import { SectionCountSelector } from './SectionCountSelector';
import { ModelOverrideToggle } from './ModelOverrideToggle';
import { RefineToggle } from './RefineToggle';

export function TopicView({
    topic,
    isEditing,
    draft,
    setDraft,
    isSaved,
    suggestions,
    suggestionsLoading,
    selectedSuggestions,
    selectMode,
    presetLabel,
    stageModels,
    onStageModelChange,
    selectedPreset,
    onPresetSelect,
    isRunning,
    handlers,
    editorRef,
    selectToggleRef,
    suggestionsRef,
    avoidTopics,
    setAvoidTopics,
    includeTopics,
    setIncludeTopics,
}) {
    const {
        startEditing,
        handleEditSubmit,
        handleEditBlur,
        handleEditKeyDown,
        handleTitleKeyDown,
        handleSave,
        handleGenerate,
        handleClose,
        handleOpenTopic,
        handleToggleSuggestion,
        handleRefreshSuggestions,
        handleToggleSelectMode,
        sectionCount,
        setSectionCount,
    } = handlers;

    return (
        <section className="topic-view" aria-label="Topic overview">
            <header className="topic-view__header">
                <div>
                    <p className="topic-view__eyebrow">Topic view</p>
                    <div className="topic-view__title-row">
                        <div className="topic-view__title-group">
                            {isEditing ? (
                                <form
                                    className="topic-view__title-editor"
                                    onSubmit={handleEditSubmit}
                                >
                                    <input
                                        ref={editorRef}
                                        className="topic-view__title-input"
                                        value={draft}
                                        onChange={(event) => setDraft(event.target.value)}
                                        onBlur={handleEditBlur}
                                        onKeyDown={handleEditKeyDown}
                                        aria-label="Edit topic title"
                                    />
                                </form>
                            ) : (
                                <h1
                                    className="topic-view__title topic-view__title--editable"
                                    tabIndex={0}
                                    role="button"
                                    onClick={startEditing}
                                    onKeyDown={handleTitleKeyDown}
                                >
                                    {topic}
                                </h1>
                            )}
                        </div>
                        <span
                            className={`topic-view__save-link${isSaved ? " topic-view__save-link--disabled" : ""}`}
                            role="button"
                            tabIndex={isSaved ? -1 : 0}
                            onClick={isSaved ? undefined : handleSave}
                            onKeyDown={
                                isSaved
                                    ? undefined
                                    : (event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            handleSave();
                                        }
                                    }
                            }
                            aria-disabled={isSaved}
                        >
                            {isSaved ? "Saved" : "Save"}
                        </span>
                    </div>
                </div>
                <button type="button" className="topic-view__close" onClick={handleClose}>
                    X
                </button>
            </header>
            <div className="topic-view__actions">
                <div className="topic-view__refine-row">
                    <RefineToggle
                        avoidTopics={avoidTopics}
                        setAvoidTopics={setAvoidTopics}
                        includeTopics={includeTopics}
                        setIncludeTopics={setIncludeTopics}
                        isRunning={isRunning}
                    />
                </div>
                <div className="topic-view__actions-row">
                    <SectionCountSelector
                        value={sectionCount}
                        onChange={setSectionCount}
                        disabled={isRunning}
                    />
                    <ModelOverrideToggle
                        isRunning={isRunning}
                        stageModels={stageModels}
                        onStageModelChange={onStageModelChange}
                        selectedPreset={selectedPreset}
                        onPresetSelect={onPresetSelect}
                        presetLabel={presetLabel}
                        idPrefix="topicview"
                    />
                    <button
                        type="button"
                        className="topic-view__generate button-generate"
                        onClick={handleGenerate}
                        disabled={isRunning}
                    >
                        {isRunning ? "Working…" : "Generate Report"}
                    </button>
                </div>
            </div>
            <p className="topic-view__description">
                Explore topics related to <strong>{topic}</strong>.
            </p>
            <div className="topic-view__suggestions-header">
                <div>
                    <p className="topic-view__eyebrow">Suggested topics</p>
                    <p className="topic-view__description">
                        {suggestionsLoading ? "Loading suggestions…" : ``}
                    </p>
                </div>
                <div className="topic-view__suggestion-actions">
                    <button
                        type="button"
                        className="topic-view__pill topic-view__pill--action"
                        onClick={handleRefreshSuggestions}
                        disabled={suggestionsLoading}
                        aria-label="Regenerate suggestions"
                    >
                        {suggestionsLoading ? "…" : (
                            <svg className="pill-icon" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M20 4v6h-6l2.24-2.24A6 6 0 0 0 6 12a6 6 0 0 0 6 6 6 6 0 0 0 5.65-3.88l1.88.68A8 8 0 0 1 12 20 8 8 0 0 1 4 12a8 8 0 0 1 12.73-6.36L19 3z" />
                            </svg>
                        )}
                    </button>
                    {suggestions.length > 0 && (
                        <button
                            type="button"
                            className={`select-toggle${selectMode ? " select-toggle--active" : ""}`}
                            onClick={handleToggleSelectMode}
                            aria-pressed={selectMode}
                            aria-label="Toggle select mode"
                            ref={selectToggleRef}
                        >
                            {selectMode && selectedSuggestions.length ? (
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
            <ul className="topic-view__suggestions" aria-label="Suggested related topics" ref={suggestionsRef}>
                {suggestions.map((suggestion) => {
                    const isSelected = selectedSuggestions.includes(suggestion);
                    return (
                        <li key={suggestion} className="topic-view__suggestion">
                            <button
                                type="button"
                                className={`topic-view__pill${isSelected ? " topic-view__pill--selected" : ""}`}
                                onClick={() => {
                                    if (selectMode) {
                                        handleToggleSuggestion(suggestion);
                                    } else {
                                        handleOpenTopic(suggestion);
                                    }
                                }}
                                title={selectMode ? "Click to select" : "Click to open"}
                            >
                                {suggestion}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
