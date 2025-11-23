import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTopicSuggestions, generateRelatedTopics } from '../utils/helpers';

export function useTopicView({
    apiBase,
    suggestionModel,
    rememberTopics,
    isRunning,
    runTopicPrompt,
}) {
    const [topicViewTopic, setTopicViewTopic] = useState("");
    const [topicViewDraft, setTopicViewDraft] = useState("");
    const [isTopicEditing, setIsTopicEditing] = useState(false);
    const [topicSuggestions, setTopicSuggestions] = useState([]);
    const [topicSuggestionsLoading, setTopicSuggestionsLoading] = useState(false);
    const [topicSuggestionsNonce, setTopicSuggestionsNonce] = useState(0);
    const [selectedSuggestions, setSelectedSuggestions] = useState([]);
    const [topicSelectMode, setTopicSelectMode] = useState(false);
    const [suggestionsPaused, setSuggestionsPaused] = useState(false);
    const topicSelectToggleRef = useRef(null);
    const topicSuggestionsRef = useRef(null);
    const topicViewEditorRef = useRef(null);
    const skipTopicCommitRef = useRef(false);



    useEffect(() => {
        if (isTopicEditing) {
            topicViewEditorRef.current?.focus();
            topicViewEditorRef.current?.select?.();
        }
    }, [isTopicEditing]);

    useEffect(() => {
        if (!topicViewTopic || suggestionsPaused) return;
        const controller = new AbortController();
        setTopicSuggestionsLoading(true);
        const loadSuggestions = async () => {
            const remote = await fetchTopicSuggestions(apiBase, {
                topic: topicViewTopic,
                seeds: [],
                includeReportHeadings: false,
                model: suggestionModel,
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            const merged = remote.length ? remote : generateRelatedTopics(topicViewTopic);
            setTopicSuggestions(merged);
            setTopicSuggestionsLoading(false);
        };
        loadSuggestions().catch(() => setTopicSuggestionsLoading(false));
        return () => controller.abort();
    }, [apiBase, topicSuggestionsNonce, topicViewTopic, suggestionModel, suggestionsPaused]);

    const openTopicView = useCallback((topic, options = {}) => {
        const normalized = (topic || "").trim();
        if (!normalized) return;
        const pauseSuggestions = Boolean(options.pauseSuggestions);
        setTopicViewTopic(normalized);
        setTopicViewDraft(normalized);
        setIsTopicEditing(false);
        setTopicSuggestionsLoading(!pauseSuggestions);
        setSelectedSuggestions([]);
        setTopicSelectMode(false);
        setTopicSuggestions([]);
        setSuggestionsPaused(pauseSuggestions);
    }, []);

    const closeTopicView = useCallback(() => {
        setTopicViewTopic("");
        setTopicViewDraft("");
        setIsTopicEditing(false);
        setTopicSuggestions([]);
        setSelectedSuggestions([]);
        setTopicSelectMode(false);
        setSuggestionsPaused(false);
    }, []);

    const startTopicEditing = useCallback(() => {
        if (!topicViewTopic) return;
        skipTopicCommitRef.current = false;
        setTopicViewDraft(topicViewTopic);
        setIsTopicEditing(true);
    }, [topicViewTopic]);

    const cancelTopicEditing = useCallback(() => {
        skipTopicCommitRef.current = true;
        setTopicViewDraft(topicViewTopic);
        setIsTopicEditing(false);
    }, [topicViewTopic]);

    const commitTopicEdit = useCallback(() => {
        if (skipTopicCommitRef.current) {
            skipTopicCommitRef.current = false;
            return;
        }
        const normalized = topicViewDraft.trim();
        setIsTopicEditing(false);
        if (normalized && normalized !== topicViewTopic) {
            setTopicViewTopic(normalized);
            setTopicViewDraft(normalized);
            setTopicSuggestionsLoading(true);
            setSelectedSuggestions([]);
            setTopicSelectMode(false);
        } else {
            setTopicViewDraft(topicViewTopic);
        }
    }, [topicViewDraft, topicViewTopic]);

    const handleTopicEditSubmit = useCallback(
        (event) => {
            event.preventDefault();
            commitTopicEdit();
        },
        [commitTopicEdit]
    );

    const handleTopicEditBlur = useCallback(() => {
        commitTopicEdit();
    }, [commitTopicEdit]);

    const handleTopicEditKeyDown = useCallback(
        (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                cancelTopicEditing();
            } else if (event.key === "Enter") {
                event.preventDefault();
                commitTopicEdit();
            }
        },
        [cancelTopicEditing, commitTopicEdit]
    );

    const handleTopicTitleKeyDown = useCallback(
        (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                startTopicEditing();
            }
        },
        [startTopicEditing]
    );

    const handleTopicViewGenerate = useCallback(async () => {
        if (!topicViewTopic || isRunning) return;
        closeTopicView();
        await runTopicPrompt(topicViewTopic);
    }, [closeTopicView, isRunning, runTopicPrompt, topicViewTopic]);

    const handleTopicViewSave = useCallback(() => {
        if (!topicViewTopic) return;
        rememberTopics([topicViewTopic]);
    }, [rememberTopics, topicViewTopic]);

    const handleSuggestionToggle = useCallback((title) => {
        const normalized = (title || "").trim();
        if (!normalized) return;
        setSelectedSuggestions((current) => {
            if (current.includes(normalized)) {
                return current.filter((entry) => entry !== normalized);
            }
            return [...current, normalized];
        });
    }, []);

    const handleSaveSelectedSuggestions = useCallback(() => {
        if (!selectedSuggestions.length) return;
        rememberTopics(selectedSuggestions);
        setSelectedSuggestions([]);
        setTopicSelectMode(false);
    }, [rememberTopics, selectedSuggestions]);

    const handleRefreshSuggestions = useCallback(() => {
        setSuggestionsPaused(false);
        setTopicSuggestionsNonce((value) => value + 1);
    }, []);

    const handleToggleTopicSelectMode = useCallback(() => {
        if (!topicSelectMode) {
            setSelectedSuggestions([]);
            setTopicSelectMode(true);
            return;
        }
        if (selectedSuggestions.length) {
            handleSaveSelectedSuggestions();
            return;
        }
        setSelectedSuggestions([]);
        setTopicSelectMode(false);
    }, [handleSaveSelectedSuggestions, selectedSuggestions.length, topicSelectMode]);

    useEffect(() => {
        const handleGlobalClick = (event) => {
            const target = event.target;
            if (
                topicSelectMode &&
                topicSuggestionsRef.current &&
                !topicSuggestionsRef.current.contains(target) &&
                !topicSelectToggleRef.current?.contains(target)
            ) {
                setSelectedSuggestions([]);
                setTopicSelectMode(false);
            }
        };
        document.addEventListener("mousedown", handleGlobalClick);
        return () => document.removeEventListener("mousedown", handleGlobalClick);
    }, [topicSelectMode]);

    return {
        topicViewTopic,
        topicViewDraft,
        setTopicViewDraft,
        isTopicEditing,
        topicSuggestions,
        topicSuggestionsLoading,
        selectedSuggestions,
        topicSelectMode,
        topicSelectToggleRef,
        topicSuggestionsRef,
        topicViewEditorRef,
        openTopicView,
        closeTopicView,
        startTopicEditing,
        cancelTopicEditing,
        commitTopicEdit,
        handleTopicEditSubmit,
        handleTopicEditBlur,
        handleTopicEditKeyDown,
        handleTopicTitleKeyDown,
        handleTopicViewGenerate,
        handleTopicViewSave,
        handleSuggestionToggle,
        handleSaveSelectedSuggestions,
        handleRefreshSuggestions,
        handleToggleTopicSelectMode,
    };
}
