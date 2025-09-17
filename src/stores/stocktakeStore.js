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

    initializeSession: (sessionData, summaryStats, discrepancyItems) => set({
        sessionData,
        summaryStats,
        discrepancyItems,
        loading: false,
        checkedItems: {},
    }),

    setItems: (items) => set({
        items: items.map(item => ({
            ...item,
            countedQtyBeforeSubmit: item.countedQty ?? null
        }))
    }),

    updateItemCountInUI: (itemId, newCount) => set(state => ({
        items: state.items.map(item =>
            item.id === itemId ? { ...item, countedQty: newCount } : item
        ),
    })),

    setSessionStatus: (status) => set(state => ({
        sessionData: state.sessionData ? { ...state.sessionData, status: status } : null,
    })),

    setSummary: (summaryStats, discrepancyItems) => set({ 
        summaryStats, 
        discrepancyItems 
    }),

    toggleCheckedItem: (itemId) => set(state => ({
        checkedItems: {
            ...state.checkedItems,
            [itemId]: !state.checkedItems[itemId],
        },
    })),
    
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
})); // <-- LỖI ĐÃ ĐƯỢỢC SỬA Ở ĐÂY (bỏ bớt 1 dấu '}')

export default useStocktakeStore;