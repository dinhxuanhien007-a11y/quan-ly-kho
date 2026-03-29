// src/components/ViewerLayout.jsx

import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Link, useLocation, useNavigate, Routes, Route } from 'react-router-dom';
import { useAuth } from '../context/UserContext';
import { useResponsive } from '../hooks/useResponsive';
import FloatingCalculator from './FloatingCalculator';
import { MdCalculate } from 'react-icons/md';
import companyLogo from '../assets/logo.png';
import { usePresence } from '../hooks/usePresence';
import { useTheme } from '../context/ThemeContext';
import { MdDarkMode, MdLightMode } from 'react-icons/md';
import { FiGitMerge } from 'react-icons/fi';

import ParticipantBanner from './ParticipantBanner';
import { subscribeToActiveSessions } from '../services/collaborativeStocktakeService';

const InventoryPage = lazy(() => import('../pages/InventoryPage'));
const InventorySummaryPage = lazy(() => import('../pages/InventorySummaryPage'));
const MobileInventoryPage = lazy(() => import('../pages/MobileInventoryPage'));
const InventoryReconciliationPage = lazy(() => import('../pages/InventoryReconciliationPage'));
const CollaborativeStocktakePage = lazy(() => import('../pages/CollaborativeStocktakePage'));

const ViewerLayout = () => {
    const { role, user, userData } = useAuth();
const location = useLocation();
const navigate = useNavigate();
const isReconcilePage = location.pathname === '/doi-chieu-ton-kho';
    const { theme, toggleTheme } = useTheme();
    usePresence();

    const isMobile = useResponsive();
    const canViewDetail = ['owner', 'admin', 'med', 'bio'].includes(role);

    // === BƯỚC 1: DI CHUYỂN STATE VÀ HÀM LÊN TRÊN ===
    const [viewMode, setViewMode] = useState('summary');
    const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);
    const [activeSessions, setActiveSessions] = useState([]);

    // Subscribe phiên kiểm kê cộng tác active khi user là admin
    useEffect(() => {
        if (!user?.uid || role !== 'admin') return;
        const unsubscribe = subscribeToActiveSessions(user.uid, (sessions) => {
            console.log('activeSessions:', sessions.length, sessions.map(s => s.name));
            setActiveSessions(sessions);
        });
        return () => unsubscribe();
    }, [user?.uid, role]);

    const toggleCalculator = useCallback(() => {
    setIsCalculatorVisible(prev => !prev);
}, []); // [] nghĩa là hàm này chỉ tạo 1 lần duy nhất, không bao giờ thay đổi
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
                {role === 'admin' && activeSessions.length > 0 && !location.pathname.includes('/collaborate') && (
                    <ParticipantBanner
                        sessions={activeSessions}
                        onNavigate={(id) => navigate(`/stocktakes/${id}/collaborate`)}
                    />
                )}
                <Suspense fallback={<div className="loading-screen">Đang tải...</div>}>
                    <Routes>
                        <Route path="/stocktakes/:sessionId/collaborate" element={<CollaborativeStocktakePage />} />
                        <Route path="*" element={<MobileInventoryPage />} />
                    </Routes>
                </Suspense>
            </div>
        );
    }

    return (
        <div className="viewer-layout-container">
            <ParticipantBanner
                sessions={activeSessions}
                onNavigate={(id) => navigate(`/stocktakes/${id}/collaborate`)}
            />
            <div className="viewer-header">
                <div className="viewer-header-left">
    {role === 'owner' && (
        <Link to="/dashboard" className="btn-back">
            &larr; Quay lại Trang Quản Trị
        </Link>
    )}

    {/* Nếu đang ở trang đối chiếu thì hiện nút quay lại */}
    {isReconcilePage ? (
        <button
            onClick={() => navigate('/view')}
            className="btn-back"
        >
            &larr; Quay lại Xem Kho
        </button>
    ) : (
        /* Nếu đang ở trang kho thì hiện 2 nút chế độ xem */
        canViewDetail && (
            <div className="filter-group">
                <button onClick={() => setViewMode('summary')} className={`view-toggle-btn ${viewMode === 'summary' ? 'active' : ''}`}>
                    Xem Tổng Hợp
                </button>
                <button onClick={() => setViewMode('detail')} className={`view-toggle-btn ${viewMode === 'detail' ? 'active' : ''}`}>
                    Xem Chi Tiết
                </button>
            </div>
        )
    )}
</div>

                <div className="viewer-header-center">
                    <img src={companyLogo} alt="Logo Công ty" className="header-logo" />
                    <h1>{dynamicTitle}</h1>
                </div>

                <div className="viewer-header-right">

{role === 'admin' && userData?.canReconcile && (
    <Link 
        to="/doi-chieu-ton-kho" 
        style={{ marginRight: '8px', fontSize: '13px' }}
        title="Đối chiếu tồn kho"
    >
        <FiGitMerge style={{ fontSize: '22px' }} />
    </Link>
)}
    <button
        onClick={toggleCalculator}
        title="Máy tính (F2)"
        style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px',
            borderRadius: '8px',
            color: 'inherit',
            fontSize: '24px'
        }}
    >
        <MdCalculate />
    </button>
    <button
        onClick={toggleTheme}
        title={theme === 'light' ? 'Chuyển Dark Mode' : 'Chuyển Light Mode'}
        style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px',
            borderRadius: '8px',
            color: 'inherit',
            fontSize: '24px'
        }}
    >
        {theme === 'light' ? <MdDarkMode /> : <MdLightMode />}
    </button>
</div>
            </div>

<div className="viewer-main-content">
    <Suspense fallback={<div className="loading-screen">Đang tải...</div>}>
        <Routes>
            <Route path="/stocktakes/:sessionId/collaborate" element={<CollaborativeStocktakePage />} />
            <Route path="/doi-chieu-ton-kho" element={<InventoryReconciliationPage />} />
            <Route path="*" element={
                (viewMode === 'detail' && canViewDetail)
                    ? <InventoryPage />
                    : <InventorySummaryPage />
            } />
        </Routes>
    </Suspense>
</div>

            {isCalculatorVisible && <FloatingCalculator onClose={toggleCalculator} />}
        </div>
    );
};

export default ViewerLayout;