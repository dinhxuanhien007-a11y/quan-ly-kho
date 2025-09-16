// src/hooks/useFirestorePagination.test.js
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFirestorePagination } from './useFirestorePagination';

// Cho Vitest biết rằng mỗi khi có code nào import 'firebase/firestore',
// nó sẽ trỏ đến file mock của chúng ta.
vi.mock('firebase/firestore', async () => {
  const mocks = await vi.importActual('../../src/test/__mocks__/firebaseFirestore.js');
  return mocks;
});

// Import các hàm đã được mock
import { getDocs, startAfter, setupMockData } from 'firebase/firestore';

describe('Hook: useFirestorePagination', () => {

    const mockBaseQuery = { type: 'baseQuery' };
    const pageSize = 2;

    // Reset các mock trước mỗi bài test để đảm bảo chúng độc lập
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('nên tải trang đầu tiên một cách chính xác', async () => {
        // Arrange: Chuẩn bị dữ liệu mẫu cho trang 1
        setupMockData(1);

        // Act: Render hook
        const { result } = renderHook(() => useFirestorePagination(mockBaseQuery, pageSize));

        // Assert: Kiểm tra trạng thái loading ban đầu
        expect(result.current.loading).toBe(true);
        
        // Chờ cho đến khi hook hết loading
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        
        // Assert: Kiểm tra kết quả sau khi tải xong
        expect(result.current.documents).toHaveLength(2);
        expect(result.current.documents[0].id).toBe('partner-01');
        expect(result.current.page).toBe(1);
        expect(result.current.isLastPage).toBe(false);
        expect(getDocs).toHaveBeenCalledTimes(2); // 1 lần cho data, 1 lần để check isLastPage
    });

    it('nên tải trang tiếp theo khi gọi hàm nextPage', async () => {
        // Arrange: Setup trang 1
        setupMockData(1);
        const { result } = renderHook(() => useFirestorePagination(mockBaseQuery, pageSize));
        await waitFor(() => expect(result.current.loading).toBe(false));
        
        // Setup dữ liệu cho trang 2
        setupMockData(2);

        // Act: Gọi hàm nextPage
        act(() => {
            result.current.nextPage();
        });
        
        // Assert: Chờ loading và kiểm tra kết quả
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.documents).toHaveLength(2);
        expect(result.current.documents[0].id).toBe('partner-03');
        expect(result.current.page).toBe(2);
        expect(startAfter).toHaveBeenCalled(); // Kiểm tra xem hàm startAfter có được gọi không
    });
    
    it('nên reset về trang đầu tiên khi gọi hàm reset', async () => {
        // Arrange: Tải trang 1, rồi tải trang 2
        setupMockData(1);
        const { result } = renderHook(() => useFirestorePagination(mockBaseQuery, pageSize));
        await waitFor(() => expect(result.current.loading).toBe(false));
        
        setupMockData(2);
        act(() => { result.current.nextPage(); });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.page).toBe(2); // Đảm bảo đang ở trang 2

        // Setup lại dữ liệu cho trang 1
        setupMockData(1);
        
        // Act: Gọi hàm reset
        act(() => {
            result.current.reset();
        });

        // Assert: Chờ loading và kiểm tra đã về trang 1
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.documents[0].id).toBe('partner-01');
        expect(result.current.page).toBe(1);
    });
});