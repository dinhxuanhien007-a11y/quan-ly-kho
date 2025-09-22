// src/pages/NewExportPage.jsx
import { formatNumber, parseFormattedNumber } from '../utils/numberUtils';
import ProductAutocomplete from '../components/ProductAutocomplete';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { FiXCircle, FiChevronDown, FiAlertCircle } from 'react-icons/fi';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import { z } from 'zod';
import useExportSlipStore from '../stores/exportSlipStore';

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
    const {
        customerId, customerName, description, items,
        setCustomer, setDescription, addNewItemRow, removeItemRow, updateItem,
        replaceItem, resetSlip
    } = useExportSlipStore();

    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [allCustomers, setAllCustomers] = useState([]);
    
    const lotSelectRefs = useRef([]);
    const quantityInputRefs = useRef([]);
    const lastInputRef = useRef(null);

    const isSlipValid = useMemo(() => {
        // Kiểm tra xem cả customerId và customerName đều không rỗng
        const hasCustomer = customerId.trim() !== '' && customerName.trim() !== '';
        // Kiểm tra có ít nhất một item với đầy đủ productId, selectedLotId và quantityToExport > 0
        const hasValidItem = items.some(
            item => item.productId && item.selectedLotId && Number(item.quantityToExport) > 0
        );
        return hasCustomer && hasValidItem;
    }, [customerId, customerName, items]);

    useEffect(() => {
        if (lastInputRef.current) {
            lastInputRef.current.focus();
        }
    }, [items.length]);

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
            setCustomer(customerId, '');
            return;
        }
        try {
            const partnerRef = doc(db, 'partners', customerId.toUpperCase());
            const partnerSnap = await getDoc(partnerRef);
            if (partnerSnap.exists() && partnerSnap.data().partnerType === 'customer') {
                setCustomer(customerId, partnerSnap.data().partnerName);
            } else {
                setCustomer(customerId, '');
                toast.error(`Không tìm thấy Khách hàng với mã "${customerId}"`);
            }
        } catch (error) {
            console.error("Lỗi khi tìm khách hàng:", error);
            setCustomer(customerId, '');
        }
    };

    const handleProductSearch = async (index, productOrId) => {
    if (!productOrId) return;

    // Reset thông tin dòng hiện tại trước khi tìm kiếm
    replaceItem(index, { productName: '', unit: '', packaging: '', storageTemp: '', availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '', expiryDate: '', quantityRemaining: 0, isOutOfStock: false });
    
    let productData;
    let productIdToSearch;

    if (typeof productOrId === 'object' && productOrId !== null) {
        // Trường hợp 1: Người dùng chọn từ autocomplete
        productData = productOrId;
        productIdToSearch = productOrId.id;
        updateItem(index, 'productId', productIdToSearch); // Cập nhật mã hàng vào state
    } else {
        // Trường hợp 2: Người dùng gõ tay
        productIdToSearch = String(productOrId).trim().toUpperCase();
        if (!productIdToSearch) return;
        
        const productRef = doc(db, 'products', productIdToSearch);
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
            toast.warn(`Không tìm thấy sản phẩm với mã: ${productIdToSearch}`);
            return;
        }
        productData = { id: productSnap.id, ...productSnap.data() };
    }

    // Cập nhật thông tin sản phẩm vào dòng
    replaceItem(index, {
        productName: productData.productName,
        unit: productData.unit,
        packaging: productData.packaging,
        storageTemp: productData.storageTemp,
    });

    try {
        // Tìm các lô hàng có sẵn
        const lotsQuery = query(collection(db, 'inventory_lots'), where("productId", "==", productIdToSearch), where("quantityRemaining", ">", 0));
        const lotsSnapshot = await getDocs(lotsQuery);

        if (lotsSnapshot.empty) {
            updateItem(index, 'isOutOfStock', true);
        } else {
            const foundLots = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            foundLots.sort((a, b) => {
    const aHasExpiry = a.expiryDate && a.expiryDate.toDate;
    const bHasExpiry = b.expiryDate && b.expiryDate.toDate;

    // Nếu cả hai đều không có HSD, coi như bằng nhau
    if (!aHasExpiry && !bHasExpiry) return 0;
    // Lô không có HSD luôn xếp sau lô có HSD (ưu tiên xuất lô có HSD trước)
    if (!aHasExpiry) return 1;
    if (!bHasExpiry) return -1;
    // Sắp xếp bình thường nếu cả hai đều có HSD
    return a.expiryDate.toDate() - b.expiryDate.toDate();
});
            
            replaceItem(index, {
                availableLots: foundLots,
                isOutOfStock: false,
            });
            setTimeout(() => lotSelectRefs.current[index]?.focus(), 0);
        }
    } catch (error) {
        console.error("Lỗi khi tìm kiếm lô hàng:", error);
        toast.error("Đã có lỗi xảy ra khi tìm kiếm lô hàng.");
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
                removeItemRow(index);
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
            resetSlip();
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
            resetSlip();
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
            <div className="item-details-grid" style={{ gridTemplateColumns: '1.5fr 2.5fr 2fr 1.2fr 0.8fr 1.5fr 1fr 1.5fr 1.5fr 0.5fr' }}>
                <div className="grid-header">Mã hàng (*)</div>
                <div className="grid-header">Tên hàng</div>
                <div className="grid-header">Số lô (*)</div>
                <div className="grid-header">HSD (*)</div>
                <div className="grid-header">ĐVT</div>
                <div className="grid-header">Quy cách</div>
                <div className="grid-header">SL Xuất (*)</div>
                <div className="grid-header">Ghi chú</div>
                <div className="grid-header">Nhiệt độ BQ</div>
                <div className="grid-header">Xóa</div>

                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
    {/* THAY THẾ TOÀN BỘ CÁC Ô DỮ LIỆU CŨ BẰNG KHỐI NÀY */}
    <div className="grid-cell">
        <ProductAutocomplete
            value={item.productId}
            onChange={(value) => updateItem(index, 'productId', value.toUpperCase())}
            onSelect={(product) => handleProductSearch(index, product)}
            onBlur={() => handleProductSearch(index, item.productId)}
        />
    </div>
    <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
    <div className="grid-cell" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        {item.isOutOfStock ? (
            <div className="inline-warning"><FiAlertCircle /><span>Sản phẩm đã hết hàng!</span></div>
        ) : item.selectedLotId ? (
            <div className="selected-lot-view">
                <input type="text" value={item.displayLotText} readOnly className="selected-lot-input" />
                <button type="button" onClick={() => handleLotSelection(index, '')} className="change-lot-btn"><FiChevronDown /></button>
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
        {`Lô: ${lot.lotNumber} | HSD: ${formatDate(lot.expiryDate)} | Tồn: ${formatNumber(lot.quantityRemaining)}`}
    </option>
))}
            </select>
        )}
    </div>
    {/* Ô HSD ĐÃ ĐƯỢC THÊM LẠI */}
    <div className="grid-cell"><input type="text" value={item.expiryDate} readOnly /></div>
    <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
    <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
    <div className="grid-cell">
    <input 
        type="text" // Đổi sang "text"
        inputMode="numeric" // Gợi ý bàn phím số trên di động
        value={formatNumber(item.quantityToExport)}
        ref={el => quantityInputRefs.current[index] = el}
        onChange={e => {
            const numericValue = parseFormattedNumber(e.target.value);
            if (/^\d*$/.test(numericValue)) {
                updateItem(index, 'quantityToExport', numericValue);
            }
        }} 
    />
</div>
    <div className="grid-cell"><textarea value={item.notes || ''} onChange={e => updateItem(index, 'notes', e.target.value)} /></div>
    <div className="grid-cell"><input type="text" value={item.storageTemp} readOnly /></div>
    <div className="grid-cell">
        <button type="button" className="btn-icon btn-delete" onClick={() => handleRemoveRowWithConfirmation(index)}><FiXCircle /></button>
    </div>
</React.Fragment>
                ))}
            </div>
            <button onClick={addNewItemRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
            <div className="page-actions">
                <button 
                    onClick={handleSaveDraft} 
                    className="btn-secondary" 
                    disabled={isProcessing || !isSlipValid}
                >
                    {isProcessing ? 'Đang xử lý...' : 'Lưu Nháp'}
                </button>
                <button 
                    onClick={promptForDirectExport} 
                    className="btn-primary" 
                    disabled={isProcessing || !isSlipValid}
                >
                    {isProcessing ? 'Đang xử lý...' : 'Xuất Kho Trực Tiếp'}
                </button>
            </div>
        </div>
    );
};

export default NewExportPage;