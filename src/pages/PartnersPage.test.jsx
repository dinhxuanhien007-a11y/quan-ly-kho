// src/pages/PartnersPage.test.jsx

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

// BƯỚC 1: Mock toàn bộ custom hook mà component này sử dụng
import { useFirestorePagination } from '../hooks/useFirestorePagination';
vi.mock('../hooks/useFirestorePagination');

// Import component cần test
import PartnersPage from './PartnersPage';

// Component PartnersPage có thể chứa <NavLink> hoặc các hook của react-router,
// nên chúng ta cần bọc nó trong <BrowserRouter> khi test.
const MockWrapper = ({ children }) => <BrowserRouter>{children}</BrowserRouter>;

describe('Page: PartnersPage', () => {
    
    beforeEach(() => {
        // Reset mock trước mỗi bài test để đảm bảo chúng độc lập
        vi.clearAllMocks();
    });

    // Test case 1: Trạng thái đang tải dữ liệu
    it('nên hiển thị Spinner khi đang loading', () => {
        // Arrange: Giả lập hook trả về trạng thái loading
        useFirestorePagination.mockReturnValue({
            documents: [],
            loading: true,
            // Các giá trị khác không quan trọng trong test case này
            isLastPage: true, 
            page: 1,
            nextPage: vi.fn(),
            prevPage: vi.fn(),
            reset: vi.fn(),
        });

        // Act: Render component
        render(<PartnersPage />, { wrapper: MockWrapper });

        // Assert:
        // - Tiêu đề trang phải luôn hiển thị
        expect(screen.getByRole('heading', { name: /Quản Lý Đối Tác/i })).toBeInTheDocument();
        // - Spinner không có text, nên ta kiểm tra sự VẮNG MẶT của nội dung bảng
        expect(screen.queryByText('Mã Đối Tác')).toBeNull(); 
    });

    // Test case 2: Tải thành công và có dữ liệu
    it('nên hiển thị bảng với dữ liệu đối tác khi tải thành công', () => {
        // Arrange: Giả lập hook trả về một mảng dữ liệu mẫu
        const mockPartners = [
            { id: 'NCC-01', partnerName: 'Nhà Cung Cấp A', partnerType: 'supplier' },
            { id: 'KH-01', partnerName: 'Khách Hàng B', partnerType: 'customer' },
        ];
        useFirestorePagination.mockReturnValue({
            documents: mockPartners,
            loading: false,
            // ... các giá trị khác
        });

        // Act
        render(<PartnersPage />, { wrapper: MockWrapper });

        // Assert: Kiểm tra xem các tên đối tác có được render ra không
        expect(screen.getByText('Nhà Cung Cấp A')).toBeInTheDocument();
        expect(screen.getByText('Khách Hàng B')).toBeInTheDocument();
        // Kiểm tra cả loại đối tác
        expect(screen.getByText('Nhà Cung Cấp')).toBeInTheDocument();
        expect(screen.getByText('Khách Hàng')).toBeInTheDocument();
    });

    // Test case 3: Tải thành công nhưng không có dữ liệu
    it('nên hiển thị thông báo khi không có đối tác nào', () => {
        // Arrange: Giả lập hook trả về một mảng rỗng
        useFirestorePagination.mockReturnValue({
            documents: [],
            loading: false,
            // ... các giá trị khác
        });

        // Act
        render(<PartnersPage />, { wrapper: MockWrapper });

        // Assert: Kiểm tra thông báo "Chưa có đối tác nào." đã được hiển thị
        expect(screen.getByText('Chưa có đối tác nào.')).toBeInTheDocument();
    });
});