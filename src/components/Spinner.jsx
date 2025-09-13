// src/components/Spinner.jsx
import React from 'react';
import './Spinner.css';

const Spinner = ({ forTable = false }) => {
    if (forTable) {
        return (
            <tr className="spinner-table-row">
                <td colSpan="100%"> {/* colSpan lớn để hoạt động với mọi bảng */}
                    <div className="spinner"></div>
                </td>
            </tr>
        );
    }

    return (
        <div className="spinner-container">
            <div className="spinner"></div>
        </div>
    );
};

export default Spinner;