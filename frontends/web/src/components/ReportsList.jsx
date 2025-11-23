import React, { useState } from 'react';

export function ReportsList({ savedReports, onReportSelect, handleReportRemove, generatingReport, onGeneratingReportSelect }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const hasReports = savedReports.length > 0 || Boolean(generatingReport);

    return (
        <section className={`sidebar-section${isCollapsed ? ' sidebar-section--collapsed' : ''}`}>
            <div className="sidebar-section__header">
                <button
                    type="button"
                    className="sidebar-section__toggle"
                    aria-expanded={!isCollapsed}
                    aria-controls="sidebar-saved-reports"
                    onClick={() => setIsCollapsed((prev) => !prev)}
                >
                    <div className="sidebar-section__heading">
                        <h2>Reports</h2>
                        <span className="sidebar-section__count">{savedReports.length + (generatingReport ? 1 : 0)}</span>
                    </div>
                    <span
                        className={`sidebar-section__chevron${isCollapsed ? ' sidebar-section__chevron--collapsed' : ''}`}
                        aria-hidden="true"
                    />
                </button>
            </div>
            {!isCollapsed && (
                hasReports ? (
                    <ul className="sidebar-list" id="sidebar-saved-reports">
                        {generatingReport && (
                            <li key="generating" className="sidebar-entry-wrapper">
                                <button
                                    type="button"
                                    className={`sidebar-entry sidebar-entry--report${generatingReport.isGenerating ? ' sidebar-entry--generating' : ''}`}
                                    onClick={onGeneratingReportSelect}
                                    aria-label={`View ${generatingReport.isGenerating ? 'generating' : 'active'} report ${generatingReport.topic}`}
                                >
                                    <span className="sidebar-entry__eyebrow">{generatingReport.isGenerating ? 'Generating…' : 'Active Session'}</span>
                                    <span className="sidebar-entry__title">{generatingReport.topic}</span>
                                    {generatingReport.isGenerating && <div className="sidebar-entry__spinner" />}
                                </button>
                            </li>
                        )}
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
    );
}
