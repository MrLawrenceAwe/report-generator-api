import React, { useEffect, useRef, useState } from 'react';
import {
    MODEL_PRESET_LABELS,
    MODEL_PRESET_ORDER,
    MODEL_STAGES,
    MODEL_OPTIONS,
} from '../utils/helpers';

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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                    <rect x="9" y="9" width="6" height="6"></rect>
                    <line x1="9" y1="1" x2="9" y2="4"></line>
                    <line x1="15" y1="1" x2="15" y2="4"></line>
                    <line x1="9" y1="20" x2="9" y2="23"></line>
                    <line x1="15" y1="20" x2="15" y2="23"></line>
                    <line x1="20" y1="9" x2="23" y2="9"></line>
                    <line x1="20" y1="14" x2="23" y2="14"></line>
                    <line x1="1" y1="9" x2="4" y2="9"></line>
                    <line x1="1" y1="14" x2="4" y2="14"></line>
                </svg>
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
