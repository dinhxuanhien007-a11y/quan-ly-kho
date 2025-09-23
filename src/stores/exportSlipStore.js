// src/stores/exportSlipStore.js

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'react-toastify';

const useExportSlipStore = create(
    persist(
        (set, get) => ({
            // === STATE ===
            customerId: '',
            customerName: '',
            description: '',
            exportDate: new Date().toISOString().split('T')[0], // Định dạng YYYY-MM-DD
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

            addNewItemRow: () => set(state => ({
                items: [
                    ...state.items,
                    { 
                        id: Date.now(), 
                        productId: '', productName: '', unit: '', packaging: '', storageTemp: '',
                        availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '',
                        expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '',
                        isOutOfStock: false
                    }
                ]
            })),

            removeItemRow: (indexToRemove) => set(state => {
                if (state.items.length <= 1) return {};
                return { items: state.items.filter((_, index) => index !== indexToRemove) };
            }),

            updateItem: (index, field, value) => set(state => {
                const newItems = [...state.items];
                const currentItem = { ...newItems[index] };

                if (field === 'quantityToExport') {
                    if (value === '') {
                        currentItem[field] = '';
                    } else {
                        const val = Number(value);
                        if (val < 0) return {};
                        if (val > currentItem.quantityRemaining) {
                            toast.warn('Cảnh báo: Số lượng xuất vượt quá số lượng tồn!');
                            currentItem[field] = currentItem.quantityRemaining;
                        } else {
                            currentItem[field] = value;
                        }
                    }
                } else {
                    currentItem[field] = value;
                }

                if (field === 'productId') {
                    currentItem.isOutOfStock = false;
                }

                newItems[index] = currentItem;
                return { items: newItems };
            }),
            
            replaceItem: (index, newItemData) => set(state => {
                const newItems = [...state.items];
                newItems[index] = { ...newItems[index], ...newItemData };
                return { items: newItems };
            }),

            resetSlip: () => set({
                customerId: '',
                customerName: '',
                description: '',
                items: [{ 
                    id: Date.now(), 
                    productId: '', productName: '', unit: '', packaging: '', storageTemp: '',
                    availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '',
                    expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '',
                    isOutOfStock: false
                }]
            })
        }),
        {
            name: 'export-slip-storage', // Tên định danh để lưu trong localStorage
        }
    )
);

export default useExportSlipStore;