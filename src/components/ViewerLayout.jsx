// src/components/ViewerLayout.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';
import InventorySummaryPage from '../pages/InventorySummaryPage';
import { useAuth } from '../context/UserContext';
import { useResponsive } from '../hooks/useResponsive';
import FloatingCalculator from './FloatingCalculator';
import { MdCalculate } from 'react-icons/md';
import MobileInventoryPage from '../pages/MobileInventoryPage';
import companyLogo from '../assets/logo.png';
import { usePresence } from '../hooks/usePresence';

const ViewerLayout = () => {
    const { role, user } = useAuth();
    usePresence();

    const isMobile = useResponsive();
    const canViewDetail = ['owner', 'admin', 'med', 'bio'].includes(role);

    // === BƯỚC 1: DI CHUYỂN STATE VÀ HÀM LÊN TRÊN ===
    const [viewMode, setViewMode] = useState('summary');
    const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);

    const toggleCalculator = () => {
        setIsCalculatorVisible(prev => !prev);
    };
    // =======================================================

    // === BƯỚC 2: ĐẶT useEffect Ở DƯỚI SAU KHI CÁC HÀM ĐÃ ĐƯỢC ĐỊNH NGHĨA ===
    useEffect(() => {
        const handleKeyDown = (event) => {
            // Mở/Đóng máy tính bằng phím F2
            if (event.key === 'F2') {
                event.preventDefault();
                toggleCalculator();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleCalculator]);
    // =======================================================================

    const dynamicTitle = useMemo(() => {
        switch (role) {
            case 'owner':
            case 'admin':
                return 'INVENTORY';
            case 'med':
                return 'TEAM MED';
            case 'bio':
                return 'TEAM BIO';
            default:
                return 'Kho - PT Biomed';
        }
    }, [role]);

    useEffect(() => {
        document.title = dynamicTitle;
    }, [dynamicTitle]);

    useEffect(() => {
        if (!canViewDetail) {
            setViewMode('summary');
        }
    }, [canViewDetail]);

    if (isMobile) {
        return (
            <div style={{ padding: '10px' }}>
                <MobileInventoryPage />
            </div>
        );
    }

    return (
        <div className="viewer-layout-container">
            <div className="viewer-header">
                <div className="viewer-header-left">
                    {role === 'owner' && (
                        <Link to="/dashboard" className="btn-back">
                            &larr; Quay lại Trang Quản Trị
                        </Link>
                    )}
                    {canViewDetail && (
                         <div className="filter-group">
                            <button onClick={() => setViewMode('summary')} className={`view-toggle-btn ${viewMode === 'summary' ? 'active' : ''}`}>
                                Xem Tổng Hợp
                            </button>
                            <button onClick={() => setViewMode('detail')} className={`view-toggle-btn ${viewMode === 'detail' ? 'active' : ''}`}>
                                Xem Chi Tiết
                            </button>
                         </div>
                    )}
                </div>

                <div className="viewer-header-center">
                    <img src={companyLogo} alt="Logo Công ty" className="header-logo" />
                    <h1>{dynamicTitle}</h1>
                </div>

                <div className="viewer-header-right">
                    {/* Có thể thêm nút đăng xuất ở đây nếu cần */}
                </div>
            </div>

            <div className="viewer-main-content">
                {(viewMode === 'detail' && canViewDetail) 
                    ? <InventoryPage />
                    : <InventorySummaryPage />
                }
            </div>

            <button className="floating-toggle-btn" onClick={toggleCalculator} title="Mở máy tính (F2)">
                <MdCalculate />
            </button>
            {isCalculatorVisible && <FloatingCalculator onClose={toggleCalculator} />}
        </div>
    );
};

export default ViewerLayout;