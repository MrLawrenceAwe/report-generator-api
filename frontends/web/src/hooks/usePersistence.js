import { useEffect } from 'react';
import {
    persistList,
    persistModelPresets,
    persistActiveModelPreset,
    persistSuggestionModel,
    SAVED_TOPICS_KEY,
    SAVED_REPORTS_KEY,
} from '../utils/helpers';

export function usePersistence({
    savedTopics,
    savedReports,
    modelPresets,
    defaultPreset,
    suggestionModel,
}) {
    useEffect(() => {
        persistList(SAVED_TOPICS_KEY, savedTopics);
    }, [savedTopics]);

    useEffect(() => {
        persistList(SAVED_REPORTS_KEY, savedReports);
    }, [savedReports]);

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
