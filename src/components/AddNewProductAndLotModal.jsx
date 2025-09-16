// src/components/AddNewProductAndLotModal.jsx

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { z } from 'zod';
import { TEMP_OPTIONS, MANUFACTURER_OPTIONS, UNIT_OPTIONS } from '../constants';
import { formatExpiryDate } from '../utils/dateUtils';
import { addProduct } from '../services/productService';

// Schema xác thực dữ liệu bằng Zod
const productAndLotSchema = z.object({
  productName: z.string().min(1, { message: "Tên hàng không được để trống." }),
  lotNumber: z.string().min(1, { message: "Số lô không được để trống." }),
  unit: z.string().min(1, { message: "Đơn vị tính không được để trống." }),
  team: z.string().min(1, { message: "Bạn phải chọn một team." }), // Bắt buộc chọn team
});


const AddNewProductAndLotModal = ({ productId, onClose, onSave }) => {
    const [productName, setProductName] = useState('');
    const [lotNumber, setLotNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [unit, setUnit] = useState('');
    const [packaging, setPackaging] = useState('');
    const [storageTemp, setStorageTemp] = useState('');
    const [manufacturer, setManufacturer] = useState('');
    const [team, setTeam] = useState(''); // Bỏ giá trị mặc định 'MED'
    const [isSaving, setIsSaving] = useState(false);
    
    // Tạo một ref để có thể submit form từ nút bấm bên ngoài
    const formRef = React.useRef(null);

    const handleSubmit = async (e) => {
        // Ngăn hành vi mặc định nếu sự kiện được truyền vào
        if (e) e.preventDefault();
        
        const formData = { productName, lotNumber, unit, team };
        const validationResult = productAndLotSchema.safeParse(formData);
        
        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
            return;
        }
        
        setIsSaving(true);
        
        const newProductData = {
            productName, unit, packaging, storageTemp, manufacturer, team,
        };
        
        try {
            // 1. Tạo sản phẩm mới thông qua service
            await addProduct(productId, newProductData);
            
            // 2. Trả về dữ liệu để trang NewImportPage tự điền vào dòng
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
                
                {/* Bọc form trong div.modal-body để có thể cuộn */}
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
                              {/* Thêm lựa chọn trống và bỏ giá trị mặc định */}
                              <select value={team} onChange={(e) => setTeam(e.target.value)}>
                                  <option value="" disabled>-- Chọn team --</option>
                                  <option value="MED">MED</option>
                                  <option value="BIO">BIO</option>
                                  <option value="Spare Part">Spare Part</option>
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

                {/* Khu vực nút bấm nằm bên ngoài vùng cuộn */}
                <div className="modal-actions">
                    <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
                    <button 
                        type="button" 
                        onClick={() => formRef.current.requestSubmit()} // Trigger submit của form
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