// src/pages/NewImportPage.jsx
import { formatNumber, parseFormattedNumber } from '../utils/numberUtils';
import ProductAutocomplete from '../components/ProductAutocomplete';
import SupplierAutocomplete from '../components/SupplierAutocomplete';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc, collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs } from 'firebase/firestore';
import AddNewProductAndLotModal from '../components/AddNewProductAndLotModal';
import AddNewLotModal from '../components/AddNewLotModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { parseDateString, formatExpiryDate, formatDate } from '../utils/dateUtils';
import { FiInfo, FiXCircle } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { z } from 'zod';
import useImportSlipStore from '../stores/importSlipStore';

// --- PHẦN SCHEMAS GIỮ NGUYÊN ---
const importItemSchema = z.object({
  id: z.number(),
  productId: z.string().min(1, "Mã hàng không được để trống."),
  productName: z.string(),
  unit: z.string(),
  packaging: z.string(),
  storageTemp: z.string(),
  team: z.string(),
  manufacturer: z.string(),
  notes: z.string(),
  lotNumber: z.string().nullable(),
  quantity: z.preprocess(
      val => Number(val),
      z.number({ invalid_type_error: "Số lượng phải là một con số." })
       .gt(0, { message: "Số lượng phải lớn hơn 0." })
  ),
  expiryDate: z.string().refine(val => {
      const trimmedVal = val.trim();
      return trimmedVal === '' || trimmedVal.toUpperCase() === 'N/A' || parseDateString(trimmedVal) !== null;
  }, {
      message: "Hạn sử dụng không hợp lệ (cần định dạng dd/mm/yyyy hoặc để trống)."
  }),
});

const importSlipSchema = z.object({
    supplierId: z.string().min(1, "Mã nhà cung cấp không được để trống."),
    supplierName: z.string().min(1, "Không tìm thấy tên nhà cung cấp."),
    items: z.array(importItemSchema).min(1, "Phiếu nhập phải có ít nhất một mặt hàng hợp lệ.")
});


const NewImportPage = () => {
    const {
        supplierId, supplierName, description, items, importDate,
        setSupplier, setDescription, setImportDate, addNewItemRow, updateItem,
        handleProductSearchResult, handleLotCheckResult, declareNewLot,
        fillNewProductData, resetSlip, removeItemRow
    } = useImportSlipStore();

    const [isSaving, setIsSaving] = useState(false);
    const [newProductModal, setNewProductModal] = useState({ isOpen: false, productId: '', index: -1 });
    const [newLotModal, setNewLotModal] = useState({ isOpen: false, index: -1 });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [focusedInputIndex, setFocusedInputIndex] = useState(null);

    const productInputRefs = useRef([]);
    const lotNumberInputRefs = useRef([]);
    const quantityInputRefs = useRef([]);
    const addRowButtonRef = useRef(null);
    const prevItemsLength = useRef(items.length);

    useEffect(() => {
        if (items.length > prevItemsLength.current) {
            const lastIndex = items.length - 1;
            if (productInputRefs.current[lastIndex]) {
                productInputRefs.current[lastIndex].focus();
            }
        }
        prevItemsLength.current = items.length;
    }, [items.length]);

    
    const isSlipValid = useMemo(() => {
        const hasSupplier = supplierId.trim() !== '' && supplierName.trim() !== '';
        const hasValidItem = items.some(
            item => item.productId && Number(item.quantity) > 0
        );
        return hasSupplier && hasValidItem;
    }, [supplierId, supplierName, items]);

    const disabledReason = useMemo(() => {
        if (isSlipValid) return '';
        if (!supplierId.trim() || !supplierName.trim()) {
            return 'Vui lòng chọn Nhà Cung Cấp.';
        }
        if (!items.some(item => item.productId && Number(item.quantity) > 0)) {
            return 'Vui lòng thêm ít nhất một sản phẩm với số lượng hợp lệ.';
        }
        return 'Vui lòng điền đầy đủ thông tin bắt buộc (*).';
    }, [isSlipValid, supplierId, supplierName, items]);

    const handleRemoveRow = (index) => {
        if (items.length <= 1) return;
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xóa dòng?",
            message: "Bạn có chắc chắn muốn xóa dòng hàng này khỏi phiếu nhập không?",
            onConfirm: () => {
                removeItemRow(index);
                setConfirmModal({ isOpen: false });
            }
        });
    };

    const getValidSlipData = () => {
        const validItems = items.filter(item => 
            item.productId && item.quantity
        ).map(item => ({
            ...item,
            lotNumber: item.lotNumber.trim() || null
        }));

        if (validItems.length === 0) {
            toast.warn("Phiếu nhập phải có ít nhất một mặt hàng hợp lệ.");
            return null;
        }

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
            importDate: formatDate(new Date(importDate)),
            description,
            productIds: Array.from(new Set(validationResult.data.items.map(item => item.productId))),
            status: '',
            createdAt: serverTimestamp()
        };
    }
    
    const handleSupplierSearch = async (idToSearch = supplierId) => {
        if (!idToSearch) {
            setSupplier(idToSearch, '');
            return;
        }
        try {
            const partnerRef = doc(db, 'partners', idToSearch.toUpperCase());
            const partnerSnap = await getDoc(partnerRef);
            
            if (partnerSnap.exists() && partnerSnap.data().partnerType === 'supplier') {
                setSupplier(idToSearch, partnerSnap.data().partnerName);
            } else {
                setSupplier(idToSearch, '');
                toast.error(`Không tìm thấy Nhà cung cấp với mã "${idToSearch}"`);
            }
        } catch (error) {
            console.error("Lỗi khi tìm nhà cung cấp:", error);
            toast.error("Không thể đọc dữ liệu NCC. Kiểm tra Console (F12)!"); 
            setSupplier(idToSearch, '');
        }
    };
    
    const handleExpiryDateBlur = (index, value) => {
        const formattedValue = formatExpiryDate(value);
        updateItem(index, 'expiryDate', formattedValue);

        if (!formattedValue || formattedValue.toUpperCase() === 'N/A') {
            return;
        }

        const expiryDateObject = parseDateString(formattedValue);

        if (expiryDateObject) {
            const today = new Date();
            today.setHours(0, 0, 0, 0); 
            if (expiryDateObject < today) {
                toast.warn(`Cảnh báo: Hạn sử dụng "${formattedValue}" của mặt hàng ở dòng ${index + 1} đã ở trong quá khứ.`);
            }
        }
    };

    // --- BẮT ĐẦU THAY ĐỔI: Cập nhật hàm checkExistingLot ---
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
                // Lấy dữ liệu của lần nhập đầu tiên để có HSD
                const baseLotData = querySnapshot.docs[0].data();
                
                // Cộng dồn số lượng tồn từ TẤT CẢ các lần nhập
                let totalQuantityRemaining = 0;
                querySnapshot.forEach(doc => {
                    totalQuantityRemaining += doc.data().quantityRemaining;
                });

                // Tạo một đối tượng dữ liệu tổng hợp
                const aggregatedLotData = {
                    ...baseLotData,
                    quantityRemaining: totalQuantityRemaining
                };
                
                handleLotCheckResult(index, aggregatedLotData, true);
                setTimeout(() => quantityInputRefs.current[index]?.focus(), 0);
            } else {
                handleLotCheckResult(index, null, false);
                setNewLotModal({ isOpen: true, index: index });
            }
        } catch (error) {
            console.error("Lỗi khi kiểm tra lô tồn tại: ", error);
        }
    };
    // --- KẾT THÚC THAY ĐỔI ---

    const handleProductSearch = async (index, productOrId) => {
        if (!productOrId) return;

        let productData = null;
        if (typeof productOrId === 'object' && productOrId !== null) {
            productData = productOrId;
        } else {
            const productId = String(productOrId).trim().toUpperCase();
            if (!productId) return;
            try {
                const productRef = doc(db, 'products', productId);
                const productSnap = await getDoc(productRef);
                if (productSnap.exists()) {
                    productData = { id: productSnap.id, ...productSnap.data() };
                }
            } catch (error) {
                console.error("Lỗi khi tìm kiếm sản phẩm:", error);
                toast.error("Lỗi khi tìm kiếm sản phẩm!");
            }
        }

        handleProductSearchResult(index, productData, !!productData);
        if (productData) {
            updateItem(index, 'productId', productData.id);
            setTimeout(() => lotNumberInputRefs.current[index]?.focus(), 0);
        }
    };

    const handleNewLotDeclared = (expiry) => {
        const { index } = newLotModal;
        declareNewLot(index, expiry);
        setNewLotModal({ isOpen: false, index: -1 });
        setTimeout(() => quantityInputRefs.current[index]?.focus(), 0);
    };

    const handleLotNumberKeyDown = (e, index) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.target.blur(); 
        }
    };

    const handleQuantityKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addRowButtonRef.current?.focus();
        }
    };

    const handleNewProductCreated = (newData) => {
        const { index } = newProductModal;
        fillNewProductData(index, newData);
        setNewProductModal({ isOpen: false, productId: '', index: -1 });
    };

    const handleSaveSlip = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;

        setIsSaving(true);
        try {
            const finalSlipData = { ...slipData, status: 'pending' };
            const docRef = await addDoc(collection(db, 'import_tickets'), finalSlipData);
            toast.success(`Lưu tạm phiếu nhập thành công! ID phiếu: ${docRef.id}`);
            resetSlip();
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
                const expiryDateObj = parseDateString(item.expiryDate);
                const expiryTimestamp = expiryDateObj ? Timestamp.fromDate(expiryDateObj) : null;
                
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
                    manufacturer: item.manufacturer,
                    quantityImported: Number(item.quantity),
                    quantityRemaining: Number(item.quantity),
                    notes: item.notes,
                    supplierName: slipData.supplierName,
                };
                await addDoc(collection(db, "inventory_lots"), newLotData);
            }
            
            const finalSlipData = { ...slipData, status: 'completed' };
            await addDoc(collection(db, 'import_tickets'), finalSlipData);
            
            toast.success('Nhập kho trực tiếp thành công!');
            resetSlip();
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
                    onSave={handleNewLotDeclared}
                />
            )}

            <h1>Tạo Phiếu Nhập Kho</h1>
            <div className="form-section">
                <div className="form-row">
                    <div className="form-group">
                        <label>Ngày nhập</label>
                        <input 
                            type="text" 
                            value={formatDate(new Date())} 
                            readOnly 
                            style={{backgroundColor: '#f0f0f0'}} 
                        />
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                        <label>Nhà Cung Cấp (*)</label>
                        <SupplierAutocomplete
                            value={supplierName || supplierId}
                            onSelect={({ id, name }) => {
                                setSupplier(id, name);
                                if (!id && name) { 
                                    setSupplier(name, '');
                                }
                            }}
                            onBlur={() => {
                                if (!supplierId && supplierName) {
                                    handleSupplierSearch(supplierName);
                                }
                            }}
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label>Diễn giải</label>
                    <textarea rows="2" placeholder="Ghi chú cho phiếu nhập..." value={description} onChange={e => setDescription(e.target.value)}></textarea>
                </div>
            </div>

            <h2>Chi tiết hàng hóa</h2>
            <div className="item-details-grid" style={{ gridTemplateColumns: '1.2fr 2fr 1.1fr 1.2fr 0.8fr 1.5fr 1fr 1.5fr 1fr 0.5fr' }}>
                <div className="grid-header">Mã hàng (*)</div>
                <div className="grid-header">Tên hàng</div>
                <div className="grid-header">Số lô</div>
                <div className="grid-header">HSD</div>
                <div className="grid-header">ĐVT</div>
                <div className="grid-header">Quy cách</div>
                <div className="grid-header">Số lượng (*)</div>
                <div className="grid-header">Ghi chú</div>
                <div className="grid-header">Team</div>
                <div className="grid-header">Xóa</div>

                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        <div className="grid-cell" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                            <ProductAutocomplete
                                ref={el => productInputRefs.current[index] = el}
                                value={item.productId}
                                onChange={(value) => updateItem(index, 'productId', value.toUpperCase())}
                                onSelect={(product) => handleProductSearch(index, product)}
                                onBlur={() => handleProductSearch(index, item.productId)}
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
                                ref={el => lotNumberInputRefs.current[index] = el}
                                type="text"
                                value={item.lotNumber}
                                onChange={e => updateItem(index, 'lotNumber', e.target.value)}
                                onBlur={() => checkExistingLot(index)}
                                onKeyDown={e => handleLotNumberKeyDown(e, index)}
                            />
                            {item.lotStatus === 'exists' && item.existingLotInfo && (
                                <div className="existing-lot-info">
                                    <FiInfo />
                                    <span>Lô đã có | Tồn: {formatNumber(item.existingLotInfo.quantityRemaining)} | HSD: {item.existingLotInfo.expiryDate}</span>
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
                                ref={el => quantityInputRefs.current[index] = el}
                                type="text"
                                inputMode="numeric"
                                value={focusedInputIndex === index ? item.quantity : formatNumber(item.quantity)}
                                onFocus={() => setFocusedInputIndex(index)}
                                onBlur={() => setFocusedInputIndex(null)}
                                onKeyDown={handleQuantityKeyDown}
                                onChange={e => {
                                    const rawValue = e.target.value;
                                    const parsedValue = rawValue.replace(',', '.');
                                    if (/^\d*\.?\d*$/.test(parsedValue) || parsedValue === '') {
                                        updateItem(index, 'quantity', parsedValue);
                                    }
                                }}
                            />
                        </div>
                        <div className="grid-cell"><textarea value={item.notes} onChange={e => updateItem(index, 'notes', e.target.value)} /></div>
                        <div className="grid-cell"><input type="text" value={item.team} readOnly /></div>
                        <div className="grid-cell">
                            <button 
                                type="button" 
                                className="btn-icon btn-delete" 
                                onClick={() => handleRemoveRow(index)}
                                title="Xóa dòng này"
                            >
                                <FiXCircle />
                            </button>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            <button ref={addRowButtonRef} onClick={addNewItemRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
            
            <div className="page-actions">
                <button 
                    onClick={handleSaveSlip} 
                    className="btn-secondary" 
                    disabled={isSaving || !isSlipValid}
                    title={!isSlipValid ? disabledReason : 'Lưu phiếu dưới dạng bản nháp'}
                >
                    {isSaving ? 'Đang lưu...' : 'Lưu Tạm'}
                </button>
                
                <button 
                    onClick={promptForDirectImport} 
                    className="btn-primary" 
                    disabled={isSaving || !isSlipValid}
                    title={!isSlipValid ? disabledReason : 'Nhập hàng và cập nhật tồn kho ngay lập tức'}
                >
                    {isSaving ? 'Đang xử lý...' : 'Nhập Kho Trực Tiếp'}
                </button>
            </div>
        </div>
    );
};

export default NewImportPage;