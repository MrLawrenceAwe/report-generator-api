import { downloadTextFile } from '../utils/helpers';

export function ReportView({ report, onClose }) {
    if (!report) return null;
    const title = (report.title || report.topic || "Explorer Report").trim() || "Explorer Report";
    const topic = (report.topic || title).trim();
    const handleDownload = () => {
        if (!report.content) return;
        downloadTextFile(report.content, `${title}.md`);
    };

    return (
        <section className="report-view" aria-label="Saved report">
            <header className="report-view__header">
                <div>
                    <p className="report-view__eyebrow">Report</p>
                    <h1 className="report-view__title">{title}</h1>
                    {topic && <p className="report-view__subtitle">{topic}</p>}
                </div>
                <div className="report-view__actions">
                    {report.content && (
                        <button type="button" className="report-view__button" onClick={handleDownload}>
                            Download
                        </button>
                    )}
                    <button type="button" className="report-view__close" onClick={onClose}>
                        Close
                    </button>
                </div>
            </header>
            {report.content ? (
                <article className="report-view__content" aria-label="Report body">
                    <pre>{report.content}</pre>
                </article>
            ) : (
                <div className="report-view__empty">
                    <p>The full report text is unavailable for this entry.</p>
                    <p className="report-view__empty-hint">
                        Generate a new report to capture it for viewing and download.
                    </p>
                </div>
            )}
        </section>
    );
}
