// src/components/NewDataNotification.jsx
import React from 'react';

const NewDataNotification = ({ isVisible, onRefresh, message }) => {
    if (!isVisible) {
        return null;
    }

    return (
        <div className="new-data-notification">
            <p>{message}</p>
            <button onClick={onRefresh} className="btn-primary">Tải lại danh sách</button>
        </div>
    );
};

export default NewDataNotification;
