// src/components/AddProductModal.jsx
import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore'; // Import các hàm của Firestore

const AddProductModal = ({ onClose, onProductAdded }) => {
  // State cho tất cả các trường thông tin
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [unit, setUnit] = useState('');
  const [packaging, setPackaging] = useState('');
  const [storageTemp, setStorageTemp] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [team, setTeam] = useState('MED'); // Mặc định là team MED
  const [isSaving, setIsSaving] = useState(false);

  // Hàm handleSubmit đã được cập nhật
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId) {
      alert('Mã hàng không được để trống.');
      return;
    }
    setIsSaving(true);

    try {
      // Tạo object dữ liệu hoàn chỉnh
      const newProductData = {
        productName,
        unit,
        packaging,
        storageTemp,
        manufacturer,
        team,
      };

      // Tham chiếu đến document sản phẩm
      const productRef = doc(db, 'products', productId);
      // Ghi dữ liệu vào Firestore
      await setDoc(productRef, newProductData);

      alert('Thêm sản phẩm mới thành công!');
      onProductAdded(); // Gọi hàm để đóng modal và tải lại danh sách

    } catch (error) {
      console.error("Lỗi khi thêm sản phẩm: ", error);
      alert('Đã xảy ra lỗi khi thêm sản phẩm.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>Thêm sản phẩm mới</h2>
        <form onSubmit={handleSubmit}>
          {/* Mã hàng và Tên hàng */}
          <div className="form-row">
            <div className="form-group">
              <label>Mã hàng (ID)</label>
              <input type="text" value={productId} onChange={(e) => setProductId(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Tên hàng</label>
              <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} required />
            </div>
          </div>

          {/* ĐVT và Quy cách */}
          <div className="form-row">
            <div className="form-group">
              <label>Đơn vị tính</label>
              <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Quy cách đóng gói</label>
              <input type="text" value={packaging} onChange={(e) => setPackaging(e.target.value)} />
            </div>
          </div>
          
          {/* Nhiệt độ và Hãng SX */}
          <div className="form-row">
            <div className="form-group">
              <label>Nhiệt độ bảo quản</label>
              <input type="text" value={storageTemp} onChange={(e) => setStorageTemp(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Hãng sản xuất</label>
              <input type="text" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </div>
          </div>

          {/* Team */}
          <div className="form-group">
            <label>Team</label>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="MED">MED</option>
              <option value="BIO">BIO</option>
              <option value="Spare Part">Spare Part</option>
            </select>
          </div>
          
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProductModal;