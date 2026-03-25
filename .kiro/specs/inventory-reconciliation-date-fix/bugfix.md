# Bugfix Requirements Document

## Introduction

Lỗi xử lý hạn sử dụng (HSD) trong trang đối chiếu tồn kho giữa WebKho và Misa. Khi import dữ liệu từ file Excel Misa, HSD hiển thị bị lùi đi 1 ngày so với dữ liệu gốc. Ví dụ: HSD trong file Excel Misa là 31/07/2027 nhưng sau khi import vào trang đối chiếu chỉ hiển thị 30/07/2027.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN parsing HSD từ file Excel Misa trong hàm parseMisaExcel THEN hệ thống cộng thêm timezone offset không chính xác làm ngày bị lùi đi 1 ngày

1.2 WHEN HSD trong Excel là 31/07/2027 THEN hệ thống hiển thị 30/07/2027 trong trang đối chiếu

1.3 WHEN xử lý Date object từ Excel THEN hệ thống áp dụng công thức `new Date(hsd.getTime() + offset)` gây ra sai lệch múi giờ

### Expected Behavior (Correct)

2.1 WHEN parsing HSD từ file Excel Misa THEN hệ thống SHALL hiển thị đúng ngày như trong file Excel gốc

2.2 WHEN HSD trong Excel là 31/07/2027 THEN hệ thống SHALL hiển thị 31/07/2027 trong trang đối chiếu

2.3 WHEN xử lý Date object từ Excel THEN hệ thống SHALL sử dụng local date components (getFullYear, getMonth, getDate) thay vì timezone offset

### Unchanged Behavior (Regression Prevention)

3.1 WHEN HSD hiển thị đúng trên WebKho THEN hệ thống SHALL CONTINUE TO hiển thị chính xác HSD từ WebKho

3.2 WHEN xử lý các định dạng ngày khác (string, number, Firestore Timestamp) THEN hệ thống SHALL CONTINUE TO xử lý chính xác như hiện tại

3.3 WHEN thực hiện đối chiếu tồn kho THEN hệ thống SHALL CONTINUE TO so sánh chính xác các trường dữ liệu khác (mã hàng, số lô, số lượng)