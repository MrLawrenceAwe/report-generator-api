export const STORAGE_KEY = "explorer-api-base";
export const SAVED_TOPICS_KEY = "explorer-saved-topics";
export const SAVED_REPORTS_KEY = "explorer-saved-reports";
export const DEFAULT_API_BASE = window.location.origin;
export const MAX_SAVED_TOPICS = 8;
export const MAX_SAVED_REPORTS = 6;
export const TOPIC_VIEW_BAR_INPUT_ID = "sidebar-topic-view-bar";
export const MODEL_PRESET_STORAGE_KEY = "explorer-model-presets";
export const MODEL_ACTIVE_PRESET_STORAGE_KEY = "explorer-active-model-preset";
export const SUGGESTION_MODEL_STORAGE_KEY = "explorer-suggestion-model";

export const MODE_TABS = [
    { value: "topic", label: "From Topic" },
    { value: "outline", label: "From Topic & Custom Outline" },
];

export const OUTLINE_INPUT_MODES = [
    { value: "lines", label: "Manual" },
    { value: "json", label: "JSON" },
];

export const MODEL_STAGES = [
    {
        key: "outline",
        label: "Outline",
        description: "Plans the section list.",
    },
    {
        key: "writer",
        label: "Writer",
        description: "Writes each section.",
    },
    {
        key: "translator",
        label: "Translator",
        description: "Turns prose into narration suitable for audio format.",
    },
    {
        key: "cleanup",
        label: "Cleanup",
        description: "Polishes narration, and strips AI meta chatter.",
    },
];

export const MODEL_PRESET_ORDER = ["fast", "slower", "slowest"];

export const MODEL_PRESET_LABELS = {
    fast: "Fast",
    slower: "Slower",
    slowest: "Slowest",
};

export const MODEL_OPTIONS = [
    { value: "gpt-4o-mini", label: "gpt-4o-mini (fast)" },
    { value: "gpt-4o", label: "gpt-4o (slower, better)" },
    { value: "gpt-5-nano", label: "gpt-5-nano" },
];
export const DEFAULT_SUGGESTION_MODEL = "gpt-4o-mini";

export const DEFAULT_STAGE_MODELS = {
    outline: "gpt-4o-mini",
    writer: "gpt-4o-mini",
    translator: "gpt-4o-mini",
    cleanup: "gpt-5-nano",
};

export const DEFAULT_MODEL_PRESETS = {
    fast: {
        ...DEFAULT_STAGE_MODELS,
    },
    slower: {
        ...DEFAULT_STAGE_MODELS,
        outline: "gpt-4o",
        writer: "gpt-4o",
        translator: "gpt-4o",
    },
    slowest: {
        ...DEFAULT_STAGE_MODELS,
        outline: "gpt-4o",
        writer: "gpt-4o",
        translator: "gpt-4o",
        cleanup: "gpt-4o",
    },
};

export const DEFAULT_OUTLINE_JSON = JSON.stringify(
    {
        sections: [
            {
                title: "Introduction",
                subsections: ["Hook", "Background", "Thesis"],
            },
        ],
    },
    null,
    2
);

export function buildOutlineGeneratePayload(topic, sections, models) {
    const payload = {
        mode: "generate_report",
        return: "report",
        outline: {
            report_title: topic,
            sections: sections.map((section) => ({
                title: section.title,
                subsections: section.subsections,
            })),
        },
    };
    if (models) {
        payload.models = models;
    }
    return payload;
}

export function createEmptyOutlineSection() {
    return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: "",
        subsections: [""],
    };
}

export function generateRelatedTopics(topic) {
    const normalized = (topic || "").trim();
    if (!normalized) return [];
    const anchor = normalized.split(/\s+/).slice(0, 3).join(" ") || normalized;
    const cleanedAnchor = anchor.replace(/^(history of|future of|introduction to|overview of)\s+/i, "").trim() || anchor;
    const suggestions = [
        `${cleanedAnchor} overview`,
        `${cleanedAnchor} applications`,
        `${cleanedAnchor} challenges`,
        `Future of ${cleanedAnchor}`,
    ].map((entry) => entry.replace(/\s+/g, " ").trim());
    return Array.from(new Set(suggestions));
}

export function loadApiBase() {
    const params = new URL(window.location.href).searchParams;
    const paramBase = params.get("apiBase");
    if (paramBase && paramBase.trim()) {
        localStorage.setItem(STORAGE_KEY, paramBase.trim());
    }
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE;
}

export function loadSavedList(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("Failed to parse saved list", key, error);
        return [];
    }
}

export function persistList(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
}

export function summarizeReport(text) {
    if (!text) return "";
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= 120) return clean;
    const cutoff = clean.indexOf(". ", 80);
    if (cutoff > 0 && cutoff < 160) {
        return `${clean.slice(0, cutoff + 1)}…`;
    }
    return `${clean.slice(0, 140)}…`;
}

export function autoResize(textarea) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
}

export function normalizePreset(preset) {
    const safePreset = preset && typeof preset === "object" ? preset : {};
    const normalized = { ...DEFAULT_STAGE_MODELS };
    MODEL_STAGES.forEach((stage) => {
        const value = (safePreset[stage.key] || "").trim();
        normalized[stage.key] = value || DEFAULT_STAGE_MODELS[stage.key];
    });
    return normalized;
}

export function normalizeModelPresets(rawPresets) {
    const safePresets =
        rawPresets && typeof rawPresets === "object" ? rawPresets : {};
    const normalized = {};
    MODEL_PRESET_ORDER.forEach((presetKey) => {
        normalized[presetKey] = normalizePreset(safePresets[presetKey]);
    });
    return normalized;
}

export function loadModelPresets() {
    try {
        const raw = localStorage.getItem(MODEL_PRESET_STORAGE_KEY);
        if (!raw) return DEFAULT_MODEL_PRESETS;
        const parsed = JSON.parse(raw);
        return normalizeModelPresets(parsed);
    } catch (error) {
        console.warn("Failed to parse model presets", error);
        return DEFAULT_MODEL_PRESETS;
    }
}

export function persistModelPresets(presets) {
    localStorage.setItem(
        MODEL_PRESET_STORAGE_KEY,
        JSON.stringify(normalizeModelPresets(presets))
    );
}

export function loadActiveModelPreset(presets) {
    const available = presets || DEFAULT_MODEL_PRESETS;
    const stored = localStorage.getItem(MODEL_ACTIVE_PRESET_STORAGE_KEY);
    if (stored && available[stored]) {
        return stored;
    }
    if (available.fast) return "fast";
    return Object.keys(available)[0] || "fast";
}

export function persistActiveModelPreset(preset) {
    localStorage.setItem(MODEL_ACTIVE_PRESET_STORAGE_KEY, preset);
}

export function loadSuggestionModel() {
    const stored = localStorage.getItem(SUGGESTION_MODEL_STORAGE_KEY);
    return stored || DEFAULT_SUGGESTION_MODEL;
}

export function persistSuggestionModel(model) {
    const normalized = (model || "").trim();
    localStorage.setItem(SUGGESTION_MODEL_STORAGE_KEY, normalized || DEFAULT_SUGGESTION_MODEL);
}

export async function fetchTopicSuggestions(apiBase, {
    topic,
    seeds = [],
    enableFreeRoam = false,
    includeReportHeadings = true,
    model,
    signal,
} = {}) {
    const modelSpec = model ? { model } : undefined;
    const payload = {
        topic: topic || "",
        seeds: Array.isArray(seeds) ? seeds : [],
        enable_free_roam: Boolean(enableFreeRoam),
        include_report_headings: Boolean(includeReportHeadings),
        ...(modelSpec ? { model: modelSpec } : {}),
    };
    try {
        const response = await fetch(`${apiBase}/suggestions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal,
        });
        if (!response.ok) {
            throw new Error(`Suggestion request failed: ${response.status}`);
        }
        const data = await response.json();
        const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
        return suggestions
            .map((entry) => {
                if (typeof entry === "string") return entry;
                if (entry && typeof entry === "object") {
                    return (entry.title || entry.topic || "").trim();
                }
                return "";
            })
            .filter(Boolean);
    } catch (error) {
        console.warn("Falling back to local suggestions", error);
        return [];
    }
}

export function buildModelsPayload(stageModels) {
    const normalized = normalizePreset(stageModels);
    const payload = {};
    MODEL_STAGES.forEach((stage) => {
        const modelName = (normalized[stage.key] || "").trim();
        payload[stage.key] = { model: modelName || DEFAULT_STAGE_MODELS[stage.key] };
    });
    return payload;
}
