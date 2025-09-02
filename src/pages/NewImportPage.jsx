// src/pages/NewImportPage.jsx
import React, { useState, useRef } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

// Hàm helper để chuyển chuỗi dd/mm/yyyy thành object Date
const parseDateString = (dateString) => {
  try {
    const [day, month, year] = dateString.split('/');
    // new Date(year, monthIndex, day) - month is 0-indexed
    return new Date(year, month - 1, day);
  } catch (error) {
    console.error("Lỗi định dạng ngày tháng:", dateString, error);
    return null; // Trả về null nếu định dạng sai
  }
};

const NewImportPage = () => {
  // --- STATE MANAGEMENT ---
  const today = new Date();
  const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  const [importDate, setImportDate] = useState(formattedDate);
  const [supplier, setSupplier] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState([
    { id: 1, productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '' }
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const inputRefs = useRef([]);

  // --- FUNCTIONS ---

  // Chỉ cập nhật state, không gọi Firestore, tối ưu hiệu suất
  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    let currentValue = value;

    if (field === 'expiryDate') {
      let formattedValue = currentValue.replace(/\D/g, '');
      if (formattedValue.length > 2) {
        formattedValue = `${formattedValue.slice(0, 2)}/${formattedValue.slice(2)}`;
      }
      if (formattedValue.length > 5) {
        formattedValue = `${formattedValue.slice(0, 5)}/${formattedValue.slice(5, 9)}`;
      }
      currentValue = formattedValue;
    }
    
    newItems[index][field] = currentValue;
    setItems(newItems);
  };

  // Chỉ tìm kiếm sản phẩm khi người dùng rời khỏi ô Mã hàng
  const handleProductSearch = async (index, productId) => {
    if (!productId) return;

    const newItems = [...items];
    try {
      const productRef = doc(db, 'products', productId);
      const productSnap = await getDoc(productRef);
      if (productSnap.exists()) {
        const productData = productSnap.data();
        newItems[index].productName = productData.productName || '';
        newItems[index].unit = productData.unit || '';
        newItems[index].packaging = productData.packaging || '';
        newItems[index].storageTemp = productData.storageTemp || '';
        newItems[index].team = productData.team || '';
      } else {
        newItems[index].productName = 'Không tìm thấy mã hàng!';
        newItems[index].unit = '';
        newItems[index].packaging = '';
        newItems[index].storageTemp = '';
        newItems[index].team = '';
      }
    } catch (error) {
      console.error("Lỗi khi tìm kiếm sản phẩm:", error);
      newItems[index].productName = 'Lỗi khi tìm kiếm!';
    } finally {
        setItems(newItems);
    }
  };

  const handleKeyDown = (e, rowIndex, inputIndex) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const nextInputIndex = (rowIndex * 3) + inputIndex + 1;
      const nextInput = inputRefs.current[nextInputIndex];
      if (nextInput) {
        nextInput.focus();
      }
    }
  };

  const addNewRow = () => {
    setItems([
      ...items,
      { id: Date.now(), productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '' }
    ]);
  };

  // Hàm lưu phiếu với trạng thái "pending"
  const handleSaveSlip = async () => {
    if (!supplier) {
      alert('Vui lòng nhập thông tin Nhà cung cấp.');
      return;
    }
    const validItems = items.filter(item => item.productId && item.quantity > 0);
    if (validItems.length === 0) {
      alert('Vui lòng thêm ít nhất một mặt hàng hợp lệ vào phiếu.');
      return;
    }
    setIsSaving(true);
    try {
      const slipData = {
        importDate,
        supplier,
        description,
        items: validItems,
        status: 'pending',
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'import_tickets'), slipData);
      alert(`Lưu tạm phiếu nhập thành công! ID phiếu: ${docRef.id}`);
      setSupplier('');
      setDescription('');
      setItems([{ id: 1, productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '' }]);
    } catch (error) {
      console.error("Lỗi khi lưu phiếu nhập: ", error);
      alert('Đã xảy ra lỗi khi lưu phiếu.');
    } finally {
      setIsSaving(false);
    }
  };

  // Hàm mới để nhập kho trực tiếp
  const handleDirectImport = async () => {
    if (!supplier) {
      alert('Vui lòng nhập thông tin Nhà cung cấp.');
      return;
    }
    const validItems = items.filter(item => item.productId && item.quantity > 0);
    if (validItems.length === 0) {
      alert('Vui lòng thêm ít nhất một mặt hàng hợp lệ.');
      return;
    }
    if (!window.confirm('Bạn có chắc muốn nhập kho trực tiếp? Thao tác này sẽ cập nhật tồn kho ngay lập tức.')) {
      return;
    }
    setIsSaving(true);
    try {
      for (const item of validItems) {
        const expiryDateObject = parseDateString(item.expiryDate);
        if (!expiryDateObject) {
          alert(`HSD của mặt hàng ${item.productName} (${item.lotNumber}) có định dạng sai.`);
          setIsSaving(false);
          return;
        }
        const expiryTimestamp = Timestamp.fromDate(expiryDateObject);
        const newLotData = {
          importDate: Timestamp.now(),
          productId: item.productId,
          productName: item.productName,
          lotNumber: item.lotNumber,
          expiryDate: expiryTimestamp,
          unit: item.unit,
          packaging: item.packaging,
          storageTemp: item.storageTemp,
          team: item.team,
          quantityImported: Number(item.quantity),
          quantityRemaining: Number(item.quantity),
          notes: item.notes,
        };
        await addDoc(collection(db, "inventory_lots"), newLotData);
      }

      const slipData = {
        importDate,
        supplier,
        description,
        items: validItems,
        status: 'completed',
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'import_tickets'), slipData);

      alert('Nhập kho trực tiếp thành công!');
      setSupplier('');
      setDescription('');
      setItems([{ id: 1, productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '' }]);

    } catch (error) {
      console.error("Lỗi khi nhập kho trực tiếp: ", error);
      alert('Đã xảy ra lỗi khi nhập kho trực tiếp.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- RENDER ---
  return (
    <div>
      <h1>Tạo Phiếu Nhập Kho</h1>
      <div className="form-section">
        <div className="form-row">
          <div className="form-group">
            <label>Ngày nhập</label>
            <input type="text" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Nhà cung cấp</label>
            <input type="text" placeholder="Nhập mã hoặc tên NCC" value={supplier} onChange={e => setSupplier(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Diễn giải</label>
          <textarea rows="2" placeholder="Ghi chú cho phiếu nhập..." value={description} onChange={e => setDescription(e.target.value)}></textarea>
        </div>
      </div>

      <h2>Chi tiết hàng hóa</h2>
      <div className="item-details-grid">
        <div className="grid-header">Mã hàng</div>
        <div className="grid-header">Tên hàng</div>
        <div className="grid-header">Số lô</div>
        <div className="grid-header">HSD</div>
        <div className="grid-header">ĐVT</div>
        <div className="grid-header">Quy cách</div>
        <div className="grid-header">Số lượng</div>
        <div className="grid-header">Ghi chú</div>
        <div className="grid-header">Nhiệt độ BQ</div>
        <div className="grid-header">Team</div>

        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            <div className="grid-cell">
              <input 
                ref={el => inputRefs.current[index * 3] = el} 
                onKeyDown={(e) => handleKeyDown(e, index, 0)}
                type="text" 
                value={item.productId} 
                onChange={e => handleItemChange(index, 'productId', e.target.value)}
                onBlur={e => handleProductSearch(index, e.target.value)}
              />
            </div>
            <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
            <div className="grid-cell">
              <input 
                ref={el => inputRefs.current[index * 3 + 1] = el}
                onKeyDown={(e) => handleKeyDown(e, index, 1)}
                type="text" 
                value={item.lotNumber} 
                onChange={e => handleItemChange(index, 'lotNumber', e.target.value)} 
              />
            </div>
            <div className="grid-cell"><input type="text" placeholder="dd/mm/yyyy" value={item.expiryDate} onChange={e => handleItemChange(index, 'expiryDate', e.target.value)} /></div>
            <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
            <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
            <div className="grid-cell">
              <input 
                ref={el => inputRefs.current[index * 3 + 2] = el}
                type="number" 
                value={item.quantity} 
                onChange={e => handleItemChange(index, 'quantity', e.target.value)} 
              />
            </div>
            <div className="grid-cell"><textarea value={item.notes} onChange={e => handleItemChange(index, 'notes', e.target.value)} /></div>
            <div className="grid-cell"><textarea value={item.storageTemp} readOnly /></div>
            <div className="grid-cell"><input type="text" value={item.team} readOnly /></div>
          </React.Fragment>
        ))}
      </div>
      
      <button onClick={addNewRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
      <div className="page-actions">
        <button onClick={handleSaveSlip} className="btn-secondary" disabled={isSaving}>
          {isSaving ? 'Đang lưu...' : 'Lưu Tạm'}
        </button>
        <button onClick={handleDirectImport} className="btn-primary" disabled={isSaving}>
          {isSaving ? 'Đang xử lý...' : 'Nhập Kho Trực Tiếp'}
        </button>
      </div>
    </div>
  );
};

export default NewImportPage;