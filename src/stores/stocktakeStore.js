// src/stores/stocktakeStore.js
import { create } from 'zustand';

const initialState = {
    sessionData: null,
    items: [],
    discrepancyItems: [],
    checkedItems: {},
    summaryStats: { totalItems: 0, countedItems: 0, discrepancies: 0 },
    loading: true,
};

const useStocktakeStore = create((set, get) => ({
    ...initialState,

    // === ACTIONS ===

    // Khởi tạo store với dữ liệu của phiên
    initializeSession: (sessionData, summaryStats, discrepancyItems) => set({
        sessionData,
        summaryStats,
        discrepancyItems,
        loading: false,
        checkedItems: {}, // Reset các mục đã chọn khi tải lại
    }),

    // Cập nhật danh sách vật tư (dùng cho phân trang)
    setItems: (items) => set({ items }),

    // Cập nhật số lượng đếm của một vật tư trên UI
    updateItemCountInUI: (itemId, newCount) => set(state => ({
        items: state.items.map(item =>
            item.id === itemId ? { ...item, countedQty: newCount } : item
        ),
    })),

    // Cập nhật trạng thái của phiên
    setSessionStatus: (status) => set(state => ({
        sessionData: state.sessionData ? { ...state.sessionData, status: status } : null,
    })),

    // Cập nhật thống kê và danh sách chênh lệch
    setSummary: (summaryStats, discrepancyItems) => set({ 
        summaryStats, 
        discrepancyItems 
    }),

    // Xử lý check/uncheck một mục chênh lệch
    toggleCheckedItem: (itemId) => set(state => ({
        checkedItems: {
            ...state.checkedItems,
            [itemId]: !state.checkedItems[itemId],
        },
    })),
    
    // Xử lý check/uncheck tất cả các mục chênh lệch
    toggleAllCheckedItems: (shouldCheck) => set(state => {
        if (!shouldCheck) {
            return { checkedItems: {} };
        }
        const allChecked = state.discrepancyItems.reduce((acc, item) => {
            acc[item.id] = true;
            return acc;
        }, {});
        return { checkedItems: allChecked };
    }),

    // Reset store về trạng thái ban đầu khi rời khỏi trang
    clearStore: () => set({ ...initialState }),
}));

export default useStocktakeStore;