import { useCallback } from 'react';

export function useGeneration({
    user,
    modelsPayload,
    sectionCount,
    rememberTopic,
    appendMessage,
    runReportFlow,
    setActiveReport,
    setIsRunning,
    isRunning,
}) {
    const runTopicPrompt = useCallback(
        async (prompt) => {
            const normalizedPrompt = (prompt || "").trim();
            if (!normalizedPrompt || isRunning) return false;

            setActiveReport(null);
            const assistantId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            rememberTopic(normalizedPrompt);
            appendMessage({
                id: `${assistantId}-user`,
                role: "user",
                content: normalizedPrompt,
                variant: "topic",
            });
            appendMessage({
                id: assistantId,
                role: "assistant",
                content: "",
                variant: "topic",
                reportTopic: normalizedPrompt,
            });
            setIsRunning(true);
            try {
                await runReportFlow(
                    {
                        topic: normalizedPrompt,
                        mode: "generate_report",
                        return: "report_with_outline",
                        sections: sectionCount || undefined,
                        models: modelsPayload,
                        user_email: user.email || undefined,
                        username: user.username || undefined,
                    },
                    assistantId,
                    normalizedPrompt
                );
                return true;
            } finally {
                setIsRunning(false);
            }
        },
        [appendMessage, isRunning, modelsPayload, user.email, user.username, rememberTopic, runReportFlow, sectionCount, setActiveReport, setIsRunning]
    );

    return { runTopicPrompt };
}
