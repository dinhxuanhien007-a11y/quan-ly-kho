// src/components/AddNewProductAndLotModal.jsx

import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { z } from 'zod';
import { TEMP_OPTIONS, MANUFACTURER_OPTIONS, UNIT_OPTIONS, ALL_SUBGROUPS } from '../constants';
import { formatExpiryDate } from '../utils/dateUtils';
import { addProduct } from '../services/productService';

const productAndLotSchema = z.object({
  productName: z.string().min(1, { message: "Tên hàng không được để trống." }),
  lotNumber: z.string().min(1, { message: "Số lô không được để trống." }),
  unit: z.string().min(1, { message: "Đơn vị tính không được để trống." }),
  team: z.string().min(1, { message: "Bạn phải chọn một team." }),
  subGroup: z.string().min(1, { message: "Bạn phải chọn một nhóm hàng." }),
});

const AddNewProductAndLotModal = ({ productId, onClose, onSave }) => {
    const [productName, setProductName] = useState('');
    const [lotNumber, setLotNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [unit, setUnit] = useState('');
    const [packaging, setPackaging] = useState('');
    const [storageTemp, setStorageTemp] = useState('');
    const [manufacturer, setManufacturer] = useState('');
    const [team, setTeam] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [subGroup, setSubGroup] = useState('');
    const formRef = useRef(null);

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        const formData = { productName, lotNumber, unit, team, subGroup };
        const validationResult = productAndLotSchema.safeParse(formData);

        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
            return;
        }
        
        setIsSaving(true);
        const newProductData = {
            productName, unit, packaging, storageTemp, manufacturer, team, subGroup,
        };

        try {
            await addProduct(productId, newProductData);
            onSave({
                ...newProductData,
                productId,
                lotNumber,
                expiryDate,
                quantity: '',
                notes: '',
            });
            toast.success("Tạo sản phẩm và lô hàng mới thành công!");
        } catch (error) {
            console.error("Lỗi khi tạo sản phẩm mới: ", error);
            toast.error('Đã xảy ra lỗi khi tạo sản phẩm.');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleExpiryDateBlur = (e) => {
        setExpiryDate(formatExpiryDate(e.target.value));
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content" style={{width: '600px'}}>
                <h2>Tạo Nhanh Sản Phẩm Mới</h2>
                <p>Mã hàng <strong>{productId}</strong> chưa tồn tại. Vui lòng cung cấp thông tin chi tiết.</p>
                
                <div className="modal-body">
                  <form ref={formRef} onSubmit={handleSubmit}>
                      <div className="form-group">
                          <label>Mã hàng (ID)</label>
                          <input type="text" value={productId} readOnly disabled />
                      </div>
                      <div className="form-row">
                          <div className="form-group">
                              <label>Tên hàng (*)</label>
                              <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} autoFocus/>
                          </div>
                          <div className="form-group">
                              <label>Team (*)</label>
                              <select value={team} onChange={(e) => setTeam(e.target.value)}>
                                  <option value="" disabled>-- Chọn team --</option>
                                  <option value="MED">MED</option>
                                  <option value="BIO">BIO</option>
                              </select>
                          </div>
                          <div className="form-group">
                      <label>Nhóm hàng (*)</label>
                      <select value={subGroup} onChange={(e) => setSubGroup(e.target.value)}>
                          <option value="" disabled>-- Chọn nhóm hàng --</option>
                          {ALL_SUBGROUPS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                  </div>
                      </div>
                      <div className="form-row">
                          <div className="form-group">
                            <label>Số lô (*)</label>
                            <input type="text" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
                        </div>
                         <div className="form-group">
                            <label>HSD (dd/mm/yyyy)</label>
                            <input 
                                type="text" 
                                value={expiryDate} 
                                onChange={(e) => setExpiryDate(e.target.value)} 
                                onBlur={handleExpiryDateBlur}
                                placeholder="dd/mm/yyyy" 
                            />
                        </div>
                     </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Đơn vị tính (*)</label>
                            <input
                                type="text" // <-- THÊM type="text"
                                list="unit-options"
                                value={unit}
                                onChange={(e) => setUnit(e.target.value)}
                                placeholder="Chọn hoặc nhập ĐVT..."
                            />
                            <datalist id="unit-options">
                                {UNIT_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                            </datalist>
                        </div>
                        <div className="form-group">
                            <label>Quy cách đóng gói</label>
                            <input type="text" value={packaging} onChange={(e) => setPackaging(e.target.value)} />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Nhiệt độ bảo quản</label>
                            <input
                                type="text" // <-- THÊM type="text"
                                list="temp-options"
                                value={storageTemp}
                                onChange={(e) => setStorageTemp(e.target.value)}
                                placeholder="Chọn hoặc nhập nhiệt độ..."
                            />
                            <datalist id="temp-options">
                                {TEMP_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                            </datalist>
                        </div>
                        <div className="form-group">
                            <label>Hãng sản xuất</label>
                            <input
                                type="text" // <-- THÊM type="text"
                                list="manufacturer-options"
                                value={manufacturer}
                                onChange={(e) => setManufacturer(e.target.value)}
                                placeholder="Chọn hoặc nhập hãng SX..."
                            />
                            <datalist id="manufacturer-options">
                                {MANUFACTURER_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                            </datalist>
                        </div>
                    </div>
                  </form>
                </div>

                <div className="modal-actions">
                    <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
                    <button 
                        type="button" 
                        onClick={() => formRef.current.requestSubmit()}
                        className="btn-primary" 
                        disabled={isSaving}
                    >
                        {isSaving ? 'Đang lưu...' : 'Lưu và Chọn'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddNewProductAndLotModal;
