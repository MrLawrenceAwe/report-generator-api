import { useState, useRef, useCallback } from 'react';

export function useChat(apiBase, rememberReport) {
    const [messages, setMessages] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    const abortRef = useRef(null);

    const updateMessage = useCallback((id, updater) => {
        setMessages((current) =>
            current.map((message) =>
                message.id === id
                    ? typeof updater === "function"
                        ? { ...message, ...updater(message) }
                        : { ...message, ...updater }
                    : message
            )
        );
    }, []);

    const appendMessage = useCallback((message) => {
        setMessages((current) => [...current, message]);
    }, []);

    const runReportFlow = useCallback(
        async (generateRequest, assistantId, summaryLabel) => {
            abortRef.current = new AbortController();
            try {
                const response = await fetch(`${apiBase}/generate_report`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(generateRequest),
                    signal: abortRef.current.signal,
                });
                if (!response.ok) {
                    let detail = "";
                    try {
                        const raw = await response.text();
                        if (raw) {
                            try {
                                const parsed = JSON.parse(raw);
                                if (typeof parsed === "string") {
                                    detail = parsed;
                                } else if (parsed && typeof parsed === "object") {
                                    const extracted = parsed.detail ?? parsed.message;
                                    if (typeof extracted === "string") {
                                        detail = extracted;
                                    } else if (extracted) {
                                        detail = JSON.stringify(extracted);
                                    } else if (parsed.detail === undefined) {
                                        detail = JSON.stringify(parsed);
                                    }
                                } else {
                                    detail = raw.trim();
                                }
                            } catch {
                                detail = raw.trim();
                            }
                        }
                    } catch {
                        /* ignore parsing failures */
                    }
                    const reason = detail ? `: ${detail}` : ".";
                    throw new Error(`Report request failed (${response.status})${reason}`);
                }
                if (!response.body) {
                    throw new Error("Report request failed: missing response body.");
                }
                const reader = response.body
                    .pipeThrough(new TextDecoderStream())
                    .getReader();
                let buffer = "";
                let finalText = "";
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += value;
                    let newlineIndex;
                    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
                        const line = buffer.slice(0, newlineIndex).trim();
                        buffer = buffer.slice(newlineIndex + 1);
                        if (!line) continue;
                        try {
                            const event = JSON.parse(line);
                            if (event.status === "complete") {
                                finalText = event.report || "";
                            } else if (event.status === "error") {
                                throw new Error(event.detail || "Explorer reported an error.");
                            }
                        } catch (error) {
                            console.error("Failed to parse event", error, line);
                        }
                    }
                    if (finalText) {
                        updateMessage(assistantId, { content: finalText });
                    }
                }
                const resolvedText = finalText || "Explorer didn't return a report.";
                updateMessage(assistantId, (message) => ({
                    content: message.content || resolvedText,
                }));
                if (finalText && summaryLabel) {
                    rememberReport(summaryLabel, finalText);
                }
                return true;
            } catch (error) {
                const isAbort = error && (error.name === "AbortError" || error.message === "The user aborted a request.");
                if (isAbort) {
                    updateMessage(assistantId, (message) => ({
                        content: message.content || "Generation cancelled.",
                    }));
                } else {
                    updateMessage(assistantId, {
                        content: `Something went wrong: ${error.message}`,
                    });
                }
                return false;
            } finally {
                abortRef.current = null;
            }
        },
        [apiBase, rememberReport, updateMessage]
    );

    const stopGeneration = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
    }, []);

    return {
        messages,
        setMessages,
        isRunning,
        setIsRunning,
        runReportFlow,
        appendMessage,
        stopGeneration,
        abortRef
    };
}
