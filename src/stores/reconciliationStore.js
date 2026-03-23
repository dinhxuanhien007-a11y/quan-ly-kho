// src/stores/reconciliationStore.js
import { create } from 'zustand';

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

const useReconciliationStore = create((set) => ({
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
}));

export default useReconciliationStore;