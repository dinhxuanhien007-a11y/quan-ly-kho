// src/components/ExpiryBadge.jsx
import React from 'react';
import { formatDate, getRelativeTimeFromNow, calculateLifePercentage, getRowColorByExpiry } from '../utils/dateUtils';
import { FiClock, FiAlertCircle } from 'react-icons/fi';

const ExpiryBadge = ({ expiryDate, subGroup, showProgressBar = true, compact = false }) => {
    if (!expiryDate) return <span style={{color: '#999', fontStyle: 'italic'}}>(Không có HSD)</span>;

    const formattedDate = formatDate(expiryDate);
    const relativeTime = getRelativeTimeFromNow(expiryDate);
    const colorClass = getRowColorByExpiry(expiryDate, subGroup);
    const lifePercentage = calculateLifePercentage(expiryDate);

    // Xác định màu chữ dựa trên class trả về từ utils
    let textColor = '#333';
    let icon = <FiClock style={{marginRight: '4px'}} />;
    
    if (colorClass.includes('expired')) {
        textColor = '#dc3545'; // Đỏ đậm
        icon = <FiAlertCircle style={{marginRight: '4px'}} />;
    } else if (colorClass.includes('red')) {
        textColor = '#c82333';
    } else if (colorClass.includes('orange')) {
        textColor = '#d66907'; // Cam đậm
    } else if (colorClass.includes('yellow')) {
        textColor = '#856404'; // Vàng nâu
    } else {
        textColor = '#28a745'; // Xanh lá (An toàn)
    }

    if (compact) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: '12px' }}>
                <span style={{ fontWeight: 'bold' }}>{formattedDate}</span>
                <span style={{ color: textColor, fontSize: '11px' }}>{relativeTime}</span>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {/* Dòng 1: Ngày tháng + Icon */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ fontWeight: '600' }}>{formattedDate}</span>
                <span style={{ fontSize: '11px', color: textColor, display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                    {icon} {relativeTime}
                </span>
            </div>

            {/* Dòng 2: Thanh tiến trình tuổi thọ */}
            {showProgressBar && (
                <div style={{ width: '100%', height: '4px', backgroundColor: '#e9ecef', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                        width: `${lifePercentage}%`,
                        height: '100%',
                        borderRadius: '2px',
                        backgroundColor: lifePercentage > 50 ? '#28a745' : (lifePercentage > 20 ? '#ffc107' : '#dc3545'),
                        transition: 'width 0.5s ease'
                    }}></div>
                </div>
            )}
        </div>
    );
};

export default React.memo(ExpiryBadge);