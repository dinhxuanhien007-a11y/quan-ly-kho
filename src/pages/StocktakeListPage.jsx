// src/pages/StocktakeListPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit, startAfter } from 'firebase/firestore';
import CreateStocktakeModal from '../components/CreateStocktakeModal';
import { toast } from 'react-toastify';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const PAGE_SIZE = 15; // SỐ PHIÊN TRÊN MỖI TRANG

const StocktakeListPage = () => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [stocktakeSessions, setStocktakeSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // --- STATE MỚI CHO PHÂN TRANG ---
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    const [isLastPage, setIsLastPage] = useState(false);

    const fetchSessions = useCallback(async (direction = 'next') => {
        setLoading(true);
        try {
            let sessionsQuery = query(collection(db, "stocktakes"), orderBy("createdAt", "desc"));

            if (direction === 'next' && lastVisible) {
                sessionsQuery = query(sessionsQuery, startAfter(lastVisible), limit(PAGE_SIZE));
            } else { // 'first' or default
                sessionsQuery = query(sessionsQuery, limit(PAGE_SIZE));
                setPage(1);
            }

            const querySnapshot = await getDocs(sessionsQuery);
            const sessions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
            setIsLastPage(querySnapshot.docs.length < PAGE_SIZE);
            setStocktakeSessions(sessions);
        } catch (error) {
            console.error("Lỗi khi tải phiên kiểm kê:", error);
            toast.error("Không thể tải danh sách phiên kiểm kê.");
        } finally {
            setLoading(false);
        }
    }, [lastVisible]);

    useEffect(() => {
        fetchSessions('first');
    }, []);

    const handleNextPage = () => {
        if (!isLastPage) {
            setPage(prev => prev + 1);
            fetchSessions('next');
        }
    };
    
    const handlePrevPage = () => {
        setLastVisible(null);
        fetchSessions('first');
    };

    const handleCreateStocktake = async (sessionData) => {
        setIsCreating(true);
        try {
            let inventoryQuery;
            if (sessionData.scope === 'all') {
                inventoryQuery = query(collection(db, "inventory_lots"));
            } else {
                inventoryQuery = query(collection(db, "inventory_lots"), where("team", "==", sessionData.scope));
            }

            const querySnapshot = await getDocs(inventoryQuery);
            const inventorySnapshotItems = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    lotId: doc.id,
                    productId: data.productId,
                    productName: data.productName,
                    lotNumber: data.lotNumber,
                    expiryDate: data.expiryDate,
                    unit: data.unit,
                    packaging: data.packaging,
                    storageTemp: data.storageTemp,
                    team: data.team,
                    systemQty: data.quantityRemaining,
                    countedQty: null,
                };
            });
            
            const newStocktakeSession = {
                name: sessionData.sessionName,
                scope: sessionData.scope,
                status: 'in_progress',
                createdAt: serverTimestamp(),
                items: inventorySnapshotItems,
            };

            const docRef = await addDoc(collection(db, "stocktakes"), newStocktakeSession);
            
            toast.success("Tạo phiên kiểm kê mới thành công!");
            setIsCreateModalOpen(false);
            navigate(`/stocktakes/${docRef.id}`); // Chuyển đến trang mới, không cần tải lại danh sách
        } catch (error) {
            console.error("Lỗi khi tạo phiên kiểm kê: ", error);
            toast.error("Đã có lỗi xảy ra khi tạo phiên kiểm kê.");
        } finally {
            setIsCreating(false);
        }
    };
    
    return (
        <div>
            {isCreateModalOpen && (
                <CreateStocktakeModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreate={handleCreateStocktake}
                    isCreating={isCreating}
                />
            )}
            <div className="page-header">
                <h1>Danh sách Phiên Kiểm Kê Kho</h1>
                <button 
                    onClick={() => setIsCreateModalOpen(true)} 
                    className="btn-primary"
                >
                    Tạo Phiên Mới
                </button>
            </div>
      
            {loading ? <Spinner /> : (
                <>
                    <table className="products-table">
                        <thead>
                            <tr>
                                <th>Tên Phiên Kiểm Kê</th>
                                <th>Ngày Tạo</th>
                                <th>Phạm Vi</th>
                                <th>Trạng Thái</th>
                                <th>Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stocktakeSessions.length > 0 ? (
                                stocktakeSessions.map(session => (
                                    <tr key={session.id}>
                                        <td>{session.name}</td>
                                        <td>{session.createdAt?.toDate().toLocaleDateString('vi-VN')}</td>
                                        <td>{session.scope === 'all' ? 'Toàn bộ kho' : session.scope}</td>
                                        <td><StatusBadge status={session.status} /></td>
                                        <td>
                                            <button 
                                                className="btn-secondary" 
                                                style={{padding: '5px 10px'}}
                                                onClick={() => navigate(`/stocktakes/${session.id}`)}
                                            >
                                                Xem/Thực hiện
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="5" style={{textAlign: 'center'}}>Chưa có phiên kiểm kê nào.</td></tr>
                            )}
                        </tbody>
                    </table>

                    <div className="pagination-controls">
                        <button onClick={handlePrevPage} disabled={page <= 1}>
                            <FiChevronLeft /> Trang Trước
                        </button>
                        <span>Trang {page}</span>
                        <button onClick={handleNextPage} disabled={isLastPage}>
                            Trang Tiếp <FiChevronRight />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default StocktakeListPage;