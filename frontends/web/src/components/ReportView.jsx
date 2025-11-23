import { useEffect, useMemo, useRef, useState } from 'react';
import { cleanHeadingForTopic, copyTextToClipboard, downloadTextFile } from '../utils/helpers';

function normalizeOutlineSections(outlineCandidate) {
    const sections = Array.isArray(outlineCandidate?.sections)
        ? outlineCandidate.sections
        : Array.isArray(outlineCandidate)
            ? outlineCandidate
            : [];
    const seen = new Set();
    return sections
        .map((section) => {
            const title = (section?.title || "").trim();
            if (!title) return null;
            const subsections = Array.isArray(section.subsections)
                ? section.subsections.map((entry) => (entry || "").trim()).filter(Boolean)
                : [];
            return { title, subsections };
        })
        .filter((section) => {
            if (!section) return false;
            const key = section.title.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function extractOutlineFromContent(content) {
    const safeContent = (content || "").trim();
    if (!safeContent) return [];

    const sections = [];
    const seen = new Set();
    const addHeading = (title) => {
        const normalized = (title || "").replace(/\s+/g, " ").trim();
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        sections.push({ title: normalized, subsections: [] });
    };

    safeContent.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const markdownMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
        if (markdownMatch) {
            addHeading(markdownMatch[1]);
            return;
        }
        const numberedMatch = trimmed.match(/^(?:Section\s+\d+[:.\-]?\s*|[0-9]+[\.\)]\s+)(.+)$/i);
        if (numberedMatch) {
            addHeading(numberedMatch[1]);
        }
    });

    if (!sections.length) {
        safeContent.split(/\n{2,}/).forEach((block) => {
            const [firstLine] = block.split(/\r?\n/);
            const heading = (firstLine || "").trim();
            if (!heading) return;
            if (heading.length > 140) return;
            const wordCount = heading.split(/\s+/).length;
            if (/[.!?]"?$/.test(heading) && wordCount > 10) return;
            if (/^[\-\*\u2022]/.test(heading)) return;
            addHeading(heading);
        });
    }

    return sections.slice(0, 60);
}

function deriveReportOutline(report) {
    if (!report) return [];
    const structuredCandidates = [
        report.outline,
        report.sections?.outline,
        report.sections,
    ];
    for (const candidate of structuredCandidates) {
        const normalized = normalizeOutlineSections(candidate);
        if (normalized.length) return normalized;
    }
    return extractOutlineFromContent(report.content);
}

export function ReportView({ report, onClose, onOpenTopic }) {
    const [copyLabel, setCopyLabel] = useState("Copy");
    const [isOutlineOpen, setIsOutlineOpen] = useState(false);
    const copyResetRef = useRef(null);

    const outlineSections = useMemo(() => deriveReportOutline(report), [report]);
    const hasOutline = outlineSections.length > 0;

    useEffect(
        () => () => {
            if (copyResetRef.current) {
                clearTimeout(copyResetRef.current);
            }
        },
        []
    );

    useEffect(() => {
        setIsOutlineOpen(false);
    }, [report?.id]);

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

    const handleSelectHeading = (heading) => {
        const normalized = cleanHeadingForTopic(heading);
        if (!normalized || !onOpenTopic) return;
        setIsOutlineOpen(false);
        onOpenTopic(normalized, { pauseSuggestions: true, normalizeHeading: false });
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
                    {hasOutline && (
                        <button
                            type="button"
                            className="report-view__button"
                            onClick={() => setIsOutlineOpen((open) => !open)}
                            aria-pressed={isOutlineOpen}
                        >
                            {isOutlineOpen ? "Hide outline" : "View outline"}
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
            {isOutlineOpen && hasOutline && (
                <aside className="report-outline" aria-label="Report outline">
                    <div className="report-outline__header">
                        <div>
                            <p className="report-outline__eyebrow">Outline</p>
                            <p className="report-outline__hint">Open any heading in Topic view.</p>
                        </div>
                        <button
                            type="button"
                            className="report-outline__close"
                            onClick={() => setIsOutlineOpen(false)}
                        >
                            Close
                        </button>
                    </div>
                    <ol className="report-outline__list">
                        {outlineSections.map((section, index) => (
                            <li key={`${section.title}-${index}`} className="report-outline__item">
                                <button
                                    type="button"
                                    className="report-outline__section"
                                    onClick={() => handleSelectHeading(section.title)}
                                >
                                    <span className="report-outline__badge">{index + 1}</span>
                                    <span className="report-outline__section-title">{section.title}</span>
                                </button>
                                {section.subsections?.length ? (
                                    <ul className="report-outline__subsections">
                                        {section.subsections.map((sub, subIndex) => (
                                            <li key={`${section.title}-${sub}-${subIndex}`}>
                                                <button
                                                    type="button"
                                                    className="report-outline__subsection"
                                                    onClick={() => handleSelectHeading(sub)}
                                                >
                                                    {sub}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </li>
                        ))}
                    </ol>
                </aside>
            )}
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
