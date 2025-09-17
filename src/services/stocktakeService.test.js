// src/services/stocktakeService.test.js

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bổ sung getFirestore vào mock
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    deleteDoc: vi.fn(),
    collection: vi.fn(),
    getDocs: vi.fn(),
    writeBatch: vi.fn(() => ({
        delete: vi.fn(),
        commit: vi.fn(),
    })),
    getFirestore: vi.fn(), // <-- THÊM DÒNG NÀY
}));

import { doc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { deleteStocktakeSession } from './stocktakeService';
import { db } from '../firebaseConfig';

describe('Service: stocktakeService', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('nên xóa các item con trước khi xóa document cha', async () => {
        const sessionId = 'session-with-items';
        const mockSessionRef = { id: 'sessionRef' };
        const mockItemsCollectionRef = { id: 'itemsCollectionRef' };
        
        const mockItemsSnapshot = {
            empty: false,
            docs: [
                { id: 'item1', ref: { id: 'item1Ref' } },
                { id: 'item2', ref: { id: 'item2Ref' } },
            ],
        };
        const mockBatch = { delete: vi.fn(), commit: vi.fn() };

        doc.mockReturnValue(mockSessionRef);
        collection.mockReturnValue(mockItemsCollectionRef);
        getDocs.mockResolvedValue(mockItemsSnapshot);
        writeBatch.mockReturnValue(mockBatch);

        await deleteStocktakeSession(sessionId);

        expect(collection).toHaveBeenCalledWith(db, 'stocktakes', sessionId, 'items');
        expect(getDocs).toHaveBeenCalledWith(mockItemsCollectionRef);
        expect(writeBatch).toHaveBeenCalledWith(db);
        expect(mockBatch.delete).toHaveBeenCalledTimes(2);
        expect(mockBatch.commit).toHaveBeenCalledTimes(1);
        expect(deleteDoc).toHaveBeenCalledWith(mockSessionRef);
    });

    it('nên chỉ xóa document cha nếu không có item con', async () => {
        const sessionId = 'session-no-items';
        const mockSessionRef = { id: 'sessionRef' };
        const mockItemsCollectionRef = { id: 'itemsCollectionRef' };

        const mockItemsSnapshot = { empty: true, docs: [] };
        
        doc.mockReturnValue(mockSessionRef);
        collection.mockReturnValue(mockItemsCollectionRef);
        getDocs.mockResolvedValue(mockItemsSnapshot);

        await deleteStocktakeSession(sessionId);

        expect(getDocs).toHaveBeenCalledWith(mockItemsCollectionRef);
        expect(writeBatch).not.toHaveBeenCalled();
        expect(deleteDoc).toHaveBeenCalledWith(mockSessionRef);
    });
});