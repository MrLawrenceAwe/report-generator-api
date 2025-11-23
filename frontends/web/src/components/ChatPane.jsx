import React, { useEffect, useRef } from 'react';
import {
    autoResize,
} from '../utils/helpers';
import { SectionCountSelector } from './SectionCountSelector';
import { ModelOverrideToggle } from './ModelOverrideToggle';
import { ModeToggle } from './ModeToggle';
import { MessageBubble } from './MessageBubble';
import { RefineToggle } from './RefineToggle';

export function ChatPane({
    messages,
    mode,
    setMode,
    isRunning,
    onReset,
    composerValue,
    setComposerValue,
    handleTopicSubmit,
    handleStop,
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
    avoidTopics,
    setAvoidTopics,
    includeTopics,
    setIncludeTopics,
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

    const hasMessages = messages.length > 0;

    return (
        <>
            {hasMessages && (
                <section className="chat-pane__body" aria-live="polite">
                    <div className="chat-pane__back-row">
                        <button
                            type="button"
                            className="chat-pane__back"
                            onClick={onReset}
                            aria-label="Back to Home"
                        >
                            ← Home
                        </button>
                    </div>
                    <ol className="message-list">
                        {messages.map((message) => (
                            <li key={message.id} className={`message message--${message.role}`}>
                                <div className="message__header">
                                    {message.role === 'user' ? 'REQUEST' : 'REPORT'}
                                </div>
                                <div className="message__bubble">
                                    <MessageBubble message={message} onViewReport={onViewReport} />
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
                        <ModeToggle
                            mode={mode}
                            setMode={setMode}
                            isRunning={isRunning}
                            extraClass="mode-toggle--compact"
                        />
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
                        <div className="composer__footer">
                            <RefineToggle
                                avoidTopics={avoidTopics}
                                setAvoidTopics={setAvoidTopics}
                                includeTopics={includeTopics}
                                setIncludeTopics={setIncludeTopics}
                                isRunning={isRunning}
                            />
                            <div className="composer__footer-right">
                                <SectionCountSelector
                                    value={sectionCount}
                                    onChange={setSectionCount}
                                    disabled={isRunning}
                                />
                                <button
                                    type={isRunning ? "button" : "submit"}
                                    onClick={isRunning ? handleStop : undefined}
                                    className="button-generate"
                                >
                                    {composerButtonLabel}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            ) : (
                <div className="outline-pane">
                    <div className="composer-toolbar composer-toolbar--outline">
                        <ModeToggle
                            mode={mode}
                            setMode={setMode}
                            isRunning={isRunning}
                            extraClass="mode-toggle--standalone"
                        />
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
