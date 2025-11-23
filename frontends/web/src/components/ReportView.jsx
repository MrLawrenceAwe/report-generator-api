import { useEffect, useRef, useState } from 'react';
import { copyTextToClipboard, downloadTextFile } from '../utils/helpers';

export function ReportView({ report, onClose }) {
    const [copyLabel, setCopyLabel] = useState("Copy");
    const copyResetRef = useRef(null);

    useEffect(
        () => () => {
            if (copyResetRef.current) {
                clearTimeout(copyResetRef.current);
            }
        },
        []
    );

    if (!report) return null;
    const title = (report.title || report.topic || "Explorer Report").trim() || "Explorer Report";
    const topic = (report.topic || "").trim();
    const subtitle = topic && topic !== title ? topic : null;

    const handleDownload = () => {
        if (!report.content) return;
        downloadTextFile(report.content, `${title}.md`);
    };

    const handleCopy = async () => {
        if (!report.content) return;
        if (copyResetRef.current) {
            clearTimeout(copyResetRef.current);
        }
        try {
            await copyTextToClipboard(report.content);
            setCopyLabel("Copied");
        } catch (error) {
            console.warn("Failed to copy report", error);
            setCopyLabel("Copy failed");
        } finally {
            copyResetRef.current = window.setTimeout(() => setCopyLabel("Copy"), 1800);
        }
    };

    return (
        <section className="report-view" aria-label="Saved report">
            <header className="report-view__header">
                <div>
                    <p className="report-view__eyebrow">Report</p>
                    <h1 className="report-view__title">{title}</h1>
                    {subtitle && <p className="report-view__subtitle">{subtitle}</p>}
                </div>
                <div className="report-view__actions">
                    {report.content && (
                        <button type="button" className="report-view__button" onClick={handleCopy}>
                            {copyLabel}
                        </button>
                    )}
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
