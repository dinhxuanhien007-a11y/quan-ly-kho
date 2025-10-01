// src/pages/NewExportPage.jsx

import { formatNumber, parseFormattedNumber } from '../utils/numberUtils';
import ProductAutocomplete from '../components/ProductAutocomplete';
import CustomerAutocomplete from '../components/CustomerAutocomplete';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { FiXCircle, FiChevronDown, FiAlertCircle } from 'react-icons/fi';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate, getExpiryStatusPrefix } from '../utils/dateUtils';
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
        replaceItem, handleProductSearchResult, resetSlip
    } = useExportSlipStore();

    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [focusedInputIndex, setFocusedInputIndex] = useState(null);
    
    const lotSelectRefs = useRef([]);

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

    // HÀM TÌM KIẾM SẢN PHẨM MỚI (CHỈ GỌI STORE)
    const handleProductSearch = async (index, productOrId) => {
        if (!productOrId) {
            handleProductSearchResult(index, null);
            return;
        };

        let productData = null;
        if (typeof productOrId === 'object' && productOrId !== null) {
            productData = productOrId;
        } 
        else {
            const productId = String(productOrId).trim().toUpperCase();
            if (!productId) {
                handleProductSearchResult(index, null); // Xóa dữ liệu dòng nếu productId rỗng
                return;
            };
            try {
                const productRef = doc(db, 'products', productId);
                const productSnap = await getDoc(productRef);
                if (productSnap.exists()) {
                    productData = { id: productSnap.id, ...productSnap.data() };
                } else {
                    toast.warn(`Không tìm thấy sản phẩm với mã: ${productId}`);
                }
            } catch (error) {
                console.error("Lỗi khi tìm sản phẩm:", error);
                toast.error("Đã xảy ra lỗi khi tìm kiếm sản phẩm.");
            }
        }
        
        handleProductSearchResult(index, productData); 
        setTimeout(() => lotSelectRefs.current[index]?.focus(), 100);
    };
    
    const handleLotSelection = (index, selectedLotId) => {
        const currentItem = items[index];
        const selectedLot = currentItem.availableLots.find(lot => lot.id === selectedLotId);
        if (selectedLot) {
          replaceItem(index, {
              selectedLotId: selectedLotId,
              lotNumber: selectedLot.lotNumber,
              expiryDate: selectedLot.expiryDate ? formatDate(selectedLot.expiryDate) : '',
              quantityRemaining: selectedLot.quantityRemaining,
              displayLotText: selectedLot.lotNumber || '(Trống)'
          });
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
        const formattedDate = formatDate(new Date());
        const validItemsInput = items.filter(item => item.productId && item.selectedLotId && Number(item.quantityToExport) > 0);
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
                const quantityFromThisLot = Math.min(quantityToDistribute, originalLot.quantityRemaining);
                
                finalItems.push({
                    productId: item.productId,
                    productName: item.productName,
                    lotId: originalLot.id,
                    lotNumber: originalLot.lotNumber,
                    expiryDate: originalLot.expiryDate ? formatDate(originalLot.expiryDate) : '',
                    unit: item.unit,
                    packaging: item.packaging,
                    storageTemp: item.storageTemp || '',
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
            if (!id && name) { // Nếu người dùng đang gõ mà chưa chọn
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
        {`${getExpiryStatusPrefix(lot.expiryDate)}Lô: ${lot.lotNumber || '(Không có)'} | HSD: ${lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'} | Tồn: ${formatNumber(lot.quantityRemaining)}`}
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
                                type="text"
                                inputMode="numeric"
                                value={focusedInputIndex === index ? item.quantityToExport : formatNumber(item.quantityToExport)}
                                onFocus={() => setFocusedInputIndex(index)}
                                onBlur={() => setFocusedInputIndex(null)}
                                onChange={e => {
                                    const rawValue = e.target.value;
                                    const parsedValue = parseFormattedNumber(rawValue);
                                    if (/^\d*\.?\d*$/.test(parsedValue) || parsedValue === '') {
                                        updateItem(index, 'quantityToExport', parsedValue);
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