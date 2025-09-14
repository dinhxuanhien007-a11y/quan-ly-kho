// src/components/TempBadge.jsx
import React from 'react';

const TempBadge = ({ temperature }) => {
  let className = 'temp-badge';
  const tempString = temperature?.toLowerCase() || '';

  if (tempString.includes('2') && tempString.includes('8')) {
    className += ' temp-cool'; // 2 -> 8°C
  } else if (tempString.includes('-15') || tempString.includes('-25')) {
    className += ' temp-frozen'; // -25 -> -15°C
  } else if (tempString.includes('phòng')) {
    className += ' temp-room'; // Nhiệt độ phòng
  } else {
    className += ' temp-other'; // Các loại khác
  }

  return <span className={className}>{temperature}</span>;
};

// <-- NÂNG CẤP: Bọc component trong React.memo để tối ưu hiệu năng.
export default React.memo(TempBadge);
