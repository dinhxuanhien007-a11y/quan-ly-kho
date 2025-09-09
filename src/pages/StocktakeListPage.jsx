// src/pages/StocktakeListPage.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import CreateStocktakeModal from '../components/CreateStocktakeModal';

const StocktakeListPage = () => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [stocktakeSessions, setStocktakeSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const fetchSessions = async () => {
        setLoading(true);
        const q = query(collection(db, "stocktakes"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const sessions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStocktakeSessions(sessions);
        setLoading(false);
    };

    useEffect(() => {
        fetchSessions();
    }, []);

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
            
            setIsCreateModalOpen(false);
            navigate(`/stocktakes/${docRef.id}`);

        } catch (error) {
            console.error("Lỗi khi tạo phiên kiểm kê: ", error);
            alert("Đã có lỗi xảy ra khi tạo phiên kiểm kê.");
        } finally {
            setIsCreating(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'in_progress': return <span className="status-badge status-pending">Đang thực hiện</span>;
            case 'completed': return <span className="status-badge status-completed">Đã hoàn thành đếm</span>;
            case 'adjusted': return <span className="status-badge" style={{ backgroundColor: '#6f42c1' }}>Đã điều chỉnh</span>;
            default: return <span className="status-badge">{status}</span>;
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
                    {loading ? (
                        <tr><td colSpan="5" style={{textAlign: 'center'}}>Đang tải...</td></tr>
                    ) : stocktakeSessions.length > 0 ? (
                        stocktakeSessions.map(session => (
                            <tr key={session.id}>
                                <td>{session.name}</td>
                                <td>{session.createdAt?.toDate().toLocaleDateString('vi-VN')}</td>
                                <td>{session.scope === 'all' ? 'Toàn bộ kho' : session.scope}</td>
                                <td>{getStatusBadge(session.status)}</td>
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
        </div>
    );
};

export default StocktakeListPage;