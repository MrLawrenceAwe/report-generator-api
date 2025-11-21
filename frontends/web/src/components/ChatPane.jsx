import React, { useEffect, useRef, useState } from 'react';
import {
    autoResize,
    MODEL_PRESET_LABELS,
    MODEL_PRESET_ORDER,
    MODEL_STAGES,
    MODEL_OPTIONS,
    downloadTextFile,
} from '../utils/helpers';
import { SectionCountSelector } from './SectionCountSelector';

export function ModelOverrideToggle({
    isRunning,
    stageModels,
    onStageModelChange,
    selectedPreset,
    onPresetSelect,
    presetLabel,
    idPrefix,
}) {
    const toggleRef = useRef(null);
    const popoverRef = useRef(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                !open ||
                popoverRef.current?.contains(event.target) ||
                toggleRef.current?.contains(event.target)
            ) {
                return;
            }
            setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    return (
        <div className="model-quick-toggle" ref={toggleRef}>
            <button
                type="button"
                className="model-quick-toggle__button"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                aria-label="Model overrides"
            >
                {presetLabel || "Preset"}
            </button>
            {open && (
                <div className="model-quick-popover" ref={popoverRef}>
                    <div className="model-quick-presets" role="tablist" aria-label="Model presets">
                        {MODEL_PRESET_ORDER.map((presetKey) => (
                            <button
                                key={`${idPrefix}-preset-${presetKey}`}
                                type="button"
                                role="tab"
                                aria-pressed={selectedPreset === presetKey}
                                className={`model-quick-presets__option${selectedPreset === presetKey ? " model-quick-presets__option--active" : ""}`}
                                onClick={() => onPresetSelect(presetKey)}
                                disabled={isRunning}
                            >
                                {MODEL_PRESET_LABELS[presetKey]}
                            </button>
                        ))}
                    </div>
                    <div className="model-quick-stages">
                        {MODEL_STAGES.map((stage) => (
                            <label key={`${idPrefix}-stage-${stage.key}`} className="model-quick-stage">
                                <span className="model-quick-stage__label">{stage.label}</span>
                                <select
                                    value={stageModels[stage.key] || ""}
                                    onChange={(event) =>
                                        onStageModelChange(stage.key, event.target.value)
                                    }
                                    disabled={isRunning}
                                    aria-label={`${stage.label} model override`}
                                >
                                    {MODEL_OPTIONS.map((option) => (
                                        <option key={`${idPrefix}-${stage.key}-${option.value}`} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ))}
                    </div>
                    <p className="model-quick-hint">Overrides apply to your next run.</p>
                </div>
            )}
        </div>
    );
}

export function ChatPane({
    messages,
    mode,
    isRunning,
    composerValue,
    setComposerValue,
    handleTopicSubmit,
    handleStop,
    renderModeToggle,
    composerButtonLabel,
    outlineForm,
    sectionCount,
    setSectionCount,
    stageModels,
    onStageModelChange,
    selectedPreset,
    onPresetSelect,
    presetLabel,
    hideComposer = false,
    onViewReport,
}) {
    const chatEndRef = useRef(null);
    const textareaRef = useRef(null);
    useEffect(() => {
        if (textareaRef.current) {
            autoResize(textareaRef.current);
        }
    }, [composerValue]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleViewReport = (message) => {
        if (!onViewReport || !message.reportText) return;
        onViewReport({
            id: message.id,
            title: message.reportTitle,
            topic: message.reportTopic,
            content: message.reportText,
        });
    };

    const hasMessages = messages.length > 0;

    return (
        <>
            {hasMessages && (
                <section className="chat-pane__body" aria-live="polite">
                    <ol className="message-list">
                        {messages.map((message) => (
                            <li key={message.id} className={`message message--${message.role}`}>
                                <div className="message__header">
                                    {message.role === 'user' ? 'REQUEST' : 'REPORT'}
                                </div>
                                <div className="message__bubble">
                                    {message.variant === "outline" ? (
                                        <pre>{message.content}</pre>
                                    ) : message.role === "user" ? (
                                        <p>{message.content}</p>
                                    ) : (
                                        <>
                                            {(() => {
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
                                                    </>
                                                );
                                            })()}
                                            {message.reportText && (
                                                <div className="message__download">
                                                    {onViewReport && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewReport(message)}
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
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                    <div ref={chatEndRef} />
                </section>
            )}
            {hideComposer ? (
                <div className="composer-stop-only">
                    <button
                        type="button"
                        className="composer-stop-only__button"
                        onClick={handleStop}
                        aria-label="Stop generation"
                    >
                        <span aria-hidden="true" />
                    </button>
                </div>
            ) : mode === "topic" ? (
                <div className="composer-lane">
                    <div className="composer-toolbar">
                        {renderModeToggle("mode-toggle--compact")}
                        <ModelOverrideToggle
                            isRunning={isRunning}
                            stageModels={stageModels}
                            onStageModelChange={onStageModelChange}
                            selectedPreset={selectedPreset}
                            onPresetSelect={onPresetSelect}
                            presetLabel={presetLabel}
                            idPrefix="topic"
                        />
                    </div>
                    <form
                        className={`composer${isRunning ? " composer--pending" : ""}`}
                        onSubmit={handleTopicSubmit}
                    >
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={composerValue}
                            onChange={(event) => setComposerValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    handleTopicSubmit(event);
                                }
                            }}
                            disabled={isRunning}
                            aria-label="Ask Explorer anything"
                        />
                        <SectionCountSelector
                            value={sectionCount}
                            onChange={setSectionCount}
                            disabled={isRunning}
                        />
                        <button type={isRunning ? "button" : "submit"} onClick={isRunning ? handleStop : undefined}>
                            {composerButtonLabel}
                        </button>
                    </form>
                </div>
            ) : (
                <div className="outline-pane">
                    <div className="composer-toolbar composer-toolbar--outline">
                        {renderModeToggle("mode-toggle--standalone")}
                        <ModelOverrideToggle
                            isRunning={isRunning}
                            stageModels={stageModels}
                            onStageModelChange={onStageModelChange}
                            selectedPreset={selectedPreset}
                            onPresetSelect={onPresetSelect}
                            presetLabel={presetLabel}
                            idPrefix="outline"
                        />
                    </div>
                    {outlineForm}
                </div>
            )}
        </>
    );
}
