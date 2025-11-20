import React from 'react';
import { ModelSettings } from './ModelSettings';

export function SettingsModal({
    isOpen,
    onClose,
    defaultPreset,
    onDefaultPresetChange,
    modelPresets,
    onPresetModelChange,
    suggestionModel,
    onSuggestionModelChange,
}) {
    if (!isOpen) return null;

    return (
        <div
            className="settings-overlay"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div className="settings-panel" onClick={(event) => event.stopPropagation()}>
                <header className="settings-panel__header">
                    <div>
                        <p className="settings-panel__eyebrow">Explorer</p>
                        <h1 className="settings-panel__title">Settings</h1>
                    </div>
                    <button type="button" className="settings-panel__close" onClick={onClose}>
                        Close
                    </button>
                </header>
                <ModelSettings
                    defaultPreset={defaultPreset}
                    onDefaultPresetChange={onDefaultPresetChange}
                    presets={modelPresets}
                    onPresetModelChange={onPresetModelChange}
                    suggestionModel={suggestionModel}
                    onSuggestionModelChange={onSuggestionModelChange}
                />
            </div>
        </div>
    );
}
