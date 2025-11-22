import React, { useState } from 'react';
import { TOPIC_VIEW_BAR_INPUT_ID } from '../utils/helpers';

export function Sidebar({
    savedTopics,
    savedReports,
    handleTopicRecall,
    handleTopicRemove,
    handleReportRemove,
    topicViewBarValue,
    setTopicViewBarValue,
    handleTopicViewBarSubmit,
    onOpenSettings,
    onReportSelect,
    onResetExplore,
}) {
    const [topicsCollapsed, setTopicsCollapsed] = useState(false);
    const [reportsCollapsed, setReportsCollapsed] = useState(false);
    const hasTopics = savedTopics.length > 0;
    const hasReports = savedReports.length > 0;

    return (
        <aside className="sidebar" aria-label="Saved prompts and generated reports">
            <button
                type="button"
                className="sidebar__brand"
                onClick={onResetExplore}
                aria-label="Back to home"
            >
                <div className="sidebar__logo">Ex</div>
                <div>
                    <div className="sidebar__title">Explorer</div>
                </div>
            </button>
            <button type="button" className="sidebar__settings-button" onClick={onOpenSettings}>
                Settings
            </button>
            <section className="sidebar-section sidebar-section--topic-bar">
                <div className="sidebar-section__header">
                    <h2>Topic View bar</h2>
                </div>
                <form className="topic-view-bar" onSubmit={handleTopicViewBarSubmit}>
                    <label htmlFor={TOPIC_VIEW_BAR_INPUT_ID} className="topic-view-bar__label">
                        Topic
                    </label>
                    <input
                        id={TOPIC_VIEW_BAR_INPUT_ID}
                        type="text"
                        value={topicViewBarValue}
                        placeholder="e.g. Microplastics In Oceans"
                        onChange={(event) => setTopicViewBarValue(event.target.value)}
                        autoComplete="off"
                    />
                    <p className="topic-view-bar__hint">Press Enter to open the Topic View.</p>
                </form>
            </section>
            <div className="sidebar__content">
                <section className={`sidebar-section${topicsCollapsed ? ' sidebar-section--collapsed' : ''}`}>
                    <div className="sidebar-section__header">
                        <button
                            type="button"
                            className="sidebar-section__toggle"
                            aria-expanded={!topicsCollapsed}
                            aria-controls="sidebar-saved-topics"
                            onClick={() => setTopicsCollapsed((prev) => !prev)}
                        >
                            <div className="sidebar-section__heading">
                                <h2>Saved topics</h2>
                                <span className="sidebar-section__count">{savedTopics.length}</span>
                            </div>
                            <span
                                className={`sidebar-section__chevron${topicsCollapsed ? ' sidebar-section__chevron--collapsed' : ''}`}
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                    {!topicsCollapsed && (
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
                <section className={`sidebar-section${reportsCollapsed ? ' sidebar-section--collapsed' : ''}`}>
                    <div className="sidebar-section__header">
                        <button
                            type="button"
                            className="sidebar-section__toggle"
                            aria-expanded={!reportsCollapsed}
                            aria-controls="sidebar-saved-reports"
                            onClick={() => setReportsCollapsed((prev) => !prev)}
                        >
                            <div className="sidebar-section__heading">
                                <h2>Generated reports</h2>
                                <span className="sidebar-section__count">{savedReports.length}</span>
                            </div>
                            <span
                                className={`sidebar-section__chevron${reportsCollapsed ? ' sidebar-section__chevron--collapsed' : ''}`}
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                    {!reportsCollapsed && (
                        hasReports ? (
                            <ul className="sidebar-list" id="sidebar-saved-reports">
                                {savedReports.map((report) => (
                                    <li key={report.id} className="sidebar-entry-wrapper">
                                        <button
                                            type="button"
                                            className="sidebar-entry sidebar-entry--report"
                                            onClick={() => onReportSelect?.(report)}
                                            aria-label={`Open report ${report.title || report.topic}`}
                                        >
                                            <span className="sidebar-entry__eyebrow">Report</span>
                                            <span className="sidebar-entry__title">{report.topic}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="sidebar-entry__delete-icon"
                                            aria-label={`Delete report ${report.title || report.topic}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleReportRemove?.(report.id);
                                            }}
                                        >
                                            ×
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="sidebar__empty" id="sidebar-saved-reports">No reports yet.</p>
                        )
                    )}
                </section>
            </div>
        </aside>
    );
}
