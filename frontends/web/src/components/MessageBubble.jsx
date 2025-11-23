import React from 'react';
import { downloadTextFile } from '../utils/helpers';

export function MessageBubble({ message, onViewReport }) {
    const handleViewReport = () => {
        if (!onViewReport || !message.reportText) return;
        onViewReport({
            id: message.id,
            title: message.reportTitle,
            topic: message.reportTopic,
            content: message.reportText,
            outline: message.outline,
        });
    };

    if (message.variant === "outline") {
        return <pre>{message.content}</pre>;
    }

    if (message.role === "user") {
        return <p>{message.content}</p>;
    }

    const statusLines = Array.isArray(message.statusLog) && message.statusLog.length
        ? message.statusLog
        : (message.content || "").split("\n").map((line) => line.trim()).filter(Boolean);
    const outlineReadyIndex = statusLines.findIndex((line) =>
        line.toLowerCase().startsWith("outline ready")
    );
    const hasOutlineReady = outlineReadyIndex >= 0;
    const preStatus = hasOutlineReady
        ? statusLines.slice(0, outlineReadyIndex + 1)
        : statusLines;
    const postStatus = hasOutlineReady
        ? statusLines.slice(outlineReadyIndex + 1)
        : [];

    const renderStatusBlock = (lines, blockKey) =>
        lines.length ? (
            <div className="message__status-block" key={`${message.id}-${blockKey}`}>
                {lines.map((line, index) => (
                    <p className="message__status" key={`${message.id}-${blockKey}-${index}`}>
                        {line}
                    </p>
                ))}
            </div>
        ) : null;

    return (
        <>
            {renderStatusBlock(preStatus, "pre")}
            {message.outline && (
                <div className="message__outline">
                    <p className="message__outline-title">Outline</p>
                    <ol>
                        {message.outline.sections?.map((section) => (
                            <li key={section.title}>
                                <strong>{section.title}</strong>
                                {!!section.subsections?.length && (
                                    <ul>
                                        {section.subsections.map((sub) => (
                                            <li key={`${section.title}-${sub}`}>{sub}</li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            )}
            {renderStatusBlock(postStatus, "post")}
            {message.reportText && (
                <div className="message__download">
                    {onViewReport && (
                        <button
                            type="button"
                            onClick={handleViewReport}
                        >
                            View
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => downloadTextFile(message.reportText, `${message.reportTitle || "report"}.md`)}
                    >
                        Download
                    </button>
                </div>
            )}
        </>
    );
}
