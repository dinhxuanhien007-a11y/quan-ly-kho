# Danh Sách Task Triển Khai

- [ ] 1. Viết test khám phá điều kiện lỗi
  - **Property 1: Bug Condition** - HSD Từ Excel Bị Lùi 1 Ngày
  - **QUAN TRỌNG**: Viết property-based test này TRƯỚC KHI triển khai bản sửa
  - **MỤC TIÊU**: Tìm ra counterexample chứng minh lỗi tồn tại
  - **Phương Pháp Scoped PBT**: Scope property đến các trường hợp lỗi cụ thể: HSD từ Excel Misa với các ngày khác nhau
  - Test rằng parseMisaExcel xử lý HSD từ Excel bị lùi đi 1 ngày (từ Bug Condition trong thiết kế)
  - Chạy test trên mã CHƯA SỬA - mong đợi THẤT BẠI (điều này xác nhận lỗi tồn tại)
  - Ghi lại counterexample tìm được (ví dụ: "HSD 31/07/2027 trong Excel hiển thị 30/07/2027 thay vì 31/07/2027")
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Viết test bảo toàn thuộc tính (TRƯỚC KHI triển khai bản sửa)
  - **Property 2: Preservation** - Xử Lý HSD Từ Nguồn Khác
  - **QUAN TRỌNG**: Tuân theo phương pháp observation-first
  - Quan sát: HSD từ WebKho hiển thị chính xác trên mã chưa sửa
  - Quan sát: Xử lý các định dạng ngày khác (string, number, Timestamp) hoạt động đúng trên mã chưa sửa
  - Viết property-based test: đối với tất cả input không phải từ Excel Misa, kết quả xử lý HSD giống như hiện tại (từ Preservation Requirements trong thiết kế)
  - Xác minh test PASS trên mã CHƯA SỬA
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Sửa lỗi xử lý HSD từ Excel Misa

  - [ ] 3.1 Triển khai bản sửa
    - Loại bỏ logic timezone offset hiện tại trong hàm parseMisaExcel
    - Thay thế bằng việc sử dụng local date components: getFullYear(), getMonth(), getDate()
    - Tạo Date object mới với local components: new Date(year, month, day)
    - Cập nhật comment từ "✅ FIX" thành mô tả chính xác
    - Đảm bảo logic nhất quán với hàm parseDate
    - _Bug_Condition: isBugCondition(input) where input.source === 'misa_excel' AND input.hsd instanceof Date_
    - _Expected_Behavior: expectedBehavior(result) từ thiết kế - HSD hiển thị chính xác như trong Excel gốc_
    - _Preservation: Preservation Requirements từ thiết kế - xử lý HSD từ WebKho và các định dạng khác không thay đổi_
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

  - [ ] 3.2 Xác minh test khám phá điều kiện lỗi giờ đây pass
    - **Property 1: Expected Behavior** - HSD Từ Excel Hiển Thị Chính Xác
    - **QUAN TRỌNG**: Chạy lại CÙNG test từ task 1 - KHÔNG viết test mới
    - Test từ task 1 encode hành vi mong muốn
    - Khi test này pass, nó xác nhận hành vi mong muốn được thỏa mãn
    - Chạy bug condition exploration test từ bước 1
    - **KẾT QUẢ MONG ĐỢI**: Test PASS (xác nhận lỗi đã được sửa)
    - _Requirements: Expected Behavior Properties từ thiết kế_

  - [ ] 3.3 Xác minh test bảo toàn vẫn pass
    - **Property 2: Preservation** - Xử Lý HSD Từ Nguồn Khác
    - **QUAN TRỌNG**: Chạy lại CÙNG test từ task 2 - KHÔNG viết test mới
    - Chạy preservation property test từ bước 2
    - **KẾT QUẢ MONG ĐỢI**: Test PASS (xác nhận không có regression)
    - Xác nhận tất cả test vẫn pass sau khi sửa (không có regression)

- [ ] 4. Checkpoint - Đảm bảo tất cả test pass
  - Đảm bảo tất cả test pass, hỏi người dùng nếu có thắc mắc phát sinh.