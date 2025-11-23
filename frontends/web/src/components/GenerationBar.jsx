import React from 'react';
import { TOPIC_VIEW_BAR_INPUT_ID } from '../utils/helpers';

export function GenerationBar({
    topicViewBarValue,
    setTopicViewBarValue,
    handleTopicViewBarSubmit,
}) {
    return (
        <section className="sidebar-section sidebar-section--topic-bar">
            <div className="sidebar-section__header">
                <h2>Topic View bar</h2>
            </div>
            <form className="topic-view-bar" onSubmit={handleTopicViewBarSubmit}>
                <label htmlFor={TOPIC_VIEW_BAR_INPUT_ID} className="topic-view-bar__label">
                    Topic
                </label>
                <input
                    id={TOPIC_VIEW_BAR_INPUT_ID}
                    type="text"
                    value={topicViewBarValue}
                    placeholder="e.g. Microplastics In Oceans"
                    onChange={(event) => setTopicViewBarValue(event.target.value)}
                    autoComplete="off"
                />
                <p className="topic-view-bar__hint">Press Enter to open the Topic View.</p>
            </form>
        </section>
    );
}
