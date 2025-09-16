// src/test/__mocks__/firebaseFirestore.js
import { vi } from 'vitest';

// Dữ liệu mẫu
const mockDataPage1 = [
    { id: 'partner-01', data: () => ({ partnerName: 'Công ty A' }) },
    { id: 'partner-02', data: () => ({ partnerName: 'Công ty B' }) },
];

const mockDataPage2 = [
    { id: 'partner-03', data: () => ({ partnerName: 'Công ty C' }) },
    { id: 'partner-04', data: () => ({ partnerName: 'Công ty D' }) },
];

// Tạo hàm mock getDocs
const mockGetDocs = vi.fn();

// Hàm tiện ích để thiết lập dữ liệu trả về cho getDocs
export const setupMockData = (page) => {
    let docs = [];
    if (page === 1) {
        docs = mockDataPage1;
    } else if (page === 2) {
        docs = mockDataPage2;
    }

    mockGetDocs.mockResolvedValue({
        docs: docs,
        empty: docs.length === 0,
    });
};

// Mock các hàm khác mà hook sử dụng
export const getDocs = mockGetDocs;
export const query = vi.fn((...args) => ({ _query: args, type: 'query' }));
export const limit = vi.fn((...args) => ({ _limit: args, type: 'limit' }));
export const startAfter = vi.fn((...args) => ({ _startAfter: args, type: 'startAfter' }));
export const endBefore = vi.fn((...args) => ({ _endBefore: args, type: 'endBefore' }));
export const limitToLast = vi.fn((...args) => ({ _limitToLast: args, type: 'limitToLast' }));
export const collection = vi.fn((...args) => ({ _collection: args, type: 'collection' }));
export const orderBy = vi.fn((...args) => ({ _orderBy: args, type: 'orderBy' }));
export const documentId = vi.fn(() => 'mockDocumentId');