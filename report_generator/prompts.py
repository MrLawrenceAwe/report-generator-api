from __future__ import annotations

from typing import List, Optional


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


def build_section_writer_prompt(
    report_title: str,
    all_section_headers: List[str],
    current_section_title: str,
    current_subsections: List[str],
    full_report_context: Optional[str] = None,
) -> str:
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


def build_summary_detection_prompt(section_title: str, subsection_titles: List[str]) -> str:
    subsection_lines = "\n".join(f"- {title}" for title in subsection_titles) if subsection_titles else "(no subsections listed)"
    return (
        "Determine whether the section below is a summary or conclusion section for the report.\n"
        "Respond with YES or NO.\n\n"
        f"Section title: {section_title}\n"
        f"Subsections:\n{subsection_lines}\n"
    )

