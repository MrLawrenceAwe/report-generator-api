export const STORAGE_KEY = "explorer-api-base";
export const SAVED_TOPICS_KEY = "explorer-saved-topics";
export const SAVED_REPORTS_KEY = "explorer-saved-reports";
export const DEFAULT_API_BASE = window.location.origin;
export const MAX_SAVED_TOPICS = 8;
export const MAX_SAVED_REPORTS = 6;
export const TOPIC_VIEW_BAR_INPUT_ID = "sidebar-topic-view-bar";

export const MODE_TABS = [
    { value: "topic", label: "From Topic" },
    { value: "outline", label: "From Topic & Custom Outline" },
];

export const OUTLINE_INPUT_MODES = [
    { value: "lines", label: "Manual" },
    { value: "json", label: "JSON" },
];

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

export function buildOutlineGeneratePayload(topic, sections) {
    return {
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
