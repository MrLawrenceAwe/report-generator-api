import asyncio
import json
import os
import re
from typing import List, Optional, Literal, Dict, Any

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field, validator


# ---------- Data models ----------

ReasoningEffort = Literal["minimal", "low", "medium", "high"]

_REASONING_MODEL_PREFIXES = ("gpt-5", "o3", "o4")

class ModelSpec(BaseModel):
    model: str = Field(default="gpt-4o-mini", description="Model name, e.g., gpt-4o-mini, gpt-4o")
    reasoning_effort: Optional[ReasoningEffort] = Field(default=None, description="Reasoning effort for reasoning models")

def _supports_reasoning(model_name: Optional[str]) -> bool:
    if not model_name:
        return False
    return any(model_name.startswith(prefix) for prefix in _REASONING_MODEL_PREFIXES)

def _maybe_add_reasoning(payload: Dict[str, Any], key: str, model_spec: ModelSpec) -> None:
    if model_spec.reasoning_effort and _supports_reasoning(model_spec.model):
        payload[key] = model_spec.reasoning_effort

class Section(BaseModel):
    title: str
    subsections: List[str] = Field(default_factory=list)

class Outline(BaseModel):
    report_title: str
    sections: List[Section]

class OutlineRequest(BaseModel):
    topic: str
    format: Literal["json","markdown"] = "json"
    model: ModelSpec = ModelSpec(model="gpt-4o-mini")

class GenerateRequest(BaseModel):
    topic: Optional[str] = None
    mode: Optional[Literal["generate_report"]] = None
    outline: Optional[Outline] = None
    models: Dict[str, ModelSpec] = Field(default_factory=lambda: {
        "outline":    ModelSpec(model="gpt-4o-mini"),
        "writer":     ModelSpec(model="gpt-4o-mini"),
        "translator": ModelSpec(model="gpt-4o-mini"),
        "cleanup":    ModelSpec(model="gpt-5-nano"),
    })
    writer_fallback: Optional[str] = None
    return_: Literal["report","report_with_outline"] = Field(default="report", alias="return")

    @validator("mode")
    def validate_mode(cls, v, values):
        if values.get("topic") and values.get("outline") is None:
            if v != "generate_report" and v is not None:
                raise ValueError("When topic-only (Case A) and using /generate_report, mode must be 'generate_report'.")
        return v


# ---------- OpenAI client ----------

def _make_client() -> OpenAI:
    base_url = os.environ.get("OPENAI_BASE_URL")
    if base_url:
        return OpenAI(base_url=base_url)
    return OpenAI()

client = _make_client()


# ---------- Helpers ----------

def call_openai_text(model_spec: ModelSpec, system_prompt: str, user_prompt: str, style_hint: Optional[str] = None) -> str:
    messages = []
    if style_hint:
        messages.append({"role": "system", "content": style_hint})
    messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})

    kwargs: Dict[str, Any] = {
        "model": model_spec.model,
        "input": messages
    }
    if model_spec.reasoning_effort and _supports_reasoning(model_spec.model):
        kwargs["reasoning"] = {"effort": model_spec.reasoning_effort}

    resp = client.responses.create(**kwargs)
    return resp.output_text

def build_outline_prompt_json(topic: str) -> str:
    return f"""
Write a detailed outline for a report on the topic of "{topic}".
Organize it into main sections (Section 1, Section 2, etc.). Under each main section, list subsections (1.1, 1.2, etc.).
Make sure it's comprehensive, covering key concepts and sub-topics.

Return valid JSON only with this schema:
{{
  "report_title": string,
  "sections": [
    {{
      "title": string,
      "subsections": string[]
    }}
  ]
}}
"""

def build_outline_prompt_markdown(topic: str) -> str:
    return f"""
Write a detailed outline for a report on the topic of "{topic}".
Organize it into main sections (Section 1, Section 2, etc.). Under each main section, list subsections (1.1, 1.2, etc.).
Make sure it's comprehensive, covering key concepts and sub-topics.

Return Markdown only.
"""

def build_section_writer_prompt(report_title: str,
                                all_section_headers: List[str],
                                current_section_title: str,
                                current_subsections: List[str],
                                full_report_context: Optional[str] = None) -> str:
    headers_list = "\n".join(all_section_headers)
    subs_list = "\n".join(current_subsections) if current_subsections else "(none)"
    context_block = ""
    if full_report_context:
        context_block = (
            "\nFull report content written so far (reference for summaries/conclusions; "
            "do not copy verbatim):\n"
            f"{full_report_context}\n"
        )
    return f"""
You are writing part of a comprehensive report titled "{report_title}".

All section headers (for global context):
{headers_list}

Current section to write:
{current_section_title}

{context_block if context_block else ''}

Subsections to cover inside this section:
{subs_list}

Instructions:
- For each subsection label listed above, start a new heading line using the label exactly as written (for example `1.1: Definition`). Follow each heading with 1–3 cohesive paragraphs that cover that subsection.
- Do NOT add Markdown heading markers (`#`) or change the numbering/wording of the provided labels.
- Do NOT include the section header itself; the caller will add it separately.
- Be extremely comprehensive and detailed while keeping the prose information-dense.
"""

def build_section_translator_prompt(report_title: str, section_title: str, section_text: str) -> str:
    section_body = section_text.strip() or "(no body text)"
    return f"""
Translate the following section body from the report "{report_title}" into an audio-friendly narration while preserving every fact.
Keep every heading line exactly as written (they already contain numbering like `1.1: ...`); do not add Markdown `#` symbols, change the numbering, or repeat the section title "{section_title}".
Rewrite only the paragraph text beneath those headings using a conversational tone.
Never add translator prefaces such as "Sure, here's the translation" or meta commentary; begin directly with the first heading and narration.

Section body to translate:
{section_body}
"""

def build_translation_cleanup_prompt(report_title: str, section_title: str, translated_text: str) -> str:
    narration = translated_text.strip() or "(no narration)"
    return f"""
You polish narrated report sections. Remove any meta commentary, translator disclaimers, filler like "Sure, here is" or "Translating now", and any content outside the narration itself. Preserve every heading exactly as provided (e.g., `1.1: ...`) and keep the factual narration untouched.

Return only the cleaned narration, starting with the first heading. If the text already complies, return it unchanged.

Report: "{report_title}"
Section: "{section_title}"

Narration to clean:
{narration}
"""


_SUMMARY_CLASSIFIER_SPEC = ModelSpec(model="gpt-5-nano")
_SUMMARY_CLASSIFIER_SYSTEM = "You respond with a single word: YES if the section is a summary or conclusion, otherwise NO."


def build_summary_detection_prompt(section_title: str, subsection_titles: List[str]) -> str:
    subsection_lines = "\n".join(f"- {title}" for title in subsection_titles) if subsection_titles else "(no subsections listed)"
    return (
        "Determine whether the section below is a summary or conclusion section for the report.\n"
        "Respond with YES or NO.\n\n"
        f"Section title: {section_title}\n"
        f"Subsections:\n{subsection_lines}\n"
    )

async def is_summary_or_conclusion_section(section_title: str, subsection_titles: List[str]) -> bool:
    prompt = build_summary_detection_prompt(section_title, subsection_titles)
    try:
        response = await call_openai_text_async(
            _SUMMARY_CLASSIFIER_SPEC,
            _SUMMARY_CLASSIFIER_SYSTEM,
            prompt
        )
    except Exception:
        return False

    normalized = response.strip().lower()
    return normalized.startswith("yes") or normalized.startswith("true")


_SECTION_LABEL_RE = re.compile(r"Section\s+(\d+(?:\.\d+)*)\s*[:.-]?\s*(.*)", re.IGNORECASE)
_NUMBER_PREFIX_RE = re.compile(r"^(\d+(?:\.\d+)*)\s*[:.-]?\s*(.*)$")


def _ensure_numbered_title(title: str, default_number: str) -> str:
    cleaned = title.strip()
    if not cleaned:
        return f"{default_number}:"

    match = _SECTION_LABEL_RE.match(cleaned)
    if match:
        number, rest = match.groups()
        rest = rest.strip()
        return f"{number}: {rest}" if rest else f"{number}:"

    match = _NUMBER_PREFIX_RE.match(cleaned)
    if match:
        number, rest = match.groups()
        rest = rest.strip()
        # If there was already a number, normalize delimiter to ':'
        if rest:
            return f"{number}: {rest}"
        return f"{number}:"

    return f"{default_number}: {cleaned}"

def ensure_section_numbering(title: str, section_index: int) -> str:
    return _ensure_numbered_title(title, str(section_index))

def ensure_subsection_numbering(title: str, section_index: int, subsection_index: int) -> str:
    return _ensure_numbered_title(title, f"{section_index}.{subsection_index}")

def enforce_subsection_headings(section_text: str, subsection_titles: List[str]) -> str:
    lines = section_text.splitlines()
    result = []
    idx = 0
    hash_heading_pattern = re.compile(r"^###\s*")
    numbered_heading_pattern = re.compile(r"^(?:###\s*)?\d+(?:\.\d+)*\s*[:.-]?")

    for line in lines:
        stripped = line.lstrip()
        if idx < len(subsection_titles):
            if hash_heading_pattern.match(stripped) or numbered_heading_pattern.match(stripped):
                prefix = line[: len(line) - len(stripped)]
                result.append(f"{prefix}{subsection_titles[idx]}")
                idx += 1
                continue
        result.append(line)

    return "\n".join(result)

def parse_outline_json(text: str):
    from json import loads

    cleaned = text.strip()
    if cleaned.startswith("```") and cleaned.endswith("```"):
        cleaned = cleaned.strip("`").strip()
        newline = cleaned.find("\n")
        if newline != -1:
            cleaned = cleaned[newline + 1 :].strip()

    data = loads(cleaned)
    return Outline(**data)



# ---------- FastAPI app ----------

app = FastAPI(title="Report Generation API", version="2.0.0")

def _build_outline_request(
    topic: str,
    fmt: Literal["json", "markdown"],
    model_name: Optional[str],
    reasoning_effort: Optional[ReasoningEffort],
) -> OutlineRequest:
    model_spec = ModelSpec(model=model_name or "gpt-4o-mini")
    if reasoning_effort and _supports_reasoning(model_spec.model):
        model_spec.reasoning_effort = reasoning_effort
    return OutlineRequest(topic=topic, format=fmt, model=model_spec)

def _handle_outline_request(req: OutlineRequest):
    system = "You generate structured outlines."
    prompt = build_outline_prompt_json(req.topic) if req.format == "json" else build_outline_prompt_markdown(req.topic)
    text = call_openai_text(req.model, system, prompt)
    if req.format == "json":
        try:
            outline = parse_outline_json(text)
            return outline.model_dump()
        except Exception as e:
            raise HTTPException(status_code=502, detail={
                "error": f"Failed to parse outline JSON: {e}",
                "raw_response": text
            })
    else:
        return {"markdown_outline": text}

@app.get("/outline")
def get_outline(
    topic: str = Query(..., description="Topic to outline"),
    fmt: Literal["json", "markdown"] = Query("json", alias="format"),
    model: Optional[str] = Query(None, description="Model name override"),
    reasoning_effort: Optional[ReasoningEffort] = Query(None, description="Reasoning effort when supported"),
):
    req = _build_outline_request(topic, fmt, model, reasoning_effort)
    return _handle_outline_request(req)

@app.post("/outline")
def create_outline(
    req: Optional[OutlineRequest] = Body(default=None),
    topic: Optional[str] = Query(None, description="Topic to outline"),
    fmt: Literal["json", "markdown"] = Query("json", alias="format"),
    model: Optional[str] = Query(None, description="Model name override"),
    reasoning_effort: Optional[ReasoningEffort] = Query(None, description="Reasoning effort when supported"),
):
    if req is None:
        if not topic:
            raise HTTPException(status_code=400, detail="Provide a topic via query when no JSON body is supplied.")
        req = _build_outline_request(topic, fmt, model, reasoning_effort)
    return _handle_outline_request(req)

async def call_openai_text_async(model_spec: ModelSpec, system_prompt: str, user_prompt: str, style_hint: Optional[str] = None) -> str:
    return await asyncio.to_thread(call_openai_text, model_spec, system_prompt, user_prompt, style_hint)

@app.post("/generate_report")
def generate_report(req: GenerateRequest):
    if req.outline is None and (not req.topic or req.mode != "generate_report"):
        raise HTTPException(status_code=400, detail="For Case A with /generate_report, provide {topic, mode='generate_report'}.")

    provided_outline = req.outline

    async def event_stream():
        yield json.dumps({"status": "started"}) + "\n"
        await asyncio.sleep(0)
        try:
            outline_spec = req.models.get("outline", ModelSpec(model="gpt-4o-mini"))
            if provided_outline is None:
                system = "You generate structured outlines."
                prompt = build_outline_prompt_json(req.topic)
                outline_status = {
                    "status": "generating_outline",
                    "model": outline_spec.model,
                }
                _maybe_add_reasoning(outline_status, "reasoning_effort", outline_spec)
                yield json.dumps(outline_status) + "\n"
                await asyncio.sleep(0)
                text = await call_openai_text_async(outline_spec, system, prompt)
                try:
                    outline = parse_outline_json(text)
                    outline_ready_status = {
                        "status": "outline_ready",
                        "model": outline_spec.model,
                        "sections": len(outline.sections)
                    }
                    _maybe_add_reasoning(outline_ready_status, "reasoning_effort", outline_spec)
                    yield json.dumps(outline_ready_status) + "\n"
                    await asyncio.sleep(0)
                except Exception as e:
                    yield json.dumps({
                        "status": "error",
                        "detail": f"Failed to parse outline JSON: {e}",
                        "raw_outline": text
                    }) + "\n"
                    return
            else:
                outline = provided_outline
                yield json.dumps({
                    "status": "using_provided_outline",
                    "sections": len(outline.sections)
                }) + "\n"
                await asyncio.sleep(0)

            numbered_sections: List[Dict[str, Any]] = []
            for idx, sec in enumerate(outline.sections, start=1):
                section_title = ensure_section_numbering(sec.title, idx)
                subsection_titles = [
                    ensure_subsection_numbering(sub, idx, sub_idx)
                    for sub_idx, sub in enumerate(sec.subsections, start=1)
                ]
                numbered_sections.append({
                    "section_title": section_title,
                    "subsections": subsection_titles
                })

            all_section_headers = [entry["section_title"] for entry in numbered_sections]

            writer_spec = req.models.get("writer", ModelSpec(model="gpt-4o-mini"))
            translator_spec = req.models.get("translator", ModelSpec(model="gpt-4o-mini"))
            cleanup_spec = req.models.get("cleanup", translator_spec)

            if req.writer_fallback:
                writer_spec.model = req.writer_fallback
                writer_spec.reasoning_effort = None

            assembled_narration = outline.report_title

            begin_sections_status = {
                "status": "begin_sections",
                "count": len(outline.sections),
                "writer_model": writer_spec.model,
                "translator_model": translator_spec.model,
                "cleanup_model": cleanup_spec.model
            }
            _maybe_add_reasoning(begin_sections_status, "writer_reasoning_effort", writer_spec)
            _maybe_add_reasoning(begin_sections_status, "translator_reasoning_effort", translator_spec)
            if cleanup_spec is not translator_spec:
                _maybe_add_reasoning(begin_sections_status, "cleanup_reasoning_effort", cleanup_spec)
            yield json.dumps(begin_sections_status) + "\n"
            await asyncio.sleep(0)

            written_sections: List[Dict[str, str]] = []

            for entry in numbered_sections:
                section_title = entry["section_title"]
                subsection_titles = entry["subsections"]
                yield json.dumps({
                    "status": "writing_section",
                    "section": section_title
                }) + "\n"
                await asyncio.sleep(0)
                writer_system = "You write high-quality, well-structured prose that continues a report seamlessly."
                elevate_context = await is_summary_or_conclusion_section(section_title, subsection_titles)
                report_context = None
                if elevate_context and written_sections:
                    report_context = "\n\n".join(
                        f"{item['title']}\n\n{item['body']}"
                        for item in written_sections
                    )
                writer_prompt = build_section_writer_prompt(
                    outline.report_title,
                    all_section_headers,
                    section_title,
                    subsection_titles,
                    full_report_context=report_context
                )
                section_text = await call_openai_text_async(writer_spec, writer_system, writer_prompt)
                section_text = enforce_subsection_headings(section_text, subsection_titles)
                written_sections.append({
                    "title": section_title,
                    "body": section_text.strip()
                })

                yield json.dumps({
                    "status": "translating_section",
                    "section": section_title
                }) + "\n"
                await asyncio.sleep(0)
                translator_system = "You translate prose into clear, audio-friendly narration without losing information."
                translator_prompt = build_section_translator_prompt(outline.report_title, section_title, section_text)
                narrated = await call_openai_text_async(translator_spec, translator_system, translator_prompt)

                yield json.dumps({
                    "status": "cleaning_section",
                    "section": section_title
                }) + "\n"
                await asyncio.sleep(0)
                cleanup_system = "You remove meta commentary from narrated report sections while keeping content intact."
                cleanup_prompt = build_translation_cleanup_prompt(outline.report_title, section_title, narrated)
                cleaned_narration = await call_openai_text_async(cleanup_spec, cleanup_system, cleanup_prompt)
                cleaned_narration = enforce_subsection_headings(cleaned_narration, subsection_titles)

                if assembled_narration:
                    assembled_narration += "\n\n"
                assembled_narration += f"{section_title}\n\n{cleaned_narration.strip()}"

                yield json.dumps({
                    "status": "section_complete",
                    "section": section_title
                }) + "\n"
                await asyncio.sleep(0)

            final_payload = {
                "status": "complete",
                "report_title": outline.report_title,
                "report": assembled_narration
            }
            if req.return_ == "report_with_outline":
                final_payload["outline_used"] = outline.model_dump()

            yield json.dumps(final_payload) + "\n"
            await asyncio.sleep(0)

        except Exception as e:
            yield json.dumps({"status": "error", "detail": str(e)}) + "\n"
            return

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )

# Debug route to list all registered routes
@app.get("/_routes")
def list_routes():
    return {"paths": [r.path for r in app.routes]}
