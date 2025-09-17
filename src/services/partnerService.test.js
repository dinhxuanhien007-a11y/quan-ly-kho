// src/services/partnerService.test.js

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bổ sung getFirestore và serverTimestamp vào mock
vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getFirestore: vi.fn(),
    // Thêm mock cho serverTimestamp để test có thể chạy
    serverTimestamp: vi.fn(() => 'MOCK_SERVER_TIMESTAMP'),
}));

// Import các hàm SAU KHI đã mock
import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { addPartner, updatePartner, deletePartner } from './partnerService';
import { db } from '../firebaseConfig';

describe('Service: partnerService', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hàm addPartner nên gọi doc và setDoc với ID viết hoa và có createdAt', async () => {
        const partnerId = 'ncc-test';
        const partnerData = { partnerName: 'Đối tác Test', partnerType: 'supplier' };
        const mockDocRef = { id: 'mockDocRef' };
        
        doc.mockReturnValue(mockDocRef);

        await addPartner(partnerId, partnerData);

        // Kiểm tra ID đã được chuyển thành chữ hoa
        expect(doc).toHaveBeenCalledWith(db, 'partners', 'NCC-TEST');
        
        // **PHẦN SỬA LỖI:**
        // Kiểm tra rằng setDoc được gọi với dữ liệu gốc VÀ trường createdAt
        expect(setDoc).toHaveBeenCalledWith(mockDocRef, { 
            ...partnerData, 
            createdAt: serverTimestamp() 
        });
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