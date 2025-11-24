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
export const USER_EMAIL_STORAGE_KEY = "explorer-user-email";
export const USERNAME_STORAGE_KEY = "explorer-username";

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
        key: "editor",
        label: "Editor",
        description: "Edits prose into narration suitable for audio format.",
    },
];

export const MODEL_PRESET_ORDER = ["fast", "slower", "slowest"];

export const MODEL_PRESET_LABELS = {
    fast: "Fast",
    slower: "Slower",
    slowest: "Slowest",
};

export const MODEL_OPTIONS = [
    { value: "gpt-4.1-nano", label: "gpt-4.1-nano (fast)" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "gpt-4o", label: "gpt-4o (slower, better)" },
    { value: "gpt-5-nano", label: "gpt-5-nano" },
];
export const DEFAULT_SUGGESTION_MODEL = "gpt-4.1-nano";

export const DEFAULT_STAGE_MODELS = {
    outline: "gpt-4.1-nano",
    writer: "gpt-4.1-nano",
    editor: "gpt-4.1-nano",
};

export const DEFAULT_MODEL_PRESETS = {
    fast: {
        ...DEFAULT_STAGE_MODELS,
    },
    slower: {
        ...DEFAULT_STAGE_MODELS,
        outline: "gpt-4o",
        writer: "gpt-4o",
        editor: "gpt-4o",
    },
    slowest: {
        ...DEFAULT_STAGE_MODELS,
        outline: "gpt-4o",
        writer: "gpt-4o",
        editor: "gpt-4o",
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
        return: "report_with_outline",
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

export function cleanHeadingForTopic(heading) {
    const original = (heading || "").trim();
    if (!original) return "";
    let cleaned = original.replace(/^(section|chapter)\s+\d+\s*[:.)-]?\s*/i, "");
    cleaned = cleaned.replace(/^\d+\s*[:.)-]?\s*/, "");
    cleaned = cleaned.replace(/^(introduction|background)\s*[:.)-]?\s*/i, "");
    cleaned = cleaned.replace(/^[\-\u2022*]\s*/, "");
    cleaned = cleaned.trim();
    return cleaned || original;
}

export function loadApiBase() {
    const params = new URL(window.location.href).searchParams;
    const paramBase = params.get("apiBase");
    if (paramBase && paramBase.trim()) {
        localStorage.setItem(STORAGE_KEY, paramBase.trim());
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;

    const envBase = typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_BASE : undefined;
    if (envBase && envBase.trim()) {
        return envBase.trim();
    }

    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
        return "http://localhost:8000";
    }

    return DEFAULT_API_BASE;
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

export function loadUserProfile() {
    const envEmail = typeof import.meta !== "undefined" ? import.meta.env?.VITE_USER_EMAIL : undefined;
    const envUsername = typeof import.meta !== "undefined" ? import.meta.env?.VITE_USERNAME : undefined;
    const storedEmail = localStorage.getItem(USER_EMAIL_STORAGE_KEY);
    const storedUsername = localStorage.getItem(USERNAME_STORAGE_KEY);
    const email = (storedEmail || envEmail || "").trim();
    const username = (storedUsername || envUsername || "").trim();
    return { email, username };
}

export function persistUserProfile(user) {
    const email = (user?.email || "").trim();
    const username = (user?.username || "").trim();
    if (email) {
        localStorage.setItem(USER_EMAIL_STORAGE_KEY, email);
    } else {
        localStorage.removeItem(USER_EMAIL_STORAGE_KEY);
    }
    if (username) {
        localStorage.setItem(USERNAME_STORAGE_KEY, username);
    } else {
        localStorage.removeItem(USERNAME_STORAGE_KEY);
    }
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

function buildUserQuery(user) {
    const email = (user?.email || "").trim();
    if (!email) {
        throw new Error("User email is required for this action.");
    }
    const params = new URLSearchParams({ user_email: email });
    const username = (user?.username || "").trim();
    if (username) {
        params.set("username", username);
    }
    return params.toString();
}

export async function fetchTopicSuggestions(apiBase, {
    topic,
    seeds = [],
    includeReportHeadings = true,
    model,
    signal,
} = {}) {
    const modelSpec = model ? { model } : undefined;
    const payload = {
        topic: topic || "",
        seeds: Array.isArray(seeds) ? seeds : [],
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
        if (!(error && error.name === "AbortError")) {
            console.warn("Failed to fetch topic suggestions", error);
        }
        return [];
    }
}

export async function fetchSavedTopics(apiBase, user, { signal } = {}) {
    const query = buildUserQuery(user);
    const response = await fetch(`${apiBase}/saved_topics?${query}`, { signal });
    if (!response.ok) {
        throw new Error(`Failed to load saved topics (${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.map((topic) => ({
        id: topic.id,
        prompt: topic.title,
    }));
}

export async function createSavedTopic(apiBase, user, title) {
    const query = buildUserQuery(user);
    const normalizedTitle = (title || "").trim();
    if (!normalizedTitle) {
        throw new Error("Title is required to save a topic.");
    }
    const response = await fetch(`${apiBase}/saved_topics?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: normalizedTitle }),
    });
    if (!response.ok) {
        throw new Error(`Failed to save topic (${response.status}).`);
    }
    const topic = await response.json();
    return {
        id: topic.id,
        prompt: topic.title,
    };
}

export async function deleteSavedTopic(apiBase, user, topicId) {
    const query = buildUserQuery(user);
    const response = await fetch(`${apiBase}/saved_topics/${topicId}?${query}`, {
        method: "DELETE",
    });
    if (!response.ok) {
        throw new Error(`Failed to delete topic (${response.status}).`);
    }
}

export async function fetchSavedReports(apiBase, user, { includeContent = true, signal } = {}) {
    const query = buildUserQuery(user);
    const url = includeContent ? `${apiBase}/reports?${query}&include_content=1` : `${apiBase}/reports?${query}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
        throw new Error(`Failed to load reports (${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.map((report) => ({
        id: report.id,
        topic: report.topic || "",
        title: report.title || report.topic || "Explorer Report",
        content: report.content || "",
        preview: report.summary || summarizeReport(report.content || report.title || report.topic || ""),
    }));
}

export async function deleteSavedReport(apiBase, user, reportId) {
    const query = buildUserQuery(user);
    const response = await fetch(`${apiBase}/reports/${reportId}?${query}`, {
        method: "DELETE",
    });
    if (!response.ok) {
        throw new Error(`Failed to delete report (${response.status}).`);
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

export function downloadTextFile(text, filename = "report.md") {
    const safeText = text || "";
    if (!safeText) return;
    const blob = new Blob([safeText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function copyTextToClipboard(text) {
    const safeText = text || "";
    if (!safeText) return false;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(safeText);
        return true;
    }

    if (typeof document === "undefined") {
        throw new Error("Clipboard unavailable");
    }

    const textarea = document.createElement("textarea");
    textarea.value = safeText;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!success) {
        throw new Error("Copy command failed");
    }

    return true;
}
