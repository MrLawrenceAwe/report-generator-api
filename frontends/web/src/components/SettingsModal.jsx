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
    user,
    onUserChange,
}) {
    if (!isOpen) return null;

    const safeUser = user || { email: "", username: "" };
    const handleUserChange = (next) => {
        if (typeof onUserChange === "function") {
            onUserChange(next);
        }
    };

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
                <section className="settings-panel__section">
                    <div className="settings-panel__section-header">
                        <p className="settings-panel__eyebrow">Account</p>
                        <h2 className="settings-panel__section-title">User identity</h2>
                        <p className="settings-panel__hint">
                            Used to scope saved topics and reports in the database.
                        </p>
                    </div>
                    <div className="settings-panel__fields">
                        <label className="settings-panel__field">
                            <span>User email</span>
                            <input
                                type="email"
                                value={safeUser.email || ""}
                                placeholder="you@example.com"
                                onChange={(event) =>
                                    handleUserChange({
                                        ...safeUser,
                                        email: event.target.value,
                                    })
                                }
                            />
                        </label>
                        <label className="settings-panel__field">
                            <span>Username</span>
                            <input
                                type="text"
                                value={safeUser.username || ""}
                                placeholder="Display name"
                                onChange={(event) =>
                                    handleUserChange({
                                        ...safeUser,
                                        username: event.target.value,
                                    })
                                }
                            />
                        </label>
                    </div>
                </section>
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
