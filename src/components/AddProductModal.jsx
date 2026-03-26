// src/components/AddProductModal.jsx

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { z } from 'zod';
import { TEMP_OPTIONS, MANUFACTURER_OPTIONS, UNIT_OPTIONS } from '../constants';

// Import hàm service thay vì các hàm của firestore
import { addProduct } from '../services/productService';

const productSchema = z.object({
  productId: z.string().min(1, { message: 'Mã hàng (ID) không được để trống.' }),
  productName: z.string().min(1, { message: 'Tên hàng không được để trống.' }),
  unit: z.string().min(1, { message: 'Đơn vị tính không được để trống.' }),
  packaging: z.string().optional(),
  storageTemp: z.string().optional(),
  manufacturer: z.string().optional(),
  team: z.string(),
});

const AddProductModal = ({ onClose, onProductAdded }) => {
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [unit, setUnit] = useState('');
  const [packaging, setPackaging] = useState('');
  const [storageTemp, setStorageTemp] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [team, setTeam] = useState('MED');
  const [misaCode, setMisaCode] = useState('');
  const [misaConversionFactor, setMisaConversionFactor] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = {
      productId: productId.trim().toUpperCase(),
      productName: productName.trim(),
      unit: unit.trim(),
      packaging: packaging.trim(),
      storageTemp: storageTemp.trim(),
      manufacturer: manufacturer.trim(),
      team,
      misaCode: misaCode.trim().toUpperCase() || null,
      misaConversionFactor: misaConversionFactor !== '' ? Number(misaConversionFactor) : null,
    };
    
    const validationResult = productSchema.safeParse(formData);

    if (!validationResult.success) {
      toast.warn(validationResult.error.issues[0].message);
      setIsSaving(false);
      return;
    }

    try {
      const { productId, ...newProductData } = validationResult.data;
      // Gọi hàm service để thêm sản phẩm
      await addProduct(productId, newProductData);

      toast.success('Thêm sản phẩm mới thành công!');
      onProductAdded();
    } catch (error) {
      console.error("Lỗi khi thêm sản phẩm: ", error);
      toast.error('Đã xảy ra lỗi khi thêm sản phẩm.');
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
              <label>Mã hàng (ID) (*)</label>
              <input type="text" value={productId} onChange={(e) => setProductId(e.target.value.toUpperCase())} autoFocus />
            </div>
            <div className="form-group">
              <label>Tên hàng (*)</label>
              <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Đơn vị tính (*)</label>
              <input
                list="unit-options-add"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Chọn hoặc nhập ĐVT..."
              />
              <datalist id="unit-options-add">
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
                list="temp-options-add"
                value={storageTemp}
                onChange={(e) => setStorageTemp(e.target.value)}
                placeholder="Chọn hoặc nhập nhiệt độ..."
              />
              <datalist id="temp-options-add">
                  {TEMP_OPTIONS.map(opt => <option key={opt} value={opt} />)}
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
                  {MANUFACTURER_OPTIONS.map(opt => <option key={opt} value={opt} />)}
              </datalist>
            </div>
          </div>
          <div className="form-group">
            <label>Team</label>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="MED">MED</option>
              <option value="BIO">BIO</option>
            </select>
          </div>

          <hr style={{ margin: '16px 0', borderColor: '#e9ecef' }} />
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: '600', color: '#6c757d' }}>
            Cấu hình đối chiếu Misa (tuỳ chọn)
          </p>
          <div className="form-row">
            <div className="form-group">
              <label>Mã hàng trên Misa (nếu khác WebKho)</label>
              <input
                type="text"
                value={misaCode}
                onChange={(e) => setMisaCode(e.target.value.toUpperCase())}
                placeholder="Để trống nếu mã giống nhau"
              />
            </div>
            <div className="form-group">
              <label>Hệ số quy đổi sang Misa</label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={misaConversionFactor}
                onChange={(e) => setMisaConversionFactor(e.target.value)}
                placeholder="Để trống nếu cùng đơn vị (= 1)"
              />
              <small style={{ color: '#6c757d', fontSize: '11px' }}>
                VD: WebKho tính Cái, Misa tính Hộp/10 cái → nhập 0.1
              </small>
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={missingFromMisa}
                onChange={(e) => setMissingFromMisa(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Mã hàng này không có trên Misa (bỏ qua khi đối chiếu)
            </label>
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
