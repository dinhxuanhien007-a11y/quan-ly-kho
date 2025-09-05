// src/components/InventoryFilters.jsx
import React from 'react';

const InventoryFilters = ({ userRole, onFilterChange, activeFilters }) => {
    
  const handleTeamFilter = (team) => {
    if (activeFilters.team === team) {
      onFilterChange('team', 'all');
    } else {
      onFilterChange('team', team);
    }
  };

  const handleDateFilter = (status) => {
    if (activeFilters.dateStatus === status) {
      onFilterChange('dateStatus', 'all');
    } else {
      onFilterChange('dateStatus', status);
    }
  };

  return (
    <div className="filters-container">
      {/* Bộ lọc theo Team */}
      {/* Chỉ hiển thị bộ lọc team nếu là admin, owner, hoặc bio */}
      {(userRole === 'admin' || userRole === 'owner' || userRole === 'bio') && (
        <div className="filter-group">
          {/* Chỉ admin/owner mới thấy nút lọc MED và BIO */}
          {(userRole === 'admin' || userRole === 'owner') && (
            <>
              <button
                className={activeFilters.team === 'MED' ? 'active' : ''}
                onClick={() => handleTeamFilter('MED')}
              >
                Lọc hàng MED
              </button>
              <button
                className={activeFilters.team === 'BIO' ? 'active' : ''}
                onClick={() => handleTeamFilter('BIO')}
              >
                Lọc hàng BIO
              </button>
            </>
          )}
          
          {/* Admin/owner và bio đều thấy nút này */}
          <button
            className={activeFilters.team === 'Spare Part' ? 'active' : ''}
            onClick={() => handleTeamFilter('Spare Part')}
          >
            Lọc hàng Spare Part
          </button>
        </div>
      )}
      
      {/* Bộ lọc theo HSD */}
      <div className="filter-group">
        <button
          className={activeFilters.dateStatus === 'near_expiry' ? 'active' : ''}
          onClick={() => handleDateFilter('near_expiry')}
        >
          Lọc hàng cận date (&lt;120 ngày)
        </button>
        <button
          className={activeFilters.dateStatus === 'expired' ? 'active' : ''}
          onClick={() => handleDateFilter('expired')}
        >
          Lọc hàng đã hết HSD
        </button>
      </div>
    </div>
  );
};

export default InventoryFilters;