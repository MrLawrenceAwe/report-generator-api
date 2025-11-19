import React from 'react';

export function SectionCountSelector({ value, onChange, disabled }) {
    return (
        <div className="section-selector" title="Number of sections to generate">
            <span className="section-selector__label">Sections</span>
            <input
                type="number"
                min="1"
                max="20"
                value={value}
                onChange={(e) => {
                    const val = e.target.value;
                    onChange(val === "" ? "" : parseInt(val, 10));
                }}
                disabled={disabled}
                className="section-selector__input"
            />
        </div>
    );
}
