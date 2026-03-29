// src/stores/collaborativeStocktakeStore.js
import { create } from 'zustand';

const initialState = {
    sessionData: null,
    countEntries: [],   // tất cả entries của phiên (realtime)
    myEntries: [],      // entries của user hiện tại
    conflicts: [],      // entries có conflict: true && !rejected
    progress: { total: 0, counted: 0, percent: 0 },
    loading: true,
};

const useCollaborativeStocktakeStore = create((set, get) => ({
    ...initialState,

    /**
     * Khởi tạo phiên với sessionData và tổng số lô (totalLots).
     */
    initSession: (sessionData, totalLots = 0) => set({
        sessionData,
        loading: false,
        progress: { total: totalLots, counted: 0, percent: 0 },
    }),

    /**
     * Cập nhật toàn bộ count entries từ realtime listener.
     * Tự động tính lại myEntries, conflicts, và progress.
     * @param {Object[]} entries - tất cả entries từ Firestore
     * @param {string} currentUid - uid của user hiện tại
     * @param {number} totalLots - tổng số lô trong phiên
     */
    setCountEntries: (entries, currentUid, totalLots) => {
        const myEntries = entries.filter(e => e.enteredBy === currentUid);
        const conflicts = entries.filter(e => e.conflict === true && e.rejected !== true);

        // Tính progress: số lotId distinct đã có ít nhất 1 entry chưa bị rejected
        const countedLotIds = new Set(
            entries.filter(e => e.rejected !== true).map(e => e.lotId)
        );
        const counted = countedLotIds.size;
        const total = totalLots || get().progress.total;
        const percent = total > 0 ? Math.round((counted / total) * 100) : 0;

        set({
            countEntries: entries,
            myEntries,
            conflicts,
            progress: { total, counted, percent },
        });
    },

    /**
     * Cập nhật totalLots khi biết được tổng số lô của phiên.
     */
    setTotalLots: (totalLots) => set(state => ({
        progress: {
            ...state.progress,
            total: totalLots,
            percent: totalLots > 0
                ? Math.round((state.progress.counted / totalLots) * 100)
                : 0,
        },
    })),

    setLoading: (loading) => set({ loading }),

    clearStore: () => set({ ...initialState }),
}));

export default useCollaborativeStocktakeStore;
