import { useState, useCallback } from 'react';
import {
    createEmptyOutlineSection,
    DEFAULT_OUTLINE_JSON,
    buildOutlineGeneratePayload,
} from '../utils/helpers';

export function buildOutlinePayload({
    topicText,
    outlineInputMode,
    outlineSections,
    outlineJsonInput,
    models,
    avoidTopics,
    includeTopics,
}) {
    let outlineBrief = "";
    let userSummary = "";
    let outlineGeneratePayload = null;

    const subject_exclusions = (avoidTopics || "").split(",").map(s => s.trim()).filter(Boolean);
    const subject_inclusions = (includeTopics || "").split(",").map(s => s.trim()).filter(Boolean);

    if (outlineInputMode === "lines") {
        const normalizedSections = outlineSections
            .map((section) => ({
                title: section.title.trim(),
                subsections: section.subsections
                    .map((entry) => entry.trim())
                    .filter(Boolean),
            }))
            .filter((section) => section.title);
        if (!normalizedSections.length) {
            return { error: "Add at least one section." };
        }
        outlineBrief = [
            `Outline topic: ${topicText}`,
            "Structure:",
            normalizedSections
                .map(
                    (section) =>
                        `${section.title}\n${section.subsections
                            .map((entry) => `- ${entry}`)
                            .join("\n")}`
                )
                .join("\n\n"),
        ].join("\n\n");
        userSummary = outlineBrief;
        outlineGeneratePayload = buildOutlineGeneratePayload(
            topicText,
            normalizedSections,
            models
        );
        outlineGeneratePayload.subject_exclusions = subject_exclusions;
        outlineGeneratePayload.subject_inclusions = subject_inclusions;
    } else {
        const trimmedInput = outlineJsonInput.trim();
        if (!trimmedInput) {
            return { error: "Paste JSON with sections and subsections." };
        }
        let normalizedJsonSections = [];
        try {
            const parsed = JSON.parse(trimmedInput);
            if (
                !parsed ||
                typeof parsed !== "object" ||
                !Array.isArray(parsed.sections) ||
                !parsed.sections.length
            ) {
                return { error: "JSON must include a sections array." };
            }
            const invalidSection = parsed.sections.find(
                (section) =>
                    !section ||
                    typeof section.title !== "string" ||
                    !section.title.trim() ||
                    !Array.isArray(section.subsections)
            );
            if (invalidSection) {
                return { error: "Each JSON section needs a title." };
            }
            normalizedJsonSections = parsed.sections.map((section) => ({
                title: section.title.trim(),
                subsections: section.subsections
                    .map((entry) => (entry || "").trim())
                    .filter(Boolean),
            }));
        } catch (error) {
            console.error(error);
            return { error: "Fix the JSON before continuing." };
        }
        outlineBrief = `Outline topic: ${topicText}\n\nUse this JSON:\n${trimmedInput}`;
        userSummary = outlineBrief;
        outlineGeneratePayload = buildOutlineGeneratePayload(
            topicText,
            normalizedJsonSections,
            models
        );
        outlineGeneratePayload.subject_exclusions = subject_exclusions;
        outlineGeneratePayload.subject_inclusions = subject_inclusions;
    }

    return {
        payload: outlineGeneratePayload,
        userSummary,
        error: null,
    };
}

export function useOutlineForm({ isRunning, appendMessage, onGenerate, models }) {
    const [outlineTopic, setOutlineTopic] = useState("");
    const [outlineInputMode, setOutlineInputMode] = useState("lines");
    const [outlineSections, setOutlineSections] = useState(() => [
        createEmptyOutlineSection(),
    ]);
    const [outlineJsonInput, setOutlineJsonInput] = useState(DEFAULT_OUTLINE_JSON);
    const [outlineError, setOutlineError] = useState("");
    const [avoidTopics, setAvoidTopics] = useState("");
    const [includeTopics, setIncludeTopics] = useState("");

    const clearOutlineError = useCallback(() => setOutlineError(""), []);

    const resetOutlineForm = useCallback(() => {
        clearOutlineError();
        setOutlineTopic("");
        setOutlineSections([createEmptyOutlineSection()]);
        setOutlineJsonInput(DEFAULT_OUTLINE_JSON);
        setAvoidTopics("");
        setIncludeTopics("");
    }, [clearOutlineError]);

    const handleAddOutlineSection = useCallback(() => {
        clearOutlineError();
        setOutlineSections((current) => [...current, createEmptyOutlineSection()]);
    }, [clearOutlineError]);

    const handleRemoveOutlineSection = useCallback((sectionId) => {
        clearOutlineError();
        setOutlineSections((current) =>
            current.length === 1
                ? current
                : current.filter((section) => section.id !== sectionId)
        );
    }, [clearOutlineError]);

    const handleOutlineSectionTitleChange = useCallback((sectionId, value) => {
        clearOutlineError();
        setOutlineSections((current) =>
            current.map((section) =>
                section.id === sectionId ? { ...section, title: value } : section
            )
        );
    }, [clearOutlineError]);

    const handleOutlineSubsectionChange = useCallback((sectionId, index, value) => {
        clearOutlineError();
        setOutlineSections((current) =>
            current.map((section) => {
                if (section.id !== sectionId) return section;
                const updated = [...section.subsections];
                updated[index] = value;
                return { ...section, subsections: updated };
            })
        );
    }, [clearOutlineError]);

    const handleAddSubsectionLine = useCallback((sectionId) => {
        clearOutlineError();
        setOutlineSections((current) =>
            current.map((section) =>
                section.id === sectionId
                    ? { ...section, subsections: [...section.subsections, ""] }
                    : section
            )
        );
    }, [clearOutlineError]);

    const handleRemoveSubsectionLine = useCallback((sectionId, index) => {
        clearOutlineError();
        setOutlineSections((current) =>
            current.map((section) => {
                if (section.id !== sectionId) return section;
                const updated = section.subsections.filter((_, idx) => idx !== index);
                return { ...section, subsections: updated };
            })
        );
    }, [clearOutlineError]);

    const handleOutlineSubmit = useCallback(
        async (event) => {
            event.preventDefault();
            if (isRunning) return;

            const topicText = outlineTopic.trim();
            if (!topicText) {
                setOutlineError("Add a topic first.");
                return;
            }

            const { payload, userSummary, error } = buildOutlinePayload({
                topicText,
                outlineInputMode,
                outlineSections,
                outlineJsonInput,
                models,
                avoidTopics,
                includeTopics,
            });

            if (error) {
                setOutlineError(error);
                return;
            }

            if (!payload) {
                setOutlineError("Unable to prepare the outline request.");
                return;
            }

            const assistantId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            appendMessage({
                id: `${assistantId}-user`,
                role: "user",
                content: userSummary,
                variant: "outline",
            });
            appendMessage({
                id: assistantId,
                role: "assistant",
                content: "",
                variant: "outline",
                reportTopic: topicText,
            });
            setOutlineError("");

            if (onGenerate) {
                await onGenerate(payload, assistantId, topicText);
            }
        },
        [
            appendMessage,
            isRunning,
            outlineInputMode,
            outlineJsonInput,
            outlineSections,
            outlineTopic,
            onGenerate,
            models,
            avoidTopics,
            includeTopics,
        ]
    );

    const setOutlineTopicSafe = useCallback((value) => {
        clearOutlineError();
        setOutlineTopic(value);
    }, [clearOutlineError]);

    const setOutlineInputModeSafe = useCallback((value) => {
        clearOutlineError();
        setOutlineInputMode(value);
    }, [clearOutlineError]);

    const setOutlineJsonInputSafe = useCallback((value) => {
        clearOutlineError();
        setOutlineJsonInput(value);
    }, [clearOutlineError]);

    return {
        outlineTopic,
        setOutlineTopic: setOutlineTopicSafe,
        outlineInputMode,
        setOutlineInputMode: setOutlineInputModeSafe,
        outlineSections,
        setOutlineSections,
        outlineJsonInput,
        setOutlineJsonInput: setOutlineJsonInputSafe,
        outlineError,
        setOutlineError,
        resetOutlineForm,
        handleAddOutlineSection,
        handleRemoveOutlineSection,
        handleOutlineSectionTitleChange,
        handleOutlineSubsectionChange,
        handleAddSubsectionLine,
        handleRemoveSubsectionLine,
        handleOutlineSubmit,
        avoidTopics,
        setAvoidTopics,
        includeTopics,
        setIncludeTopics,
    };
}
