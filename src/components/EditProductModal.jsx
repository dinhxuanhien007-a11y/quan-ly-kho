// src/components/EditProductModal.jsx
import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';

const EditProductModal = ({ onClose, onProductUpdated, productToEdit }) => {
  const [productData, setProductData] = useState({ ...productToEdit });
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProductData(prevData => ({ ...prevData, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const productDocRef = doc(db, 'products', productToEdit.id);
      await updateDoc(productDocRef, productData);
      toast.success('Cập nhật sản phẩm thành công!');
      onProductUpdated();
    } catch (error) {
      console.error("Lỗi khi cập nhật sản phẩm: ", error);
      toast.error('Đã xảy ra lỗi khi cập nhật sản phẩm.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>Sửa thông tin sản phẩm</h2>
        <p><strong>Mã hàng:</strong> {productToEdit.id}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tên hàng</label>
            <input type="text" name="productName" value={productData.productName || ''} onChange={handleChange} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Đơn vị tính</label>
              <input type="text" name="unit" value={productData.unit || ''} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Quy cách đóng gói</label>
              <input type="text" name="packaging" value={productData.packaging || ''} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Nhiệt độ bảo quản</label>
              <input type="text" name="storageTemp" value={productData.storageTemp || ''} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Hãng sản xuất</label>
              <input type="text" name="manufacturer" value={productData.manufacturer || ''} onChange={handleChange} />
            </div>
          </div>
          <div className="form-group">
            <label>Team</label>
            <select name="team" value={productData.team} onChange={handleChange}>
              <option value="MED">MED</option>
              <option value="BIO">BIO</option>
              <option value="Spare Part">Spare Part</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProductModal;