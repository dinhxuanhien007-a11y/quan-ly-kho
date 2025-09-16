// src/components/AddUnlistedItemModal.jsx
import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { formatExpiryDate } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import { z } from 'zod'; // <-- IMPORT ZOD

// <-- ĐỊNH NGHĨA SCHEMA -->
const unlistedItemSchema = z.object({
    productId: z.string().trim().min(1, "Mã hàng là bắt buộc."),
    productName: z.string(), // Sẽ kiểm tra điều kiện bên dưới
    countedQty: z.preprocess(
        val => Number(val),
        z.number({ required_error: "Số lượng đếm là bắt buộc.", invalid_type_error: "Số lượng đếm phải là một con số." })
         .gt(0, "Số lượng đếm phải lớn hơn 0.")
    )
}).refine(data => { // Thêm điều kiện refine
    // Nếu isNewProduct là true (được truyền vào context), thì productName phải có giá trị
    if (this.isNewProduct) {
        return data.productName.trim().length > 0;
    }
    return true; // Nếu không phải sản phẩm mới thì không cần check
}, {
    message: "Tên hàng là bắt buộc đối với sản phẩm mới.",
    path: ["productName"], // Báo lỗi cho trường productName
});

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
            toast.warn("Mã hàng này không tồn tại. Vui lòng nhập Tên hàng mới.");
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // <-- SỬ DỤNG SCHEMA ĐỂ XÁC THỰC -->
        const validationResult = unlistedItemSchema.safeParse({
            productId: productId,
            productName: productName,
            countedQty: countedQty,
        }, {
            // Truyền trạng thái isNewProduct vào context của Zod
            context: { isNewProduct }
        });

        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
            return;
        }
        
        onAddItem({
            productId: validationResult.data.productId.trim(),
            productName: productName,
            lotNumber: lotNumber.trim() || 'N/A',
            expiryDate: expiryDate,
            unit: unit,
            packaging: packaging,
            systemQty: 0,
            countedQty: validationResult.data.countedQty,
            lotId: `new_${validationResult.data.productId.trim()}_${lotNumber.trim() || Date.now()}`,
            isNew: true,
            storageTemp: storageTemp,
            manufacturer: manufacturer,
            team: team,
        });
    };
    
    const handleExpiryDateBlur = (e) => {
        setExpiryDate(formatExpiryDate(e.target.value));
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Thêm Hàng Ngoài Danh Sách</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Mã hàng (*)</label>
                        <input type="text" value={productId} onChange={e => setProductId(e.target.value)} onBlur={handleProductSearch} required />
                    </div>
                    <div className="form-group">
                        <label>Tên hàng {isNewProduct && '(*)'}</label>
                        <input type="text" value={productName} onChange={e => setProductName(e.target.value)} readOnly={!isNewProduct} required={isNewProduct} />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Số lô</label>
                            <input type="text" value={lotNumber} onChange={e => setLotNumber(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>HSD (dd/mm/yyyy)</label>
                            <input 
                                type="text" 
                                value={expiryDate} 
                                onChange={e => setExpiryDate(e.target.value)} 
                                onBlur={handleExpiryDateBlur}
                                placeholder="dd/mm/yyyy" 
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Số lượng đếm thực tế (*)</label>
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