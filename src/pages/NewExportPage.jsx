// src/pages/NewExportPage.jsx (Thay thế toàn bộ nội dung file)

import { formatNumber, parseFormattedNumber, calculateCaseCount } from '../utils/numberUtils'; // <-- THÊM calculateCaseCount
import ProductAutocomplete from '../components/ProductAutocomplete';
import CustomerAutocomplete from '../components/CustomerAutocomplete';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore'; // THÊM writeBatch
import { FiXCircle, FiChevronDown, FiAlertCircle } from 'react-icons/fi';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate, getExpiryStatusPrefix } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import { z } from 'zod';
import useExportSlipStore from '../stores/exportSlipStore';

// src/pages/NewExportPage.jsx (Thêm hàm này dưới các import)

/**
 * Xác định đơn vị cần hiển thị khi quy đổi.
 * @param {string} packagingStr - Chuỗi quy cách.
 * @param {string} currentUnit - ĐVT hiện tại của item.
 * @returns {string} - Đơn vị quy đổi (vd: Lọ, Thùng, Test).
 */
// src/pages/NewExportPage.jsx (Áp dụng tương tự cho NewImportPage.jsx)
// Thay thế hàm getTargetUnit

const getTargetUnit = (packagingStr, currentUnit) => {
    if (!packagingStr || !currentUnit) return 'Đơn vị';
    const lowerUnit = currentUnit.toLowerCase().trim();

    // --- QUY TẮC NHẮM MỤC TIÊU: LỌ/HỘP ---
    // Xử lý mã 246001 và các mã Hộp tương tự: Luôn ưu tiên Lọ hơn mL/G.
    if (lowerUnit === 'hộp') {
        // Cố gắng tìm đơn vị đếm (Lọ, Test, Cái)
        const countMatch = packagingStr.match(/(\d+(\.\d+)?)\s*(Test|Lọ|Cái|Ống|Bộ|Gói)\s*\//i);
        if (countMatch && countMatch[3]) {
            return countMatch[3].trim(); // Trả về Lọ (hoặc Test)
        }
    }
    // ----------------------------------------
    
    // --- LOGIC GỐC (Áp dụng cho các mã Thùng/Lít/Khay) ---
    if (lowerUnit === 'hộp' || lowerUnit === 'lọ' || lowerUnit === 'thùng' || lowerUnit === 'khay') { 
        
        // 1. Ưu tiên tìm đơn vị THỂ TÍCH/KHỐI LƯỢNG (Lít, mL, G)
        const volumeUnitMatch = packagingStr.match(/(\d+(\.\d+)?)\s*(Lít|mL|G|µg)\s*\//i);
        if (volumeUnitMatch && volumeUnitMatch[3]) {
             return volumeUnitMatch[3].trim(); 
        }

        // 2. Nếu không phải thể tích, ưu tiên tìm đơn vị ĐẾM (Lọ, Test, Cái)
        const countMatch = packagingStr.match(/(\d+(\.\d+)?)\s*(Test|Lọ|Cái|Ống|Bộ|Gói)\s*\//i);
        if (countMatch && countMatch[3]) {
            return countMatch[3].trim();
        }
        
        return 'Đơn vị'; 
    }

    // ... (Logic phép Chia giữ nguyên)
    const largeUnitMatch = packagingStr.match(/\/ (Hộp|Thùng|Can|Kiện|Lọ|Bộ|Gói|Khay)$/i);
    if (largeUnitMatch) {
        return largeUnitMatch[1].trim();
    }
    
    return 'Thùng'; 
}

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
    // Lấy state và actions từ store
    const {
        customerId, customerName, description, items,
        setCustomer, setDescription, addNewItemRow, removeItemRow, updateItem,
        replaceItem, handleProductSearchResult, resetSlip
    } = useExportSlipStore();

    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [focusedInputIndex, setFocusedInputIndex] = useState(null);
    const hasSelectedProduct = useRef(false);

    // Refs cho các element cần focus
    const lotSelectRefs = useRef([]);
    const quantityInputRefs = useRef([]);
    const addRowButtonRef = useRef(null);
    const productInputRefs = useRef([]);
    const prevItemsLength = useRef(items.length);

    // useEffect để tự động focus vào dòng mới
    useEffect(() => {
        // Nếu số lượng dòng tăng lên (tức là vừa thêm dòng mới)
        if (items.length > prevItemsLength.current) {
            const lastIndex = items.length - 1;
            // Focus vào ô mã hàng của dòng mới nhất
            if (productInputRefs.current[lastIndex]) {
                productInputRefs.current[lastIndex].focus();
            }
        }
        // Cập nhật lại số lượng dòng cũ
        prevItemsLength.current = items.length;
    }, [items.length]);

    const isSlipValid = useMemo(() => {
        const hasCustomer = customerId.trim() !== '' && customerName.trim() !== '';
        const hasValidItem = items.some(
            item => item.productId && item.selectedLotId && Number(item.quantityToExport) > 0
        );
        return hasCustomer && hasValidItem;
    }, [customerId, customerName, items]);

    const disabledReason = useMemo(() => {
        if (isSlipValid) return '';
        if (!customerId.trim() || !customerName.trim()) {
            return 'Vui lòng chọn Khách Hàng.';
        }
        if (!items.some(item => item.productId && item.selectedLotId && Number(item.quantityToExport) > 0)) {
            return 'Vui lòng thêm ít nhất một sản phẩm hợp lệ (đã chọn lô và có số lượng).';
        }
        
        return 'Vui lòng điền đầy đủ thông tin bắt buộc (*).';
    }, [isSlipValid, customerId, customerName, items]);

    const handleCustomerSearch = async (idToSearch) => { 
        if (!idToSearch) {
            setCustomer(idToSearch, '');
            return;
        }
        try {
            const partnerRef = doc(db, 'partners', idToSearch.toUpperCase()); 
            const partnerSnap = await getDoc(partnerRef);
            if (partnerSnap.exists() && partnerSnap.data().partnerType === 'customer') {
                setCustomer(idToSearch, partnerSnap.data().partnerName);
            } else {
                setCustomer(idToSearch, '');
                toast.error(`Không tìm thấy Khách hàng với mã "${idToSearch}"`);
            }
        } catch (error) {
            console.error("Lỗi khi tìm khách hàng:", error);
            setCustomer(idToSearch, '');
        }
    };

    const handleProductSearch = async (index, productOrId) => {
        const findProductData = async () => {
            if (!productOrId) return null;
            if (typeof productOrId === 'object' && productOrId !== null) return productOrId;
            const productId = String(productOrId).trim().toUpperCase();
            if (!productId) return null;
            try {
                const productRef = doc(db, 'products', productId);
                const productSnap = await getDoc(productRef);
                if (productSnap.exists()) return { id: productSnap.id, ...productSnap.data() };
                toast.warn(`Không tìm thấy sản phẩm với mã: ${productId}`);
                return null;
            } catch (error) {
                console.error("Lỗi khi tìm sản phẩm:", error);
                toast.error("Đã xảy ra lỗi khi tìm kiếm sản phẩm.");
                return null;
            }
        };
        const productData = await findProductData();
        await handleProductSearchResult(index, productData);
        if (lotSelectRefs.current[index]) {
            lotSelectRefs.current[index].focus();
        }
    };
    
    // src/pages/NewExportPage.jsx (Thay thế hàm handleLotSelection)

const handleLotSelection = (index, selectedLotId) => {
    const currentItem = items[index];
    const selectedAggregatedLot = currentItem.availableLots.find(lot => lot.id === selectedLotId);
    
    if (selectedAggregatedLot) {
        // LƯU Ý: Trường quantityRemaining (trong store) được dùng để TÍNH TỒN CUỐI.
        // NHƯNG CHÚNG TA ĐANG SỬ DỤNG quantityAvailableForExport (trong hàm getValidSlipData) ĐỂ KIỂM TRA.
        // Cả hai trường này phải được gán TỒN KHẢ DỤNG.
        
        replaceItem(index, {
            selectedLotId: selectedLotId, lotNumber: selectedAggregatedLot.lotNumber,
            expiryDate: selectedAggregatedLot.expiryDate ? formatDate(selectedAggregatedLot.expiryDate) : '',
            
            // THAY ĐỔI CỐT LÕI TẠI ĐÂY:
            // 1. Gán TỒN KHẢ DỤNG (availableQty) vào trường kiểm tra giới hạn
            quantityAvailableForExport: selectedAggregatedLot.availableQty, 
            
            // 2. Gán TỒN KHẢ DỤNG (availableQty) vào trường quantityRemaining 
            //    (đây là trường được dùng trong logic cũ để hiển thị TỒN KHO)
            //    Chúng ta cần đảm bảo nó mang giá trị 60 (Tồn khả dụng) chứ không phải 66 (Tồn thực)
            quantityRemaining: selectedAggregatedLot.availableQty, 
            
            displayLotText: selectedAggregatedLot.lotNumber || '(Trống)',
            unit: selectedAggregatedLot.unit || '', packaging: selectedAggregatedLot.packaging || '',
            storageTemp: selectedAggregatedLot.storageTemp || '',
        });

        // Tự động focus vào ô số lượng
        setTimeout(() => {
            if (quantityInputRefs.current[index]) {
                quantityInputRefs.current[index].focus();
            }
        }, 0); 

    } else {
        // RESET VỀ 0
        replaceItem(index, { selectedLotId: '', lotNumber: '', expiryDate: '', quantityAvailableForExport: 0, quantityRemaining: 0, displayLotText: '' });
    }
};

    const handleQuantityKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            if (addRowButtonRef.current) {
                addRowButtonRef.current.focus(); 
            }
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
    const formattedDate = formatDate(new Date());
    // Sửa lỗi Validation Tồn kho Khả dụng
    const validItemsInput = items.filter(item => {
        const qty = Number(item.quantityToExport);
        // THAY ĐỔI TẠI ĐÂY: Lấy Tồn khả dụng đã tính toán từ Store
        const available = item.quantityAvailableForExport;
        
        // CHỈ KIỂM TRA NẾU ĐÃ CHỌN LÔ (để tránh lỗi khi ô còn trống)
        if (item.productId && item.selectedLotId) {
            // Lỗi nghiệp vụ quan trọng: Chặn xuất nếu vượt quá Tồn khả dụng
            if (qty > available) {
                toast.warn(`Lỗi: SL xuất (${formatNumber(qty)}) vượt quá tồn khả dụng (${formatNumber(available)}) của lô hàng.`);
                return false; // Loại bỏ mục này khỏi phiếu và dừng quá trình
            }
            return qty > 0;
        }
        return false;
    });

        if (validItemsInput.length === 0) {
            toast.warn("Phiếu xuất phải có ít nhất một mặt hàng hợp lệ.");
            return null;
        }

        const finalItems = [];
        let allProductIds = new Set();

        for (const item of validItemsInput) {
            let quantityToDistribute = Number(item.quantityToExport);
            const selectedAggregatedLot = item.availableLots.find(lot => lot.id === item.selectedLotId);

            if (!selectedAggregatedLot || quantityToDistribute <= 0) continue;

            const originalLotsSorted = selectedAggregatedLot.originalLots.sort((a, b) => (a.expiryDate?.toDate() || 0) - (b.expiryDate?.toDate() || 0));

            for (const originalLot of originalLotsSorted) {
                if (quantityToDistribute <= 0) break;
                // Sửa lỗi: Lượng khả dụng của lô gốc = Tồn thực - Đặt giữ hiện tại
                const originalLotAvailableQty = originalLot.quantityRemaining - (originalLot.quantityAllocated || 0);

                const quantityFromThisLot = Math.min(quantityToDistribute, originalLotAvailableQty); // Sử dụng AVAILABLE QTY
                
                finalItems.push({
                    productId: item.productId,
                    productName: item.productName,
                    lotId: originalLot.id,
                    lotNumber: originalLot.lotNumber,
                    expiryDate: originalLot.expiryDate ? formatDate(originalLot.expiryDate) : '',
                    unit: item.unit,
                    packaging: item.packaging,
                    storageTemp: item.storageTemp || '',
                    team: item.team,
                    quantityToExport: quantityFromThisLot,
                    notes: item.notes || ''
                });
                quantityToDistribute -= quantityFromThisLot;
            }
            
            allProductIds.add(item.productId);
        }

        if(finalItems.length === 0){
            toast.warn("Không có mặt hàng nào hợp lệ để xuất.");
            return null;
        }

        return {
            exportDate: formattedDate, 
            customerId: customerId.toUpperCase(), 
            customer: customerName,
            description, 
            items: finalItems, 
            productIds: Array.from(allProductIds),
            createdAt: serverTimestamp()
        };
    };
    
    const handleSaveDraft = async () => {
        const slipData = getValidSlipData();
        if (!slipData) return;
        setIsProcessing(true);
        
        try {
            const batch = writeBatch(db); // Dùng Batch Writes
            
            // 1. Đặt giữ các lô hàng (Soft Lock)
            for (const item of slipData.items) {
                const lotRef = doc(db, 'inventory_lots', item.lotId);
                const lotSnap = await getDoc(lotRef); 
                if (lotSnap.exists()) {
                    const currentAllocated = lotSnap.data().quantityAllocated || 0;
                    const newAllocated = currentAllocated + item.quantityToExport;

                    batch.update(lotRef, { 
                        quantityAllocated: newAllocated // Tăng lượng đặt giữ
                    });
                }
            }

            // 2. Lưu phiếu xuất nháp
            const slipRef = doc(collection(db, 'export_tickets'));
            batch.set(slipRef, { ...slipData, status: 'pending' });

            await batch.commit(); // Ghi tất cả một lần

            toast.success('Lưu nháp phiếu xuất thành công và đặt giữ tồn kho!');
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
            const batch = writeBatch(db); // Dùng Batch Writes

            // 1. Trừ tồn kho thực tế VÀ giải phóng đặt giữ
            for (const item of slipData.items) {
                const lotRef = doc(db, 'inventory_lots', item.lotId);
                const lotSnap = await getDoc(lotRef);
                if(lotSnap.exists()){
                    const currentRemaining = lotSnap.data().quantityRemaining;
                    const currentAllocated = lotSnap.data().quantityAllocated || 0;
                    
                    const newQuantityRemaining = currentRemaining - item.quantityToExport; // Trừ tồn kho thực tế
                    
                    // Nếu lô hàng này đã được đặt giữ trước đó, giải phóng phần đó (Đặt giữ luôn phải >= 0)
                    const newAllocated = Math.max(0, currentAllocated - item.quantityToExport); 

                    batch.update(lotRef, { 
                        quantityRemaining: newQuantityRemaining,
                        quantityAllocated: newAllocated // Giải phóng đặt giữ
                    });
                }
            }

            // 2. Lưu phiếu xuất chính thức
            const slipRef = doc(collection(db, 'export_tickets'));
            batch.set(slipRef, { ...slipData, status: 'completed' });

            await batch.commit(); // Ghi tất cả một lần

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
                        <input 
                            type="text" 
                            value={formatDate(new Date())} 
                            readOnly 
                            style={{backgroundColor: '#f0f0f0'}} 
                        />
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                        <label>Khách hàng (*)</label>
                        <CustomerAutocomplete
                            value={customerName || customerId}
                            onSelect={({ id, name }) => {
                                setCustomer(id, name);
                                if (!id && name) {
                                    setCustomer(name, '');
                                }
                            }}
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label>Diễn giải</label>
                    <textarea rows="2" placeholder="Ghi chú cho phiếu xuất..." value={description} onChange={e => setDescription(e.target.value)}></textarea>
                </div>
            </div>

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
                        <div className="grid-cell">
                            <ProductAutocomplete
                                ref={el => productInputRefs.current[index] = el}
                                value={item.productId}
                                onChange={(value) => updateItem(index, 'productId', value.toUpperCase())}
                                onSelect={(product) => {
                                    hasSelectedProduct.current = true;
                                    handleProductSearch(index, product);
                                    setTimeout(() => { hasSelectedProduct.current = false; }, 150);
                                }}
                                onBlur={() => {
                                    if (!hasSelectedProduct.current) {
                                        handleProductSearch(index, item.productId);
                                    }
                                }}
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
                                    disabled={item.isFetchingLots || item.availableLots.length === 0}
                                    style={{width: '100%'}}
                                >
                                    {item.isFetchingLots 
                                        ? <option value="">Đang tải lô...</option>
                                        : <option value="">-- Chọn lô tồn kho --</option>
                                    }
                                    {item.availableLots.map(lot => (
    <option key={lot.id} value={lot.id}>
        {`${getExpiryStatusPrefix(lot.expiryDate, lot.subGroup)}Lô: ${lot.lotNumber || '(Không có)'} | HSD: ${lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'} | Tồn: ${formatNumber(lot.availableQty)}`} 
    </option>
))}
                                </select>
                            )}
                        </div>
                
                        <div className="grid-cell"><input type="text" value={item.expiryDate} readOnly /></div>
                        <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
                        <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
                        
                        <div className="grid-cell">
                            <input
                                ref={el => quantityInputRefs.current[index] = el}
                                type="text"
                                inputMode="numeric"
                                value={focusedInputIndex === index ? item.quantityToExport : formatNumber(item.quantityToExport)}
                                onFocus={() => setFocusedInputIndex(index)}
                                onBlur={() => setFocusedInputIndex(null)}
                                onKeyDown={handleQuantityKeyDown}
                                onChange={e => {
            const rawValue = e.target.value;
            const parsedValue = parseFormattedNumber(rawValue);
            const numValue = Number(parsedValue);
            
            // THÊM LOGIC KIỂM TRA TẠI ĐÂY
            const available = item.quantityAvailableForExport;
            
            if (numValue > available) {
                toast.warn(`Cảnh báo: SL vượt quá tồn khả dụng (${formatNumber(available)}).`);
                // Giới hạn giá trị nhập vào bằng tồn khả dụng
                updateItem(index, 'quantityToExport', available);
                return;
            }
            // KẾT THÚC LOGIC KIỂM TRA
            
            if (/^\d*\.?\d*$/.test(parsedValue) || parsedValue === '') {
                updateItem(index, 'quantityToExport', parsedValue);
            }
        }}
    />

{/* HIỂN THỊ SỐ KIỆN */}
{item.packaging && item.conversionFactor > 1 && (
    <div style={{ marginTop: '5px', fontSize: '12px', color: '#6c757d', textAlign: 'center' }}>
        Quy đổi: <strong>
            {/* LƯU Ý: LẤY ĐƠN VỊ VÀ KẾT QUẢ TỪ HÀM calculateCaseCount */}
            {formatNumber(calculateCaseCount(
                Number(item.quantityToExport), 
                item.conversionFactor, 
                item.unit
            ).value)}
        </strong> 
        
        {/* ĐƠN VỊ HIỂN THỊ */}
        {calculateCaseCount(Number(item.quantityToExport), item.conversionFactor, item.unit).action === 'MULTIPLY'
            ? getTargetUnit(item.packaging, item.unit) // Logic Lọ/Test
            : 'Thùng'} 
    </div>
)}
                        </div>
                        <div className="grid-cell"><textarea value={item.notes || ''} onChange={e => updateItem(index, 'notes', e.target.value)} /></div>
                        <div className="grid-cell"><input type="text" value={item.storageTemp} readOnly /></div>
                        <div className="grid-cell">
                            <button type="button" className="btn-icon btn-delete" onClick={() => handleRemoveRowWithConfirmation(index)}><FiXCircle /></button>
                        </div>
                    </React.Fragment>
                ))}
            </div>
            <button ref={addRowButtonRef} onClick={addNewItemRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
            
            <div className="page-actions">
                <button 
                    onClick={handleSaveDraft} 
                    className="btn-secondary" 
                    disabled={isProcessing || !isSlipValid}
                    title={!isSlipValid ? disabledReason : 'Lưu phiếu dưới dạng bản nháp'}
                >
                    {isProcessing ? 'Đang xử lý...' : 'Lưu Nháp'}
                </button>
                <button 
                    onClick={promptForDirectExport} 
                    className="btn-primary" 
                    disabled={isProcessing || !isSlipValid}
                    title={!isSlipValid ? disabledReason : 'Xuất hàng và cập nhật tồn kho ngay lập tức'}
                >
                    {isProcessing ? 'Đang xử lý...' : 'Xuất Kho Trực Tiếp'}
                </button>
            </div>
        </div>
    );
};

export default NewExportPage;