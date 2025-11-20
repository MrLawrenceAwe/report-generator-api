import React from 'react';

export function ExploreSuggestions({
    exploreSuggestions,
    exploreLoading,
    selectedExploreSuggestions,
    exploreSelectMode,
    exploreSelectToggleRef,
    exploreSuggestionsRef,
    handleRefreshExplore,
    handleToggleExploreSuggestion,
    handleToggleExploreSelectMode,
    handleOpenTopic,
}) {
    return (
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
                                    handleOpenTopic(suggestion);
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
    );
}
