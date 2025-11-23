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
                className="refine-toggle__button"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                aria-label="Refine generation topics"
                title="Avoid or include specific topics"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ color: 'var(--color-text-primary)' }}>
                    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
                </svg>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: (avoidTopics && avoidTopics.trim()) ? '#ef4444' : 'var(--color-text-tertiary)' }}>
                    Avoid
                    {avoidTopics && avoidTopics.trim() && (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                    )}
                </span>
                <span style={{ color: 'var(--color-text-tertiary)' }}> / </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: (includeTopics && includeTopics.trim()) ? '#3b82f6' : 'var(--color-text-tertiary)' }}>
                    Include
                    {includeTopics && includeTopics.trim() && (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
                    )}
                </span>
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
