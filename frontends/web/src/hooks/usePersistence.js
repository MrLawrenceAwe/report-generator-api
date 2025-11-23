import { useEffect } from 'react';
import {
    persistModelPresets,
    persistActiveModelPreset,
    persistSuggestionModel,
} from '../utils/helpers';

export function usePersistence({
    modelPresets,
    defaultPreset,
    suggestionModel,
}) {
    useEffect(() => {
        persistModelPresets(modelPresets);
    }, [modelPresets]);

    useEffect(() => {
        persistActiveModelPreset(defaultPreset);
    }, [defaultPreset]);

    useEffect(() => {
        persistSuggestionModel(suggestionModel);
    }, [suggestionModel]);
}
