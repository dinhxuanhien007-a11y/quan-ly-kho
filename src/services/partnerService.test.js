// src/services/partnerService.test.js

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bổ sung getFirestore vào mock
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getFirestore: vi.fn(), // <-- THÊM DÒNG NÀY
}));

import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { addPartner, updatePartner, deletePartner } from './partnerService';
import { db } from '../firebaseConfig';

describe('Service: partnerService', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hàm addPartner nên gọi doc và setDoc với ID được viết hoa', async () => {
        const partnerId = 'ncc-test';
        const partnerData = { partnerName: 'Đối tác Test', partnerType: 'supplier' };
        const mockDocRef = { id: 'mockDocRef' };
        doc.mockReturnValue(mockDocRef);

        await addPartner(partnerId, partnerData);

        expect(doc).toHaveBeenCalledWith(db, 'partners', 'NCC-TEST');
        expect(setDoc).toHaveBeenCalledWith(mockDocRef, partnerData);
    });

    it('hàm updatePartner nên gọi doc và updateDoc với các tham số chính xác', async () => {
        const partnerId = 'KH-01';
        const partnerData = { partnerName: 'Khách hàng A' };
        const mockDocRef = { id: 'mockDocRef' };
        doc.mockReturnValue(mockDocRef);

        await updatePartner(partnerId, partnerData);

        expect(doc).toHaveBeenCalledWith(db, 'partners', partnerId);
        expect(updateDoc).toHaveBeenCalledWith(mockDocRef, partnerData);
    });

    it('hàm deletePartner nên gọi doc và deleteDoc với tham số chính xác', async () => {
        const partnerId = 'KH-02';
        const mockDocRef = { id: 'mockDocRef' };
        doc.mockReturnValue(mockDocRef);

        await deletePartner(partnerId);

        expect(doc).toHaveBeenCalledWith(db, 'partners', partnerId);
        expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });
});