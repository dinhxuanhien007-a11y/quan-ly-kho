// src/components/AddProductModal.jsx
import React, { useState } from 'react';
import { db } from '../firebaseConfig'; // Import db
import { doc, setDoc } from 'firebase/firestore'; // Import các hàm của Firestore

const AddProductModal = ({ onClose, onProductAdded }) => {
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [unit, setUnit] = useState('');
  const [packaging, setPackaging] = useState('');
  const [storageTemp, setStorageTemp] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [team, setTeam] = useState('Med');
  const [isSaving, setIsSaving] = useState(false); // Thêm state loading

  // Chuyển hàm thành async để xử lý việc lưu dữ liệu
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true); // Bắt đầu quá trình lưu, vô hiệu hóa nút

    try {
      // Tạo một object chứa tất cả dữ liệu sản phẩm
      const newProduct = {
        productName,
        unit,
        packaging,
        storageTemp,
        manufacturer,
        team
      };
      
      // Tạo một tham chiếu đến document mới trong collection 'products'
      // với ID là productId người dùng đã nhập
      const productRef = doc(db, 'products', productId);

      // Dùng setDoc để ghi đè hoặc tạo mới document
      await setDoc(productRef, newProduct);
      
      alert('Thêm sản phẩm thành công!');
      onProductAdded(); // Gọi hàm để đóng modal và tải lại danh sách

    } catch (error) {
      console.error("Lỗi khi thêm sản phẩm: ", error);
      alert('Đã xảy ra lỗi khi thêm sản phẩm. Vui lòng thử lại.');
    } finally {
      setIsSaving(false); // Kết thúc quá trình lưu
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>Thêm sản phẩm mới</h2>
        <form onSubmit={handleSubmit}>
          {/* ... các trường nhập liệu giữ nguyên như cũ ... */}
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
          <div className="form-group">
            <label>Team</label>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="Med">Med</option>
              <option value="Bio">Bio</option>
              <option value="Spare Part">Spare Part</option>
            </select>
          </div>
          
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
            {/* Vô hiệu hóa nút Lưu khi đang trong quá trình xử lý */}
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