import { useState, useCallback, useMemo, useEffect } from 'react';
import {
    loadModelPresets,
    loadActiveModelPreset,
    loadSuggestionModel,
    normalizeModelPresets,
    buildModelsPayload,
} from '../utils/helpers';

export function useSettings() {
    const [modelPresets, setModelPresets] = useState(loadModelPresets);
    const [defaultPreset, setDefaultPreset] = useState(() =>
        loadActiveModelPreset(loadModelPresets())
    );
    const [selectedPreset, setSelectedPreset] = useState(() =>
        loadActiveModelPreset(loadModelPresets())
    );
    const [stageModels, setStageModels] = useState(() => {
        const presets = loadModelPresets();
        const presetKey = loadActiveModelPreset(presets);
        return { ...presets[presetKey] };
    });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [suggestionModel, setSuggestionModel] = useState(loadSuggestionModel);

    const modelsPayload = useMemo(
        () => buildModelsPayload(stageModels),
        [stageModels]
    );

    const handleStageModelChange = useCallback((stageKey, value) => {
        setStageModels((current) => ({
            ...current,
            [stageKey]: value,
        }));
    }, []);

    const handlePresetModelChange = useCallback((presetKey, stageKey, value) => {
        setModelPresets((current) =>
            normalizeModelPresets({
                ...current,
                [presetKey]: { ...(current[presetKey] || {}), [stageKey]: value },
            })
        );
    }, []);

    const handlePresetSelect = useCallback((presetKey) => {
        setSelectedPreset(presetKey);
    }, []);

    const handleDefaultPresetChange = useCallback((presetKey) => {
        setDefaultPreset(presetKey);
        setSelectedPreset(presetKey);
    }, []);

    const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
    const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);

    const handleSuggestionModelChange = useCallback((model) => {
        setSuggestionModel(model);
    }, []);

    useEffect(() => {
        const normalized = normalizeModelPresets(modelPresets);
        const selected = normalized[selectedPreset] || normalized[defaultPreset] || normalized.fast;
        setStageModels({ ...selected });
    }, [defaultPreset, modelPresets, selectedPreset]);

    return {
        modelPresets,
        defaultPreset,
        selectedPreset,
        stageModels,
        isSettingsOpen,
        suggestionModel,
        modelsPayload,
        handleStageModelChange,
        handlePresetModelChange,
        handlePresetSelect,
        handleDefaultPresetChange,
        handleOpenSettings,
        handleCloseSettings,
        handleSuggestionModelChange,
    };
}
