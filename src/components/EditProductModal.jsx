// src/components/EditProductModal.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';

// Component nhận vào productToEdit chứa thông tin sản phẩm cần sửa
const EditProductModal = ({ onClose, onProductUpdated, productToEdit }) => {
  // Dùng useState để quản lý state của form, với giá trị khởi tạo là thông tin sản phẩm cũ
  const [productData, setProductData] = useState({ ...productToEdit });
  const [isSaving, setIsSaving] = useState(false);

  // Hàm để cập nhật state khi người dùng thay đổi input
  const handleChange = (e) => {
    const { name, value } = e.target;
    setProductData(prevData => ({ ...prevData, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // Tham chiếu đến document cần cập nhật
      const productDocRef = doc(db, 'products', productToEdit.id);
      // Dùng hàm updateDoc để cập nhật
      await updateDoc(productDocRef, productData);
      
      alert('Cập nhật sản phẩm thành công!');
      onProductUpdated(); // Báo cho trang cha để đóng modal và tải lại danh sách
    } catch (error) {
      console.error("Lỗi khi cập nhật sản phẩm: ", error);
      alert('Đã xảy ra lỗi khi cập nhật sản phẩm.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>Sửa thông tin sản phẩm</h2>
        {/* Mã hàng sẽ không được sửa */}
        <p><strong>Mã hàng:</strong> {productToEdit.id}</p>
        <form onSubmit={handleSubmit}>
          {/* Tên hàng */}
          <div className="form-group">
            <label>Tên hàng</label>
            <input type="text" name="productName" value={productData.productName || ''} onChange={handleChange} required />
          </div>
          {/* ĐVT và Quy cách */}
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
          {/* Nhiệt độ và Hãng SX */}
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
          {/* Team */}
          <div className="form-group">
            <label>Team</label>
            <select name="team" value={productData.team} onChange={handleChange}>
              <option value="Med">Med</option>
              <option value="Bio">Bio</option>
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