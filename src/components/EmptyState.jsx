// src/components/EmptyState.jsx
import React from 'react';
import { FiInbox, FiSearch } from 'react-icons/fi';

const EmptyState = ({ message, isSearch = false }) => {
    return (
        <div className="empty-state-wrapper">
            <div className="empty-state-icon">
                {isSearch ? <FiSearch /> : <FiInbox />}
            </div>
            <p className="empty-state-text">{message || 'Không có dữ liệu'}</p>
        </div>
    );
};

export default EmptyState;