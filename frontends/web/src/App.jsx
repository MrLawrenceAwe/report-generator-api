import { useState, useCallback, useMemo } from 'react';
import { useChat } from './hooks/useChat';
import { useOutlineForm } from './hooks/useOutlineForm';
import { useSettings } from './hooks/useSettings';
import { usePersistence } from './hooks/usePersistence';
import { useExplore } from './hooks/useExplore';
import { useTopicView } from './hooks/useTopicView';
import { Sidebar } from './components/Sidebar';
import { ChatPane } from './components/ChatPane';
import { TopicView } from './components/TopicView';
import { OutlineForm } from './components/OutlineForm';
import {
  loadApiBase,
  loadSavedList,
  SAVED_TOPICS_KEY,
  SAVED_REPORTS_KEY,
  MAX_SAVED_TOPICS,
  MAX_SAVED_REPORTS,
  MODE_TABS,
  summarizeReport,
  MODEL_PRESET_LABELS,
} from './utils/helpers';
import { ModelSettings } from './components/ModelSettings';

function App() {
  const [apiBase] = useState(loadApiBase);
  const [savedTopics, setSavedTopics] = useState(() => loadSavedList(SAVED_TOPICS_KEY));
  const [savedReports, setSavedReports] = useState(() => loadSavedList(SAVED_REPORTS_KEY));
  const [composerValue, setComposerValue] = useState("");
  const [topicViewBarValue, setTopicViewBarValue] = useState("");
  const [mode, setMode] = useState("topic");
  const [sectionCount, setSectionCount] = useState(3);

  const {
    modelPresets,
    defaultPreset,
    selectedPreset,
    stageModels,
    isSettingsOpen,
    suggestionModel,
    modelsPayload,
    handleStageModelChange,
    handlePresetModelChange,
    handlePresetSelect,
    handleDefaultPresetChange,
    handleOpenSettings,
    handleCloseSettings,
    handleSuggestionModelChange,
  } = useSettings();

  usePersistence({
    savedTopics,
    savedReports,
    modelPresets,
    defaultPreset,
    suggestionModel,
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

  const rememberTopics = useCallback((prompts) => {
    const normalizedPrompts = (Array.isArray(prompts) ? prompts : [prompts])
      .map((entry) => (entry || "").trim())
      .filter(Boolean);
    if (!normalizedPrompts.length) return;
    setSavedTopics((current) => {
      const deduped = current.filter(
        (entry) => !normalizedPrompts.includes(entry.prompt)
      );
      const newEntries = normalizedPrompts.map((prompt) => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        prompt,
      }));
      return [...newEntries, ...deduped].slice(0, MAX_SAVED_TOPICS);
    });
  }, []);

  const rememberTopic = useCallback(
    (prompt) => rememberTopics([prompt]),
    [rememberTopics]
  );

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
            return: "report_with_outline",
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
    [appendMessage, isRunning, modelsPayload, rememberTopic, runReportFlow, sectionCount, setIsRunning]
  );

  const {
    exploreSuggestions,
    exploreLoading,
    selectedExploreSuggestions,
    exploreSelectMode,
    exploreSelectToggleRef,
    exploreSuggestionsRef,
    handleRefreshExplore,
    handleToggleExploreSuggestion,
    handleToggleExploreSelectMode,
  } = useExplore({
    apiBase,
    savedTopics,
    savedReports,
    suggestionModel,
    rememberTopics,
  });

  const {
    topicViewTopic,
    topicViewDraft,
    setTopicViewDraft,
    isTopicEditing,
    topicSuggestions,
    topicSuggestionsLoading,
    selectedSuggestions,
    topicSelectMode,
    topicSelectToggleRef,
    topicSuggestionsRef,
    topicViewEditorRef,
    openTopicView,
    closeTopicView,
    startTopicEditing,
    cancelTopicEditing,
    commitTopicEdit,
    handleTopicEditSubmit,
    handleTopicEditBlur,
    handleTopicEditKeyDown,
    handleTopicTitleKeyDown,
    handleTopicViewGenerate,
    handleTopicViewSave,
    handleSuggestionToggle,
    handleSaveSelectedSuggestions,
    handleRefreshSuggestions,
    handleToggleTopicSelectMode,
  } = useTopicView({
    apiBase,
    suggestionModel,
    rememberTopics,
    isRunning,
    runTopicPrompt,
  });

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
  const isTopicSaved = useMemo(
    () => savedTopics.some((entry) => entry.prompt === topicViewTopic),
    [savedTopics, topicViewTopic]
  );
  const shouldShowExplore = !isTopicViewOpen && !hasMessages;
  const presetLabel = MODEL_PRESET_LABELS[selectedPreset] || selectedPreset;

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
        {shouldShowExplore && (
          <section className="explore" aria-label="Explore suggestions">
            <div className="explore__header">
              <div>
                <p className="topic-view__eyebrow">Explore</p>
              </div>
              <div className="explore__actions">
                <button
                  type="button"
                  className="topic-view__pill topic-view__pill--action"
                  onClick={handleRefreshExplore}
                  disabled={exploreLoading}
                  aria-label="Regenerate suggestions"
                >
                  {exploreLoading ? "…" : (
                    <svg className="pill-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 4v6h-6l2.24-2.24A6 6 0 0 0 6 12a6 6 0 0 0 6 6 6 6 0 0 0 5.65-3.88l1.88.68A8 8 0 0 1 12 20 8 8 0 0 1 4 12a8 8 0 0 1 12.73-6.36L19 3z" />
                    </svg>
                  )}
                </button>
                {exploreSuggestions.length > 0 && (
                  <button
                    type="button"
                    className={`select-toggle${exploreSelectMode ? " select-toggle--active" : ""}`}
                    onClick={handleToggleExploreSelectMode}
                    aria-pressed={exploreSelectMode}
                    aria-label="Toggle select mode"
                    ref={exploreSelectToggleRef}
                  >
                    {exploreSelectMode && selectedExploreSuggestions.length ? (
                      "Save"
                    ) : (
                      <svg className="pill-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9.5 16.2 5.3 12l-1.4 1.4L9.5 19 20 8.5 18.6 7.1z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
            <p className="topic-view__description">
              {exploreLoading
                ? "…"
                : ``}
            </p>
            <div className="explore__grid" ref={exploreSuggestionsRef}>
              {exploreSuggestions.map((suggestion) => {
                const isSelected = selectedExploreSuggestions.includes(suggestion);
                return (
                  <button
                    key={suggestion}
                    type="button"
                    className={`topic-view__pill explore__pill${isSelected ? " topic-view__pill--selected" : ""}`}
                    onClick={() => {
                      if (exploreSelectMode) {
                        handleToggleExploreSuggestion(suggestion);
                      } else {
                        openTopicView(suggestion);
                      }
                    }}
                    title={exploreSelectMode ? "Click to select" : "Click to open"}
                  >
                    {suggestion}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {isTopicViewOpen ? (
          <TopicView
            topic={topicViewTopic}
            isEditing={isTopicEditing}
            draft={topicViewDraft}
            setDraft={setTopicViewDraft}
            isSaved={isTopicSaved}
            suggestions={topicSuggestions}
            suggestionsLoading={topicSuggestionsLoading}
            selectedSuggestions={selectedSuggestions}
            selectMode={topicSelectMode}
            presetLabel={presetLabel}
            stageModels={stageModels}
            onStageModelChange={handleStageModelChange}
            selectedPreset={selectedPreset}
            onPresetSelect={handlePresetSelect}
            selectToggleRef={topicSelectToggleRef}
            suggestionsRef={topicSuggestionsRef}
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
              handleToggleSuggestion: handleSuggestionToggle,
              handleSaveSelectedSuggestions,
              handleRefreshSuggestions,
              handleToggleSelectMode: handleToggleTopicSelectMode,
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
            presetLabel={presetLabel}
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
            hideComposer={isRunning}
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
              suggestionModel={suggestionModel}
              onSuggestionModelChange={handleSuggestionModelChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
