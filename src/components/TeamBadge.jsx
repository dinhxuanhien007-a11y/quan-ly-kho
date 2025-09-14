// src/components/TeamBadge.jsx
import React from 'react';

const TeamBadge = ({ team }) => {
  let className = 'team-badge';
  switch (team) {
    case 'MED':
      className += ' team-med';
      break;
    case 'BIO':
      className += ' team-bio';
      break;
    case 'Spare Part':
      className += ' team-sparepart';
      break;
    default:
      break;
  }

  return <span className={className}>{team}</span>;
};

// <-- NÂNG CẤP: Bọc component trong React.memo để tối ưu hiệu năng.
export default React.memo(TeamBadge);
