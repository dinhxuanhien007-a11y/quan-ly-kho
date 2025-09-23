// src/components/HighlightText.jsx
import React from 'react';

const HighlightText = ({ text = '', highlight = '' }) => {
    if (!highlight.trim()) {
        return <span>{text}</span>;
    }

    const regex = new RegExp(`(${highlight})`, 'gi');
    const parts = text.split(regex);

    return (
        <span>
            {parts.map((part, i) =>
                regex.test(part) ? (
                    <strong key={i} style={{ backgroundColor: '#fffbe6' }}>{part}</strong>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </span>
    );
};

export default HighlightText;