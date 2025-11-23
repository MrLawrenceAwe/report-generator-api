import React from 'react';
import { SavedTopicsList } from './SavedTopicsList';
import { ReportsList } from './ReportsList';
import { GenerationBar } from './GenerationBar';

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
    isSyncing,
    savedError,
}) {
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
            {savedError ? (
                <p className="sidebar__status sidebar__status--error">{savedError}</p>
            ) : isSyncing ? (
                <p className="sidebar__status">Syncing saved items…</p>
            ) : null}
            <GenerationBar
                topicViewBarValue={topicViewBarValue}
                setTopicViewBarValue={setTopicViewBarValue}
                handleTopicViewBarSubmit={handleTopicViewBarSubmit}
            />
            <div className="sidebar__content">
                <SavedTopicsList
                    savedTopics={savedTopics}
                    handleTopicRecall={handleTopicRecall}
                    handleTopicRemove={handleTopicRemove}
                />
                <ReportsList
                    savedReports={savedReports}
                    onReportSelect={onReportSelect}
                    handleReportRemove={handleReportRemove}
                />
            </div>
        </aside>
    );
}
