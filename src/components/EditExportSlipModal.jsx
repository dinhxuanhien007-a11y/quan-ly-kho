import React, { useState } from 'react';
import { FiXCircle } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { z } from 'zod';

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
    const [slipData, setSlipData] = useState({ ...slip });

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
            const originalExportedQty = slip.items[index].quantityToExport || slip.items[index].quantityExported;
            const availableStock = updatedItems[index].quantityRemaining + originalExportedQty;
            
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
        
        setSlipData({ ...slipData, items: updatedItems });
    };

    // === ĐÃ DI CHUYỂN RA NGOÀI ĐÚNG VỊ TRÍ ===
    const removeRow = (indexToRemove) => {
        const newItems = slipData.items.filter((_, index) => index !== indexToRemove);
        setSlipData({ ...slipData, items: newItems });
    };

    // === ĐÃ DI CHUYỂN RA NGOÀI ĐÚNG VỊ TRÍ ===
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
                            <input 
                                type="date"
                                value={dateToInputValue(slipData.exportDate)}
                                onChange={(e) => handleInfoChange('exportDate', e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                            />
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

                <h3>Chi tiết hàng hóa</h3>
                <div className="item-details-grid" style={{ gridTemplateColumns: '1.5fr 2.5fr 1.5fr 0.8fr 1.5fr 1fr 1.5fr 0.5fr' }}>
                    <div className="grid-header">Mã hàng</div>
                    <div className="grid-header">Tên hàng</div>
                    <div className="grid-header">Số lô</div>
                    <div className="grid-header">ĐVT</div>
                    <div className="grid-header">Quy cách</div>
                    <div className="grid-header">SL Xuất (*)</div>
                    <div className="grid-header">Ghi chú</div>
                    <div className="grid-header">Thao tác</div>

                    {slipData.items.map((item, index) => (
                        <React.Fragment key={item.id || index}>
                            <div className="grid-cell"><input type="text" value={item.productId} readOnly title="Không thể sửa Mã hàng ở đây" /></div>
                            <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
                            <div className="grid-cell"><input type="text" value={item.lotNumber || '(Không có)'} readOnly title="Không thể sửa Lô hàng ở đây" /></div>
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
                            <div className="grid-cell"><textarea value={item.notes} onChange={e => handleItemChange(index, 'notes', e.target.value)} /></div>
                            <div className="grid-cell">
                                <button type="button" className="btn-icon btn-delete" onClick={() => removeRow(index)}>
                                    <FiXCircle />
                                </button>
                            </div>
                        </React.Fragment>
                    ))}
                </div>

                <div className="modal-actions">
                    <button type="button" onClick={onClose} className="btn-secondary">Đóng</button>
                    <button type="button" onClick={handleSaveChanges} className="btn-primary">Lưu thay đổi</button>
                </div>
            </div>
        </div>
    );
};

export default EditExportSlipModal;