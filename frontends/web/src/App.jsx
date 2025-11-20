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
  fetchTopicSuggestions,
  loadSuggestionModel,
  persistSuggestionModel,
  MODEL_PRESET_LABELS,
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
const [topicSuggestions, setTopicSuggestions] = useState([]);
const [topicSuggestionsLoading, setTopicSuggestionsLoading] = useState(false);
const [topicSuggestionsNonce, setTopicSuggestionsNonce] = useState(0);
const [selectedSuggestions, setSelectedSuggestions] = useState([]);
const [topicSelectMode, setTopicSelectMode] = useState(false);
const topicSelectToggleRef = useRef(null);
const topicSuggestionsRef = useRef(null);
const [mode, setMode] = useState("topic");
const [sectionCount, setSectionCount] = useState(3);
const [isSettingsOpen, setIsSettingsOpen] = useState(false);
const modelsPayload = useMemo(
  () => buildModelsPayload(stageModels),
  [stageModels]
);
const [exploreSuggestions, setExploreSuggestions] = useState([]);
const [exploreLoading, setExploreLoading] = useState(false);
const [selectedExploreSuggestions, setSelectedExploreSuggestions] = useState([]);
const [exploreNonce, setExploreNonce] = useState(0);
const [exploreSelectMode, setExploreSelectMode] = useState(false);
const exploreSelectToggleRef = useRef(null);
const exploreSuggestionsRef = useRef(null);
const [suggestionModel, setSuggestionModel] = useState(loadSuggestionModel);

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
    persistSuggestionModel(suggestionModel);
  }, [suggestionModel]);

  useEffect(() => {
    const controller = new AbortController();
    const loadExplore = async () => {
      setExploreLoading(true);
      setSelectedExploreSuggestions([]);
      const seeds = [
        ...savedTopics.map((entry) => entry.prompt),
        ...savedReports.map((entry) => entry.topic),
      ];
      const remote = await fetchTopicSuggestions(apiBase, {
        seeds,
        enableFreeRoam: false,
        model: suggestionModel,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const fallbackSeeds = seeds.filter(Boolean).slice(0, 1);
      const localFallback = fallbackSeeds.length ? generateRelatedTopics(fallbackSeeds[0]) : [];
      const merged = remote.length ? remote : localFallback;
      setExploreSuggestions(merged);
      setExploreLoading(false);
    };
    loadExplore();
    return () => controller.abort();
  }, [apiBase, exploreNonce, savedReports, savedTopics]);


  useEffect(() => {
    setTopicViewDraft(topicViewTopic);
    setIsTopicEditing(false);
    setSelectedSuggestions([]);
    setTopicSelectMode(false);
  }, [topicViewTopic]);

  useEffect(() => {
    if (isTopicEditing) {
      topicViewEditorRef.current?.focus();
      topicViewEditorRef.current?.select?.();
    }
  }, [isTopicEditing]);

  useEffect(() => {
    if (!topicViewTopic) {
      setTopicSuggestions([]);
      setSelectedSuggestions([]);
      setTopicSelectMode(false);
      return undefined;
    }
    const controller = new AbortController();
    setTopicSuggestionsLoading(true);
    setSelectedSuggestions([]);
    const loadSuggestions = async () => {
      const remote = await fetchTopicSuggestions(apiBase, {
        topic: topicViewTopic,
        seeds: [],
        enableFreeRoam: false,
        includeReportHeadings: false,
        model: suggestionModel,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const merged = remote.length ? remote : generateRelatedTopics(topicViewTopic);
      setTopicSuggestions(merged);
      setTopicSuggestionsLoading(false);
    };
    loadSuggestions();
    return () => controller.abort();
  }, [apiBase, topicSuggestionsNonce, topicViewTopic]);

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

  const handleSuggestionModelChange = useCallback((model) => {
    setSuggestionModel(model);
  }, []);

  const handleSuggestionToggle = useCallback((title) => {
    const normalized = (title || "").trim();
    if (!normalized) return;
    setSelectedSuggestions((current) => {
      if (current.includes(normalized)) {
        return current.filter((entry) => entry !== normalized);
      }
      return [...current, normalized];
    });
  }, []);

  const handleSaveSelectedSuggestions = useCallback(() => {
    if (!selectedSuggestions.length) return;
    rememberTopics(selectedSuggestions);
    setSelectedSuggestions([]);
    setTopicSelectMode(false);
  }, [rememberTopics, selectedSuggestions]);

  const handleRefreshSuggestions = useCallback(() => {
    setTopicSuggestionsNonce((value) => value + 1);
  }, []);

  const handleToggleExploreSuggestion = useCallback((title) => {
    const normalized = (title || "").trim();
    if (!normalized) return;
    setSelectedExploreSuggestions((current) => {
      if (current.includes(normalized)) {
        return current.filter((entry) => entry !== normalized);
      }
      return [...current, normalized];
    });
  }, []);

  const handleSaveSelectedExplore = useCallback(() => {
    if (!selectedExploreSuggestions.length) return;
    rememberTopics(selectedExploreSuggestions);
    setSelectedExploreSuggestions([]);
    setExploreSelectMode(false);
  }, [rememberTopics, selectedExploreSuggestions]);

  const handleRefreshExplore = useCallback(() => {
    setExploreNonce((value) => value + 1);
  }, []);

  const handleToggleExploreSelectMode = useCallback(() => {
    if (!exploreSelectMode) {
      setSelectedExploreSuggestions([]);
      setExploreSelectMode(true);
      return;
    }
    if (selectedExploreSuggestions.length) {
      handleSaveSelectedExplore();
      return;
    }
    setSelectedExploreSuggestions([]);
    setExploreSelectMode(false);
  }, [exploreSelectMode, handleSaveSelectedExplore, selectedExploreSuggestions.length]);

  const handleToggleTopicSelectMode = useCallback(() => {
    if (!topicSelectMode) {
      setSelectedSuggestions([]);
      setTopicSelectMode(true);
      return;
    }
    if (selectedSuggestions.length) {
      handleSaveSelectedSuggestions();
      return;
    }
    setSelectedSuggestions([]);
    setTopicSelectMode(false);
  }, [handleSaveSelectedSuggestions, selectedSuggestions.length, topicSelectMode]);

  useEffect(() => {
    const handleGlobalClick = (event) => {
      const target = event.target;
      if (
        exploreSelectMode &&
        exploreSuggestionsRef.current &&
        !exploreSuggestionsRef.current.contains(target) &&
        !exploreSelectToggleRef.current?.contains(target)
      ) {
        setSelectedExploreSuggestions([]);
        setExploreSelectMode(false);
      }
      if (
        topicSelectMode &&
        topicSuggestionsRef.current &&
        !topicSuggestionsRef.current.contains(target) &&
        !topicSelectToggleRef.current?.contains(target)
      ) {
        setSelectedSuggestions([]);
        setTopicSelectMode(false);
      }
    };
    document.addEventListener("mousedown", handleGlobalClick);
    return () => document.removeEventListener("mousedown", handleGlobalClick);
  }, [exploreSelectMode, topicSelectMode]);



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
  const isTopicSaved = useMemo(
    () => savedTopics.some((entry) => entry.prompt === topicViewTopic),
    [savedTopics, topicViewTopic]
  );
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
        {!isTopicViewOpen && (
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
            presetLabel={presetLabel}
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
