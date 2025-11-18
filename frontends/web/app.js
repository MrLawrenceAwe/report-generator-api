const { useCallback, useEffect, useRef, useState } = React;

const STORAGE_KEY = "explorer-api-base";
const SAVED_TOPICS_KEY = "explorer-saved-topics";
const SAVED_REPORTS_KEY = "explorer-saved-reports";
const DEFAULT_API_BASE = window.location.origin;
const MAX_SAVED_TOPICS = 8;
const MAX_SAVED_REPORTS = 6;

const MODE_TABS = [
  { value: "topic", label: "Topic" },
  { value: "outline", label: "Custom outline" },
];

const OUTLINE_INPUT_MODES = [
  { value: "lines", label: "Manual" },
  { value: "json", label: "JSON object" },
];

const DEFAULT_OUTLINE_JSON = JSON.stringify(
  {
    sections: [
      {
        title: "Introduction",
        subsections: ["Hook", "Background", "Thesis"],
      },
    ],
  },
  null,
  2
);

function buildOutlineGeneratePayload(topic, sections) {
  return {
    mode: "generate_report",
    return: "report",
    outline: {
      report_title: topic,
      sections: sections.map((section) => ({
        title: section.title,
        subsections: section.subsections,
      })),
    },
  };
}

function createEmptyOutlineSection() {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: "",
    subsections: [""],
  };
}

function loadApiBase() {
  const params = new URL(window.location.href).searchParams;
  const paramBase = params.get("apiBase");
  if (paramBase && paramBase.trim()) {
    localStorage.setItem(STORAGE_KEY, paramBase.trim());
  }
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE;
}

function loadSavedList(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to parse saved list", key, error);
    return [];
  }
}

function persistList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

function App() {
  const [apiBase] = useState(loadApiBase);
  const [messages, setMessages] = useState(() => []);
  const [composerValue, setComposerValue] = useState("");
  const [mode, setMode] = useState("topic");
  const [outlineTopic, setOutlineTopic] = useState("");
  const [outlineInputMode, setOutlineInputMode] = useState("lines");
  const [outlineSections, setOutlineSections] = useState(() => [
    createEmptyOutlineSection(),
  ]);
  const [outlineJsonInput, setOutlineJsonInput] = useState(DEFAULT_OUTLINE_JSON);
  const [outlineError, setOutlineError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [savedTopics, setSavedTopics] = useState(() => loadSavedList(SAVED_TOPICS_KEY));
  const [savedReports, setSavedReports] = useState(() => loadSavedList(SAVED_REPORTS_KEY));
  const abortRef = useRef(null);
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

  useEffect(() => {
    persistList(SAVED_TOPICS_KEY, savedTopics);
  }, [savedTopics]);

  useEffect(() => {
    persistList(SAVED_REPORTS_KEY, savedReports);
  }, [savedReports]);

  useEffect(() => {
    setOutlineError("");
  }, [outlineInputMode, mode]);

  useEffect(() => {
    setOutlineError("");
  }, [outlineJsonInput, outlineSections, outlineTopic]);

  const handleTopicRecall = useCallback(
    (topic) => {
      if (isRunning) return;
      setComposerValue(topic);
      textareaRef.current?.focus();
    },
    [isRunning]
  );

  const rememberTopic = useCallback((prompt) => {
    setSavedTopics((current) => {
      const deduped = current.filter((entry) => entry.prompt !== prompt);
      return [
        { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, prompt },
        ...deduped,
      ].slice(0, MAX_SAVED_TOPICS);
    });
  }, []);

  const rememberReport = useCallback((topic, content) => {
    const summary = summarizeReport(content);
    setSavedReports((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        topic,
        preview: summary,
      },
      ...current,
    ].slice(0, MAX_SAVED_REPORTS));
  }, []);

  const resetOutlineForm = useCallback(() => {
    setOutlineTopic("");
    setOutlineSections([createEmptyOutlineSection()]);
    setOutlineJsonInput(DEFAULT_OUTLINE_JSON);
  }, []);

  const handleAddOutlineSection = useCallback(() => {
    setOutlineSections((current) => [...current, createEmptyOutlineSection()]);
  }, []);

  const handleRemoveOutlineSection = useCallback((sectionId) => {
    setOutlineSections((current) =>
      current.length === 1
        ? current
        : current.filter((section) => section.id !== sectionId)
    );
  }, []);

  const handleOutlineSectionTitleChange = useCallback((sectionId, value) => {
    setOutlineSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, title: value } : section
      )
    );
  }, []);

  const handleOutlineSubsectionChange = useCallback((sectionId, index, value) => {
    setOutlineSections((current) =>
      current.map((section) => {
        if (section.id !== sectionId) return section;
        const updated = [...section.subsections];
        updated[index] = value;
        return { ...section, subsections: updated };
      })
    );
  }, []);

  const handleAddSubsectionLine = useCallback((sectionId) => {
    setOutlineSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? { ...section, subsections: [...section.subsections, ""] }
          : section
      )
    );
  }, []);

  const handleRemoveSubsectionLine = useCallback((sectionId, index) => {
    setOutlineSections((current) =>
      current.map((section) => {
        if (section.id !== sectionId) return section;
        if (section.subsections.length === 1) return section;
        const updated = section.subsections.filter((_, idx) => idx !== index);
        return { ...section, subsections: updated };
      })
    );
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

  const handleTopicSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const prompt = composerValue.trim();
      if (!prompt || isRunning) return;

      const assistantId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      rememberTopic(prompt);
      appendMessage({ id: `${assistantId}-user`, role: "user", content: prompt, variant: "topic" });
      appendMessage({ id: assistantId, role: "assistant", content: "", variant: "topic" });
      setComposerValue("");
      setIsRunning(true);

      await runReportFlow(
        { topic: prompt, mode: "generate_report", return: "report" },
        assistantId,
        prompt
      );

      setIsRunning(false);
    },
    [appendMessage, composerValue, isRunning, rememberTopic, runReportFlow]
  );

  const handleOutlineSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (isRunning) return;

      const topicText = outlineTopic.trim();
      if (!topicText) {
        setOutlineError("Add a topic first.");
        return;
      }

      let outlineBrief = "";
      let userSummary = "";
      let outlineGeneratePayload = null;

      if (outlineInputMode === "lines") {
        const normalizedSections = outlineSections
          .map((section) => ({
            title: section.title.trim(),
            subsections: section.subsections
              .map((entry) => entry.trim())
              .filter(Boolean),
          }))
          .filter((section) => section.title && section.subsections.length);
        if (!normalizedSections.length) {
          setOutlineError("Add at least one section and subsection.");
          return;
        }
        outlineBrief = [
          `Outline topic: ${topicText}`,
          "Structure:",
          normalizedSections
            .map(
              (section) =>
                `${section.title}\n${section.subsections
                  .map((entry) => `- ${entry}`)
                  .join("\n")}`
            )
            .join("\n\n"),
        ].join("\n\n");
        userSummary = outlineBrief;
        outlineGeneratePayload = buildOutlineGeneratePayload(
          topicText,
          normalizedSections
        );
      } else {
        const trimmedInput = outlineJsonInput.trim();
        if (!trimmedInput) {
          setOutlineError("Paste JSON with sections and subsections.");
          return;
        }
        let normalizedJsonSections = [];
        try {
          const parsed = JSON.parse(trimmedInput);
          if (
            !parsed ||
            typeof parsed !== "object" ||
            !Array.isArray(parsed.sections) ||
            !parsed.sections.length
          ) {
            setOutlineError("JSON must include a sections array.");
            return;
          }
          const invalidSection = parsed.sections.find(
            (section) =>
              !section ||
              typeof section.title !== "string" ||
              !section.title.trim() ||
              !Array.isArray(section.subsections) ||
              !section.subsections.some((entry) => typeof entry === "string" && entry.trim())
          );
          if (invalidSection) {
            setOutlineError("Each JSON section needs a title and subsection.");
            return;
          }
          normalizedJsonSections = parsed.sections.map((section) => ({
            title: section.title.trim(),
            subsections: section.subsections
              .map((entry) => (entry || "").trim())
              .filter(Boolean),
          }));
        } catch (error) {
          setOutlineError("Fix the JSON before continuing.");
          return;
        }
        outlineBrief = `Outline topic: ${topicText}\n\nUse this JSON:\n${trimmedInput}`;
        userSummary = outlineBrief;
        outlineGeneratePayload = buildOutlineGeneratePayload(
          topicText,
          normalizedJsonSections
        );
      }

      if (!outlineGeneratePayload) {
        setOutlineError("Unable to prepare the outline request.");
        return;
      }

      const assistantId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      appendMessage({
        id: `${assistantId}-user`,
        role: "user",
        content: userSummary,
        variant: "outline",
      });
      appendMessage({ id: assistantId, role: "assistant", content: "", variant: "outline" });
      setIsRunning(true);
      setOutlineError("");

      const wasSuccessful = await runReportFlow(
        outlineGeneratePayload,
        assistantId,
        topicText
      );
      setIsRunning(false);
      if (wasSuccessful) {
        resetOutlineForm();
      }
    },
    [
      appendMessage,
      isRunning,
      outlineInputMode,
      outlineJsonInput,
      outlineSections,
      outlineTopic,
      resetOutlineForm,
      runReportFlow,
    ]
  );

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const composerButtonLabel = isRunning ? "Stop" : "Send";
  const outlineSubmitLabel = isRunning ? "Working…" : "Generate report";

  const normalizedOutlineTopic = outlineTopic.trim();
  const lineModeValidity = outlineSections.every((section) => {
    const title = section.title.trim();
    const hasSubsections = section.subsections.some((line) => line.trim());
    return Boolean(title && hasSubsections);
  });
  const isLineModeValid = Boolean(normalizedOutlineTopic && lineModeValidity);
  const trimmedJsonInput = outlineJsonInput.trim();
  let jsonValidationError = "";
  if (outlineInputMode === "json" && trimmedJsonInput) {
    try {
      const parsed = JSON.parse(trimmedJsonInput);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) {
        jsonValidationError = "JSON outline must contain a sections array.";
      } else if (
        !parsed.sections.length ||
        !parsed.sections.every(
          (section) =>
            section &&
            typeof section.title === "string" &&
            section.title.trim() &&
            Array.isArray(section.subsections) &&
            section.subsections.some((entry) => typeof entry === "string" && entry.trim())
        )
      ) {
        jsonValidationError = "Each JSON section needs a title plus at least one subsection.";
      }
    } catch (error) {
      jsonValidationError = error.message || "Enter valid JSON.";
    }
  }
  const isJsonModeValid = Boolean(
    normalizedOutlineTopic && trimmedJsonInput && !jsonValidationError
  );
  const isOutlineFormValid = outlineInputMode === "lines" ? isLineModeValid : isJsonModeValid;

  const hasMessages = messages.length > 0;

  const renderModeToggle = (extraClass = "") => (
    <div
      className={`mode-toggle${extraClass ? ` ${extraClass}` : ""}`}
      role="tablist"
      aria-label="Prompt type"
    >
      {MODE_TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={mode === tab.value}
          className={`mode-toggle__option${
            mode === tab.value ? " mode-toggle__option--active" : ""
          }`}
          onClick={() => !isRunning && setMode(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page">
      <aside className="sidebar" aria-label="Saved prompts and generated reports">
        <div className="sidebar__brand">
          <div className="sidebar__logo">Ex</div>
          <div>
            <div className="sidebar__title">Explorer</div>
          </div>
        </div>
        <section className="sidebar-section">
          <div className="sidebar-section__header">
            <h2>Saved topics</h2>
          </div>
          {savedTopics.length > 0 ? (
            <ul className="sidebar-list">
              {savedTopics.map((topic) => (
                <li key={topic.id}>
                  <button
                    type="button"
                    className="sidebar-entry"
                    onClick={() => handleTopicRecall(topic.prompt)}
                  >
                    <span className="sidebar-entry__eyebrow">Topic</span>
                    <span className="sidebar-entry__title">{topic.prompt}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sidebar__empty">No saved topics yet.</p>
          )}
        </section>
        <section className="sidebar-section">
          <div className="sidebar-section__header">
            <h2>Generated reports</h2>
          </div>
          {savedReports.length > 0 ? (
            <ul className="sidebar-list">
              {savedReports.map((report) => (
                <li key={report.id}>
                  <div className="sidebar-entry sidebar-entry--report">
                    <span className="sidebar-entry__eyebrow">Report</span>
                    <span className="sidebar-entry__title">{report.topic}</span>
                    <p className="sidebar-entry__preview">{report.preview}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sidebar__empty">No reports yet.</p>
          )}
        </section>
      </aside>
      <main className={`chat-pane${hasMessages ? "" : " chat-pane--empty"}`}>
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
                disabled={isRunning && Boolean(abortRef.current)}
                aria-label="Ask Explorer anything"
              />
              <button type={isRunning ? "button" : "submit"} onClick={isRunning ? handleStop : undefined}>
                {composerButtonLabel}
              </button>
            </form>
          </div>
        ) : (
          <>
            {renderModeToggle("mode-toggle--standalone")}
            <form
              className={`outline-composer${isRunning ? " outline-composer--pending" : ""}`}
              onSubmit={handleOutlineSubmit}
            >
              <label className="outline-composer__field">
                <span className="outline-composer__eyebrow">Outline topic</span>
                <input
                  type="text"
                  value={outlineTopic}
                  onChange={(event) => setOutlineTopic(event.target.value)}
                  placeholder="e.g., The future of battery recycling"
                  disabled={isRunning}
                />
              </label>
              <div className="outline-format-toggle" role="tablist" aria-label="Outline input format">
                {OUTLINE_INPUT_MODES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={outlineInputMode === option.value}
                    className={`outline-format-toggle__option${
                      outlineInputMode === option.value
                        ? " outline-format-toggle__option--active"
                        : ""
                    }`}
                    onClick={() => !isRunning && setOutlineInputMode(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            {outlineInputMode === "lines" ? (
              <div className="outline-lines">
                <p className="outline-help">List section titles and subsections manually.</p>
                <div className="outline-section-list">
                  {outlineSections.map((section, sectionIndex) => (
                    <div key={section.id} className="outline-section">
                      <div className="outline-section__header">
                        <div className="outline-section__meta">
                          <span className="outline-section__badge">{sectionIndex + 1}</span>
                          <input
                            type="text"
                            value={section.title}
                            onChange={(event) =>
                              handleOutlineSectionTitleChange(section.id, event.target.value)
                            }
                            placeholder="Section title"
                            aria-label={`Section ${sectionIndex + 1} title`}
                            disabled={isRunning}
                          />
                        </div>
                        {outlineSections.length > 1 && (
                          <button
                            type="button"
                            className="outline-section__remove"
                            onClick={() => handleRemoveOutlineSection(section.id)}
                            disabled={isRunning}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="outline-subsection-list">
                        {section.subsections.map((subsection, subsectionIndex) => (
                          <div key={`${section.id}-${subsectionIndex}`} className="outline-subsection">
                            <span className="outline-subsection__badge">
                              {sectionIndex + 1}.{subsectionIndex + 1}
                            </span>
                            <input
                              type="text"
                              value={subsection}
                              onChange={(event) =>
                                handleOutlineSubsectionChange(
                                  section.id,
                                  subsectionIndex,
                                  event.target.value
                                )
                              }
                              placeholder="Subsection"
                              aria-label={`Section ${sectionIndex + 1} subsection ${subsectionIndex + 1}`}
                              disabled={isRunning}
                            />
                            {section.subsections.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveSubsectionLine(section.id, subsectionIndex)
                                }
                                disabled={isRunning}
                                aria-label="Remove subsection"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="outline-add-button"
                        onClick={() => handleAddSubsectionLine(section.id)}
                        disabled={isRunning}
                      >
                        + Add subsection
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="outline-json-block">
                <p className="outline-help">Paste JSON with sections and subsections.</p>
                <textarea
                  className="outline-json-input"
                  rows={8}
                  value={outlineJsonInput}
                  onChange={(event) => setOutlineJsonInput(event.target.value)}
                  disabled={isRunning}
                />
                {jsonValidationError && trimmedJsonInput && (
                  <p className="outline-error outline-error--inline">{jsonValidationError}</p>
                )}
              </div>
            )}
            {outlineError && <p className="outline-error">{outlineError}</p>}
            <div className="outline-builder__actions">
              {outlineInputMode === "lines" && (
                <button
                  type="button"
                  className="outline-add-button outline-add-button--section"
                  onClick={handleAddOutlineSection}
                  disabled={isRunning}
                >
                  + Add section
                </button>
              )}
              <button type="submit" className="outline-submit" disabled={!isOutlineFormValid || isRunning}>
                {outlineSubmitLabel}
              </button>
            </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function summarizeReport(text) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 120) return clean;
  const cutoff = clean.indexOf(". ", 80);
  if (cutoff > 0 && cutoff < 160) {
    return `${clean.slice(0, cutoff + 1)}…`;
  }
  return `${clean.slice(0, 140)}…`;
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
