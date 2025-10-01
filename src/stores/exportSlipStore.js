// src/stores/exportSlipStore.js

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'react-toastify';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';

const useExportSlipStore = create(
    persist(
        (set, get) => ({
            // === STATE ===
            customerId: '',
            customerName: '',
            description: '',
            exportDate: new Date().toISOString().split('T')[0],
            items: [{ 
                id: Date.now(), 
                productId: '', productName: '', unit: '', packaging: '', storageTemp: '',
                availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '',
                expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '',
                isOutOfStock: false
            }],

            // === ACTIONS ===
            setCustomer: (id, name) => set({ customerId: id, customerName: name }),
            setDescription: (description) => set({ description }),

            // ========================================================================
            // ===== BẮT ĐẦU PHẦN CODE ĐƯỢC VIẾT LẠI HOÀN CHỈNH =====
            // ========================================================================

            // HÀM 1: updateItem - Được đơn giản hóa tối đa
            // Chỉ cập nhật 1 trường duy nhất, không có logic phụ.
            updateItem: (index, field, value) => set(state => {
                const newItems = [...state.items];
                const currentItem = { ...newItems[index] };
                currentItem[field] = value; // Chỉ cập nhật giá trị
                newItems[index] = currentItem;
                return { items: newItems };
            }),

            // HÀM 2: handleProductSearchResult - Hàm xử lý chính, được viết lại
            // Hàm này sẽ là một hàm async và gọi 'set' nhiều lần để cập nhật UI từng bước.
            handleProductSearchResult: async (index, productData) => {
                
                // BƯỚC 1: Cập nhật UI ngay lập tức để xóa dữ liệu cũ và báo đang tải
                set(state => {
                    const newItems = [...state.items];
                    const currentItem = { ...newItems[index] };
                    
                    Object.assign(currentItem, {
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
                    });

                    // Cập nhật lại productId từ productData nếu có
                    if (productData) {
                        currentItem.productId = productData.id;
                    }

                    newItems[index] = currentItem;
                    return { items: newItems };
                });

                // Nếu không có sản phẩm, dừng lại ở đây
                if (!productData) return;

                // BƯỚC 2: Thực hiện các tác vụ bất đồng bộ (lấy dữ liệu từ server)
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

                    // BƯỚC 3: Cập nhật UI lần cuối với dữ liệu đã lấy được
                    set(state => {
                        const newItems = [...state.items];
                        const currentItem = { ...newItems[index] };

                        Object.assign(currentItem, {
                            productName: productData.productName || '',
                            availableLots: finalLots,
                            isOutOfStock: outOfStock,
                        });
                        
                        newItems[index] = currentItem;
                        return { items: newItems };
                    });

                } catch (e) {
                    console.error("Lỗi khi tìm lô hàng:", e);
                    toast.error("Lỗi khi tải danh sách lô hàng.");
                    // Cập nhật UI để báo lỗi
                    set(state => {
                        const newItems = [...state.items];
                        const currentItem = { ...newItems[index], isOutOfStock: true, productName: 'Lỗi tải dữ liệu' };
                        newItems[index] = currentItem;
                        return { items: newItems };
                    });
                }
            },
            
            // ========================================================================
            // ===== CÁC HÀM KHÁC GIỮ NGUYÊN =====
            // ========================================================================

            addNewItemRow: () => set(state => ({ items: [ ...state.items, { id: Date.now(), productId: '', productName: '', unit: '', packaging: '', storageTemp: '', availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '', expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '', isOutOfStock: false } ] })),
            removeItemRow: (indexToRemove) => set(state => { if (state.items.length <= 1) return {}; return { items: state.items.filter((_, index) => index !== indexToRemove) }; }),
            replaceItem: (index, newItemData) => set(state => { const newItems = [...state.items]; newItems[index] = { ...newItems[index], ...newItemData }; return { items: newItems }; }),
            resetSlip: () => set({ customerId: '', customerName: '', description: '', items: [{ id: Date.now(), productId: '', productName: '', unit: '', packaging: '', storageTemp: '', availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '', expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '', isOutOfStock: false }] })
        }),
        {
            name: 'export-slip-storage',
        }
    )
);

export default useExportSlipStore;