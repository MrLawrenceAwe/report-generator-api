import React from 'react';
import {
    MODEL_PRESET_LABELS,
    MODEL_PRESET_ORDER,
    MODEL_STAGES,
    MODEL_OPTIONS,
} from '../utils/helpers';

export function ModelSettings({
    defaultPreset,
    onDefaultPresetChange,
    presets,
    onPresetModelChange,
    suggestionModel,
    onSuggestionModelChange,
}) {
    return (
        <section className="model-settings">
            <div className="model-settings__group-header">
                <h2>Models</h2>
                <p>Choose your suggestions engine and per-stage presets for reports.</p>
            </div>
            <div className="model-suggestion-row">
                <label className="model-stage model-stage--compact">
                    <span className="model-stage__label">Suggestions Engine</span>
                    <div className="model-stage__controls">
                        <select
                            value={suggestionModel}
                            onChange={(event) => onSuggestionModelChange(event.target.value)}
                            aria-label="Suggestions model"
                        >
                            {MODEL_OPTIONS.map((option) => (
                                <option key={`suggestion-${option.value}`} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </label>
            </div>
            <hr className="model-settings__divider" />
            <div className="model-preset-row" role="tablist" aria-label="Model presets">
                {MODEL_PRESET_ORDER.map((presetKey) => (
                    <button
                        key={presetKey}
                        type="button"
                        role="tab"
                        aria-pressed={defaultPreset === presetKey}
                        className={`model-preset-row__option${defaultPreset === presetKey ? " model-preset-row__option--active" : ""}`}
                        onClick={() => onDefaultPresetChange(presetKey)}
                    >
                        <span className="model-preset-row__label">{MODEL_PRESET_LABELS[presetKey]}</span>
                        <span className="model-preset-row__hint">
                            {defaultPreset === presetKey ? "Default" : ""}
                        </span>
                    </button>
                ))}
            </div>
            <details className="model-preset-editor">
                <summary>Presets</summary>
                {MODEL_PRESET_ORDER.map((presetKey) => (
                    <div key={`preset-${presetKey}`} className="model-preset-card">
                        <div className="model-preset-card__header">
                            <div>
                                <p className="model-preset-card__eyebrow">Preset</p>
                                <p className="model-preset-card__title">{MODEL_PRESET_LABELS[presetKey]}</p>
                            </div>
                        </div>
                        <div className="model-stage-grid model-stage-grid--compact">
                            {MODEL_STAGES.map((stage) => (
                                <label
                                    key={`${presetKey}-${stage.key}`}
                                    className="model-stage model-stage--compact"
                                >
                                    <span className="model-stage__label">{stage.label}</span>
                                    <div className="model-stage__controls">
                                        <select
                                            value={presets?.[presetKey]?.[stage.key] || ""}
                                            onChange={(event) =>
                                                onPresetModelChange(
                                                    presetKey,
                                                    stage.key,
                                                    event.target.value
                                                )
                                            }
                                            aria-label={`${MODEL_PRESET_LABELS[presetKey]} ${stage.label} model`}
                                        >
                                            {MODEL_OPTIONS.map((option) => (
                                                <option key={`${presetKey}-${stage.key}-${option.value}`} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
                <div className="model-stage-guide">
                    <p className="model-stage-guide__title">Stage guide</p>
                    <ul>
                        {MODEL_STAGES.map((stage) => (
                            <li key={`guide-${stage.key}`}>
                                <strong>{stage.label}:</strong> {stage.description}
                            </li>
                        ))}
                    </ul>
                </div>
            </details>
        </section>
    );
}
