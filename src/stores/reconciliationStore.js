// src/stores/reconciliationStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const initialState = {
    webkhoLots:           [],
    convMap:              {},
    altCodeMap:           {},
    missingMisaCodes:     [],   // array (Set không serialize được)
    lastUpdated:          null, // ISO string

    misaItems:            [],
    misaFileName:         '',
    duplicateHsdWarnings: [],

    activeTab:            'chenh',
};

// Reviver để khôi phục Date objects từ JSON string sau khi persist
const reviveWebkhoLots = (lots) => lots.map(lot => ({
    ...lot,
    expiryDate: lot.expiryDate ? new Date(lot.expiryDate) : null,
}));

const useReconciliationStore = create(
    persist(
        (set) => ({
            ...initialState,

            setWebkhoData: (lots, convMap, altCodeMap, missingMisaArray) => set({
                webkhoLots:       lots,
                convMap:          convMap,
                altCodeMap:       altCodeMap,
                missingMisaCodes: missingMisaArray,
                lastUpdated:      new Date().toISOString(),
            }),

            setMisaData: (items, fileName, dupHsd) => set({
                misaItems:            items,
                misaFileName:         fileName,
                duplicateHsdWarnings: dupHsd,
            }),

            setActiveTab: (tab) => set({ activeTab: tab }),

            reset: () => set({ ...initialState }),
        }),
        {
            name: 'reconciliation-store-v1',
            // Chỉ persist những field cần thiết, bỏ qua activeTab
            partialize: (state) => ({
                webkhoLots:           state.webkhoLots,
                convMap:              state.convMap,
                altCodeMap:           state.altCodeMap,
                missingMisaCodes:     state.missingMisaCodes,
                lastUpdated:          state.lastUpdated,
                misaItems:            state.misaItems,
                misaFileName:         state.misaFileName,
                duplicateHsdWarnings: state.duplicateHsdWarnings,
            }),
            // Khôi phục Date objects bị serialize thành string
            onRehydrateStorage: () => (state) => {
                if (state?.webkhoLots?.length) {
                    state.webkhoLots = reviveWebkhoLots(state.webkhoLots);
                }
            },
        }
    )
);

export default useReconciliationStore;