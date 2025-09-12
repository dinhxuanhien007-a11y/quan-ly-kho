// src/pages/NewExportPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { FiXCircle, FiChevronDown } from 'react-icons/fi';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate } from '../utils/dateUtils';
import { toast } from 'react-toastify';

const NewExportPage = () => {
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const [exportDate, setExportDate] = useState(formattedDate);
    const [customerId, setCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState([{ 
        id: Date.now(), 
        productId: '', productName: '', unit: '', packaging: '', storageTemp: '',
        availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '',
        expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '' 
    }]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const lotSelectRefs = useRef([]);
    const quantityInputRefs = useRef([]);
    const [allCustomers, setAllCustomers] = useState([]);

    useEffect(() => {
        const fetchCustomers = async () => {
            const q = query(collection(db, "partners"), where("partnerType", "==", "customer"));
            const querySnapshot = await getDocs(q);
            const customerList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllCustomers(customerList);
        };
        fetchCustomers();
    }, []);

    const handleCustomerSearch = async () => {
        if (!customerId) {
            setCustomerName('');
            return;
        }
        try {
            const partnerRef = doc(db, 'partners', customerId.toUpperCase());
            const partnerSnap = await getDoc(partnerRef);
            if (partnerSnap.exists() && partnerSnap.data().partnerType === 'customer') {
                setCustomerName(partnerSnap.data().partnerName);
            } else {
                setCustomerName('');
                toast.error(`Không tìm thấy Khách hàng với mã "${customerId}"`);
            }
        } catch (error) {
            console.error("Lỗi khi tìm khách hàng:", error);
            setCustomerName('');
        }
    };

    const getValidSlipData = () => {
        if (!customerId || !customerName) {
            toast.warn('Vui lòng nhập Mã Khách hàng hợp lệ.');
            return null;
        }
        const validItems = items.filter(item => item.selectedLotId && Number(item.quantityToExport) > 0);
        if (validItems.length === 0) {
            toast.warn('Vui lòng thêm ít nhất một mặt hàng và nhập số lượng xuất.');
            return null;
        }
        return {
            exportDate, customerId: customerId.toUpperCase(), customer: customerName,
            description, items: validItems.map(item => ({
                productId: item.productId, productName: item.productName, lotId: item.selectedLotId,
                lotNumber: item.lotNumber, expiryDate: item.expiryDate, unit: item.unit,
                packaging: item.packaging, storageTemp: item.storageTemp,
                quantityToExport: Number(item.quantityToExport), notes: item.notes
            })), createdAt: serverTimestamp()
        };
    };

    const resetForm = () => {
        setCustomerId(''); setCustomerName(''); setDescription('');
        setItems([{ 
            id: Date.now(), productId: '', productName: '', unit: '', packaging: '', storageTemp: '', 
            availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '', expiryDate: '', 
            quantityRemaining: 0, quantityToExport: '', notes: '' 
        }]);
    };

    const handleSaveDraft = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;
        setIsProcessing(true);
        try {
            await addDoc(collection(db, 'export_tickets'), { ...slipData, status: 'pending' });
            toast.success('Lưu nháp phiếu xuất thành công!');
            resetForm();
        } catch (error) {
            console.error("Lỗi khi lưu nháp phiếu xuất: ", error);
            toast.error('Đã xảy ra lỗi khi lưu nháp.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDirectExport = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;
        setConfirmModal({isOpen: false});
        setIsProcessing(true);
        try {
            for (const item of slipData.items) {
                const lotRef = doc(db, 'inventory_lots', item.lotId);
                const lotSnap = await getDoc(lotRef);
                if(lotSnap.exists()){
                    const currentQuantity = lotSnap.data().quantityRemaining;
                    const newQuantityRemaining = currentQuantity - item.quantityToExport;
                    await updateDoc(lotRef, { quantityRemaining: newQuantityRemaining });
                }
            }
            await addDoc(collection(db, 'export_tickets'), { ...slipData, status: 'completed' });
            toast.success('Xuất kho trực tiếp thành công!');
            resetForm();
        } catch (error) {
            console.error("Lỗi khi xuất kho trực tiếp: ", error);
            toast.error('Đã xảy ra lỗi trong quá trình xuất kho.');
        } finally {
            setIsProcessing(false);
        }
    };

    const promptForDirectExport = () => {
        if (!getValidSlipData()) return;
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xuất kho?",
            message: "Hành động này sẽ trừ tồn kho ngay lập tức. Bạn có chắc chắn muốn tiếp tục?",
            onConfirm: handleDirectExport
        });
    };

    const handleProductSearch = async (index, productId) => {
        if (!productId) return;
        const newItems = [...items];
        const currentItem = newItems[index];
        Object.assign(currentItem, { productName: '', unit: '', packaging: '', storageTemp: '', availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '', expiryDate: '', quantityRemaining: 0 });
        setItems(newItems);
        try {
          const productRef = doc(db, 'products', productId);
          const productSnap = await getDoc(productRef);
          if (!productSnap.exists()) {
            toast.warn(`Không tìm thấy sản phẩm với mã: ${productId}`);
            return;
          }
          const productData = productSnap.data();
          currentItem.productName = productData.productName;
          currentItem.unit = productData.unit;
          currentItem.packaging = productData.packaging;
          currentItem.storageTemp = productData.storageTemp;
          const lotsQuery = query(collection(db, 'inventory_lots'), where("productId", "==", productId), where("quantityRemaining", ">", 0));
          const lotsSnapshot = await getDocs(lotsQuery);
          if (lotsSnapshot.empty) {
            toast.warn(`Cảnh báo: Sản phẩm mã '${productId}' đã hết hàng tồn kho.`);
            currentItem.availableLots = [];
          } else {
            let foundLots = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            foundLots.sort((a, b) => (a.expiryDate.toDate()) - (b.expiryDate.toDate()));
            currentItem.availableLots = foundLots;
            setTimeout(() => lotSelectRefs.current[index]?.focus(), 0);
          }
        } catch (error) {
          console.error("Lỗi khi tìm kiếm:", error);
          toast.error("Đã có lỗi xảy ra khi tìm kiếm.");
        } finally {
          setItems([...newItems]);
        }
    };
    
    const handleLotSelection = (index, selectedLotId) => {
        const newItems = [...items];
        const currentItem = newItems[index];
        currentItem.selectedLotId = selectedLotId;
        const selectedLot = currentItem.availableLots.find(lot => lot.id === selectedLotId);
        if (selectedLot) {
          currentItem.lotNumber = selectedLot.lotNumber;
          currentItem.expiryDate = formatDate(selectedLot.expiryDate);
          currentItem.quantityRemaining = selectedLot.quantityRemaining;
          currentItem.displayLotText = selectedLot.lotNumber;
          setTimeout(() => quantityInputRefs.current[index]?.focus(), 0);
        } else {
            Object.assign(currentItem, { lotNumber: '', expiryDate: '', quantityRemaining: 0, displayLotText: '' });
        }
        setItems(newItems);
    };
      
    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        if (field === 'quantityToExport') {
          const val = Number(value);
          if (val < 0) return;
          if (val > newItems[index].quantityRemaining) {
            toast.warn('Cảnh báo: Số lượng xuất vượt quá số lượng tồn!');
            newItems[index][field] = newItems[index].quantityRemaining;
          } else {
            newItems[index][field] = val;
          }
        } else {
          newItems[index][field] = value;
        }
        setItems(newItems);
    };
    
    const addNewRow = () => {
        setItems([...items, { id: Date.now(), productId: '', productName: '', unit: '', packaging: '', storageTemp: '', availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '', expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '' }]);
    };
    
    const handleRemoveRow = (indexToRemove) => {
        if (items.length <= 1) return;
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xóa dòng?",
            message: "Bạn có chắc chắn muốn xóa dòng hàng này khỏi phiếu xuất?",
            onConfirm: () => {
                setItems(prevItems => prevItems.filter((_, index) => index !== indexToRemove));
                setConfirmModal({ isOpen: false });
            }
        });
    };

    return (
        <div>
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal({ isOpen: false })}
                confirmText="Xác nhận"
            />
            <h1>Tạo Phiếu Xuất Kho</h1>
            <div className="form-section">
                <div className="form-row">
                    <div className="form-group">
                        <label>Ngày xuất</label>
                        <input type="text" value={exportDate} onChange={(e) => setExportDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Mã Khách Hàng</label>
                        <input
                            list="customers-list"
                            type="text"
                            placeholder="Nhập hoặc chọn mã KH..."
                            value={customerId}
                            onChange={e => setCustomerId(e.target.value)}
                            onBlur={handleCustomerSearch}
                        />
                        <datalist id="customers-list">
                            {allCustomers.map(cus => (
                                <option key={cus.id} value={cus.id}>
                                    {cus.partnerName}
                                </option>
                            ))}
                        </datalist>
                    </div>
                    <div className="form-group">
                        <label>Tên Khách Hàng / Nơi nhận</label>
                        <input
                            type="text"
                            value={customerName}
                            readOnly
                            style={{ backgroundColor: '#f0f0f0', cursor: 'not-allowed' }}
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label>Diễn giải</label>
                    <textarea rows="2" placeholder="Ghi chú cho phiếu xuất..." value={description} onChange={e => setDescription(e.target.value)}></textarea>
                </div>
            </div>

            <h2>Chi Tiết Hàng Hóa Xuất Kho</h2>
            <div className="item-details-grid" style={{ gridTemplateColumns: '1.5fr 2.5fr 2fr 0.8fr 1.5fr 1fr 1.5fr 0.5fr' }}>
                <div className="grid-header">Mã hàng</div>
                <div className="grid-header">Tên hàng</div>
                <div className="grid-header">Số lô</div>
                <div className="grid-header">ĐVT</div>
                <div className="grid-header">Quy cách</div>
                <div className="grid-header">SL Xuất</div>
                <div className="grid-header">Ghi chú</div>
                <div className="grid-header">Xóa</div>
                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        <div className="grid-cell">
                            <input type="text" placeholder="Nhập mã hàng..." value={item.productId}
                                onChange={e => handleItemChange(index, 'productId', e.target.value.toUpperCase())}
                                onBlur={e => handleProductSearch(index, e.target.value)} />
                        </div>
                        <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
                        <div className="grid-cell">
                            {item.selectedLotId ? (
                                <div className="selected-lot-view">
                                    <input type="text" value={item.displayLotText} readOnly className="selected-lot-input" />
                                    <button type="button" onClick={() => handleLotSelection(index, '')} className="change-lot-btn">
                                        <FiChevronDown />
                                    </button>
                                </div>
                            ) : (
                                <select
                                    ref={el => lotSelectRefs.current[index] = el}
                                    value={item.selectedLotId}
                                    onChange={e => handleLotSelection(index, e.target.value)}
                                    disabled={item.availableLots.length === 0}
                                    style={{width: '100%'}}
                                >
                                    <option value="">-- Chọn lô tồn kho --</option>
                                    {item.availableLots.map(lot => (
                                        <option key={lot.id} value={lot.id}>
                                        {`Lô: ${lot.lotNumber} | HSD: ${formatDate(lot.expiryDate)} | Tồn: ${lot.quantityRemaining}`}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
                        <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
                        <div className="grid-cell">
                            <input type="number" value={item.quantityToExport}
                                ref={el => quantityInputRefs.current[index] = el}
                                onChange={e => handleItemChange(index, 'quantityToExport', e.target.value)} />
                        </div>
                        <div className="grid-cell"><textarea value={item.notes || ''} onChange={e => handleItemChange(index, 'notes', e.target.value)} /></div>
                        <div className="grid-cell">
                            <button type="button" className="btn-icon btn-delete" onClick={() => handleRemoveRow(index)}><FiXCircle /></button>
                        </div>
                    </React.Fragment>
                ))}
            </div>
            <button onClick={addNewRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
            <div className="page-actions">
                <button onClick={handleSaveDraft} className="btn-secondary" disabled={isProcessing}>
                    {isProcessing ? 'Đang xử lý...' : 'Lưu Nháp'}
                </button>
                <button onClick={promptForDirectExport} className="btn-primary" disabled={isProcessing}>
                    {isProcessing ? 'Đang xử lý...' : 'Xuất Kho Trực Tiếp'}
                </button>
            </div>
        </div>
    );
};

export default NewExportPage;