// src/components/EditExportSlipModal.jsx

import React, { useState } from 'react';
import { FiXCircle, FiCalendar } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { z } from 'zod';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import ProductAutocomplete from './ProductAutocomplete';
// Đảm bảo các hàm này được import
import { formatDate, getExpiryStatusPrefix } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';

const exportItemSchema = z.object({
  quantityToExport: z.preprocess(
      val => Number(String(val).trim()),
      z.number({ invalid_type_error: "Số lượng xuất phải là một con số." })
       .gt(0, { message: "Số lượng xuất phải lớn hơn 0." })
  ),
  productId: z.string(),
  lotNumber: z.string().nullable(),
});

const EditExportSlipModal = ({ slip, onClose, onSave }) => {
    const [slipData, setSlipData] = useState(() => ({
        ...slip,
        items: slip.items.map(item => ({ 
            ...item, 
            isNew: false, 
            availableLots: [],
            isOutOfStock: false 
        }))
    }));

    const dateToInputValue = (dateStr) => {
        if (!dateStr || dateStr.split('/').length !== 3) return '';
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month}-${day}`;
    };

    const handleInfoChange = (field, value) => {
        let finalValue = value;
        if (field === 'exportDate') {
            const [year, month, day] = value.split('-');
            finalValue = `${day}/${month}/${year}`;
        }
        setSlipData(prev => ({ ...prev, [field]: finalValue }));
    };

    const handleItemChange = (index, field, value) => {
        const updatedItems = [...slipData.items];
        if (field === 'quantityToExport') {
            const numericValue = Number(value);
            const originalExportedQty = slip.items[index]?.quantityToExport || slip.items[index]?.quantityExported || 0;
            const availableStock = (updatedItems[index].quantityRemaining || 0) + originalExportedQty;
            
            if (numericValue < 0) return;

            if (numericValue > availableStock) {
                toast.warn(`Số lượng xuất (${numericValue}) không thể vượt quá tồn kho hiện có (${availableStock}).`);
                updatedItems[index][field] = availableStock;
            } else {
                updatedItems[index][field] = value;
            }
        } else {
            updatedItems[index][field] = value;
        }
        setSlipData(prev => ({ ...prev, items: updatedItems }));
    };
    
    const handleProductSearch = async (index, productOrId) => {
        if (!productOrId) return;
        const productId = (typeof productOrId === 'object' ? productOrId.id : String(productOrId)).trim().toUpperCase();
        if (!productId) return;
        
        const updatedItems = [...slipData.items];
        const currentItem = { ...updatedItems[index] };

        try {
            const productRef = doc(db, 'products', productId);
            const productSnap = await getDoc(productRef);

            if (!productSnap.exists()) {
                toast.warn(`Không tìm thấy sản phẩm với mã: ${productId}`);
                return;
            }

            const productData = productSnap.data();
            currentItem.productId = productId;
            currentItem.productName = productData.productName;
            currentItem.unit = productData.unit;
            currentItem.packaging = productData.packaging;

            const lotsQuery = query(collection(db, 'inventory_lots'), where("productId", "==", productId), where("quantityRemaining", ">", 0));
            const lotsSnapshot = await getDocs(lotsQuery);

            if (lotsSnapshot.empty) {
                currentItem.isOutOfStock = true;
                currentItem.availableLots = [];
            } else {
                const foundLots = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                foundLots.sort((a, b) => (a.expiryDate?.toDate() || 0) - (b.expiryDate?.toDate() || 0));
                currentItem.isOutOfStock = false;
                currentItem.availableLots = foundLots;
            }
            
            updatedItems[index] = currentItem;
            setSlipData(prev => ({ ...prev, items: updatedItems }));

        } catch (error) {
            console.error("Lỗi khi tìm sản phẩm/lô hàng:", error);
            toast.error("Đã xảy ra lỗi khi tìm kiếm.");
        }
    };
    
    const handleLotSelection = (index, selectedLotId) => {
        const updatedItems = [...slipData.items];
        const currentItem = { ...updatedItems[index] };
        const selectedLot = currentItem.availableLots.find(lot => lot.id === selectedLotId);

        if (selectedLot) {
            currentItem.lotNumber = selectedLot.lotNumber;
            currentItem.lotId = selectedLot.id;
            // SỬA LỖI CRASH VÀ LOGIC: Gán đối tượng Timestamp
            currentItem.expiryDate = selectedLot.expiryDate; 
            currentItem.quantityRemaining = selectedLot.quantityRemaining;
        } else {
            currentItem.lotNumber = '';
            currentItem.lotId = '';
            // SỬA LỖI CRASH VÀ LOGIC: Reset về null
            currentItem.expiryDate = null; 
            currentItem.quantityRemaining = 0;
        }
        updatedItems[index] = currentItem;
        setSlipData(prev => ({ ...prev, items: updatedItems }));
    };

    const addNewRow = () => {
        setSlipData(prev => ({
            ...prev,
            items: [...prev.items, {
                id: Date.now(),
                productId: '',
                productName: '',
                lotNumber: '',
                unit: '',
                packaging: '',
                quantityToExport: '',
                notes: '',
                quantityRemaining: 0,
                // THÊM: Thêm trường expiryDate vào item mới
                expiryDate: null, 
                isNew: true,
                availableLots: [],
                isOutOfStock: false
            }]
        }));
    };

    const removeRow = (indexToRemove) => {
        const newItems = slipData.items.filter((_, index) => index !== indexToRemove);
        setSlipData({ ...slipData, items: newItems });
    };

    const handleSaveChanges = () => {
        const itemsToValidate = slipData.items.filter(item => item.productId && Number(item.quantityToExport) > 0);
        
        if (itemsToValidate.length === 0) {
            toast.warn("Phiếu xuất phải có ít nhất một mặt hàng với số lượng lớn hơn 0.");
            onSave({ ...slipData, items: [] });
            return;
        }

        for (let i = 0; i < itemsToValidate.length; i++) {
            const item = itemsToValidate[i];
            const validationResult = exportItemSchema.safeParse(item);
            if (!validationResult.success) {
                const originalIndex = slipData.items.findIndex(originalItem => originalItem.id === item.id);
                const errorMessage = `Lỗi ở dòng ${originalIndex + 1} (Mã: ${item.productId}): ${validationResult.error.issues[0].message}`;
                toast.warn(errorMessage);
                return;
            }
        }

        const finalSlipData = {
            ...slipData,
            items: itemsToValidate
        };
        onSave(finalSlipData);
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content" style={{ width: '90vw', maxWidth: '1200px' }}>
                <h2>Chỉnh sửa Phiếu Xuất Kho (ID: {slipData.id})</h2>
                
                <div className="form-section" style={{padding: '15px', marginTop: '10px'}}>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Ngày xuất (*)</label>
                            <div className="date-input-wrapper">
                                <input 
                                    type="date"
                                    value={dateToInputValue(slipData.exportDate)}
                                    onChange={(e) => handleInfoChange('exportDate', e.target.value)}
                                />
                                <FiCalendar className="date-input-icon" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Khách hàng</label>
                            <input type="text" value={slipData.customer} readOnly disabled />
                        </div>
                        <div className="form-group">
                            <label>Diễn giải</label>
                            <textarea 
                                value={slipData.description || ''} 
                                onChange={(e) => handleInfoChange('description', e.target.value)}
                                rows={1}
                            />
                        </div>
                    </div>
                </div>

                <div className="modal-body">
                    <h3>Chi tiết hàng hóa</h3>
                    <div className="item-details-grid" style={{ gridTemplateColumns: '1.5fr 2.5fr 2fr 1fr 0.8fr 1.5fr 1fr 1.5fr 0.5fr' }}>
                        <div className="grid-header">Mã hàng</div>
                        <div className="grid-header">Tên hàng</div>
                        <div className="grid-header">Số lô</div>
                        <div className="grid-header">HSD</div>
                        <div className="grid-header">ĐVT</div>
                        <div className="grid-header">Quy cách</div>
                        <div className="grid-header">SL Xuất (*)</div>
                        <div className="grid-header">Ghi chú</div>
                        <div className="grid-header">Thao tác</div>

                        {slipData.items.map((item, index) => (
                            <React.Fragment key={item.id || index}>
                                <div className="grid-cell">
                                    {item.isNew ? (
                                        <ProductAutocomplete
                                            value={item.productId}
                                            onChange={(value) => handleItemChange(index, 'productId', value.toUpperCase())}
                                            onSelect={(product) => handleProductSearch(index, product)}
                                            onBlur={() => handleProductSearch(index, item.productId)}
                                        />
                                    ) : (
                                        <input type="text" value={item.productId} readOnly title="Không thể sửa Mã hàng đã có." />
                                    )}
                                </div>
                                <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
                                <div className="grid-cell">
                                    {item.isNew ? (
                                        item.isOutOfStock ? (
                                            <span style={{color: 'red'}}>Hết hàng</span>
                                        ) : (
                                            <select
                                                value={item.lotId || ''}
                                                onChange={e => handleLotSelection(index, e.target.value)}
                                                disabled={!item.availableLots || item.availableLots.length === 0}
                                                style={{width: '100%'}}
                                            >
                                                <option value="">-- Chọn lô --</option>
                                                {item.availableLots.map(lot => (
                                                    <option key={lot.id} value={lot.id}>
                                                        {`${getExpiryStatusPrefix(lot.expiryDate)}Lô: ${lot.lotNumber || '(Trống)'} | Tồn: ${formatNumber(lot.quantityRemaining)}`}
                                                    </option>
                                                ))}
                                            </select>
                                        )
                                    ) : (
                                        <input type="text" value={item.lotNumber || '(Không có)'} readOnly title="Không thể sửa Lô hàng đã có." />
                                    )}
                                </div>
                                <div className="grid-cell">
                                    {/* THÊM TẠI ĐÂY: Ô INPUT HIỂN THỊ HSD */}
                                    <input 
                                        type="text" 
                                        // SỬA LỖI CRASH: Sử dụng hàm formatDate
                                        value={item.expiryDate ? formatDate(item.expiryDate) : '(N/A)'} 
                                        readOnly 
                                        title="Hạn sử dụng của lô hàng đã chọn"
                                        style={{ backgroundColor: '#f0f0f0' }}
                                    />
                                </div>
                                <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
                                <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
                                <div className="grid-cell">
                                    <input 
                                        type="number"
                                        step="any"
                                        value={item.quantityToExport} 
                                        onChange={e => handleItemChange(index, 'quantityToExport', e.target.value)} 
                                    />
                                </div>
                                <div className="grid-cell"><textarea value={item.notes || ''} onChange={e => handleItemChange(index, 'notes', e.target.value)} /></div>
                                <div className="grid-cell">
                                    <button type="button" className="btn-icon btn-delete" onClick={() => removeRow(index)}>
                                        <FiXCircle />
                                    </button>
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>
                
                <div className="modal-actions">
                    <button type="button" onClick={addNewRow} className="btn-secondary">Thêm dòng</button>
                    <button type="button" onClick={onClose} className="btn-secondary">Đóng</button>
                    <button type="button" onClick={handleSaveChanges} className="btn-primary">Lưu thay đổi</button>
                </div>
            </div>
        </div>
    );
};

export default EditExportSlipModal;