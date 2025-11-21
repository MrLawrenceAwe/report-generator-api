import { useState, useRef, useCallback } from 'react';

export function useChat(apiBase, rememberReport) {
    const [messages, setMessages] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    const abortRef = useRef(null);

    const formatStatus = useCallback((event) => {
        switch (event.status) {
            case "started":
                return "Starting…";
            case "generating_outline":
                return `Generating outline (${event.model || "model unknown"})…`;
            case "outline_ready":
                return `Outline ready (${event.sections} sections)`;
            case "begin_sections":
                return `Writing sections (${event.count} sections)…`;
            case "writing_section":
                return `Writing ${event.section}`;
            case "translating_section":
                return `Translating ${event.section}`;
            case "section_complete":
                return `Finished ${event.section}`;
            case "writer_model_fallback":
                return `Retrying ${event.section} with ${event.fallback_model}`;
            case "complete":
                return "Report ready";
            default:
                return "";
        }
    }, []);

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
            const statusLog = [];
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
                let finalOutline = null;
                let finalTitle = summaryLabel || "";
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
                            const statusText = formatStatus(event);
                            if (statusText) {
                                statusLog.push(statusText);
                                updateMessage(assistantId, {
                                    content: statusLog.join("\n"),
                                    statusLog: [...statusLog],
                                    outline: event.outline || finalOutline || null,
                                });
                            }
                            if (event.outline) {
                                finalOutline = event.outline;
                            }
                            if (event.status === "complete") {
                                finalOutline = event.outline_used || finalOutline || null;
                                finalTitle = event.report_title || finalTitle;
                                finalText = event.report || "";
                            } else if (event.status === "error") {
                                throw new Error(event.detail || "Explorer reported an error.");
                            }
                        } catch (error) {
                            console.error("Failed to parse event", error, line);
                        }
                    }
                }
                const resolvedText = finalText || "Explorer didn't return a report.";
                const resolvedTitle = finalTitle || "Explorer Report";
                const resolvedTopic = summaryLabel || resolvedTitle;
                updateMessage(assistantId, (message) => ({
                    content: statusLog.length ? statusLog.join("\n") : (message.content || resolvedText),
                    statusLog: statusLog.length ? [...statusLog] : message.statusLog || [],
                    reportText: finalText || null,
                    reportTitle: resolvedTitle,
                    reportTopic: message.reportTopic || resolvedTopic,
                    outline: finalOutline,
                }));
                if (finalText && summaryLabel) {
                    rememberReport(summaryLabel, finalText, resolvedTitle);
                }
                return true;
            } catch (error) {
                const isAbort = error && (error.name === "AbortError" || error.message === "The user aborted a request.");
                if (isAbort) {
                    updateMessage(assistantId, (message) => ({
                        content: message.content || "Generation cancelled.",
                        statusLog: message.statusLog || [],
                    }));
                } else {
                    updateMessage(assistantId, {
                        content: `Something went wrong: ${error.message}`,
                        statusLog: statusLog.length ? [...statusLog] : [],
                    });
                }
                return false;
            } finally {
                abortRef.current = null;
            }
        },
        [apiBase, rememberReport, updateMessage, formatStatus]
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
