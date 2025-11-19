import { useState, useCallback, useEffect } from 'react';
import {
    createEmptyOutlineSection,
    DEFAULT_OUTLINE_JSON,
    buildOutlineGeneratePayload,
} from '../utils/helpers';

export function useOutlineForm({ isRunning, appendMessage, onGenerate }) {
    const [outlineTopic, setOutlineTopic] = useState("");
    const [outlineInputMode, setOutlineInputMode] = useState("lines");
    const [outlineSections, setOutlineSections] = useState(() => [
        createEmptyOutlineSection(),
    ]);
    const [outlineJsonInput, setOutlineJsonInput] = useState(DEFAULT_OUTLINE_JSON);
    const [outlineError, setOutlineError] = useState("");

    useEffect(() => {
        setOutlineError("");
    }, [outlineInputMode]);

    useEffect(() => {
        setOutlineError("");
    }, [outlineJsonInput, outlineSections, outlineTopic]);

    const resetOutlineForm = useCallback(() => {
        setOutlineTopic("");
        setOutlineSections([createEmptyOutlineSection()]);
        setOutlineJsonInput(DEFAULT_OUTLINE_JSON);
    }, []);

    const handleAddOutlineSection = useCallback(() => {
        setOutlineSections((current) => [...current, createEmptyOutlineSection()]);
    }, []);

    const handleRemoveOutlineSection = useCallback((sectionId) => {
        setOutlineSections((current) =>
            current.length === 1
                ? current
                : current.filter((section) => section.id !== sectionId)
        );
    }, []);

    const handleOutlineSectionTitleChange = useCallback((sectionId, value) => {
        setOutlineSections((current) =>
            current.map((section) =>
                section.id === sectionId ? { ...section, title: value } : section
            )
        );
    }, []);

    const handleOutlineSubsectionChange = useCallback((sectionId, index, value) => {
        setOutlineSections((current) =>
            current.map((section) => {
                if (section.id !== sectionId) return section;
                const updated = [...section.subsections];
                updated[index] = value;
                return { ...section, subsections: updated };
            })
        );
    }, []);

    const handleAddSubsectionLine = useCallback((sectionId) => {
        setOutlineSections((current) =>
            current.map((section) =>
                section.id === sectionId
                    ? { ...section, subsections: [...section.subsections, ""] }
                    : section
            )
        );
    }, []);

    const handleRemoveSubsectionLine = useCallback((sectionId, index) => {
        setOutlineSections((current) =>
            current.map((section) => {
                if (section.id !== sectionId) return section;
                const updated = section.subsections.filter((_, idx) => idx !== index);
                return { ...section, subsections: updated };
            })
        );
    }, []);

    const handleOutlineSubmit = useCallback(
        async (event) => {
            event.preventDefault();
            if (isRunning) return;

            const topicText = outlineTopic.trim();
            if (!topicText) {
                setOutlineError("Add a topic first.");
                return;
            }

            let outlineBrief = "";
            let userSummary = "";
            let outlineGeneratePayload = null;

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
                    setOutlineError("Add at least one section.");
                    return;
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
                    normalizedSections
                );
            } else {
                const trimmedInput = outlineJsonInput.trim();
                if (!trimmedInput) {
                    setOutlineError("Paste JSON with sections and subsections.");
                    return;
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
                        setOutlineError("JSON must include a sections array.");
                        return;
                    }
                    const invalidSection = parsed.sections.find(
                        (section) =>
                            !section ||
                            typeof section.title !== "string" ||
                            !section.title.trim() ||
                            !Array.isArray(section.subsections)
                    );
                    if (invalidSection) {
                        setOutlineError("Each JSON section needs a title.");
                        return;
                    }
                    normalizedJsonSections = parsed.sections.map((section) => ({
                        title: section.title.trim(),
                        subsections: section.subsections
                            .map((entry) => (entry || "").trim())
                            .filter(Boolean),
                    }));
                } catch (error) {
                    console.error(error);
                    setOutlineError("Fix the JSON before continuing.");
                    return;
                }
                outlineBrief = `Outline topic: ${topicText}\n\nUse this JSON:\n${trimmedInput}`;
                userSummary = outlineBrief;
                outlineGeneratePayload = buildOutlineGeneratePayload(
                    topicText,
                    normalizedJsonSections
                );
            }

            if (!outlineGeneratePayload) {
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
            appendMessage({ id: assistantId, role: "assistant", content: "", variant: "outline" });
            setOutlineError("");

            if (onGenerate) {
                await onGenerate(outlineGeneratePayload, assistantId, topicText);
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
        ]
    );

    return {
        outlineTopic,
        setOutlineTopic,
        outlineInputMode,
        setOutlineInputMode,
        outlineSections,
        setOutlineSections,
        outlineJsonInput,
        setOutlineJsonInput,
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
    };
}
