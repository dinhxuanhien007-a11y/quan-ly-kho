// src/components/AddUnlistedItemModal.jsx

import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

const AddUnlistedItemModal = ({ onClose, onAddItem }) => {
    const [productId, setProductId] = useState('');
    const [productName, setProductName] = useState('');
    const [isNewProduct, setIsNewProduct] = useState(false);
    const [lotNumber, setLotNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [countedQty, setCountedQty] = useState('');
    const [unit, setUnit] = useState('');
    const [packaging, setPackaging] = useState('');
    const [storageTemp, setStorageTemp] = useState('');
    const [manufacturer, setManufacturer] = useState('');
    const [team, setTeam] = useState('');


    const handleProductSearch = async () => {
        if (!productId) return;
        const productRef = doc(db, 'products', productId.trim());
        const productSnap = await getDoc(productRef);

        if (productSnap.exists()) {
            const data = productSnap.data();
            setProductName(data.productName);
            setUnit(data.unit);
            setPackaging(data.packaging);
            setStorageTemp(data.storageTemp || '');
            setManufacturer(data.manufacturer || '');
            setTeam(data.team || '');
            setIsNewProduct(false);
        } else {
            setProductName('');
            setUnit('');
            setPackaging('');
            setStorageTemp('');
            setManufacturer('');
            setTeam('');
            setIsNewProduct(true);
            alert("Mã hàng này không tồn tại. Vui lòng nhập Tên hàng mới.");
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!productId || !countedQty || (!productName && isNewProduct)) {
            alert("Vui lòng điền đầy đủ Mã hàng và Số lượng đếm.");
            return;
        }
        
        onAddItem({
            productId: productId.trim(),
            productName: productName,
            lotNumber: lotNumber.trim() || 'N/A',
            expiryDate: expiryDate,
            unit: unit,
            packaging: packaging,
            systemQty: 0,
            countedQty: Number(countedQty),
            lotId: `new_${productId.trim()}_${lotNumber.trim() || Date.now()}`,
            isNew: true,
            storageTemp: storageTemp,
            manufacturer: manufacturer,
            team: team,
        });
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Thêm Hàng Ngoài Danh Sách</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Mã hàng (Bắt buộc)</label>
                        <input type="text" value={productId} onChange={e => setProductId(e.target.value)} onBlur={handleProductSearch} required />
                    </div>
                    <div className="form-group">
                        <label>Tên hàng</label>
                        <input type="text" value={productName} onChange={e => setProductName(e.target.value)} readOnly={!isNewProduct} required={isNewProduct} />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Số lô</label>
                            <input type="text" value={lotNumber} onChange={e => setLotNumber(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>HSD (dd/mm/yyyy)</label>
                            <input type="text" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} placeholder="dd/mm/yyyy" />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Số lượng đếm thực tế (Bắt buộc)</label>
                        <input type="number" value={countedQty} onChange={e => setCountedQty(e.target.value)} required />
                    </div>
                    
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
                        <button type="submit" className="btn-primary">Thêm vào Phiếu</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddUnlistedItemModal;