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
