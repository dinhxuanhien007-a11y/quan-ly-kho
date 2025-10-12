// src/components/InventoryFilters.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { FiChevronDown } from 'react-icons/fi';
import { ALL_SUBGROUPS, SUBGROUPS_BY_TEAM } from '../constants';

const InventoryFilters = ({ userRole, onFilterChange, activeFilters }) => {
    // State để quản lý bộ lọc nhóm hàng mới
    const [isSubGroupOpen, setIsSubGroupOpen] = useState(false);
    const subGroupRef = useRef(null);

  const subGroups = useMemo(() => {
    if (userRole === 'med') {
        return SUBGROUPS_BY_TEAM.MED;
    } else if (userRole === 'bio') { // <-- Sửa thành "else if"
        return SUBGROUPS_BY_TEAM.BIO;
    } else { // <-- Thêm "else" cho rõ ràng
        // Dành cho admin/owner
        return ALL_SUBGROUPS;
    }
}, [userRole]);

    // Xử lý việc đóng menu khi click ra bên ngoài
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (subGroupRef.current && !subGroupRef.current.contains(event.target)) {
                setIsSubGroupOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Các hàm xử lý filter đã có
    const handleTeamFilter = (team) => {
        onFilterChange('team', activeFilters.team === team ? 'all' : team);
    };

    const handleDateFilter = (status) => {
        onFilterChange('dateStatus', activeFilters.dateStatus === status ? 'all' : status);
    };

    // Hàm xử lý cho bộ lọc nhóm hàng mới
    const handleSubGroupFilter = (subGroup) => {
     // Nếu chọn "Bỏ lọc" thì set 'all', ngược lại thì set giá trị được chọn
     onFilterChange('subGroup', subGroup);
     setIsSubGroupOpen(false);
 };

    return (
        <div className="filters-container">
            {/* Bộ lọc theo Team (giữ nguyên) */}
            {(userRole === 'admin' || userRole === 'owner' || userRole === 'bio') && (
                <div className="filter-group">
                    {(userRole === 'admin' || userRole === 'owner') && (
                        <>
                            <button className={activeFilters.team === 'MED' ? 'active' : ''} onClick={() => handleTeamFilter('MED')}>Lọc hàng MED</button>
                            <button className={activeFilters.team === 'BIO' ? 'active' : ''} onClick={() => handleTeamFilter('BIO')}>Lọc hàng BIO</button>
                        </>
                    )}
                </div>
            )}
            
            {/* Bộ lọc theo Date (giữ nguyên) */}
            <div className="filter-group">
                <button className={activeFilters.dateStatus === 'near_expiry' ? 'active' : ''} onClick={() => handleDateFilter('near_expiry')}>Lọc hàng cận date</button>
                <button className={activeFilters.dateStatus === 'expired' ? 'active' : ''} onClick={() => handleDateFilter('expired')}>Lọc hàng hết HSD</button>
            </div>

            {/* --- BỘ LỌC NHÓM HÀNG MỚI --- */}
            <div className="filter-group" ref={subGroupRef}>
                <div className="dropdown-filter">
                    <button onClick={() => setIsSubGroupOpen(!isSubGroupOpen)} className={activeFilters.subGroup && activeFilters.subGroup !== 'all' ? 'active' : ''}>
    {activeFilters.subGroup && activeFilters.subGroup !== 'all' ? `Nhóm: ${activeFilters.subGroup}` : 'Lọc theo Nhóm Hàng'}
    <FiChevronDown style={{ marginLeft: '5px' }} />
</button>
                    {isSubGroupOpen && (
                        <div className="dropdown-content">
                            <button onClick={() => handleSubGroupFilter('all')}>Bỏ lọc nhóm hàng</button>
                            {subGroups.map(sg => (
                                <button key={sg} onClick={() => handleSubGroupFilter(sg)}>
                                    {sg}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(InventoryFilters);