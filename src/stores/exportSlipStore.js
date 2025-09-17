// src/stores/exportSlipStore.js

import { create } from 'zustand';
import { toast } from 'react-toastify';

// `create` là hàm chính từ Zustand để tạo một store.
// Store này sẽ chứa state và các "actions" (hàm để cập nhật state).
const useExportSlipStore = create((set, get) => ({
    // === STATE ===
    // Tất cả state trước đây nằm trong NewExportPage giờ sẽ nằm ở đây.
    customerId: '',
    customerName: '',
    description: '',
    items: [{ 
        id: Date.now(), 
        productId: '', productName: '', unit: '', packaging: '', storageTemp: '',
        availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '',
        expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '' 
    }],

    // === ACTIONS ===
    // Đây là các hàm dùng để cập nhật state.
    // `set` là hàm của Zustand, cho phép chúng ta cập nhật state một cách an toàn.
    
    setCustomer: (id, name) => set({ customerId: id, customerName: name }),

    setDescription: (description) => set({ description }),

    // Action để thêm một dòng hàng hóa mới
    addNewItemRow: () => set(state => ({
        items: [
            ...state.items,
            { 
                id: Date.now(), 
                productId: '', productName: '', unit: '', packaging: '', storageTemp: '',
                availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '',
                expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '' 
            }
        ]
    })),

    // Action để xóa một dòng hàng hóa
    removeItemRow: (indexToRemove) => set(state => {
        if (state.items.length <= 1) return {}; // Không làm gì nếu chỉ còn 1 dòng
        return { items: state.items.filter((_, index) => index !== indexToRemove) };
    }),

    // Action để cập nhật một trường dữ liệu trong một dòng hàng hóa
    updateItem: (index, field, value) => set(state => {
        const newItems = [...state.items];
        const currentItem = { ...newItems[index] }; // Tạo một bản sao của item để tránh thay đổi trực tiếp
        
        // Logic kiểm tra số lượng xuất vượt tồn kho
        if (field === 'quantityToExport') {
            if (value === '') {
                currentItem[field] = '';
            } else {
                const val = Number(value);
                if (val < 0) return {}; // Không làm gì nếu số âm
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
        
        newItems[index] = currentItem;
        return { items: newItems };
    }),
    
    // Action đặc biệt để cập nhật toàn bộ một item, hữu ích sau khi tìm kiếm sản phẩm
    replaceItem: (index, newItemData) => set(state => {
        const newItems = [...state.items];
        newItems[index] = { ...newItems[index], ...newItemData };
        return { items: newItems };
    }),

    // Action để reset toàn bộ phiếu về trạng thái ban đầu
    resetSlip: () => set({
        customerId: '',
        customerName: '',
        description: '',
        items: [{ 
            id: Date.now(), 
            productId: '', productName: '', unit: '', packaging: '', storageTemp: '',
            availableLots: [], selectedLotId: '', lotNumber: '', displayLotText: '',
            expiryDate: '', quantityRemaining: 0, quantityToExport: '', notes: '' 
        }]
    })
}));

export default useExportSlipStore;