// src/stores/exportSlipStore.js

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'react-toastify';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';

const initialItemState = {
    id: Date.now(),
    productId: '', productName: '', unit: '', packaging: '', storageTemp: '',
    availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '',
    expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '',
    isOutOfStock: false,
    isFetchingLots: false
};

const useExportSlipStore = create(
    persist(
        (set, get) => ({
            // === STATE ===
            customerId: '',
            customerName: '',
            description: '',
            exportDate: new Date().toISOString().split('T')[0],
            items: [{ ...initialItemState, id: Date.now() }],

            // === ACTIONS ===
            setCustomer: (id, name) => set({ customerId: id, customerName: name }),
            setDescription: (description) => set({ description }),

            updateItem: (index, field, value) => set(state => {
                const newItems = state.items.map((item, i) => {
                    if (i === index) {
                        return { ...item, [field]: value };
                    }
                    return item;
                });
                return { items: newItems };
            }),
            
            // --- BẮT ĐẦU THAY ĐỔI ---
            // Thêm "async" vào trước hàm
            handleProductSearchResult: async (index, productData) => {
                
                // Bước 1: Cập nhật UI ngay lập tức để hiển thị trạng thái "Đang tải..."
                set(state => ({
                    items: state.items.map((item, i) => {
                        if (i === index) {
                            return {
                                ...item,
                                productId: productData ? productData.id : item.productId,
                                productName: productData ? 'Đang tải...' : '',
                                unit: '',
                                packaging: '',
                                storageTemp: '',
                                availableLots: [],
                                selectedLotId: '',
                                lotNumber: '',
                                displayLotText: '',
                                expiryDate: '',
                                quantityRemaining: 0,
                                isOutOfStock: false,
                                isFetchingLots: !!productData,
                            };
                        }
                        return item;
                    })
                }));

                if (!productData) return;

                // Bước 2: Bắt đầu tìm kiếm dữ liệu từ server
                try {
                    const lotsQuery = query(collection(db, 'inventory_lots'), where("productId", "==", productData.id), where("quantityRemaining", ">", 0));
                    const lotsSnapshot = await getDocs(lotsQuery);

                    let finalLots = [];
                    let outOfStock = false;
                    
                    if (lotsSnapshot.empty) {
                        outOfStock = true;
                    } else {
                        const foundLots = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        const lotAggregator = new Map();
                        for (const lot of foundLots) {
                            const lotKey = lot.lotNumber || 'KHONG_CO_LO';
                            if (lotAggregator.has(lotKey)) {
                                const existing = lotAggregator.get(lotKey);
                                existing.quantityRemaining += lot.quantityRemaining;
                                if (lot.expiryDate && (!existing.expiryDate || lot.expiryDate.toDate() < existing.expiryDate.toDate())) {
                                    existing.expiryDate = lot.expiryDate;
                                }
                                existing.originalLots.push(lot);
                            } else {
                                lotAggregator.set(lotKey, { ...lot, id: lotKey, quantityRemaining: lot.quantityRemaining, originalLots: [lot] });
                            }
                        }
                        const aggregatedLots = Array.from(lotAggregator.values());
                        aggregatedLots.sort((a, b) => (a.expiryDate?.toDate() || 0) - (b.expiryDate?.toDate() || 0));
                        finalLots = aggregatedLots;
                    }

                    // Bước 3: Cập nhật UI lần cuối với dữ liệu đầy đủ đã tìm được
                    set(state => ({
                        items: state.items.map((item, i) => {
                            if (i === index) {
                                return {
                                    ...item,
                                    productName: productData.productName || '',
                                    unit: productData.unit || '',
                                    packaging: productData.packaging || '',
                                    storageTemp: productData.storageTemp || '',
                                    availableLots: finalLots,
                                    isOutOfStock: outOfStock,
                                    isFetchingLots: false,
                                };
                            }
                            return item;
                        })
                    }));

                } catch (e) {
                    console.error("Lỗi khi tìm lô hàng:", e);
                    toast.error("Lỗi khi tải danh sách lô hàng.");
                    set(state => ({
                        items: state.items.map((item, i) => {
                            if (i === index) {
                                return { ...item, isOutOfStock: true, productName: 'Lỗi tải dữ liệu', isFetchingLots: false };
                            }
                            return item;
                        })
                    }));
                }
            },
            // --- KẾT THÚC THAY ĐỔI ---
            
            // Các hàm còn lại giữ nguyên
            addNewItemRow: () => set(state => ({ items: [...state.items, { ...initialItemState, id: Date.now() }] })),
            removeItemRow: (indexToRemove) => set(state => { if (state.items.length <= 1) return {}; return { items: state.items.filter((_, index) => index !== indexToRemove) }; }),
            replaceItem: (index, newItemData) => set(state => { const newItems = [...state.items]; newItems[index] = { ...newItems[index], ...newItemData }; return { items: newItems }; }),
            resetSlip: () => set({ customerId: '', customerName: '', description: '', items: [{ ...initialItemState, id: Date.now() }] })
        }),
        {
            name: 'export-slip-storage',
        }
    )
);

export default useExportSlipStore;