// src/components/CreateStocktakeModal.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { SUBGROUPS_BY_TEAM } from '../constants';
import { FiCheckSquare, FiSquare, FiFilter } from 'react-icons/fi';

const CreateStocktakeModal = ({ onClose, onSuccess, userRole }) => {
    const [sessionName, setSessionName] = useState(''); // <-- THÊM LẠI: State lưu tên phiên
    const [scope, setScope] = useState('all'); 
    const [selectedTeam, setSelectedTeam] = useState('MED');
    const [notes, setNotes] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // --- CÁC TÙY CHỌN MỚI ---
    const [excludeExpired, setExcludeExpired] = useState(false);
    const [selectedSubGroups, setSelectedSubGroups] = useState([]);

    // Tự động chọn Team nếu user không phải owner/admin
    useEffect(() => {
        if (userRole === 'med') setSelectedTeam('MED');
        if (userRole === 'bio') setSelectedTeam('BIO');
    }, [userRole]);

    const availableSubGroups = useMemo(() => {
        if (scope === 'all') {
            return [...SUBGROUPS_BY_TEAM.MED, ...SUBGROUPS_BY_TEAM.BIO];
        }
        return SUBGROUPS_BY_TEAM[selectedTeam] || [];
    }, [scope, selectedTeam]);

    useEffect(() => {
        setSelectedSubGroups(availableSubGroups);
    }, [availableSubGroups]);

    const toggleSubGroup = (sg) => {
        setSelectedSubGroups(prev => 
            prev.includes(sg) ? prev.filter(item => item !== sg) : [...prev, sg]
        );
    };

    const handleCreate = async () => {
        // --- THÊM KIỂM TRA TÊN PHIÊN ---
        if (!sessionName.trim()) {
            toast.warn("Vui lòng nhập Tên phiên kiểm kê.");
            return;
        }
        if (scope === 'team' && !selectedTeam) {
            toast.warn("Vui lòng chọn Team.");
            return;
        }
        if (selectedSubGroups.length === 0) {
            toast.warn("Vui lòng chọn ít nhất một nhóm hàng.");
            return;
        }

        setIsCreating(true);
        try {
            // 1. Tạo Query lấy dữ liệu
            let q;
            const lotsRef = collection(db, 'inventory_lots');
            
            if (scope === 'all') {
                q = query(lotsRef, where('quantityRemaining', '>', 0));
            } else {
                q = query(lotsRef, where('team', '==', selectedTeam), where('quantityRemaining', '>', 0));
            }

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                toast.info("Không có dữ liệu tồn kho phù hợp để tạo phiên kiểm kê.");
                setIsCreating(false);
                return;
            }

            // 2. XỬ LÝ GỘP LÔ VÀ LỌC DỮ LIỆU
            const lotAggregator = new Map();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            snapshot.forEach(doc => {
                const data = doc.data();
                
                // LỌC 1: Theo Nhóm hàng
                if (data.subGroup && !selectedSubGroups.includes(data.subGroup)) {
                    return; 
                }

                // LỌC 2: Theo Hạn sử dụng
                if (excludeExpired && data.expiryDate) {
                    const expDate = data.expiryDate.toDate();
                    if (expDate < today) {
                        return; // Bỏ qua lô đã hết hạn
                    }
                }

                const lotNumberKey = data.lotNumber ? data.lotNumber.trim() : 'NO_LOT';
                const uniqueKey = `${data.productId}_${lotNumberKey}`;

                if (lotAggregator.has(uniqueKey)) {
                    const existingItem = lotAggregator.get(uniqueKey);
                    existingItem.systemQty += data.quantityRemaining;
                } else {
                    lotAggregator.set(uniqueKey, {
                        productId: data.productId,
                        productName: data.productName,
                        lotNumber: data.lotNumber || '',
                        expiryDate: data.expiryDate,
                        unit: data.unit,
                        packaging: data.packaging,
                        storageTemp: data.storageTemp,
                        manufacturer: data.manufacturer,
                        subGroup: data.subGroup,
                        team: data.team,
                        systemQty: data.quantityRemaining,
                        countedQty: null,
                        notes: '',
                        isNew: false
                    });
                }
            });

            const items = Array.from(lotAggregator.values());
            items.sort((a, b) => a.productName.localeCompare(b.productName));

            if (items.length === 0) {
                toast.warn("Không tìm thấy lô hàng nào thỏa mãn điều kiện lọc.");
                setIsCreating(false);
                return;
            }

            // 3. Lưu phiên kiểm kê vào Firestore
            const sessionRef = await addDoc(collection(db, 'stocktakes'), {
                name: sessionName, // <-- SỬA LỖI: Đã lưu tên phiên vào DB
                createdAt: serverTimestamp(),
                createdBy: 'Admin',
                status: 'in_progress', // <-- SỬA LỖI: Đổi 'open' thành 'in_progress' để hiện màu vàng
                scope: scope,
                team: scope === 'team' ? selectedTeam : 'ALL',
                notes: notes,
                itemCount: items.length
            });

            const itemsCollectionRef = collection(db, 'stocktakes', sessionRef.id, 'items');
            const batchPromises = items.map(item => addDoc(itemsCollectionRef, item));
            await Promise.all(batchPromises);

            toast.success(`Đã tạo phiên kiểm kê thành công! (${items.length} mã/lô)`);
            
            if (onSuccess && typeof onSuccess === 'function') {
                onSuccess(); 
            }
            onClose();

        } catch (error) {
            console.error("Lỗi tạo phiên kiểm kê:", error);
            toast.error("Đã xảy ra lỗi khi tạo phiên.");
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content" style={{ maxWidth: '600px' }}>
                <h2>Tạo Phiếu Kiểm Kê Mới</h2>
                
                <div className="form-section">
                    {/* --- THÊM LẠI: Ô NHẬP TÊN PHIÊN --- */}
                    <div className="form-group">
                        <label>Tên Phiên Kiểm Kê (*):</label>
                        <input 
                            type="text" 
                            value={sessionName} 
                            onChange={(e) => setSessionName(e.target.value)} 
                            placeholder="Ví dụ: Kiểm kê MED tháng 12/2025"
                            autoFocus
                        />
                    </div>

                    {/* 1. Chọn Phạm vi */}
                    <div className="form-group">
                        <label>Phạm vi kiểm kê:</label>
                        <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
                            <label style={{ cursor: 'pointer' }}>
                                <input 
                                    type="radio" 
                                    name="scope" 
                                    checked={scope === 'all'} 
                                    onChange={() => setScope('all')}
                                    disabled={userRole !== 'owner' && userRole !== 'admin'}
                                /> Toàn Kho
                            </label>
                            <label style={{ cursor: 'pointer' }}>
                                <input 
                                    type="radio" 
                                    name="scope" 
                                    checked={scope === 'team'} 
                                    onChange={() => setScope('team')} 
                                /> Theo Team
                            </label>
                        </div>
                    </div>

                    {/* 2. Chọn Team */}
                    {scope === 'team' && (
                        <div className="form-group">
                            <label>Chọn Team:</label>
                            <select 
                                value={selectedTeam} 
                                onChange={(e) => setSelectedTeam(e.target.value)}
                                disabled={userRole === 'med' || userRole === 'bio'}
                            >
                                <option value="MED">MED</option>
                                <option value="BIO">BIO</option>
                            </select>
                        </div>
                    )}

                    {/* 3. Tùy chọn lọc */}
                    <div className="form-group" style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
                        <label style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <FiFilter /> Tùy chọn lọc nâng cao:
                        </label>
                        
                        <div style={{ marginTop: '10px' }}>
                            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input 
                                    type="checkbox" 
                                    checked={excludeExpired} 
                                    onChange={(e) => setExcludeExpired(e.target.checked)} 
                                />
                                <span>Loại bỏ hàng đã hết hạn sử dụng (Expired)</span>
                            </label>
                        </div>

                        <div style={{ marginTop: '15px' }}>
                            <label style={{ marginBottom: '5px', display: 'block' }}>Chọn Nhóm hàng cần kiểm:</label>
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '1fr 1fr', 
                                gap: '8px', 
                                maxHeight: '150px', 
                                overflowY: 'auto',
                                border: '1px solid #ddd',
                                padding: '10px',
                                borderRadius: '4px',
                                backgroundColor: 'white'
                            }}>
                                {availableSubGroups.map(sg => (
                                    <div key={sg} onClick={() => toggleSubGroup(sg)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
                                        {selectedSubGroups.includes(sg) 
                                            ? <FiCheckSquare color="#007bff" /> 
                                            : <FiSquare color="#ccc" />
                                        }
                                        <span>{sg}</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: '5px', fontSize: '12px', color: '#666', textAlign: 'right' }}>
                                <span 
                                    style={{ cursor: 'pointer', color: '#007bff', marginRight: '10px' }}
                                    onClick={() => setSelectedSubGroups(availableSubGroups)}
                                >
                                    Chọn tất cả
                                </span>
                                <span 
                                    style={{ cursor: 'pointer', color: '#dc3545' }}
                                    onClick={() => setSelectedSubGroups([])}
                                >
                                    Bỏ chọn
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Ghi chú phiên:</label>
                        <textarea 
                            rows="2" 
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ghi chú thêm..."
                        ></textarea>
                    </div>
                </div>

                <div className="modal-actions">
                    <button onClick={onClose} className="btn-secondary" disabled={isCreating}>Hủy bỏ</button>
                    <button onClick={handleCreate} className="btn-primary" disabled={isCreating}>
                        {isCreating ? 'Đang tạo...' : 'Bắt đầu Kiểm Kê'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateStocktakeModal;