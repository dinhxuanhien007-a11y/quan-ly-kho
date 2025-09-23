// src/components/ViewerLayout.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';
import InventorySummaryPage from '../pages/InventorySummaryPage';
import { useAuth } from '../hooks/useAuth';
import { useResponsive } from '../hooks/useResponsive';
import FloatingCalculator from './FloatingCalculator';
import { MdCalculate } from 'react-icons/md';
import MobileInventoryPage from '../pages/MobileInventoryPage';
import companyLogo from '../assets/logo.png'; // Di chuyển import logo đến đây
import { FiPrinter } from 'react-icons/fi'; // Thêm import cho icon In

const ViewerLayout = () => {
    const { role: userRole } = useAuth();
    const isMobile = useResponsive();
    const canViewDetail = userRole === 'admin' || userRole === 'owner';
    const [viewMode, setViewMode] = useState('summary');
    const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);

    const toggleCalculator = () => {
        setIsCalculatorVisible(prev => !prev);
    };

    // Di chuyển hàm handlePrint ra layout cha
    const handlePrint = () => {
        const pageNameToPrint = viewMode === 'detail' ? 'ChiTiet' : 'TongHop';
        const originalTitle = document.title;
        document.title = `BaoCao_TonKho_${pageNameToPrint}_${new Date().toLocaleDateString('vi-VN')}`;
        window.print();
        document.title = originalTitle;
    };

    const dynamicTitle = useMemo(() => {
        switch (userRole) {
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
    }, [userRole]);

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
            {/* --- THANH HEADER THỐNG NHẤT MỚI --- */}
            <div className="viewer-header">
                {/* --- Khu vực bên trái --- */}
                <div className="viewer-header-left">
                    {userRole === 'owner' && (
                        <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
                            &larr; Quay lại Trang Quản Trị
                        </Link>
                    )}
                    {canViewDetail && (
                        <div className="view-toggle">
                            <button onClick={() => setViewMode('summary')} className={viewMode === 'summary' ? 'btn-primary' : 'btn-secondary'} style={{width: 'auto'}}>
                                Xem Tổng Hợp
                            </button>
                            <button onClick={() => setViewMode('detail')} className={viewMode === 'detail' ? 'btn-primary' : 'btn-secondary'} style={{width: 'auto'}}>
                                Xem Chi Tiết
                            </button>
                        </div>
                    )}
                </div>

                {/* --- Khu vực trung tâm (Logo và Tiêu đề) --- */}
                <div className="viewer-header-center">
                    <img src={companyLogo} alt="Logo Công ty" className="header-logo" />
                    <h1>{dynamicTitle}</h1>
                </div>

                {/* --- Khu vực bên phải --- */}
                <div className="viewer-header-right">
                    {(userRole === 'owner' || userRole === 'admin') && (
                        <button onClick={handlePrint} className="btn-secondary">
                            <FiPrinter style={{marginRight: '5px'}} />
                            In Báo Cáo
                        </button>
                    )}
                </div>
            </div>

            {/* --- PHẦN NỘI DUNG CHÍNH --- */}
            <div className="viewer-main-content">
                {(viewMode === 'detail' && canViewDetail) 
                    ? <InventoryPage />
                    : <InventorySummaryPage />
                }
            </div>

            {/* Nút máy tính giữ nguyên */}
            <button className="floating-toggle-btn" onClick={toggleCalculator} title="Mở máy tính (Có thể dùng bàn phím)">
                <MdCalculate />
            </button>
            {isCalculatorVisible && <FloatingCalculator onClose={toggleCalculator} />}
        </div>
    );
};

export default ViewerLayout;