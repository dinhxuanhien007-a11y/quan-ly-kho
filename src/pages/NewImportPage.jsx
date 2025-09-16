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
import { z } from 'zod'; // <-- IMPORT ZOD

// Định nghĩa Schema xác thực
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
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const [importDate, setImportDate] = useState(formattedDate);
    const [supplierId, setSupplierId] = useState('');
    const [supplierName, setSupplierName] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState([
        { id: 1, productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '', manufacturer: '', productNotFound: false, lotStatus: 'unchecked', existingLotInfo: null }
    ]);
    const [isSaving, setIsSaving] = useState(false);
    const [newProductModal, setNewProductModal] = useState({ isOpen: false, productId: '', index: -1 });
    const [newLotModal, setNewLotModal] = useState({ isOpen: false, index: -1 });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const inputRefs = useRef([]);
    const [allSuppliers, setAllSuppliers] = useState([]);

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
            importDate: formattedDate,
            description,
            status: '', // Sẽ được gán sau
            createdAt: serverTimestamp()
        };
    }

    const handleSupplierSearch = async () => {
        if (!supplierId) {
            setSupplierName('');
            return;
        }
        try {
            const partnerRef = doc(db, 'partners', supplierId.toUpperCase());
            const partnerSnap = await getDoc(partnerRef);
            if (partnerSnap.exists() && partnerSnap.data().partnerType === 'supplier') {
                setSupplierName(partnerSnap.data().partnerName);
            } else {
                setSupplierName('');
                toast.error(`Không tìm thấy Nhà cung cấp với mã "${supplierId}" hoặc đối tác không phải là Nhà cung cấp.`);
            }
        } catch (error) {
            console.error("Lỗi khi tìm nhà cung cấp:", error);
            setSupplierName('');
        }
    };
    
    const handleExpiryDateBlur = (index, value) => {
        const newItems = [...items];
        newItems[index].expiryDate = formatExpiryDate(value);
        setItems(newItems);
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        
        if (field === 'productId' || field === 'lotNumber') {
            newItems[index].lotStatus = 'unchecked';
            newItems[index].expiryDate = '';
            newItems[index].existingLotInfo = null;
        }
        
        setItems(newItems);
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
            
            const newItems = [...items];
            if (!querySnapshot.empty) {
                const existingLotData = querySnapshot.docs[0].data();
                newItems[index].lotStatus = 'exists';
                newItems[index].expiryDate = formatDate(existingLotData.expiryDate);
                newItems[index].existingLotInfo = {
                    quantityRemaining: existingLotData.quantityRemaining,
                    expiryDate: formatDate(existingLotData.expiryDate)
                };
            } else {
                newItems[index].lotStatus = 'new';
                newItems[index].existingLotInfo = null;
            }
            setItems(newItems);
        } catch (error) {
            console.error("Lỗi khi kiểm tra lô tồn tại: ", error);
        }
    };

    const handleNewLotDeclared = (index, declaredExpiryDate) => {
        const newItems = [...items];
        newItems[index].expiryDate = declaredExpiryDate;
        newItems[index].lotStatus = 'declared';
        setItems(newItems);
        setNewLotModal({ isOpen: false, index: -1 });
    };

    const handleProductSearch = async (index, productId) => {
        if (!productId) return;
        const newItems = [...items];
        try {
            const productRef = doc(db, 'products', productId);
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
                const productData = productSnap.data();
                newItems[index] = {
                    ...newItems[index],
                    productName: productData.productName || '',
                    unit: productData.unit || '',
                    packaging: productData.packaging || '',
                    storageTemp: productData.storageTemp || '',
                    team: productData.team || '',
                    manufacturer: productData.manufacturer || '',
                    productNotFound: false,
                };
            } else {
                newItems[index].productName = '';
                newItems[index].productNotFound = true;
            }
        } catch (error) {
            console.error("Lỗi khi tìm kiếm sản phẩm:", error);
            newItems[index].productName = 'Lỗi khi tìm kiếm!';
            newItems[index].productNotFound = false;
        } finally {
            setItems(newItems);
        }
    };
    
    const handleNewProductCreated = (newData) => {
        const newItems = [...items];
        const { index } = newProductModal;
        newItems[index] = {
            ...newItems[index], 
            ...newData,
            productNotFound: false,
        };
        setItems(newItems);
        setNewProductModal({ isOpen: false, productId: '', index: -1 });
        setTimeout(() => {
            inputRefs.current[index * 3 + 2]?.focus();
        }, 100);
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
            { id: Date.now(), productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '', manufacturer: '', productNotFound: false, lotStatus: 'unchecked', existingLotInfo: null }
        ]);
    };

    const resetForm = () => {
        setSupplierId('');
        setSupplierName('');
        setDescription('');
        setItems([{ id: 1, productId: '', productName: '', lotNumber: '', expiryDate: '', unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: '', manufacturer: '', productNotFound: false, lotStatus: 'unchecked', existingLotInfo: null }]);
    }

    const handleSaveSlip = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;

        setIsSaving(true);
        try {
            const finalSlipData = { ...slipData, status: 'pending' };
            const docRef = await addDoc(collection(db, 'import_tickets'), finalSlipData);
            toast.success(`Lưu tạm phiếu nhập thành công! ID phiếu: ${docRef.id}`);
            resetForm();
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
            resetForm();
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
                    onSave={(expiry) => handleNewLotDeclared(newLotModal.index, expiry)}
                />
            )}

            <h1>Tạo Phiếu Nhập Kho</h1>
            <div className="form-section">
                <div className="form-row">
                    <div className="form-group">
                        <label>Ngày nhập</label>
                        <input type="text" value={importDate} readOnly style={{backgroundColor: '#f0f0f0'}} />
                    </div>
                    <div className="form-group">
                         <label>Mã Nhà Cung Cấp (*)</label>
                        <input 
                            list="suppliers-list"
                            type="text" 
                            placeholder="Nhập hoặc chọn mã NCC..." 
                            value={supplierId} 
                            onChange={e => setSupplierId(e.target.value)}
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
                                ref={el => inputRefs.current[index * 3] = el}
                                onKeyDown={(e) => handleKeyDown(e, index, 0)}
                                type="text"
                                value={item.productId}
                                onChange={e => handleItemChange(index, 'productId', e.target.value.toUpperCase())}
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
                                 ref={el => inputRefs.current[index * 3 + 1] = el}
                                onKeyDown={(e) => handleKeyDown(e, index, 1)}
                                type="text"
                                 value={item.lotNumber}
                                onChange={e => handleItemChange(index, 'lotNumber', e.target.value)}
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
                                onChange={e => handleItemChange(index, 'expiryDate', e.target.value)} 
                                onBlur={e => handleExpiryDateBlur(index, e.target.value)}
                                 readOnly={item.lotStatus === 'exists'}
                                style={{backgroundColor: item.lotStatus === 'exists' ? '#f0f0f0' : '#fff', cursor: item.lotStatus === 'exists' ? 'not-allowed' : 'text'}}
                            />
                        </div>
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
                <button onClick={promptForDirectImport} className="btn-primary" disabled={isSaving}>
                    {isSaving ? 'Đang xử lý...' : 'Nhập Kho Trực Tiếp'}
                </button>
            </div>
        </div>
    );
};

export default NewImportPage;