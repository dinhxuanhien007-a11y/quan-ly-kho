// src/pages/StocktakeSessionPage.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { doc, getDoc, updateDoc, writeBatch, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import '../styles/StocktakePage.css';
import AddUnlistedItemModal from '../components/AddUnlistedItemModal';

const formatDate = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'N/A';
    return timestamp.toDate().toLocaleDateString('vi-VN');
};

const StocktakeSessionPage = () => {
    const { sessionId } = useParams();
    const [loading, setLoading] = useState(true);
    const [sessionData, setSessionData] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [checkedItems, setCheckedItems] = useState({});
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);

    const fetchSessionData = async () => {
        setLoading(true);
        const docRef = doc(db, 'stocktakes', sessionId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            setSessionData({ id: docSnap.id, ...docSnap.data() });
        } else {
            console.log("Không tìm thấy phiên kiểm kê!");
        }
        setLoading(false);
    };

    useEffect(() => { fetchSessionData(); }, [sessionId]);

    const summaryStats = useMemo(() => {
        if (!sessionData) return { totalItems: 0, countedItems: 0, discrepancies: 0 };
        const totalItems = sessionData.items.filter(item => !item.isNew).length;
        const countedItems = sessionData.items.filter(item => item.countedQty !== null).length;
        const discrepancies = sessionData.items.filter(item => item.countedQty !== null && item.systemQty !== item.countedQty).length;
        return { totalItems, countedItems, discrepancies };
    }, [sessionData]);

    const filteredItems = useMemo(() => {
        if (!sessionData) return [];
        const sortedItems = [...sessionData.items].sort((a, b) => {
            if (a.productId < b.productId) return -1;
            if (a.productId > b.productId) return 1;
            const dateA = a.expiryDate?.toDate ? a.expiryDate.toDate() : new Date(0);
            const dateB = b.expiryDate?.toDate ? b.expiryDate.toDate() : new Date(0);
            if (dateA < dateB) return -1;
            if (dateA > dateB) return 1;
            return 0;
        });

        if (!searchTerm) return sortedItems;
        const lowercasedFilter = searchTerm.toLowerCase();
        return sortedItems.filter(item => (
            item.productId?.toLowerCase().includes(lowercasedFilter) ||
            item.productName?.toLowerCase().includes(lowercasedFilter) ||
            item.lotNumber?.toLowerCase().includes(lowercasedFilter)
        ));
    }, [sessionData, searchTerm]);

    const discrepancyItems = useMemo(() => {
        if (!sessionData) return [];
        return sessionData.items.filter(item => item.countedQty !== null && item.systemQty !== item.countedQty);
    }, [sessionData]);

    const handleCountChange = async (lotId, newCountValue) => {
        const newCount = newCountValue === '' ? null : Number(newCountValue);
        const currentItems = sessionData.items;
        const targetItem = currentItems.find(item => item.lotId === lotId);
        let finalCount = newCount;
        if (targetItem && (targetItem.countedQty || 0) > 0 && newCount !== null) {
            if (window.confirm(`Đã đếm ${targetItem.countedQty}. Bạn có muốn CỘNG DỒN thêm ${newCount} (Tổng: ${targetItem.countedQty + newCount}) không?\n\n(Nhấn OK để Cộng Dồn, Cancel để Ghi Đè)`)) {
                finalCount = (targetItem.countedQty || 0) + newCount;
            }
        }
        const updatedItems = currentItems.map(item => item.lotId === lotId ? { ...item, countedQty: finalCount } : item);
        setSessionData(prev => ({ ...prev, items: updatedItems }));
        try {
            const sessionRef = doc(db, 'stocktakes', sessionId);
            await updateDoc(sessionRef, { items: updatedItems });
            console.log(`Đã lưu số lượng cho lô ${lotId}`);
        } catch (error) {
            console.error("Lỗi khi lưu:", error);
            alert("Lỗi: Không thể lưu. Vui lòng kiểm tra kết nối mạng.");
            setSessionData(prev => ({ ...prev, items: currentItems }));
        }
    };

    const handleFinalizeCount = async () => {
        const uncountedItems = sessionData.items.filter(item => item.countedQty === null && !item.isNew);
        if (uncountedItems.length > 0) {
            if (!window.confirm(`Cảnh báo: Vẫn còn ${uncountedItems.length} mã hàng trong danh sách gốc chưa được đếm. Bạn có chắc chắn muốn hoàn tất không?`)) { return; }
        } else {
            if (!window.confirm("Tất cả các mã hàng đã được đếm. Bạn có muốn hoàn tất và khóa phiên kiểm kê này không?")) { return; }
        }
        try {
            const sessionRef = doc(db, 'stocktakes', sessionId);
            await updateDoc(sessionRef, { status: 'completed' });
            alert("Đã hoàn tất phiên kiểm kê!");
            fetchSessionData();
        } catch (error) {
            console.error("Lỗi khi hoàn tất phiên kiểm kê: ", error);
            alert("Đã có lỗi xảy ra.");
        }
    };

    const handleAdjustInventory = async () => {
        const itemsToAdjust = discrepancyItems.filter(item => checkedItems[item.lotId]);
        if (itemsToAdjust.length === 0) {
            alert("Vui lòng chọn ít nhất một mặt hàng để điều chỉnh.");
            return;
        }
        if (!window.confirm(`Bạn có chắc muốn điều chỉnh tồn kho cho ${itemsToAdjust.length} mặt hàng đã chọn không? Thao tác này không thể hoàn tác.`)) { return; }
        try {
            const batch = writeBatch(db);
            const adjustmentsCollectionRef = collection(db, 'inventory_adjustments');
            itemsToAdjust.forEach(item => {
                if (!item.isNew) {
                    const inventoryLotRef = doc(db, 'inventory_lots', item.lotId);
                    batch.update(inventoryLotRef, { quantityRemaining: item.countedQty });
                }
                const newAdjustmentRef = doc(adjustmentsCollectionRef);
                batch.set(newAdjustmentRef, {
                    createdAt: serverTimestamp(), stocktakeId: sessionId, productId: item.productId,
                    productName: item.productName, lotNumber: item.lotNumber, quantityBefore: item.systemQty,
                    quantityAfter: item.countedQty, variance: item.countedQty - item.systemQty,
                    reason: `Điều chỉnh sau kiểm kê phiên: ${sessionData.name}`
                });
            });
            const sessionRef = doc(db, 'stocktakes', sessionId);
            batch.update(sessionRef, { status: 'adjusted' });
            await batch.commit();
            alert("Đã điều chỉnh tồn kho thành công!");
            fetchSessionData();
        } catch (error) {
            console.error("Lỗi khi điều chỉnh tồn kho: ", error);
            alert("Đã xảy ra lỗi khi điều chỉnh tồn kho.");
        }
    };

    const handleCheckboxChange = (lotId) => { setCheckedItems(prev => ({ ...prev, [lotId]: !prev[lotId] })); };
    const handleCheckAll = (e) => {
        const isChecked = e.target.checked;
        const newCheckedItems = {};
        if (isChecked) {
            discrepancyItems.forEach(item => { newCheckedItems[item.lotId] = true; });
        }
        setCheckedItems(newCheckedItems);
    };

    const handleAddUnlistedItem = (newItem) => {
        const updatedItems = [...sessionData.items, newItem];
        setSessionData(prev => ({ ...prev, items: updatedItems }));
        setIsAddItemModalOpen(false);
        try {
            const sessionRef = doc(db, 'stocktakes', sessionId);
            updateDoc(sessionRef, { items: updatedItems });
            alert("Đã thêm mặt hàng mới vào phiên kiểm kê.");
        } catch (error) {
            alert("Có lỗi khi lưu mặt hàng mới, vui lòng thử lại.");
        }
    };
    
    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div>Đang tải dữ liệu phiên kiểm kê...</div>;
    if (!sessionData) return <div>Không tìm thấy dữ liệu cho phiên kiểm kê này.</div>;

    const isSessionInProgress = sessionData.status === 'in_progress';
    const isSessionCompleted = sessionData.status === 'completed';
    const isSessionAdjusted = sessionData.status === 'adjusted';
    const areAllDiscrepanciesChecked = discrepancyItems.length > 0 && discrepancyItems.every(item => checkedItems[item.lotId]);

    const CountInput = ({ item }) => {
        const [currentValue, setCurrentValue] = useState(item.countedQty ?? '');
        const handleKeyDown = (e) => { if (e.key === 'Enter') { e.target.blur(); } };
        return (
            <input type="number" placeholder="Nhập số đếm" value={currentValue}
                onChange={e => setCurrentValue(e.target.value)}
                onBlur={() => handleCountChange(item.lotId, currentValue)}
                onKeyDown={handleKeyDown} disabled={!isSessionInProgress}
                style={{
                    backgroundColor: item.isNew ? '#fff9e6' : ((item.countedQty !== null && item.countedQty !== '') ? '#e6fffa' : '#fff'),
                    borderColor: (item.countedQty !== null && item.countedQty !== '' && item.countedQty !== item.systemQty) ? '#f56565' : '#ccc',
                    cursor: !isSessionInProgress ? 'not-allowed' : 'text'
                }}
            />
        );
    };

    return (
        <div>
            {isAddItemModalOpen && (<AddUnlistedItemModal onClose={() => setIsAddItemModalOpen(false)} onAddItem={handleAddUnlistedItem} />)}
            <div className="page-header">
                <h1>{sessionData.name}
                    {isSessionCompleted && <span className="status-badge status-completed" style={{fontSize: '16px', marginLeft: '15px'}}>Đã Hoàn Thành Đếm</span>}
                    {isSessionAdjusted && <span className="status-badge" style={{fontSize: '16px', marginLeft: '15px', backgroundColor: '#6f42c1'}}>Đã Điều Chỉnh</span>}
                </h1>
                <div>
                    <button onClick={handlePrint} className="btn-secondary" style={{marginRight: '10px'}}>In Phiếu Đếm Tay</button>
                    {isSessionInProgress && (<button onClick={handleFinalizeCount} className="btn-primary">Hoàn tất đếm</button>)}
                </div>
            </div>
            <div className="form-section">
                <div className="compact-info-grid" style={{gridTemplateColumns: '1fr 1fr 1fr'}}>
                    <div><label>Tổng số mã cần đếm</label><p><strong>{summaryStats.totalItems}</strong></p></div>
                    <div><label>Số mã đã đếm</label><p style={{color: 'green'}}><strong>{summaryStats.countedItems}</strong></p></div>
                    <div><label>Số mã có chênh lệch</label><p style={{color: 'red'}}><strong>{summaryStats.discrepancies}</strong></p></div>
                </div>
            </div>
            <div className="controls-container">
                <div className="search-container">
                    <input type="text" placeholder="Tìm theo Mã hàng, Tên hàng, Số lô..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
                </div>
                {isSessionInProgress && (
                    <button onClick={() => setIsAddItemModalOpen(true)} className="btn-secondary" style={{whiteSpace: 'nowrap'}}>+ Thêm Hàng Ngoài DS</button>
                )}
            </div>
            {(isSessionCompleted || isSessionAdjusted) && (
                <div className="form-section">
                    <h3 style={{color: '#dc3545'}}>Xử Lý Chênh Lệch</h3>
                    <p>Chỉ những mặt hàng có số lượng thực tế khác với hệ thống được liệt kê dưới đây. Chọn những mục bạn muốn điều chỉnh và xác nhận.</p>
                    {discrepancyItems.length > 0 ? (
                        <>
                            <table className="products-table">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" onChange={handleCheckAll} checked={areAllDiscrepanciesChecked} disabled={isSessionAdjusted} /></th>
                                        <th>Mã hàng</th><th>Tên hàng</th><th>Số lô</th>
                                        <th>Tồn hệ thống</th><th>Tồn thực tế</th><th>Chênh lệch</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {discrepancyItems.map(item => {
                                        const variance = item.countedQty - item.systemQty;
                                        return (
                                            <tr key={item.lotId} style={{backgroundColor: item.isNew ? '#fff9e6' : 'transparent'}}>
                                                <td><input type="checkbox" checked={!!checkedItems[item.lotId]} onChange={() => handleCheckboxChange(item.lotId)} disabled={isSessionAdjusted} /></td>
                                                <td>{item.productId}</td><td>{item.productName}</td><td>{item.lotNumber}</td>
                                                <td>{item.systemQty}</td><td><strong>{item.countedQty}</strong></td>
                                                <td style={{color: variance > 0 ? 'green' : 'red', fontWeight: 'bold'}}>{variance > 0 ? `+${variance}` : variance}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                            {!isSessionAdjusted && (
                                <div className="page-actions">
                                    <button onClick={handleAdjustInventory} className="btn-primary">Xác Nhận Điều Chỉnh Tồn Kho</button>
                                </div>
                            )}
                        </>
                    ) : <p>Không có chênh lệch nào được ghi nhận.</p>
                    }
                </div>
            )}
            <div className="printable-stocktake-area">
                <h2>Phiếu Kiểm Kê Kho</h2>
                <div className="compact-info-grid" style={{gridTemplateColumns: '1fr 1fr 1fr', border: 'none', padding: 0, marginBottom: '20px'}}>
                    <div><label>Tên Phiên:</label><p><strong>{sessionData.name}</strong></p></div>
                    <div><label>Ngày Tạo:</label><p><strong>{formatDate(sessionData.createdAt)}</strong></p></div>
                    <div><label>Phạm Vi:</label><p><strong>{sessionData.scope === 'all' ? 'Toàn bộ kho' : sessionData.scope}</strong></p></div>
                </div>
                <table className="products-table">
                    <thead>
                        <tr>
                            <th>Mã hàng</th>
                            <th>Tên hàng</th>
                            <th>Số lô</th>
                            <th>HSD</th>
                            <th>ĐVT</th>
                            <th>Quy cách</th>
                            <th>Tồn hệ thống</th>
                            <th>Tồn thực tế</th>
                            <th>Nhiệt độ BQ</th>
                            <th>Team</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map((item) => (
                            <tr key={item.lotId}>
                                <td>{item.productId}</td>
                                <td style={{textAlign: 'left'}}>{item.productName}</td>
                                <td>{item.lotNumber}</td>
                                <td>{item.isNew ? item.expiryDate : formatDate(item.expiryDate)}</td>
                                <td>{item.unit}</td>
                                <td>{item.packaging}</td>
                                <td>{item.systemQty}</td>
                                <td style={{height: '40px'}}></td>
                                <td>{item.storageTemp}</td>
                                <td>{item.team}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="table-container stocktake-table-container">
                <table className="products-table">
                    <thead>
                        <tr>
                            <th>Mã hàng</th><th>Tên hàng</th><th>Số lô</th><th>HSD</th>
                            <th>ĐVT</th><th>Quy cách</th><th>Tồn hệ thống</th>
                            <th>Tồn thực tế</th><th>Nhiệt độ BQ</th><th>Team</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map((item) => (
                            <tr key={item.lotId} style={{backgroundColor: item.isNew ? '#fff9e6' : 'transparent'}}>
                                <td>{item.productId}</td><td>{item.productName}</td><td>{item.lotNumber}</td>
                                <td>{item.isNew ? item.expiryDate : formatDate(item.expiryDate)}</td>
                                <td>{item.unit}</td><td>{item.packaging}</td><td>{item.systemQty}</td>
                                <td><CountInput item={item} /></td><td>{item.storageTemp}</td><td>{item.team}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="stocktake-card-container">
                {filteredItems.map((item) => (
                    <div className="stocktake-card" key={item.lotId} style={{borderColor: item.isNew ? '#f59e0b' : 'var(--primary-color)'}}>
                        <div className="card-header">
                            <span className="card-product-id">{item.productId}</span>
                            <span className="card-product-name">{item.productName}</span>
                        </div>
                        <div className="card-body">
                            <div className="card-info-row">
                                <span><strong>Số lô:</strong> {item.lotNumber}</span>
                                <span><strong>HSD:</strong> {item.isNew ? item.expiryDate : formatDate(item.expiryDate)}</span>
                            </div>
                            <div className="card-count-area">
                                <div className="count-box system-count">
                                    <label>Hệ thống</label>
                                    <p>{item.systemQty}</p>
                                </div>
                                <div className="count-box actual-count">
                                    <label>Thực tế</label>
                                    <CountInput item={item} />
                                </div>
                            </div>
                            <div className="card-footer-info">
                                <span><strong>Team:</strong> {item.team || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StocktakeSessionPage;