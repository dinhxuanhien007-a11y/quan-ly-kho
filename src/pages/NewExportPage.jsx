// src/pages/NewExportPage.jsx
import { formatNumber, parseFormattedNumber, calculateCaseCount } from '../utils/numberUtils';
import ProductAutocomplete from '../components/ProductAutocomplete';
import CustomerAutocomplete from '../components/CustomerAutocomplete';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, doc, getDoc, writeBatch, serverTimestamp, increment, updateDoc } from 'firebase/firestore';
import { FiXCircle, FiChevronDown, FiAlertCircle, FiCopy } from 'react-icons/fi';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate, getExpiryStatusPrefix } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import useExportSlipStore from '../stores/exportSlipStore';

const getTargetUnit = (packagingStr, currentUnit) => {
    if (!packagingStr || !currentUnit) return 'Đơn vị';
    const lowerUnit = currentUnit.toLowerCase().trim();

    if (lowerUnit === 'hộp') {
        const countMatch = packagingStr.match(/(\d+(\.\d+)?)\s*(Test|Lọ|Cái|Ống|Bộ|Gói)\s*\//i);
        if (countMatch && countMatch[3]) return countMatch[3].trim();
    }

    if (lowerUnit === 'hộp' || lowerUnit === 'lọ' || lowerUnit === 'thùng' || lowerUnit === 'khay') {
        const volumeUnitMatch = packagingStr.match(/(\d+(\.\d+)?)\s*(Lít|mL|G|µg)\s*\//i);
        if (volumeUnitMatch && volumeUnitMatch[3]) return volumeUnitMatch[3].trim();

        const countMatch = packagingStr.match(/(\d+(\.\d+)?)\s*(Test|Lọ|Cái|Ống|Bộ|Gói)\s*\//i);
        if (countMatch && countMatch[3]) return countMatch[3].trim();

        return 'Đơn vị';
    }

    const largeUnitMatch = packagingStr.match(/\/ (Hộp|Thùng|Can|Kiện|Lọ|Bộ|Gói|Khay)$/i);
    if (largeUnitMatch) return largeUnitMatch[1].trim();

    return 'Thùng';
};

const NewExportPage = () => {
    const {
        customerId, customerName, description, exportDate, items,
        setCustomer, setDescription, setExportDate, addNewItemRow, removeItemRow, updateItem,
        replaceItem, handleProductSearchResult, resetSlip, duplicateItemRow
    } = useExportSlipStore();

    const [isProcessing, setIsProcessing] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [focusedInputIndex, setFocusedInputIndex] = useState(null);
    const isSelectingProduct = useRef(false);

    const lotSelectRefs = useRef([]);
    const quantityInputRefs = useRef([]);
    const addRowButtonRef = useRef(null);
    const productInputRefs = useRef([]);
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

    // Reset exportDate về hôm nay mỗi khi vào trang
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setExportDate(today);
    }, []);

    const isSlipValid = useMemo(() => {
        const hasCustomer = customerId.trim() !== '' && customerName.trim() !== '';
        const hasValidItem = items.some(
            item => item.productId && item.selectedLotId && Number(item.quantityToExport) > 0
        );
        return hasCustomer && hasValidItem;
    }, [customerId, customerName, items]);

    const disabledReason = useMemo(() => {
        if (isSlipValid) return '';
        if (!customerId.trim() || !customerName.trim()) return 'Vui lòng chọn Khách Hàng.';
        if (!items.some(item => item.productId && item.selectedLotId && Number(item.quantityToExport) > 0)) {
            return 'Vui lòng thêm ít nhất một sản phẩm hợp lệ (đã chọn lô và có số lượng).';
        }
        return 'Vui lòng điền đầy đủ thông tin bắt buộc (*).';
    }, [isSlipValid, customerId, customerName, items]);

    // Set các selectedLotId bị dùng nhiều dòng và tổng SL vượt tồn (để highlight)
    const lotOveruseSet = useMemo(() => {
        const lotQtyMap = {};
        for (const item of items) {
            if (!item.selectedLotId || !Number(item.quantityToExport)) continue;
            if (!lotQtyMap[item.selectedLotId]) {
                lotQtyMap[item.selectedLotId] = { total: 0, available: item.quantityAvailableForExport };
            }
            lotQtyMap[item.selectedLotId].total += Number(item.quantityToExport);
        }
        const overused = new Set();
        for (const [lotId, info] of Object.entries(lotQtyMap)) {
            if (info.total > info.available) overused.add(lotId);
        }
        return overused;
    }, [items]);

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

    const handleLotSelection = (index, selectedLotId) => {
        const currentItem = items[index];
        const selectedAggregatedLot = currentItem.availableLots.find(lot => lot.id === selectedLotId);

        if (selectedAggregatedLot) {
            replaceItem(index, {
                selectedLotId,
                lotNumber: selectedAggregatedLot.lotNumber,
                expiryDate: selectedAggregatedLot.expiryDate ? formatDate(selectedAggregatedLot.expiryDate) : '',
                quantityAvailableForExport: selectedAggregatedLot.availableQty,
                quantityRemaining: selectedAggregatedLot.availableQty,
                displayLotText: selectedAggregatedLot.lotNumber || '(Trống)',
                unit: selectedAggregatedLot.unit || '',
                packaging: selectedAggregatedLot.packaging || '',
                storageTemp: selectedAggregatedLot.storageTemp || '',
            });
            setTimeout(() => {
                if (quantityInputRefs.current[index]) quantityInputRefs.current[index].focus();
            }, 0);
        } else {
            replaceItem(index, {
                selectedLotId: '', lotNumber: '', expiryDate: '',
                quantityAvailableForExport: 0, quantityRemaining: 0, displayLotText: ''
            });
        }
    };

    const handleQuantityKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (addRowButtonRef.current) addRowButtonRef.current.focus();
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
        const formattedDate = exportDate ? exportDate.split('-').reverse().join('/') : formatDate(new Date());

        // Kiểm tra cùng lô được chọn ở nhiều dòng, tổng SL có vượt tồn không
        const lotQtyMap = {};
        for (const item of items) {
            if (!item.selectedLotId || !Number(item.quantityToExport)) continue;
            if (!lotQtyMap[item.selectedLotId]) {
                lotQtyMap[item.selectedLotId] = {
                    total: 0,
                    available: item.quantityAvailableForExport,
                    lotNumber: item.lotNumber || item.selectedLotId
                };
            }
            lotQtyMap[item.selectedLotId].total += Number(item.quantityToExport);
        }
        for (const [, info] of Object.entries(lotQtyMap)) {
            if (info.total > info.available) {
                toast.warn(
                    `Lỗi: Tổng SL xuất (${formatNumber(info.total)}) của lô "${info.lotNumber}" vượt quá tồn khả dụng (${formatNumber(info.available)}).`
                );
                return null;
            }
        }

        const validItemsInput = items.filter(item => {
            const qty = Number(item.quantityToExport);
            const available = item.quantityAvailableForExport;

            if (item.productId && item.selectedLotId) {
                if (qty > available) {
                    toast.warn(`Lỗi: SL xuất (${formatNumber(qty)}) vượt quá tồn khả dụng (${formatNumber(available)}) của lô hàng.`);
                    return false;
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
        const allProductIds = new Set();

        for (const item of validItemsInput) {
            let quantityToDistribute = Number(item.quantityToExport);
            const selectedAggregatedLot = item.availableLots.find(lot => lot.id === item.selectedLotId);

            if (!selectedAggregatedLot || quantityToDistribute <= 0) continue;

            const originalLotsSorted = [...selectedAggregatedLot.originalLots].sort((a, b) => {
                const dateA = (a.expiryDate && typeof a.expiryDate.toDate === 'function')
                    ? a.expiryDate.toDate().getTime() : Infinity;
                const dateB = (b.expiryDate && typeof b.expiryDate.toDate === 'function')
                    ? b.expiryDate.toDate().getTime() : Infinity;
                if (dateA === Infinity && dateB === Infinity) return 0;
                return dateA - dateB;
            });

            for (const originalLot of originalLotsSorted) {
                if (quantityToDistribute <= 0) break;
                const originalLotAvailableQty = originalLot.quantityRemaining - (originalLot.quantityAllocated || 0);
                if (originalLotAvailableQty <= 0) continue;
                const quantityFromThisLot = Math.min(quantityToDistribute, originalLotAvailableQty);

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

        if (finalItems.length === 0) {
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
            const batch = writeBatch(db);

            for (const item of slipData.items) {
                const lotRef = doc(db, 'inventory_lots', item.lotId);
                batch.update(lotRef, { quantityAllocated: increment(item.quantityToExport) });
            }

            const slipRef = doc(collection(db, 'export_tickets'));
            batch.set(slipRef, { ...slipData, status: 'pending' });

            await batch.commit();
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
        setConfirmModal({ isOpen: false });
        setIsProcessing(true);
        try {
            const batch = writeBatch(db);

            // Đọc tất cả lot song song thay vì tuần tự
            const lotSnaps = await Promise.all(
                slipData.items.map(item => getDoc(doc(db, 'inventory_lots', item.lotId)))
            );

            for (let i = 0; i < slipData.items.length; i++) {
                const item = slipData.items[i];
                const lotSnap = lotSnaps[i];
                const currentAllocated = lotSnap.exists() ? (lotSnap.data().quantityAllocated || 0) : 0;
                const allocatedToDeduct = Math.min(item.quantityToExport, currentAllocated);
                batch.update(doc(db, 'inventory_lots', item.lotId), {
                    quantityRemaining: increment(-item.quantityToExport),
                    quantityAllocated: increment(-allocatedToDeduct),
                });
            }

            const slipRef = doc(collection(db, 'export_tickets'));
            batch.set(slipRef, { ...slipData, status: 'completed' });

            await batch.commit();

            // Cập nhật totalRemaining trên products
            const qtyByProduct = {};
            for (const item of slipData.items) {
                qtyByProduct[item.productId] = (qtyByProduct[item.productId] || 0) + item.quantityToExport;
            }
            await Promise.all(
                Object.entries(qtyByProduct).map(([pid, qty]) =>
                    updateDoc(doc(db, 'products', pid), { totalRemaining: increment(-qty) })
                )
            );

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
        if (!isSlipValid) return;
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xuất kho?",
            message: "Hành động này sẽ trừ tồn kho ngay lập tức. Bạn có chắc chắn muốn tiếp tục?",
            onConfirm: handleDirectExport
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
                        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                            <input
                                type="text"
                                readOnly
                                value={exportDate ? exportDate.split('-').reverse().join('/') : ''}
                                style={{ paddingRight: '32px', cursor: 'pointer', backgroundColor: 'var(--input-bg, #fff)', color: 'var(--text-color)' }}
                                onClick={() => document.getElementById('export-date-picker').showPicker?.() || document.getElementById('export-date-picker').click()}
                            />
                            <input
                                id="export-date-picker"
                                type="date"
                                value={exportDate || ''}
                                onChange={e => setExportDate(e.target.value)}
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 1 }}
                            />
                            <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary, #666)', fontSize: '16px' }}>📅</span>
                        </div>
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                        <label>Khách hàng (*)</label>
                        <CustomerAutocomplete
                            value={customerName || customerId}
                            onSelect={({ id, name }) => {
                                setCustomer(id, name);
                            }}
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label>Diễn giải</label>
                    <textarea rows="2" placeholder="Ghi chú cho phiếu xuất..." value={description} onChange={e => setDescription(e.target.value)}></textarea>
                </div>
            </div>

            <div className="item-details-grid" style={{ gridTemplateColumns: '1.5fr 2.5fr 2fr 1.2fr 0.8fr 1.5fr 1fr 1.5fr 1.5fr 0.5fr 0.5fr' }}>
                <div className="grid-header">Mã hàng (*)</div>
                <div className="grid-header">Tên hàng</div>
                <div className="grid-header">Số lô (*)</div>
                <div className="grid-header">HSD (*)</div>
                <div className="grid-header">ĐVT</div>
                <div className="grid-header">Quy cách</div>
                <div className="grid-header">SL Xuất (*)</div>
                <div className="grid-header">Ghi chú</div>
                <div className="grid-header">Nhiệt độ BQ</div>
                <div className="grid-header">Copy</div>
                <div className="grid-header">Xóa</div>

                {items.map((item, index) => (
                    <React.Fragment key={item.id}>
                        <div className="grid-cell">
                            <ProductAutocomplete
                                ref={el => productInputRefs.current[index] = el}
                                value={item.productId}
                                onChange={(value) => updateItem(index, 'productId', value.toUpperCase())}
                                onSelect={(product) => {
                                    isSelectingProduct.current = true;
                                    handleProductSearch(index, product);
                                }}
                                onBlur={() => {
                                    if (!isSelectingProduct.current) {
                                        handleProductSearch(index, item.productId);
                                    }
                                    isSelectingProduct.current = false;
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
                                    style={{ width: '100%' }}
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

                        <div className="grid-cell" style={
                            (Number(item.quantityToExport) > item.quantityAvailableForExport && item.quantityAvailableForExport > 0)
                            || lotOveruseSet.has(item.selectedLotId)
                                ? { backgroundColor: '#fde8e8' } : {}
                        }>
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
                                    const available = item.quantityAvailableForExport;

                                    if (numValue > available) {
                                        toast.warn(`Cảnh báo: SL vượt quá tồn khả dụng (${formatNumber(available)}).`);
                                        updateItem(index, 'quantityToExport', available);
                                        return;
                                    }

                                    if (/^\d*\.?\d*$/.test(parsedValue) || parsedValue === '') {
                                        updateItem(index, 'quantityToExport', parsedValue);
                                    }
                                }}
                            />
                            {item.selectedLotId && (
                                <div style={{ marginTop: '3px', fontSize: '12px', color: '#6c757d', textAlign: 'center' }}>
                                    Tồn KD: <strong style={{ color: item.quantityAvailableForExport <= 0 ? '#c0392b' : 'inherit' }}>{formatNumber(item.quantityAvailableForExport)}</strong>
                                    {lotOveruseSet.has(item.selectedLotId) && (
                                        <span style={{ color: '#c0392b', marginLeft: '4px' }}>⚠️ Vượt tồn</span>
                                    )}
                                </div>
                            )}
                            {item.packaging && item.conversionFactor > 1 && (() => {
                                const caseResult = calculateCaseCount(Number(item.quantityToExport), item.conversionFactor, item.unit);
                                return (
                                    <div style={{ marginTop: '3px', fontSize: '12px', color: '#6c757d', textAlign: 'center' }}>
                                        Quy đổi: <strong>{formatNumber(caseResult.value)}</strong>{' '}
                                        {caseResult.action === 'MULTIPLY' ? getTargetUnit(item.packaging, item.unit) : 'Thùng'}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="grid-cell"><textarea value={item.notes || ''} onChange={e => updateItem(index, 'notes', e.target.value)} /></div>
                        <div className="grid-cell"><input type="text" value={item.storageTemp} readOnly /></div>
                        <div className="grid-cell">
                            <button
                                type="button"
                                className="btn-icon"
                                onClick={() => duplicateItemRow(index)}
                                title="Nhân đôi dòng này (giữ nguyên sản phẩm, xóa lô/SL)"
                                style={{ color: '#007bff' }}
                            >
                                <FiCopy />
                            </button>
                        </div>
                        <div className="grid-cell">
                            <button type="button" className="btn-icon btn-delete" onClick={() => handleRemoveRowWithConfirmation(index)}><FiXCircle /></button>
                        </div>
                    </React.Fragment>
                ))}
            </div>
            <button ref={addRowButtonRef} onClick={addNewItemRow} className="btn-secondary" style={{ marginTop: '10px' }}>+ Thêm dòng</button>
            <button
                onClick={() => setConfirmModal({
                    isOpen: true,
                    title: "Xóa tất cả dòng hàng?",
                    message: "Thao tác này sẽ xóa toàn bộ danh sách hàng hóa và không thể hoàn tác.",
                    onConfirm: () => { resetSlip(); setConfirmModal({ isOpen: false }); }
                })}
                className="btn-secondary"
                style={{ marginTop: '10px', marginLeft: '8px', color: '#c0392b', borderColor: '#c0392b' }}
                disabled={items.length === 0}
            >
                Xóa tất cả
            </button>

            {/* Tổng kết cuối bảng */}
            {items.some(i => i.productId && Number(i.quantityToExport) > 0) && (() => {
                const validItems = items.filter(i => i.productId && Number(i.quantityToExport) > 0);
                const uniqueProducts = new Set(validItems.map(i => i.productId)).size;
                const overQty = validItems.filter(i => Number(i.quantityToExport) > i.quantityAvailableForExport).length;
                return (
                    <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span>Số dòng: <strong>{validItems.length}</strong></span>
                        <span>Mã hàng: <strong>{uniqueProducts}</strong></span>
                        <span>Tổng SL xuất: <strong>{validItems.reduce((s, i) => s + Number(i.quantityToExport), 0).toLocaleString('vi-VN')}</strong></span>
                        {overQty > 0 && <span style={{ color: '#c0392b' }}>⚠️ Vượt tồn: <strong>{overQty}</strong> dòng</span>}
                    </div>
                );
            })()}

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
