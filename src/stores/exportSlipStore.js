// src/stores/exportSlipStore.js

import { create } from 'zustand';
import { toast } from 'react-toastify';

const useExportSlipStore = create((set, get) => ({
    // === STATE ===
    customerId: '',
    customerName: '',
    description: '',
    items: [{ 
        id: Date.now(), 
        productId: '', productName: '', unit: '', packaging: '', storageTemp: '',
        availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '',
        expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '',
        isOutOfStock: false // <-- THÊM THUỘC TÍNH MỚI
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
                isOutOfStock: false // <-- THÊM THUỘC TÍNH MỚI
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
                    currentItem[field] = val;
                }
            }
        } else {
            currentItem[field] = value;
        }
        
        // <-- THÊM LOGIC: Nếu người dùng thay đổi mã hàng, reset lại trạng thái hết hàng
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
            isOutOfStock: false // <-- THÊM THUỘC TÍNH MỚI
        }]
    })
}));

export default useExportSlipStore;