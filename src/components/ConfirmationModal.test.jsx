// src/components/ConfirmationModal.test.jsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmationModal from './ConfirmationModal.jsx';
import React from 'react';

// Nhóm các bài test cho ConfirmationModal
describe('Component: ConfirmationModal', () => {

    it('không render gì cả khi prop "isOpen" là false', () => {
        // Render modal với isOpen={false}
        render(
            <ConfirmationModal
                isOpen={false}
                title="Test Title"
                message="Test Message"
                onConfirm={() => {}}
                onCancel={() => {}}
            />
        );
        
        // Sử dụng queryByText vì nó sẽ trả về null nếu không tìm thấy (thay vì báo lỗi)
        const titleElement = screen.queryByText('Test Title');
        expect(titleElement).toBeNull();
    });

    it('hiển thị đúng title và message khi "isOpen" là true', () => {
        render(
            <ConfirmationModal
                isOpen={true}
                title="Tiêu đề xác nhận"
                message="Bạn có chắc không?"
                onConfirm={() => {}}
                onCancel={() => {}}
            />
        );

        // Kiểm tra title và message có xuất hiện trên màn hình không
        expect(screen.getByText('Tiêu đề xác nhận')).toBeInTheDocument();
        expect(screen.getByText('Bạn có chắc không?')).toBeInTheDocument();
    });

    it('gọi hàm onConfirm khi nút xác nhận được click', () => {
        // Tạo một hàm giả (mock function) cho onConfirm
        const handleConfirm = vi.fn();
        
        render(
            <ConfirmationModal
                isOpen={true}
                title="Test"
                message="Test"
                onConfirm={handleConfirm}
                onCancel={() => {}}
                confirmText="Đồng ý"
            />
        );
        
        // Tìm nút xác nhận dựa vào text của nó
        const confirmButton = screen.getByRole('button', { name: /Đồng ý/i });
        
        // Mô phỏng hành động click
        fireEvent.click(confirmButton);
        
        // Kiểm tra xem hàm giả đã được gọi đúng 1 lần chưa
        expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it('gọi hàm onCancel khi nút hủy được click', () => {
        // Tạo hàm giả cho onCancel
        const handleCancel = vi.fn();
        
        render(
            <ConfirmationModal
                isOpen={true}
                title="Test"
                message="Test"
                onConfirm={() => {}}
                onCancel={handleCancel}
                cancelText="Bỏ qua"
            />
        );

        const cancelButton = screen.getByRole('button', { name: /Bỏ qua/i });
        fireEvent.click(cancelButton);
        
        expect(handleCancel).toHaveBeenCalledTimes(1);
    });
});