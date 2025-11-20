import React from 'react';
import { TOPIC_VIEW_BAR_INPUT_ID } from '../utils/helpers';

export function Sidebar({
    savedTopics,
    savedReports,
    handleTopicRecall,
    topicViewBarValue,
    setTopicViewBarValue,
    handleTopicViewBarSubmit,
    onOpenSettings,
}) {
    return (
        <aside className="sidebar" aria-label="Saved prompts and generated reports">
            <div className="sidebar__brand">
                <div className="sidebar__logo">Ex</div>
                <div>
                    <div className="sidebar__title">Explorer</div>
                </div>
            </div>
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
            <section className="sidebar-section">
                <div className="sidebar-section__header">
                    <h2>Saved topics</h2>
                </div>
                {savedTopics.length > 0 ? (
                    <ul className="sidebar-list">
                        {savedTopics.map((topic) => (
                            <li key={topic.id}>
                                <button
                                    type="button"
                                    className="sidebar-entry"
                                    onClick={() => handleTopicRecall(topic.prompt)}
                                >
                                    <span className="sidebar-entry__eyebrow">Topic</span>
                                    <span className="sidebar-entry__title">{topic.prompt}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="sidebar__empty">No saved topics yet.</p>
                )}
            </section>
            <section className="sidebar-section">
                <div className="sidebar-section__header">
                    <h2>Generated reports</h2>
                </div>
                {savedReports.length > 0 ? (
                    <ul className="sidebar-list">
                        {savedReports.map((report) => (
                            <li key={report.id}>
                                <div className="sidebar-entry sidebar-entry--report">
                                    <span className="sidebar-entry__eyebrow">Report</span>
                                    <span className="sidebar-entry__title">{report.topic}</span>
                                    <p className="sidebar-entry__preview">{report.preview}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="sidebar__empty">No reports yet.</p>
                )}
            </section>
        </aside>
    );
}
