import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useChat } from './hooks/useChat';
import { useOutlineForm } from './hooks/useOutlineForm';
import { Sidebar } from './components/Sidebar';
import { ChatPane } from './components/ChatPane';
import { TopicView } from './components/TopicView';
import { OutlineForm } from './components/OutlineForm';
import {
  loadApiBase,
  loadSavedList,
  persistList,
  generateRelatedTopics,
  SAVED_TOPICS_KEY,
  SAVED_REPORTS_KEY,
  MAX_SAVED_TOPICS,
  MAX_SAVED_REPORTS,
  MODE_TABS,
  summarizeReport,
  loadModelPresets,
  loadActiveModelPreset,
  persistModelPresets,
  persistActiveModelPreset,
  buildModelsPayload,
  normalizeModelPresets,
} from './utils/helpers';
import { ModelSettings } from './components/ModelSettings';

function App() {
  const [apiBase] = useState(loadApiBase);
  const [savedTopics, setSavedTopics] = useState(() => loadSavedList(SAVED_TOPICS_KEY));
  const [savedReports, setSavedReports] = useState(() => loadSavedList(SAVED_REPORTS_KEY));
  const [modelPresets, setModelPresets] = useState(loadModelPresets);
  const [defaultPreset, setDefaultPreset] = useState(() =>
    loadActiveModelPreset(loadModelPresets())
  );
  const [selectedPreset, setSelectedPreset] = useState(() =>
    loadActiveModelPreset(loadModelPresets())
  );
  const [stageModels, setStageModels] = useState(() => {
    const presets = loadModelPresets();
    const presetKey = loadActiveModelPreset(presets);
    return { ...presets[presetKey] };
  });

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
  const [sectionCount, setSectionCount] = useState(3);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const modelsPayload = useMemo(
    () => buildModelsPayload(stageModels),
    [stageModels]
  );

  const handleStageModelChange = useCallback((stageKey, value) => {
    setStageModels((current) => ({
      ...current,
      [stageKey]: value,
    }));
  }, []);

  const handlePresetModelChange = useCallback((presetKey, stageKey, value) => {
    setModelPresets((current) =>
      normalizeModelPresets({
        ...current,
        [presetKey]: { ...(current[presetKey] || {}), [stageKey]: value },
      })
    );
  }, []);

  const handlePresetSelect = useCallback((presetKey) => {
    setSelectedPreset(presetKey);
  }, []);

  const handleDefaultPresetChange = useCallback((presetKey) => {
    setDefaultPreset(presetKey);
    setSelectedPreset(presetKey);
  }, []);

  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);


  const {
    outlineTopic,
    setOutlineTopic,
    outlineInputMode,
    setOutlineInputMode,
    outlineSections,
    outlineJsonInput,
    setOutlineJsonInput,
    outlineError,
    resetOutlineForm,
    handleAddOutlineSection,
    handleRemoveOutlineSection,
    handleOutlineSectionTitleChange,
    handleOutlineSubsectionChange,
    handleAddSubsectionLine,
    handleRemoveSubsectionLine,
    handleOutlineSubmit,
  } = useOutlineForm({
    isRunning,
    appendMessage,
    models: modelsPayload,
    onGenerate: async (payload, assistantId, topicText) => {
      const wasSuccessful = await runReportFlow(
        payload,
        assistantId,
        topicText
      );
      setIsRunning(false);
      if (wasSuccessful) {
        resetOutlineForm();
      }
    }
  });

  const topicViewEditorRef = useRef(null);
  const skipTopicCommitRef = useRef(false);

  useEffect(() => {
    persistList(SAVED_TOPICS_KEY, savedTopics);
  }, [savedTopics]);

  useEffect(() => {
    persistList(SAVED_REPORTS_KEY, savedReports);
  }, [savedReports]);

  useEffect(() => {
    persistModelPresets(modelPresets);
  }, [modelPresets]);

  useEffect(() => {
    persistActiveModelPreset(defaultPreset);
  }, [defaultPreset]);

  useEffect(() => {
    const normalized = normalizeModelPresets(modelPresets);
    const selected = normalized[selectedPreset] || normalized[defaultPreset] || normalized.fast;
    setStageModels({ ...selected });
  }, [defaultPreset, modelPresets, selectedPreset]);


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
            sections: sectionCount,
            models: modelsPayload,
          },
          assistantId,
          normalizedPrompt
        );
        return true;
      } finally {
        setIsRunning(false);
      }
    },
    [appendMessage, isRunning, modelsPayload, rememberTopic, runReportFlow, sectionCount]
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



  const composerButtonLabel = isRunning ? "Stop" : "Generate Report";
  const outlineSubmitLabel = isRunning ? "Working…" : "Generate report";

  const normalizedOutlineTopic = outlineTopic.trim();
  const lineModeValidity = outlineSections.every((section) => {
    const title = section.title.trim();
    return Boolean(title);
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
            Array.isArray(section.subsections)
        )
      ) {
        jsonValidationError = "Each JSON section needs a title.";
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
        onOpenSettings={handleOpenSettings}
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
            sectionCount={sectionCount}
            setSectionCount={setSectionCount}
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
            stageModels={stageModels}
            onStageModelChange={handleStageModelChange}
            selectedPreset={selectedPreset}
            onPresetSelect={handlePresetSelect}
          />
        )}
      </main>
      {isSettingsOpen && (
        <div
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseSettings}
        >
          <div className="settings-panel" onClick={(event) => event.stopPropagation()}>
            <header className="settings-panel__header">
              <div>
                <p className="settings-panel__eyebrow">Explorer</p>
                <h1 className="settings-panel__title">Settings</h1>
              </div>
              <button type="button" className="settings-panel__close" onClick={handleCloseSettings}>
                Close
              </button>
            </header>
            <ModelSettings
              defaultPreset={defaultPreset}
              onDefaultPresetChange={handleDefaultPresetChange}
              presets={modelPresets}
              onPresetModelChange={handlePresetModelChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
