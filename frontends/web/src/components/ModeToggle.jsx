import React from 'react';
import { MODE_TABS } from '../utils/helpers';

export function ModeToggle({ mode, setMode, isRunning, extraClass = "" }) {
    return (
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
                    className={`mode-toggle__option${mode === tab.value ? " mode-toggle__option--active" : ""
                        }`}
                    onClick={() => !isRunning && setMode(tab.value)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
