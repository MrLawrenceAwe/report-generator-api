import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTopicSuggestions } from '../utils/helpers';

export function useExplore({
    apiBase,
    savedTopics,
    savedReports,
    suggestionModel,
    rememberTopics,
}) {
    const [exploreSuggestions, setExploreSuggestions] = useState([]);
    const [exploreLoading, setExploreLoading] = useState(false);
    const [selectedExploreSuggestions, setSelectedExploreSuggestions] = useState([]);
    const [exploreNonce, setExploreNonce] = useState(0);
    const [exploreSelectMode, setExploreSelectMode] = useState(false);
    const exploreSelectToggleRef = useRef(null);
    const exploreSuggestionsRef = useRef(null);

    useEffect(() => {
        const controller = new AbortController();
        const loadExplore = async () => {
            setExploreLoading(true);
            setSelectedExploreSuggestions([]);
            const seeds = [
                ...savedTopics.map((entry) => entry.prompt),
                ...savedReports.map((entry) => entry.topic),
            ];
            const remote = await fetchTopicSuggestions(apiBase, {
                seeds,
                model: suggestionModel,
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            setExploreSuggestions(remote || []);
            setExploreLoading(false);
        };
        loadExplore();
        return () => controller.abort();
    }, [apiBase, exploreNonce, savedReports, savedTopics, suggestionModel]);

    const handleRefreshExplore = useCallback(() => {
        setExploreNonce((value) => value + 1);
    }, []);

    const handleToggleExploreSuggestion = useCallback((title) => {
        const normalized = (title || "").trim();
        if (!normalized) return;
        setSelectedExploreSuggestions((current) => {
            if (current.includes(normalized)) {
                return current.filter((entry) => entry !== normalized);
            }
            return [...current, normalized];
        });
    }, []);

    const handleSaveSelectedExplore = useCallback(() => {
        if (!selectedExploreSuggestions.length) return;
        rememberTopics(selectedExploreSuggestions);
        setSelectedExploreSuggestions([]);
        setExploreSelectMode(false);
    }, [rememberTopics, selectedExploreSuggestions]);

    const handleToggleExploreSelectMode = useCallback(() => {
        if (!exploreSelectMode) {
            setSelectedExploreSuggestions([]);
            setExploreSelectMode(true);
            return;
        }
        if (selectedExploreSuggestions.length) {
            handleSaveSelectedExplore();
            return;
        }
        setSelectedExploreSuggestions([]);
        setExploreSelectMode(false);
    }, [exploreSelectMode, handleSaveSelectedExplore, selectedExploreSuggestions.length]);

    useEffect(() => {
        const handleGlobalClick = (event) => {
            const target = event.target;
            if (
                exploreSelectMode &&
                exploreSuggestionsRef.current &&
                !exploreSuggestionsRef.current.contains(target) &&
                !exploreSelectToggleRef.current?.contains(target)
            ) {
                setSelectedExploreSuggestions([]);
                setExploreSelectMode(false);
            }
        };
        document.addEventListener("mousedown", handleGlobalClick);
        return () => document.removeEventListener("mousedown", handleGlobalClick);
    }, [exploreSelectMode]);

    return {
        exploreSuggestions,
        exploreLoading,
        selectedExploreSuggestions,
        exploreSelectMode,
        exploreSelectToggleRef,
        exploreSuggestionsRef,
        handleRefreshExplore,
        handleToggleExploreSuggestion,
        handleToggleExploreSelectMode,
    };
}
