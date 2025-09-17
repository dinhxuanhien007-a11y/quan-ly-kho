// src/services/productService.test.js

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
import { addProduct, updateProduct, deleteProduct } from './productService';
import { db } from '../firebaseConfig';

describe('Service: productService', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hàm addProduct nên gọi doc và setDoc với createdAt', async () => {
        const productId = 'SP001';
        const productData = { productName: 'Sản phẩm Test', unit: 'Cái' };
        const mockDocRef = { id: 'mockDocRef' };
        doc.mockReturnValue(mockDocRef);

        await addProduct(productId, productData);

        expect(doc).toHaveBeenCalledWith(db, 'products', productId);

        // **PHẦN SỬA LỖI:**
        // Kiểm tra rằng setDoc được gọi với dữ liệu gốc VÀ trường createdAt
        expect(setDoc).toHaveBeenCalledWith(mockDocRef, {
            ...productData,
            createdAt: serverTimestamp()
        });
    });

    it('hàm updateProduct nên gọi doc và updateDoc với các tham số chính xác', async () => {
        const productId = 'SP002';
        const productData = { productName: 'Sản phẩm cập nhật' };
        const mockDocRef = { id: 'mockDocRef' };
        doc.mockReturnValue(mockDocRef);

        await updateProduct(productId, productData);

        expect(doc).toHaveBeenCalledWith(db, 'products', productId);
        expect(updateDoc).toHaveBeenCalledWith(mockDocRef, productData);
    });

    it('hàm deleteProduct nên gọi doc và deleteDoc với tham số chính xác', async () => {
        const productId = 'SP003';
        const mockDocRef = { id: 'mockDocRef' };
        doc.mockReturnValue(mockDocRef);

        await deleteProduct(productId);

        expect(doc).toHaveBeenCalledWith(db, 'products', productId);
        expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });
});