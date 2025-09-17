// src/pages/NewImportPage.jsx
import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import AddNewProductAndLotModal from '../components/AddNewProductAndLotModal';
import AddNewLotModal from '../components/AddNewLotModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { parseDateString, formatExpiryDate, formatDate } from '../utils/dateUtils';
import { FiInfo } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { z } from 'zod';
import useImportSlipStore from '../stores/importSlipStore'; // <-- THAY ĐỔI 1: Import store

// Schema validation không thay đổi
const importItemSchema = z.object({
  productId: z.string().min(1, "Mã hàng không được để trống."),
  lotNumber: z.string().min(1, "Số lô không được để trống."),
  quantity: z.preprocess(
      val => Number(val),
      z.number({ invalid_type_error: "Số lượng phải là một con số." })
       .gt(0, "Số lượng phải lớn hơn 0.")
  ),
  expiryDate: z.string().refine(val => parseDateString(val) !== null, {
      message: "Hạn sử dụng không hợp lệ (cần định dạng dd/mm/yyyy)."
  }),
});

const importSlipSchema = z.object({
    supplierId: z.string().min(1, "Mã nhà cung cấp không được để trống."),
    supplierName: z.string().min(1, "Không tìm thấy tên nhà cung cấp."),
    items: z.array(importItemSchema).min(1, "Phiếu nhập phải có ít nhất một mặt hàng hợp lệ.")
});

const NewImportPage = () => {
    // THAY ĐỔI 2: Lấy state và actions từ Zustand store
    const {
        supplierId,
        supplierName,
        description,
        items,
        setSupplier,
        setDescription,
        addNewItemRow,
        updateItem,
        handleProductSearchResult,
        handleLotCheckResult,
        declareNewLot,
        fillNewProductData,
        resetSlip
    } = useImportSlipStore();

    // Các state cục bộ cho UI vẫn được giữ lại
    const [isSaving, setIsSaving] = useState(false);
    const [newProductModal, setNewProductModal] = useState({ isOpen: false, productId: '', index: -1 });
    const [newLotModal, setNewLotModal] = useState({ isOpen: false, index: -1 });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [allSuppliers, setAllSuppliers] = useState([]);
    const inputRefs = useRef([]);

    useEffect(() => {
        const fetchSuppliers = async () => {
            const q = query(collection(db, "partners"), where("partnerType", "==", "supplier"));
            const querySnapshot = await getDocs(q);
            const supplierList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllSuppliers(supplierList);
        };
        fetchSuppliers();
    }, []);

    const getValidSlipData = () => {
        const validItems = items.filter(item => 
            item.productId && item.lotNumber && item.quantity && item.expiryDate
        );
        const slipToValidate = {
            supplierId: supplierId.trim(),
            supplierName: supplierName.trim(),
            items: validItems
        };
        const validationResult = importSlipSchema.safeParse(slipToValidate);

        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
            return null;
        }

        return {
            ...validationResult.data,
            importDate: formatDate(new Date()),
            description,
            status: '',
            createdAt: serverTimestamp()
        };
    }

    const handleSupplierSearch = async () => {
        if (!supplierId) {
            setSupplier(supplierId, '');
            return;
        }
        try {
            const partnerRef = doc(db, 'partners', supplierId.toUpperCase());
            const partnerSnap = await getDoc(partnerRef);
            
            if (partnerSnap.exists() && partnerSnap.data().partnerType === 'supplier') {
                setSupplier(supplierId, partnerSnap.data().partnerName);
            } else {
                setSupplier(supplierId, '');
                toast.error(`Không tìm thấy Nhà cung cấp với mã "${supplierId}"`);
            }
        } catch (error) {
            console.error("Lỗi khi tìm nhà cung cấp:", error);
            toast.error("Không thể đọc dữ liệu NCC. Kiểm tra Console (F12)!"); 
            setSupplier(supplierId, '');
        }
    };
    
    const handleExpiryDateBlur = (index, value) => {
        updateItem(index, 'expiryDate', formatExpiryDate(value));
    };

    const checkExistingLot = async (index) => {
        const currentItem = items[index];
        if (!currentItem.productId || !currentItem.lotNumber) return;

        try {
            const q = query(
                collection(db, "inventory_lots"),
                where("productId", "==", currentItem.productId.trim()),
                where("lotNumber", "==", currentItem.lotNumber.trim())
            );
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const existingLotData = querySnapshot.docs[0].data();
                handleLotCheckResult(index, existingLotData, true); // Cập nhật store
            } else {
                handleLotCheckResult(index, null, false); // Cập nhật store
            }
        } catch (error) {
            console.error("Lỗi khi kiểm tra lô tồn tại: ", error);
        }
    };

    const handleProductSearch = async (index, productId) => {
        if (!productId) return;
        try {
            const productRef = doc(db, 'products', productId);
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
                handleProductSearchResult(index, productSnap.data(), true); // Cập nhật store
            } else {
                handleProductSearchResult(index, null, false); // Cập nhật store
            }
        } catch (error) {
            console.error("Lỗi khi tìm kiếm sản phẩm:", error);
            toast.error("Lỗi khi tìm kiếm sản phẩm!");
        }
    };
    
    const handleNewProductCreated = (newData) => {
        const { index } = newProductModal;
        fillNewProductData(index, newData); // Cập nhật store
        setNewProductModal({ isOpen: false, productId: '', index: -1 });
        setTimeout(() => inputRefs.current[index * 3 + 2]?.focus(), 100);
    };

    const handleSaveSlip = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;

        setIsSaving(true);
        try {
            const finalSlipData = { ...slipData, status: 'pending' };
            const docRef = await addDoc(collection(db, 'import_tickets'), finalSlipData);
            toast.success(`Lưu tạm phiếu nhập thành công! ID phiếu: ${docRef.id}`);
            resetSlip(); // Reset state trong store
        } catch (error) {
            console.error("Lỗi khi lưu phiếu nhập: ", error);
            toast.error('Đã xảy ra lỗi khi lưu phiếu.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDirectImport = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;

        setConfirmModal({ isOpen: false });
        setIsSaving(true);
        try {
            for (const item of slipData.items) {
                const expiryTimestamp = Timestamp.fromDate(parseDateString(item.expiryDate));
                const fullItemData = items.find(i => i.productId === item.productId && i.lotNumber === item.lotNumber);
                const newLotData = {
                    importDate: Timestamp.now(),
                    productId: item.productId,
                    productName: fullItemData.productName,
                    lotNumber: item.lotNumber,
                    expiryDate: expiryTimestamp,
                    unit: fullItemData.unit,
                    packaging: fullItemData.packaging,
                    storageTemp: fullItemData.storageTemp,
                    team: fullItemData.team,
                    manufacturer: fullItemData.manufacturer,
                    quantityImported: Number(item.quantity),
                    quantityRemaining: Number(item.quantity),
                    notes: fullItemData.notes,
                    supplier: slipData.supplierName,
                };
                await addDoc(collection(db, "inventory_lots"), newLotData);
            }
            
            const finalSlipData = { ...slipData, status: 'completed' };
            await addDoc(collection(db, 'import_tickets'), finalSlipData);
            
            toast.success('Nhập kho trực tiếp thành công!');
            resetSlip(); // Reset state trong store
        } catch (error) {
            console.error("Lỗi khi nhập kho trực tiếp: ", error);
            toast.error('Đã xảy ra lỗi khi nhập kho trực tiếp.');
        } finally {
            setIsSaving(false);
        }
    };

    const promptForDirectImport = () => {
        if (getValidSlipData()) {
            setConfirmModal({
                isOpen: true,
                title: "Xác nhận nhập kho trực tiếp?",
                message: "Thao tác này sẽ cập nhật tồn kho ngay lập tức và không thể hoàn tác. Bạn có chắc chắn muốn tiếp tục?",
                onConfirm: handleDirectImport
            });
        }
    };

    // --- Các hàm và JSX còn lại phần lớn giữ nguyên cấu trúc ---
    // Chỉ thay đổi cách gọi `setState` thành gọi action của store

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
            {newProductModal.isOpen && (
                <AddNewProductAndLotModal
                    productId={newProductModal.productId}
                    onClose={() => setNewProductModal({ isOpen: false, productId: '', index: -1 })}
                    onSave={handleNewProductCreated}
                />
            )}
            {newLotModal.isOpen && (
                <AddNewLotModal
                    productId={items[newLotModal.index].productId}
                    productName={items[newLotModal.index].productName}
                    lotNumber={items[newLotModal.index].lotNumber}
                    onClose={() => setNewLotModal({ isOpen: false, index: -1 })}
                    onSave={(expiry) => declareNewLot(newLotModal.index, expiry)}
                />
            )}

            <h1>Tạo Phiếu Nhập Kho</h1>
            <div className="form-section">
                <div className="form-row">
                    <div className="form-group">
                        <label>Ngày nhập</label>
                        <input type="text" value={formatDate(new Date())} readOnly style={{backgroundColor: '#f0f0f0'}} />
                    </div>
                    <div className="form-group">
                         <label>Mã Nhà Cung Cấp (*)</label>
                        <input 
                             list="suppliers-list"
                            type="text" 
                            placeholder="Nhập hoặc chọn mã NCC..." 
                            value={supplierId} 
                            onChange={e => setSupplier(e.target.value.toUpperCase(), '')} // <-- Chỉ cập nhật ID
                            onBlur={handleSupplierSearch}
                        />
                         <datalist id="suppliers-list">
                            {allSuppliers.map(sup => (
                                <option key={sup.id} value={sup.id}>
                                     {sup.partnerName}
                                </option>
                            ))}
                         </datalist>
                    </div>
                    <div className="form-group">
                        <label>Tên Nhà Cung Cấp (*)</label>
                         <input 
                            type="text" 
                            value={supplierName} 
                            readOnly 
                             style={{ backgroundColor: '#f0f0f0', cursor: 'not-allowed' }}
                        />
                     </div>
                </div>
                <div className="form-group">
                    <label>Diễn giải</label>
                    <textarea rows="2" placeholder="Ghi chú cho phiếu nhập..." value={description} onChange={e => setDescription(e.target.value)}></textarea>
                </div>
            </div>

            <h2>Chi tiết hàng hóa</h2>
            <div className="item-details-grid">
                <div className="grid-header">Mã hàng (*)</div>
                <div className="grid-header">Tên hàng</div>
                 <div className="grid-header">Số lô (*)</div>
                <div className="grid-header">HSD (*)</div>
                <div className="grid-header">ĐVT</div>
                <div className="grid-header">Quy cách</div>
                <div className="grid-header">Số lượng (*)</div>
                <div className="grid-header">Ghi chú</div>
                <div className="grid-header">Nhiệt độ BQ</div>
                <div className="grid-header">Team</div>

                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        <div className="grid-cell" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                            <input
                                type="text"
                                value={item.productId}
                                onChange={e => updateItem(index, 'productId', e.target.value.toUpperCase())}
                                onBlur={e => handleProductSearch(index, e.target.value)}
                            />
                            {item.productNotFound && (
                                <button
                                     onClick={() => setNewProductModal({ isOpen: true, productId: item.productId, index: index })}
                                    className="btn-link"
                                     style={{ marginTop: '5px', color: '#007bff', cursor: 'pointer', background: 'none', border: 'none', padding: '0', textAlign: 'left', fontSize: '13px' }}
                                >
                                    Mã này không tồn tại. Tạo mới...
                                </button>
                            )}
                        </div>
                        <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
                        <div className="grid-cell" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                            <input
                                type="text"
                                value={item.lotNumber}
                                onChange={e => updateItem(index, 'lotNumber', e.target.value)}
                                onBlur={() => checkExistingLot(index)}
                            />
                            {item.lotStatus === 'exists' && item.existingLotInfo && (
                                <div className="existing-lot-info">
                                    <FiInfo />
                                    <span>Lô đã có | Tồn: {item.existingLotInfo.quantityRemaining} | HSD: {item.existingLotInfo.expiryDate}</span>
                                </div>
                            )}
                            {item.lotStatus === 'new' && (
                                <button onClick={() => setNewLotModal({ isOpen: true, index: index })} className="btn-link" style={{marginTop: '5px'}}>
                                    [+] Khai báo lô mới...
                                </button>
                            )}
                        </div>
                        <div className="grid-cell">
                            <input 
                                type="text" 
                                placeholder="dd/mm/yyyy" 
                                value={item.expiryDate} 
                                onChange={e => updateItem(index, 'expiryDate', e.target.value)} 
                                onBlur={e => handleExpiryDateBlur(index, e.target.value)}
                                readOnly={item.lotStatus === 'exists'}
                                style={{backgroundColor: item.lotStatus === 'exists' ? '#f0f0f0' : '#fff', cursor: item.lotStatus === 'exists' ? 'not-allowed' : 'text'}}
                            />
                        </div>
                        <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
                        <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
                        <div className="grid-cell">
                            <input
                                type="number"
                                value={item.quantity}
                                onChange={e => updateItem(index, 'quantity', e.target.value)}
                            />
                        </div>
                        <div className="grid-cell"><textarea value={item.notes} onChange={e => updateItem(index, 'notes', e.target.value)} /></div>
                        <div className="grid-cell"><textarea value={item.storageTemp} readOnly /></div>
                        <div className="grid-cell"><input type="text" value={item.team} readOnly /></div>
                    </React.Fragment>
                ))}
            </div>
            
            <button onClick={addNewItemRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
            <div className="page-actions">
                <button onClick={handleSaveSlip} className="btn-secondary" disabled={isSaving}>
                    {isSaving ? 'Đang lưu...' : 'Lưu Tạm'}
                </button>
                <button onClick={promptForDirectImport} className="btn-primary" disabled={isSaving}>
                    {isSaving ? 'Đang xử lý...' : 'Nhập Kho Trực Tiếp'}
                </button>
            </div>
        </div>
    );
};

export default NewImportPage;