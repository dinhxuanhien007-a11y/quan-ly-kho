// src/components/AddProductModal.jsx
import React, { useState } from 'react';
import { db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

// Danh sách các lựa chọn có sẵn
const tempOptions = ["Nhiệt độ phòng", "2 → 8°C", "-25 → -15°C"];
const manufacturerOptions = ["Becton Dickinson", "Smiths Medical", "DentaLife", "Schulke", "Intra", "Rovers", "Corning", "Thermo Fisher", "Cytiva"];
const unitOptions = ["Cái", "Hộp", "Thùng", "Chai", "Ống", "Lọ", "Sợi", "Cây", "Can", "Tuýp", "Bộ", "Máng", "Gói", "Khay"];

const AddProductModal = ({ onClose, onProductAdded }) => {
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [unit, setUnit] = useState('');
  const [packaging, setPackaging] = useState('');
  const [storageTemp, setStorageTemp] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [team, setTeam] = useState('MED');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId) {
      alert('Mã hàng không được để trống.');
      return;
    }
    setIsSaving(true);
    try {
      const newProductData = {
        productName,
        unit,
        packaging,
        storageTemp,
        manufacturer,
        team,
      };
      const productRef = doc(db, 'products', productId);
      await setDoc(productRef, newProductData);

      alert('Thêm sản phẩm mới thành công!');
      onProductAdded();

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
          <div className="form-row">
            <div className="form-group">
              <label>Mã hàng (ID)</label>
              <input type="text" value={productId} onChange={(e) => setProductId(e.target.value.toUpperCase())} required />
            </div>
            <div className="form-group">
              <label>Tên hàng</label>
              <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Đơn vị tính</label>
              <input
                list="unit-options-add"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
                placeholder="Chọn hoặc nhập ĐVT..."
              />
              <datalist id="unit-options-add">
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
                list="temp-options-add"
                value={storageTemp}
                onChange={(e) => setStorageTemp(e.target.value)}
                placeholder="Chọn hoặc nhập nhiệt độ..."
              />
              <datalist id="temp-options-add">
                  {tempOptions.map(opt => <option key={opt} value={opt} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label>Hãng sản xuất</label>
              <input
                list="manufacturer-options-add"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="Chọn hoặc nhập hãng SX..."
              />
              <datalist id="manufacturer-options-add">
                  {manufacturerOptions.map(opt => <option key={opt} value={opt} />)}
              </datalist>
            </div>
          </div>

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