// src/components/Spinner.jsx
import React from 'react';
import styles from './Spinner.module.css'; // Cập nhật import

const Spinner = ({ forTable = false }) => {
    if (forTable) {
        return (
            <tr className={styles.spinnerTableRow}>
                <td colSpan="100%">
                    <div className={styles.spinner}></div>
                </td>
            </tr>
        );
    }

    return (
        <div className={styles.spinnerContainer}>
            <div className={styles.spinner}></div>
        </div>
    );
};

export default Spinner;