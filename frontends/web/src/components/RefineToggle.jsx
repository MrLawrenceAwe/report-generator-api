import React, { useEffect, useRef, useState } from 'react';

export function RefineToggle({
    avoidTopics,
    setAvoidTopics,
    includeTopics,
    setIncludeTopics,
    isRunning,
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

    const hasFilters = (avoidTopics && avoidTopics.trim()) || (includeTopics && includeTopics.trim());

    return (
        <div className="refine-toggle" ref={toggleRef}>
            <button
                type="button"
                className={`refine-toggle__button${hasFilters ? " refine-toggle__button--active" : ""}`}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                aria-label="Refine generation topics"
                title="Avoid or include specific topics"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
                </svg>
                Avoid / Include
                {hasFilters && <span className="refine-toggle__badge" />}
            </button>
            {open && (
                <div className="refine-popover" ref={popoverRef}>
                    <div className="refine-field">
                        <label className="refine-field__label">Avoid</label>
                        <input
                            className="refine-field__input"
                            placeholder="e.g. politics, sports"
                            value={avoidTopics}
                            onChange={(e) => setAvoidTopics(e.target.value)}
                            disabled={isRunning}
                        />
                    </div>
                    <div className="refine-field">
                        <label className="refine-field__label">Include</label>
                        <input
                            className="refine-field__input"
                            placeholder="e.g. history, science"
                            value={includeTopics}
                            onChange={(e) => setIncludeTopics(e.target.value)}
                            disabled={isRunning}
                        />
                    </div>
                    <p className="refine-hint">Comma separated lists.</p>
                </div>
            )}
        </div>
    );
}
