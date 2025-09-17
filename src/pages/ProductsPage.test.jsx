// src/pages/ProductsPage.test.jsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

// Mock hook và các component con
import { useFirestorePagination } from '../hooks/useFirestorePagination';
vi.mock('../hooks/useFirestorePagination');

// Import component cần test
import ProductsPage from './ProductsPage';

const MockWrapper = ({ children }) => <BrowserRouter>{children}</BrowserRouter>;

describe('Page: ProductsPage', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('nên hiển thị Spinner khi đang loading', () => {
        // Arrange
        useFirestorePagination.mockReturnValue({
            documents: [],
            loading: true,
        });

        // Act
        render(<ProductsPage />, { wrapper: MockWrapper });

        // Assert
        expect(screen.getByRole('heading', { name: /Quản Lý Hàng Hóa/i })).toBeInTheDocument();
        // Kiểm tra sự vắng mặt của header bảng
        expect(screen.queryByText('Mã hàng')).toBeNull(); 
    });

    it('nên hiển thị bảng sản phẩm khi tải thành công', () => {
        // Arrange
        const mockProducts = [
            { id: 'SP001', productName: 'Bông cồn', unit: 'Hộp', team: 'MED' },
            { id: 'SP002', productName: 'Găng tay y tế', unit: 'Thùng', team: 'BIO' },
        ];
        useFirestorePagination.mockReturnValue({
            documents: mockProducts,
            loading: false,
        });

        // Act
        render(<ProductsPage />, { wrapper: MockWrapper });

        // Assert
        expect(screen.getByText('Bông cồn')).toBeInTheDocument();
        expect(screen.getByText('Găng tay y tế')).toBeInTheDocument();
        // Lấy tất cả các dòng trong bảng (bao gồm cả header)
        const rows = screen.getAllByRole('row');
        // Mong đợi có 1 dòng header + 2 dòng dữ liệu = 3 dòng
        expect(rows).toHaveLength(3);
    });
    
    it('nên hiển thị thông báo khi không tìm thấy sản phẩm nào', () => {
        // Arrange: Giả lập hook trả về mảng rỗng
        useFirestorePagination.mockReturnValue({
            documents: [],
            loading: false,
        });

        // Act
        render(<ProductsPage />, { wrapper: MockWrapper });

        // Assert
        expect(screen.getByText('Không tìm thấy sản phẩm nào.')).toBeInTheDocument();
    });

    it('nên cập nhật giá trị của ô tìm kiếm khi người dùng nhập liệu', () => {
        // Arrange
        useFirestorePagination.mockReturnValue({
            documents: [],
            loading: false,
        });
        render(<ProductsPage />, { wrapper: MockWrapper });

        // Act
        const searchInput = screen.getByPlaceholderText('Tìm theo Mã hàng...');
        // Mô phỏng người dùng gõ "TEST-SEARCH"
        fireEvent.change(searchInput, { target: { value: 'TEST-SEARCH' } });

        // Assert: Kiểm tra xem giá trị của ô input đã được cập nhật đúng chưa
        expect(searchInput.value).toBe('TEST-SEARCH');
    });
});