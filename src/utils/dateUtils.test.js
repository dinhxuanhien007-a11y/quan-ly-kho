import { describe, it, expect } from 'vitest';
import { formatDate, formatExpiryDate } from './dateUtils';

// Nhóm các bài test cho file dateUtils
describe('Các hàm xử lý ngày tháng', () => {

    // Nhóm các bài test cho hàm formatDate
    describe('hàm formatDate', () => {

        // Test trường hợp 1: Nó phải định dạng đúng
        it('phải định dạng một đối tượng Timestamp thành chuỗi dd/mm/yyyy', () => {
            const mockTimestamp = { toDate: () => new Date(2025, 11, 25) }; // Tháng 11 là tháng 12
            const ketQua = formatDate(mockTimestamp);
            expect(ketQua).toBe('25/12/2025');
        });

        // Test trường hợp 2: Nó phải trả về chuỗi rỗng nếu đầu vào là null
        it('phải trả về chuỗi rỗng nếu đầu vào là null', () => {
            expect(formatDate(null)).toBe('');
        });
    });

    // Nhóm các bài test cho hàm formatExpiryDate
    describe('hàm formatExpiryDate', () => {
        it('phải tự động thêm dấu gạch chéo', () => {
            expect(formatExpiryDate('31122025')).toBe('31/12/2025');
        });

        it('phải bỏ qua các ký tự không phải là số', () => {
            expect(formatExpiryDate('31-abc-12-2025')).toBe('31/12/2025');
        });
    });
});