import React from 'react';
import { OUTLINE_INPUT_MODES } from '../utils/helpers';
import { RefineToggle } from './RefineToggle';

export function OutlineForm({
    outlineTopic,
    setOutlineTopic,
    outlineInputMode,
    setOutlineInputMode,
    outlineSections,
    outlineJsonInput,
    setOutlineJsonInput,
    error,
    jsonValidationError,
    trimmedJsonInput,
    isFormValid,
    isRunning,
    handleSubmit,
    submitLabel,
    handlers: {
        handleAddSection,
        handleRemoveSection,
        handleSectionTitleChange,
        handleSubsectionChange,
        handleAddSubsection,
        handleRemoveSubsection,
    },
    avoidTopics,
    setAvoidTopics,
    includeTopics,
    setIncludeTopics,
}) {
    return (
        <form
            className={`outline-composer${isRunning ? " outline-composer--pending" : ""}`}
            onSubmit={handleSubmit}
        >
            <div className="outline-composer__header">
                <label className="outline-composer__field outline-composer__field--main">
                    <span className="outline-composer__eyebrow">Topic</span>
                    <input
                        type="text"
                        value={outlineTopic}
                        onChange={(event) => setOutlineTopic(event.target.value)}
                        disabled={isRunning}
                    />
                </label>
                <RefineToggle
                    avoidTopics={avoidTopics}
                    setAvoidTopics={setAvoidTopics}
                    includeTopics={includeTopics}
                    setIncludeTopics={setIncludeTopics}
                    isRunning={isRunning}
                />
            </div>
            <div className="outline-format-toggle" role="tablist" aria-label="Outline input format">
                {OUTLINE_INPUT_MODES.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={outlineInputMode === option.value}
                        className={`outline-format-toggle__option${outlineInputMode === option.value
                            ? " outline-format-toggle__option--active"
                            : ""
                            }`}
                        onClick={() => !isRunning && setOutlineInputMode(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            {outlineInputMode === "lines" ? (
                <div className="outline-lines">
                    <div className="outline-section-list">
                        {outlineSections.map((section, sectionIndex) => (
                            <div key={section.id} className="outline-section">
                                <div className="outline-section__header">
                                    <div className="outline-section__meta">
                                        <span className="outline-section__badge">{sectionIndex + 1}</span>
                                        <input
                                            type="text"
                                            value={section.title}
                                            onChange={(event) =>
                                                handleSectionTitleChange(section.id, event.target.value)
                                            }
                                            placeholder="Section"
                                            aria-label={`Section ${sectionIndex + 1} title`}
                                            disabled={isRunning}
                                        />
                                    </div>
                                    {outlineSections.length > 1 && (
                                        <button
                                            type="button"
                                            className="outline-section__remove"
                                            onClick={() => handleRemoveSection(section.id)}
                                            disabled={isRunning}
                                            aria-label="Remove section"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                                <div className="outline-subsection-list">
                                    {section.subsections.map((subsection, subsectionIndex) => (
                                        <div key={`${section.id}-${subsectionIndex}`} className="outline-subsection">
                                            <span className="outline-subsection__badge">
                                                {sectionIndex + 1}.{subsectionIndex + 1}
                                            </span>
                                            <input
                                                type="text"
                                                value={subsection}
                                                onChange={(event) =>
                                                    handleSubsectionChange(
                                                        section.id,
                                                        subsectionIndex,
                                                        event.target.value
                                                    )
                                                }
                                                placeholder="Subsection"
                                                aria-label={`Section ${sectionIndex + 1} Subsection ${subsectionIndex + 1}`}
                                                disabled={isRunning}
                                            />
                                            {section.subsections.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemoveSubsection(section.id, subsectionIndex)
                                                    }
                                                    disabled={isRunning}
                                                    aria-label="Remove subsection"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="outline-add-button"
                                    onClick={() => handleAddSubsection(section.id)}
                                    disabled={isRunning}
                                >
                                    + Add Subsection
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="outline-json-block">
                    <p className="outline-help">Paste JSON with sections and subsections.</p>
                    <textarea
                        className="outline-json-input"
                        rows={8}
                        value={outlineJsonInput}
                        onChange={(event) => setOutlineJsonInput(event.target.value)}
                        disabled={isRunning}
                    />
                    {jsonValidationError && trimmedJsonInput && (
                        <p className="outline-error outline-error--inline">{jsonValidationError}</p>
                    )}
                </div>
            )}
            {error && <p className="outline-error">{error}</p>}
            <div className="outline-builder__actions">
                {outlineInputMode === "lines" && (
                    <button
                        type="button"
                        className="outline-add-button outline-add-button--section"
                        onClick={handleAddSection}
                        disabled={isRunning}
                    >
                        + Add Section
                    </button>
                )}
                <button type="submit" className="outline-submit" disabled={!isFormValid || isRunning}>
                    {submitLabel}
                </button>
            </div>
        </form>
    );
}
