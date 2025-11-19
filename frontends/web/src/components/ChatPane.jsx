import React, { useEffect, useRef } from 'react';
import { autoResize } from '../utils/helpers';
import { SectionCountSelector } from './SectionCountSelector';

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
                    <ol className="message-list">
                        {messages.map((message) => (
                            <li key={message.id} className={`message message--${message.role}`}>
                                <div className="message__bubble">
                                    {message.variant === "outline" ? (
                                        <pre>{message.content}</pre>
                                    ) : (
                                        <p>{message.content}</p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                    <div ref={chatEndRef} />
                </section>
            )}
            {mode === "topic" ? (
                <div className="composer-lane">
                    {renderModeToggle("mode-toggle--compact")}
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
                    {renderModeToggle("mode-toggle--standalone")}
                    {outlineForm}
                </div>
            )}
        </>
    );
}
