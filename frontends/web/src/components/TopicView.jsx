import React from 'react';

export function TopicView({
    topic,
    isEditing,
    draft,
    setDraft,
    isSaved,
    suggestions,
    isRunning,
    handlers,
    editorRef,
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
                    Back
                </button>
            </header>
            <div className="topic-view__actions">
                <button
                    type="button"
                    className="topic-view__generate"
                    onClick={handleGenerate}
                    disabled={isRunning}
                >
                    {isRunning ? "Working…" : "Generate Report"}
                </button>
            </div>
            <p className="topic-view__description">
                Explore topics related to <strong>{topic}</strong>.
            </p>
            <ul className="topic-view__suggestions" aria-label="Suggested related topics">
                {suggestions.map((suggestion) => (
                    <li key={suggestion}>
                        <button
                            type="button"
                            className="topic-view__pill"
                            onClick={() => handleOpenTopic(suggestion)}
                        >
                            {suggestion}
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
