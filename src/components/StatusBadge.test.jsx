// src/components/StatusBadge.test.jsx

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';
import React from 'react';

// Nhóm các bài test cho component StatusBadge
describe('Component: StatusBadge', () => {

    it('hiển thị đúng text và class cho trạng thái "pending"', () => {
        // B1: Render component với props cần test
        render(<StatusBadge status="pending" />);
        
        // B2: Tìm element trong DOM ảo dựa trên nội dung text của nó
        const badgeElement = screen.getByText('Đang chờ');
        
        // B3: Kiểm tra (Assert) xem element có tồn tại không và có đúng class CSS không
        expect(badgeElement).toBeInTheDocument();
        expect(badgeElement).toHaveClass('status-badge');
        expect(badgeElement).toHaveClass('status-pending');
    });

    it('hiển thị đúng text và class cho trạng thái "completed"', () => {
        render(<StatusBadge status="completed" />);
        const badgeElement = screen.getByText('Hoàn thành');
        
        expect(badgeElement).toBeInTheDocument();
        expect(badgeElement).toHaveClass('status-completed');
    });

    it('hiển thị đúng text và class cho trạng thái "cancelled"', () => {
        render(<StatusBadge status="cancelled" />);
        const badgeElement = screen.getByText('Đã hủy');

        expect(badgeElement).toBeInTheDocument();
        expect(badgeElement).toHaveClass('status-cancelled');
    });
    
    it('hiển thị đúng text và class cho trạng thái "in_progress"', () => {
        render(<StatusBadge status="in_progress" />);
        const badgeElement = screen.getByText('Đang thực hiện');

        expect(badgeElement).toBeInTheDocument();
        // Tái sử dụng style của pending
        expect(badgeElement).toHaveClass('status-pending');
    });
    
    it('hiển thị đúng text và class cho trạng thái "adjusted"', () => {
        render(<StatusBadge status="adjusted" />);
        const badgeElement = screen.getByText('Đã điều chỉnh');

        expect(badgeElement).toBeInTheDocument();
        expect(badgeElement).toHaveClass('status-adjusted');
    });

    it('hiển thị chính giá trị status nếu không khớp với case nào', () => {
        const randomStatus = "unknown_status";
        render(<StatusBadge status={randomStatus} />);
        const badgeElement = screen.getByText(randomStatus);

        expect(badgeElement).toBeInTheDocument();
        expect(badgeElement).toHaveClass(`status-${randomStatus}`);
    });
});