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
import { ReportView } from './components/ReportView';
import {
  loadApiBase,
  loadSavedList,
  SAVED_TOPICS_KEY,
  SAVED_REPORTS_KEY,
  MAX_SAVED_TOPICS,
  MAX_SAVED_REPORTS,
  summarizeReport,
  MODEL_PRESET_LABELS,
} from './utils/helpers';

import { ExploreSuggestions } from './components/ExploreSuggestions';
import { SettingsModal } from './components/SettingsModal';

function App() {
  const [apiBase] = useState(loadApiBase);
  const [savedTopics, setSavedTopics] = useState(() => loadSavedList(SAVED_TOPICS_KEY));
  const [savedReports, setSavedReports] = useState(() => loadSavedList(SAVED_REPORTS_KEY));
  const [activeReport, setActiveReport] = useState(null);
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

  const rememberReport = useCallback((topic, content, title) => {
    const safeContent = content || "";
    const normalizedTitle = (title || topic || "Explorer Report").trim() || "Explorer Report";
    const normalizedTopic = (topic || normalizedTitle).trim();
    const summary = summarizeReport(safeContent || normalizedTitle);
    setSavedReports((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        topic: normalizedTopic,
        title: normalizedTitle,
        content: safeContent,
        preview: summary,
      },
      ...current,
    ].slice(0, MAX_SAVED_REPORTS));
  }, [setSavedReports]);

  const forgetReport = useCallback((id) => {
    setSavedReports((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const {
    messages,
    isRunning,
    setMessages,
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

  const forgetTopic = useCallback((id) => {
    setSavedTopics((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const runTopicPrompt = useCallback(
    async (prompt) => {
      const normalizedPrompt = (prompt || "").trim();
      if (!normalizedPrompt || isRunning) return false;

      setActiveReport(null);
      const assistantId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      rememberTopic(normalizedPrompt);
      appendMessage({
        id: `${assistantId}-user`,
        role: "user",
        content: normalizedPrompt,
        variant: "topic",
      });
      appendMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        variant: "topic",
        reportTopic: normalizedPrompt,
      });
      setIsRunning(true);
      try {
        await runReportFlow(
          {
            topic: normalizedPrompt,
            mode: "generate_report",
            return: "report_with_outline",
            sections: sectionCount || undefined,
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
    [appendMessage, isRunning, modelsPayload, rememberTopic, runReportFlow, sectionCount, setActiveReport, setIsRunning]
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

  const handleReportOpen = useCallback(
    (reportPayload) => {
      if (!reportPayload) return;
      const content = reportPayload.content || reportPayload.reportText || "";
      const title =
        (reportPayload.title || reportPayload.reportTitle || reportPayload.topic || "Explorer Report").trim() ||
        "Explorer Report";
      const topic =
        (reportPayload.topic || reportPayload.reportTopic || title).trim() || "Explorer Report";
      const preview = reportPayload.preview || summarizeReport(content || "") || topic;
      setActiveReport({
        id: reportPayload.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        topic,
        preview,
        content,
      });
      closeTopicView();
    },
    [closeTopicView]
  );

  const handleReportClose = useCallback(() => {
    setActiveReport(null);
  }, []);

  const handleOpenTopic = useCallback((topic) => {
    setActiveReport(null);
    openTopicView(topic);
  }, [openTopicView]);

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
      setActiveReport(null);
      setIsRunning(true);
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
      handleOpenTopic(normalized);
      setTopicViewBarValue("");
    },
    [handleOpenTopic, topicViewBarValue]
  );

  const handleTopicRecall = useCallback(
    (topic) => {
      handleOpenTopic(topic);
    },
    [handleOpenTopic]
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
  const isReportViewOpen = Boolean(activeReport);
  const isTopicSaved = useMemo(
    () => savedTopics.some((entry) => entry.prompt === topicViewTopic),
    [savedTopics, topicViewTopic]
  );
  const shouldShowExplore = !isTopicViewOpen && !isReportViewOpen && !hasMessages;
  const presetLabel = MODEL_PRESET_LABELS[selectedPreset] || selectedPreset;

  const chatPaneClasses = ["chat-pane"];
  if (!hasMessages && !isTopicViewOpen && !isReportViewOpen) {
    chatPaneClasses.push("chat-pane--empty");
  }
  if (isTopicViewOpen || isReportViewOpen) {
    chatPaneClasses.push("chat-pane--topic-view");
  }
  const chatPaneClassName = chatPaneClasses.join(" ");



  return (
    <div className="page">
      <Sidebar
        savedTopics={savedTopics}
        savedReports={savedReports}
        handleTopicRecall={handleTopicRecall}
        handleTopicRemove={forgetTopic}
        handleReportRemove={forgetReport}
        topicViewBarValue={topicViewBarValue}
        setTopicViewBarValue={setTopicViewBarValue}
        handleTopicViewBarSubmit={handleTopicViewBarSubmit}
        onOpenSettings={handleOpenSettings}
        onReportSelect={handleReportOpen}
        onResetExplore={() => {
          closeTopicView();
          setActiveReport(null);
          setMessages([]);
          setMode("topic");
        }}
      />
      <main className={chatPaneClassName}>
        {shouldShowExplore && (
          <ExploreSuggestions
            exploreSuggestions={exploreSuggestions}
            exploreLoading={exploreLoading}
            selectedExploreSuggestions={selectedExploreSuggestions}
            exploreSelectMode={exploreSelectMode}
            exploreSelectToggleRef={exploreSelectToggleRef}
            exploreSuggestionsRef={exploreSuggestionsRef}
            handleRefreshExplore={handleRefreshExplore}
            handleToggleExploreSuggestion={handleToggleExploreSuggestion}
            handleToggleExploreSelectMode={handleToggleExploreSelectMode}
            handleOpenTopic={handleOpenTopic}
          />
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
              handleOpenTopic,
              handleToggleSuggestion: handleSuggestionToggle,
              handleSaveSelectedSuggestions,
              handleRefreshSuggestions,
              handleToggleSelectMode: handleToggleTopicSelectMode,
              sectionCount,
              setSectionCount,
            }}
            editorRef={topicViewEditorRef}
          />
        ) : isReportViewOpen ? (
          <ReportView
            report={activeReport}
            onClose={handleReportClose}
          />
        ) : (

          <ChatPane
            messages={messages}
            mode={mode}
            setMode={setMode}
            isRunning={isRunning}
            onReset={() => {
              closeTopicView();
              setActiveReport(null);
              setMessages([]);
              setMode("topic");
            }}
            composerValue={composerValue}
            setComposerValue={setComposerValue}
            handleTopicSubmit={handleTopicSubmit}
            handleStop={stopGeneration}
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
            onViewReport={handleReportOpen}
          />
        )}
      </main>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        defaultPreset={defaultPreset}
        onDefaultPresetChange={handleDefaultPresetChange}
        modelPresets={modelPresets}
        onPresetModelChange={handlePresetModelChange}
        suggestionModel={suggestionModel}
        onSuggestionModelChange={handleSuggestionModelChange}
      />
    </div>
  );
}

export default App;
