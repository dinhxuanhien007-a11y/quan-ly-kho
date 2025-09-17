// src/pages/NewExportPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { FiXCircle, FiChevronDown } from 'react-icons/fi';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import { z } from 'zod';
import useExportSlipStore from '../stores/exportSlipStore';

// Schema validation không thay đổi
const exportItemSchema = z.object({
    productId: z.string().min(1, { message: "Mã hàng không được để trống." }),
    selectedLotId: z.string().min(1, { message: "Vui lòng chọn một lô hàng." }),
    quantityToExport: z.preprocess(
        val => Number(val),
        z.number({ invalid_type_error: "Số lượng xuất phải là một con số." })
         .gt(0, { message: "Số lượng xuất phải lớn hơn 0." })
    )
});

const exportSlipSchema = z.object({
    customerId: z.string().min(1, { message: "Mã khách hàng không được để trống." }),
    customerName: z.string().min(1, { message: "Không tìm thấy tên khách hàng tương ứng." }),
    items: z.array(exportItemSchema).min(1, { message: "Phiếu xuất phải có ít nhất một mặt hàng." })
});

const NewExportPage = () => {
    // Lấy toàn bộ state và actions cần thiết từ Zustand store
    const {
        customerId,
        customerName,
        description,
        items,
        setCustomer,
        setDescription,
        addNewItemRow,
        removeItemRow,
        updateItem,
        replaceItem,
        resetSlip
    } = useExportSlipStore();
    
    // Các state cục bộ cho việc xử lý giao diện (loading, modal) vẫn được giữ lại
    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [allCustomers, setAllCustomers] = useState([]);
    const lotSelectRefs = useRef([]);
    const quantityInputRefs = useRef([]);

    // Lấy danh sách khách hàng khi component được mount
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
            setCustomer(customerId, ''); // Gọi action từ store
            return;
        }
        try {
            const partnerRef = doc(db, 'partners', customerId.toUpperCase());
            const partnerSnap = await getDoc(partnerRef);
            if (partnerSnap.exists() && partnerSnap.data().partnerType === 'customer') {
                setCustomer(customerId, partnerSnap.data().partnerName); // Gọi action
            } else {
                setCustomer(customerId, ''); // Gọi action
                toast.error(`Không tìm thấy Khách hàng với mã "${customerId}"`);
            }
        } catch (error) {
            console.error("Lỗi khi tìm khách hàng:", error);
            setCustomer(customerId, ''); // Gọi action
        }
    };

    const handleProductSearch = async (index, productId) => {
        if (!productId) return;
        
        replaceItem(index, { productName: '', unit: '', packaging: '', storageTemp: '', availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '', expiryDate: '', quantityRemaining: 0 });
        
        try {
          const productRef = doc(db, 'products', productId);
          const productSnap = await getDoc(productRef);
          if (!productSnap.exists()) {
            toast.warn(`Không tìm thấy sản phẩm với mã: ${productId}`);
            return;
          }
          const productData = productSnap.data();
          const lotsQuery = query(collection(db, 'inventory_lots'), where("productId", "==", productId), where("quantityRemaining", ">", 0));
          const lotsSnapshot = await getDocs(lotsQuery);
          
          let foundLots = [];
          if (lotsSnapshot.empty) {
            toast.warn(`Cảnh báo: Sản phẩm mã '${productId}' đã hết hàng tồn kho.`);
          } else {
            foundLots = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            foundLots.sort((a, b) => (a.expiryDate.toDate()) - (b.expiryDate.toDate()));
            setTimeout(() => lotSelectRefs.current[index]?.focus(), 0);
          }
          
          replaceItem(index, {
              productName: productData.productName,
              unit: productData.unit,
              packaging: productData.packaging,
              storageTemp: productData.storageTemp,
              availableLots: foundLots
          });
        } catch (error) {
          console.error("Lỗi khi tìm kiếm:", error);
          toast.error("Đã có lỗi xảy ra khi tìm kiếm.");
        }
    };
    
    const handleLotSelection = (index, selectedLotId) => {
        const currentItem = items[index];
        const selectedLot = currentItem.availableLots.find(lot => lot.id === selectedLotId);
        if (selectedLot) {
          replaceItem(index, {
              selectedLotId: selectedLotId,
              lotNumber: selectedLot.lotNumber,
              expiryDate: formatDate(selectedLot.expiryDate),
              quantityRemaining: selectedLot.quantityRemaining,
              displayLotText: selectedLot.lotNumber
          });
          setTimeout(() => quantityInputRefs.current[index]?.focus(), 0);
        } else {
           replaceItem(index, { selectedLotId: '', lotNumber: '', expiryDate: '', quantityRemaining: 0, displayLotText: '' });
        }
    };
    
    const handleRemoveRowWithConfirmation = (index) => {
        if (items.length <= 1) return;
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xóa dòng?",
            message: "Bạn có chắc chắn muốn xóa dòng hàng này khỏi phiếu xuất?",
            onConfirm: () => {
                removeItemRow(index); // Gọi action
                setConfirmModal({ isOpen: false });
            }
        });
    };

    const getValidSlipData = () => {
        const today = new Date();
        const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
        const validItems = items.filter(item => item.productId && item.selectedLotId && item.quantityToExport);
        const slipToValidate = {
            customerId: customerId.trim(),
            customerName: customerName.trim(),
            items: validItems
        };
        const validationResult = exportSlipSchema.safeParse(slipToValidate);
        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
            return null;
        }
        return {
            exportDate: formattedDate, 
            customerId: customerId.toUpperCase(), 
            customer: customerName,
            description, 
            items: validationResult.data.items.map(item => {
                const fullItemData = items.find(i => i.selectedLotId === item.selectedLotId);
                return {
                    productId: item.productId,
                    productName: fullItemData?.productName || '',
                    lotId: item.selectedLotId,
                    lotNumber: fullItemData?.lotNumber || '',
                    expiryDate: fullItemData?.expiryDate || '',
                    unit: fullItemData?.unit || '',
                    packaging: fullItemData?.packaging || '',
                    storageTemp: fullItemData?.storageTemp || '',
                    quantityToExport: item.quantityToExport,
                    notes: fullItemData?.notes || ''
                }
            }), 
            createdAt: serverTimestamp()
        };
    };

    const handleSaveDraft = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;
        setIsProcessing(true);
        try {
            await addDoc(collection(db, 'export_tickets'), { ...slipData, status: 'pending' });
            toast.success('Lưu nháp phiếu xuất thành công!');
            resetSlip(); // Gọi action
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
            resetSlip(); // Gọi action
        } catch (error) {
            console.error("Lỗi khi xuất kho trực tiếp: ", error);
            toast.error('Đã xảy ra lỗi trong quá trình xuất kho.');
        } finally {
            setIsProcessing(false);
        }
    };

    const promptForDirectExport = () => {
        if (getValidSlipData()) {
             setConfirmModal({
                isOpen: true,
                title: "Xác nhận xuất kho?",
                message: "Hành động này sẽ trừ tồn kho ngay lập tức. Bạn có chắc chắn muốn tiếp tục?",
                onConfirm: handleDirectExport
            });
        }
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
                        <input type="text" value={formatDate(new Date())} readOnly style={{backgroundColor: '#f0f0f0'}} />
                    </div>
                    <div className="form-group">
                         <label>Mã Khách Hàng (*)</label>
                        <input
                            list="customers-list"
                            type="text"
                            placeholder="Nhập hoặc chọn mã KH..."
                            value={customerId}
                            onChange={e => setCustomer(e.target.value.toUpperCase(), customerName)}
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
                         <label>Tên Khách Hàng / Nơi nhận (*)</label>
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
                <div className="grid-header">Mã hàng (*)</div>
                <div className="grid-header">Tên hàng</div>
                <div className="grid-header">Số lô (*)</div>
                <div className="grid-header">ĐVT</div>
                <div className="grid-header">Quy cách</div>
                <div className="grid-header">SL Xuất (*)</div>
                <div className="grid-header">Ghi chú</div>
                 <div className="grid-header">Xóa</div>
                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        <div className="grid-cell">
                            <input type="text" placeholder="Nhập mã hàng..." value={item.productId}
                                onChange={e => updateItem(index, 'productId', e.target.value.toUpperCase())}
                                onBlur={e => handleProductSearch(index, e.target.value)} />
                         </div>
                        <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
                        <div className="grid-cell">
                            {item.selectedLotId ?
                            (
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
                                onChange={e => updateItem(index, 'quantityToExport', e.target.value)} />
                        </div>
                        <div className="grid-cell"><textarea value={item.notes || ''} onChange={e => updateItem(index, 'notes', e.target.value)} /></div>
                        <div className="grid-cell">
                            <button type="button" className="btn-icon btn-delete" onClick={() => handleRemoveRowWithConfirmation(index)}><FiXCircle /></button>
                        </div>
                     </React.Fragment>
                ))}
            </div>
            <button onClick={addNewItemRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
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