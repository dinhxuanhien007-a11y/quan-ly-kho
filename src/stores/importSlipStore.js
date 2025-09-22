// src/stores/importSlipStore.js

import { create } from 'zustand';
import { formatDate } from '../utils/dateUtils';

// State khởi tạo cho một dòng item mới, giúp tránh lặp lại code
const initialItemState = {
    id: Date.now(),
    productId: '',
    productName: '',
    lotNumber: '',
    expiryDate: '',
    unit: '',
    packaging: '',
    quantity: '',
    notes: '',
    storageTemp: '',
    team: '',
    manufacturer: '',
    productNotFound: false,
    lotStatus: 'unchecked', // 'unchecked', 'exists', 'new', 'declared'
    existingLotInfo: null
};

// State khởi tạo cho toàn bộ store
const initialState = {
    supplierId: '',
    supplierName: '',
    description: '',
    items: [{ ...initialItemState, id: Date.now() }]
};

const useImportSlipStore = create((set) => ({
    // === STATE ===
    ...initialState,

    // === ACTIONS ===
    setSupplier: (id, name) => set({ supplierId: id, supplierName: name }),
    
    setDescription: (description) => set({ description }),

    addNewItemRow: () => set(state => ({
        items: [...state.items, { ...initialItemState, id: Date.now() }]
    })),
    
    removeItemRow: (indexToRemove) => set(state => {
        // Không cho xóa nếu chỉ còn 1 dòng
        if (state.items.length <= 1) return {};
        return { items: state.items.filter((_, index) => index !== indexToRemove) };
    }),

    // Action chung để cập nhật một trường bất kỳ của một item
    updateItem: (index, field, value) => set(state => {
    const newItems = [...state.items];
    const currentItem = { ...newItems[index] };
    currentItem[field] = value;

        // Nếu thay đổi productId hoặc lotNumber, reset các trạng thái liên quan
        if (field === 'productId' || field === 'lotNumber') {
            currentItem.lotStatus = 'unchecked';
            currentItem.expiryDate = '';
            currentItem.existingLotInfo = null;
        }

        newItems[index] = currentItem;
        return { items: newItems };
    }),
    
    // Action để xử lý kết quả sau khi tìm kiếm sản phẩm
    handleProductSearchResult: (index, productData, found) => set(state => {
        const newItems = [...state.items];
        const currentItem = { ...newItems[index] };
        if (found) {
            Object.assign(currentItem, {
                productName: productData.productName || '',
                unit: productData.unit || '',
                packaging: productData.packaging || '',
                storageTemp: productData.storageTemp || '',
                team: productData.team || '',
                manufacturer: productData.manufacturer || '',
                productNotFound: false,
            });
        } else {
            Object.assign(currentItem, {
                productName: '', unit: '', packaging: '', storageTemp: '',
                team: '', manufacturer: '', productNotFound: true,
            });
        }
        newItems[index] = currentItem;
        return { items: newItems };
    }),

    // Action để xử lý kết quả sau khi kiểm tra số lô
    handleLotCheckResult: (index, lotData, exists) => set(state => {
        const newItems = [...state.items];
        const currentItem = { ...newItems[index] };
        if (exists) {
            currentItem.lotStatus = 'exists';
            currentItem.expiryDate = formatDate(lotData.expiryDate);
            currentItem.existingLotInfo = {
                quantityRemaining: lotData.quantityRemaining,
                expiryDate: formatDate(lotData.expiryDate),
            };
        } else {
            currentItem.lotStatus = 'new';
            currentItem.existingLotInfo = null;
        }
        newItems[index] = currentItem;
        return { items: newItems };
    }),
    
    // Action để khai báo HSD cho lô mới từ modal
    declareNewLot: (index, declaredExpiryDate) => set(state => {
        const newItems = [...state.items];
        const currentItem = { ...newItems[index] };
        currentItem.expiryDate = declaredExpiryDate;
        currentItem.lotStatus = 'declared';
        newItems[index] = currentItem;
        return { items: newItems };
    }),

    // Action để điền dữ liệu từ việc tạo sản phẩm mới nhanh
    fillNewProductData: (index, newData) => set(state => {
        const newItems = [...state.items];
        newItems[index] = {
            ...newItems[index],
            ...newData,
            productNotFound: false,
        };
        return { items: newItems };
    }), // <-- ĐÃ SỬA LỖI: Thêm dấu phẩy

    // Action để reset toàn bộ form về trạng thái ban đầu
    resetSlip: () => set({ ...initialState, items: [{ ...initialItemState, id: Date.now() }]})
}));

export default useImportSlipStore;