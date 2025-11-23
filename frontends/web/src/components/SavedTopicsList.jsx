import React, { useState } from 'react';

export function SavedTopicsList({ savedTopics, handleTopicRecall, handleTopicRemove }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const hasTopics = savedTopics.length > 0;

    return (
        <section className={`sidebar-section${isCollapsed ? ' sidebar-section--collapsed' : ''}`}>
            <div className="sidebar-section__header">
                <button
                    type="button"
                    className="sidebar-section__toggle"
                    aria-expanded={!isCollapsed}
                    aria-controls="sidebar-saved-topics"
                    onClick={() => setIsCollapsed((prev) => !prev)}
                >
                    <div className="sidebar-section__heading">
                        <h2>Saved topics</h2>
                        <span className="sidebar-section__count">{savedTopics.length}</span>
                    </div>
                    <span
                        className={`sidebar-section__chevron${isCollapsed ? ' sidebar-section__chevron--collapsed' : ''}`}
                        aria-hidden="true"
                    />
                </button>
            </div>
            {!isCollapsed && (
                hasTopics ? (
                    <ul className="sidebar-list" id="sidebar-saved-topics">
                        {savedTopics.map((topic) => (
                            <li key={topic.id} className="sidebar-entry-wrapper">
                                <button
                                    type="button"
                                    className="sidebar-entry"
                                    onClick={() => handleTopicRecall(topic.prompt)}
                                >
                                    <span className="sidebar-entry__eyebrow">Topic</span>
                                    <span className="sidebar-entry__title">{topic.prompt}</span>
                                </button>
                                <button
                                    type="button"
                                    className="sidebar-entry__delete-icon"
                                    aria-label={`Delete saved topic ${topic.prompt}`}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleTopicRemove?.(topic.id);
                                    }}
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="sidebar__empty" id="sidebar-saved-topics">No saved topics yet.</p>
                )
            )}
        </section>
    );
}
