import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useChat } from './hooks/useChat';
import { Sidebar } from './components/Sidebar';
import { ChatPane } from './components/ChatPane';
import { TopicView } from './components/TopicView';
import { OutlineForm } from './components/OutlineForm';
import {
  loadApiBase,
  loadSavedList,
  persistList,
  createEmptyOutlineSection,
  generateRelatedTopics,
  buildOutlineGeneratePayload,
  SAVED_TOPICS_KEY,
  SAVED_REPORTS_KEY,
  MAX_SAVED_TOPICS,
  MAX_SAVED_REPORTS,
  DEFAULT_OUTLINE_JSON,
  MODE_TABS,
  summarizeReport,
} from './utils/helpers';

function App() {
  const [apiBase] = useState(loadApiBase);
  const [savedTopics, setSavedTopics] = useState(() => loadSavedList(SAVED_TOPICS_KEY));
  const [savedReports, setSavedReports] = useState(() => loadSavedList(SAVED_REPORTS_KEY));

  const rememberReport = useCallback((topic, content) => {
    const summary = summarizeReport(content);
    setSavedReports((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        topic,
        preview: summary,
      },
      ...current,
    ].slice(0, MAX_SAVED_REPORTS));
  }, []);

  const {
    messages,
    isRunning,
    setIsRunning,
    runReportFlow,
    appendMessage,
    stopGeneration,
  } = useChat(apiBase, rememberReport);

  const [composerValue, setComposerValue] = useState("");
  const [topicViewBarValue, setTopicViewBarValue] = useState("");
  const [topicViewTopic, setTopicViewTopic] = useState("");
  const [topicViewDraft, setTopicViewDraft] = useState("");
  const [isTopicEditing, setIsTopicEditing] = useState(false);
  const [mode, setMode] = useState("topic");
  const [outlineTopic, setOutlineTopic] = useState("");
  const [outlineInputMode, setOutlineInputMode] = useState("lines");
  const [outlineSections, setOutlineSections] = useState(() => [
    createEmptyOutlineSection(),
  ]);
  const [outlineJsonInput, setOutlineJsonInput] = useState(DEFAULT_OUTLINE_JSON);
  const [outlineError, setOutlineError] = useState("");
  const [sectionCount, setSectionCount] = useState(3);

  const topicViewEditorRef = useRef(null);
  const skipTopicCommitRef = useRef(false);

  useEffect(() => {
    persistList(SAVED_TOPICS_KEY, savedTopics);
  }, [savedTopics]);

  useEffect(() => {
    persistList(SAVED_REPORTS_KEY, savedReports);
  }, [savedReports]);

  useEffect(() => {
    setOutlineError("");
  }, [outlineInputMode, mode]);

  useEffect(() => {
    setOutlineError("");
  }, [outlineJsonInput, outlineSections, outlineTopic]);

  useEffect(() => {
    setTopicViewDraft(topicViewTopic);
    setIsTopicEditing(false);
  }, [topicViewTopic]);

  useEffect(() => {
    if (isTopicEditing) {
      topicViewEditorRef.current?.focus();
      topicViewEditorRef.current?.select?.();
    }
  }, [isTopicEditing]);

  const openTopicView = useCallback((topic) => {
    const normalized = (topic || "").trim();
    if (!normalized) return;
    setTopicViewTopic(normalized);
  }, []);

  const closeTopicView = useCallback(() => {
    setTopicViewTopic("");
  }, []);

  const startTopicEditing = useCallback(() => {
    if (!topicViewTopic) return;
    skipTopicCommitRef.current = false;
    setTopicViewDraft(topicViewTopic);
    setIsTopicEditing(true);
  }, [topicViewTopic]);

  const cancelTopicEditing = useCallback(() => {
    skipTopicCommitRef.current = true;
    setTopicViewDraft(topicViewTopic);
    setIsTopicEditing(false);
  }, [topicViewTopic]);

  const commitTopicEdit = useCallback(() => {
    if (skipTopicCommitRef.current) {
      skipTopicCommitRef.current = false;
      return;
    }
    const normalized = topicViewDraft.trim();
    setIsTopicEditing(false);
    if (normalized && normalized !== topicViewTopic) {
      setTopicViewTopic(normalized);
    } else {
      setTopicViewDraft(topicViewTopic);
    }
  }, [topicViewDraft, topicViewTopic]);

  const handleTopicEditSubmit = useCallback(
    (event) => {
      event.preventDefault();
      commitTopicEdit();
    },
    [commitTopicEdit]
  );

  const handleTopicEditBlur = useCallback(() => {
    commitTopicEdit();
  }, [commitTopicEdit]);

  const handleTopicEditKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelTopicEditing();
      } else if (event.key === "Enter") {
        event.preventDefault();
        commitTopicEdit();
      }
    },
    [cancelTopicEditing, commitTopicEdit]
  );

  const handleTopicTitleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        startTopicEditing();
      }
    },
    [startTopicEditing]
  );

  const handleTopicViewBarSubmit = useCallback(
    (event) => {
      event.preventDefault();
      const normalized = topicViewBarValue.trim();
      if (!normalized) return;
      openTopicView(normalized);
      setTopicViewBarValue("");
    },
    [openTopicView, topicViewBarValue]
  );

  const handleTopicRecall = useCallback(
    (topic) => {
      openTopicView(topic);
    },
    [openTopicView]
  );

  const rememberTopic = useCallback((prompt) => {
    setSavedTopics((current) => {
      const deduped = current.filter((entry) => entry.prompt !== prompt);
      return [
        { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, prompt },
        ...deduped,
      ].slice(0, MAX_SAVED_TOPICS);
    });
  }, []);

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
        if (section.subsections.length === 1) return section;
        const updated = section.subsections.filter((_, idx) => idx !== index);
        return { ...section, subsections: updated };
      })
    );
  }, []);

  const runTopicPrompt = useCallback(
    async (prompt) => {
      const normalizedPrompt = (prompt || "").trim();
      if (!normalizedPrompt || isRunning) return false;

      const assistantId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      rememberTopic(normalizedPrompt);
      appendMessage({
        id: `${assistantId}-user`,
        role: "user",
        content: normalizedPrompt,
        variant: "topic",
      });
      appendMessage({ id: assistantId, role: "assistant", content: "", variant: "topic" });
      setIsRunning(true);
      try {
        await runReportFlow(
          {
            topic: normalizedPrompt,
            mode: "generate_report",
            return: "report",
            sections: sectionCount
          },
          assistantId,
          normalizedPrompt
        );
        return true;
      } finally {
        setIsRunning(false);
      }
    },
    [appendMessage, isRunning, rememberTopic, runReportFlow, sectionCount]
  );

  const handleTopicSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const prompt = composerValue.trim();
      if (!prompt || isRunning) return;
      setComposerValue("");
      await runTopicPrompt(prompt);
    },
    [composerValue, isRunning, runTopicPrompt]
  );

  const handleTopicViewGenerate = useCallback(async () => {
    if (!topicViewTopic || isRunning) return;
    closeTopicView();
    await runTopicPrompt(topicViewTopic);
  }, [closeTopicView, isRunning, runTopicPrompt, topicViewTopic]);

  const handleTopicViewSave = useCallback(() => {
    if (!topicViewTopic) return;
    rememberTopic(topicViewTopic);
  }, [rememberTopic, topicViewTopic]);

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
          .filter((section) => section.title && section.subsections.length);
        if (!normalizedSections.length) {
          setOutlineError("Add at least one section and subsection.");
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
              !Array.isArray(section.subsections) ||
              !section.subsections.some((entry) => typeof entry === "string" && entry.trim())
          );
          if (invalidSection) {
            setOutlineError("Each JSON section needs a title and subsection.");
            return;
          }
          normalizedJsonSections = parsed.sections.map((section) => ({
            title: section.title.trim(),
            subsections: section.subsections
              .map((entry) => (entry || "").trim())
              .filter(Boolean),
          }));
        } catch (error) {
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
      setIsRunning(true);
      setOutlineError("");

      const wasSuccessful = await runReportFlow(
        outlineGeneratePayload,
        assistantId,
        topicText
      );
      setIsRunning(false);
      if (wasSuccessful) {
        resetOutlineForm();
      }
    },
    [
      appendMessage,
      isRunning,
      outlineInputMode,
      outlineJsonInput,
      outlineSections,
      outlineTopic,
      resetOutlineForm,
      runReportFlow,
    ]
  );

  const composerButtonLabel = isRunning ? "Stop" : "Generate Report";
  const outlineSubmitLabel = isRunning ? "Working…" : "Generate report";

  const normalizedOutlineTopic = outlineTopic.trim();
  const lineModeValidity = outlineSections.every((section) => {
    const title = section.title.trim();
    const hasSubsections = section.subsections.some((line) => line.trim());
    return Boolean(title && hasSubsections);
  });
  const isLineModeValid = Boolean(normalizedOutlineTopic && lineModeValidity);
  const trimmedJsonInput = outlineJsonInput.trim();
  let jsonValidationError = "";
  if (outlineInputMode === "json" && trimmedJsonInput) {
    try {
      const parsed = JSON.parse(trimmedJsonInput);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) {
        jsonValidationError = "JSON outline must contain a sections array.";
      } else if (
        !parsed.sections.length ||
        !parsed.sections.every(
          (section) =>
            section &&
            typeof section.title === "string" &&
            section.title.trim() &&
            Array.isArray(section.subsections) &&
            section.subsections.some((entry) => typeof entry === "string" && entry.trim())
        )
      ) {
        jsonValidationError = "Each JSON section needs a title plus at least one subsection.";
      }
    } catch (error) {
      jsonValidationError = error.message || "Enter valid JSON.";
    }
  }
  const isJsonModeValid = Boolean(
    normalizedOutlineTopic && trimmedJsonInput && !jsonValidationError
  );
  const isOutlineFormValid = outlineInputMode === "lines" ? isLineModeValid : isJsonModeValid;

  const hasMessages = messages.length > 0;
  const isTopicViewOpen = Boolean(topicViewTopic);
  const topicViewSuggestions = useMemo(
    () => generateRelatedTopics(topicViewTopic),
    [topicViewTopic]
  );
  const isTopicSaved = useMemo(
    () => savedTopics.some((entry) => entry.prompt === topicViewTopic),
    [savedTopics, topicViewTopic]
  );

  const chatPaneClasses = ["chat-pane"];
  if (!hasMessages && !isTopicViewOpen) {
    chatPaneClasses.push("chat-pane--empty");
  }
  if (isTopicViewOpen) {
    chatPaneClasses.push("chat-pane--topic-view");
  }
  const chatPaneClassName = chatPaneClasses.join(" ");

  const renderModeToggle = (extraClass = "") => (
    <div
      className={`mode-toggle${extraClass ? ` ${extraClass}` : ""}`}
      role="tablist"
      aria-label="Prompt type"
    >
      {MODE_TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={mode === tab.value}
          className={`mode-toggle__option${mode === tab.value ? " mode-toggle__option--active" : ""
            }`}
          onClick={() => !isRunning && setMode(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page">
      <Sidebar
        savedTopics={savedTopics}
        savedReports={savedReports}
        handleTopicRecall={handleTopicRecall}
        topicViewBarValue={topicViewBarValue}
        setTopicViewBarValue={setTopicViewBarValue}
        handleTopicViewBarSubmit={handleTopicViewBarSubmit}
      />
      <main className={chatPaneClassName}>
        {isTopicViewOpen ? (
          <TopicView
            topic={topicViewTopic}
            isEditing={isTopicEditing}
            draft={topicViewDraft}
            setDraft={setTopicViewDraft}
            isSaved={isTopicSaved}
            suggestions={topicViewSuggestions}
            isRunning={isRunning}
            handlers={{
              startEditing: startTopicEditing,
              cancelEditing: cancelTopicEditing,
              commitEditing: commitTopicEdit,
              handleEditSubmit: handleTopicEditSubmit,
              handleEditBlur: handleTopicEditBlur,
              handleEditKeyDown: handleTopicEditKeyDown,
              handleTitleKeyDown: handleTopicTitleKeyDown,
              handleSave: handleTopicViewSave,
              handleGenerate: handleTopicViewGenerate,
              handleClose: closeTopicView,
              handleOpenTopic: openTopicView,
              sectionCount,
              setSectionCount,
            }}
            editorRef={topicViewEditorRef}
          />
        ) : (
          <ChatPane
            messages={messages}
            mode={mode}
            isRunning={isRunning}
            composerValue={composerValue}
            setComposerValue={setComposerValue}
            handleTopicSubmit={handleTopicSubmit}
            handleStop={stopGeneration}
            renderModeToggle={renderModeToggle}
            composerButtonLabel={composerButtonLabel}
            outlineForm={
              <OutlineForm
                outlineTopic={outlineTopic}
                setOutlineTopic={setOutlineTopic}
                outlineInputMode={outlineInputMode}
                setOutlineInputMode={setOutlineInputMode}
                outlineSections={outlineSections}
                outlineJsonInput={outlineJsonInput}
                setOutlineJsonInput={setOutlineJsonInput}
                error={outlineError}
                jsonValidationError={jsonValidationError}
                trimmedJsonInput={trimmedJsonInput}
                isFormValid={isOutlineFormValid}
                isRunning={isRunning}
                handleSubmit={handleOutlineSubmit}
                submitLabel={outlineSubmitLabel}
                handlers={{
                  handleAddSection: handleAddOutlineSection,
                  handleRemoveSection: handleRemoveOutlineSection,
                  handleSectionTitleChange: handleOutlineSectionTitleChange,
                  handleSubsectionChange: handleOutlineSubsectionChange,
                  handleAddSubsection: handleAddSubsectionLine,
                  handleRemoveSubsection: handleRemoveSubsectionLine,
                }}
              />
            }
          />
        )}
      </main>
    </div>
  );
}

export default App;
