// src/components/AddNewProductAndLotModal.jsx
import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { formatExpiryDate } from '../utils/dateUtils';

// Danh sách các lựa chọn có sẵn
const tempOptions = ["Nhiệt độ phòng", "2 → 8°C", "-25 → -15°C"];
const manufacturerOptions = ["Becton Dickinson", "Smiths Medical", "DentaLife", "Schulke", "Intra", "Rovers", "Corning", "Thermo Fisher", "Cytiva"];
const unitOptions = ["Cái", "Hộp", "Thùng", "Chai", "Ống", "Lọ", "Sợi", "Cây", "Can", "Tuýp", "Bộ", "Máng", "Gói", "Khay"];

const AddNewProductAndLotModal = ({ productId, onClose, onSave }) => {
    const [productName, setProductName] = useState('');
    const [lotNumber, setLotNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [unit, setUnit] = useState('');
    const [packaging, setPackaging] = useState('');
    const [storageTemp, setStorageTemp] = useState('');
    const [manufacturer, setManufacturer] = useState('');
    const [team, setTeam] = useState('MED');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!productName || !lotNumber || !unit) {
            alert('Vui lòng điền các thông tin bắt buộc: Tên hàng, Số lô, ĐVT.');
            return;
        }
        setIsSaving(true);
        const newProductData = {
            productName, unit, packaging, storageTemp, manufacturer, team,
        };
        try {
            const productRef = doc(db, 'products', productId);
            await setDoc(productRef, newProductData);
            onSave({
                ...newProductData, productId, lotNumber, expiryDate, quantity: '', notes: '',
            });
        } catch (error) {
            console.error("Lỗi khi tạo sản phẩm mới: ", error);
            alert('Đã xảy ra lỗi khi tạo sản phẩm.');
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
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Mã hàng (ID)</label>
                        <input type="text" value={productId} readOnly disabled />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Tên hàng (*)</label>
                            <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>Team</label>
                            <select value={team} onChange={(e) => setTeam(e.target.value)}>
                                <option value="MED">MED</option>
                                <option value="BIO">BIO</option>
                                <option value="Spare Part">Spare Part</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Số lô (*)</label>
                            <input type="text" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} required />
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
                                required
                                placeholder="Chọn hoặc nhập ĐVT..."
                            />
                            <datalist id="unit-options">
                                {unitOptions.map(opt => <option key={opt} value={opt} />)}
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
                                {tempOptions.map(opt => <option key={opt} value={opt} />)}
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
                                {manufacturerOptions.map(opt => <option key={opt} value={opt} />)}
                            </datalist>
                        </div>
                    </div>
                    
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
                        <button type="submit" className="btn-primary" disabled={isSaving}>
                            {isSaving ? 'Đang lưu...' : 'Lưu và Chọn'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddNewProductAndLotModal;