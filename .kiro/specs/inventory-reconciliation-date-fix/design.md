# Khắc Phục Lỗi HSD Bị Lùi 1 Ngày - Tài Liệu Thiết Kế

## Tổng Quan

Lỗi xử lý hạn sử dụng (HSD) trong trang đối chiếu tồn kho xảy ra khi import dữ liệu từ file Excel Misa. HSD hiển thị bị lùi đi 1 ngày so với dữ liệu gốc do việc xử lý timezone offset không chính xác trong hàm `parseMisaExcel`. Chiến lược khắc phục là sử dụng local date components thay vì timezone offset để đảm bảo ngày hiển thị chính xác.

## Thuật Ngữ

- **Bug_Condition (C)**: Điều kiện kích hoạt lỗi - khi HSD từ Excel được xử lý với timezone offset không chính xác
- **Property (P)**: Hành vi mong muốn - HSD hiển thị chính xác như trong file Excel gốc
- **Preservation**: Các hành vi hiện tại phải được bảo toàn - xử lý HSD từ WebKho và các định dạng khác
- **parseMisaExcel**: Hàm trong `src/pages/InventoryReconciliationPage.jsx` xử lý dữ liệu từ file Excel Misa
- **parseDate**: Hàm chuyển đổi các định dạng ngày khác nhau thành Date object chuẩn
- **HSD (Hạn Sử Dụng)**: Ngày hết hạn của sản phẩm trong kho

## Chi Tiết Lỗi

### Điều Kiện Lỗi

Lỗi xảy ra khi xử lý HSD từ file Excel Misa trong hàm `parseMisaExcel`. Hàm hiện tại đang cộng thêm timezone offset (`hsd.getTime() + offset`) làm cho ngày bị lùi đi 1 ngày.

**Đặc Tả Chính Thức:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { hsd: Date, source: string }
  OUTPUT: boolean
  
  RETURN input.source === 'misa_excel'
         AND input.hsd instanceof Date
         AND NOT isNaN(input.hsd.getTime())
         AND currentProcessingUsesTimezoneOffset(input.hsd)
END FUNCTION
```

### Ví Dụ

- **Ví dụ 1**: HSD trong Excel Misa là 31/07/2027, sau khi import hiển thị 30/07/2027
- **Ví dụ 2**: HSD trong Excel Misa là 15/12/2025, sau khi import hiển thị 14/12/2025  
- **Ví dụ 3**: HSD trong Excel Misa là 01/01/2026, sau khi import hiển thị 31/12/2025
- **Trường hợp biên**: HSD là 01/01/2025 có thể bị lùi về 31/12/2024 (chuyển sang năm trước)

## Hành Vi Mong Muốn

### Yêu Cầu Bảo Toàn

**Các Hành Vi Không Thay Đổi:**
- Xử lý HSD từ WebKho phải tiếp tục hoạt động chính xác như hiện tại
- Xử lý các định dạng ngày khác (string, number, Firestore Timestamp) phải không bị ảnh hưởng
- Chức năng đối chiếu tồn kho cho các trường khác (mã hàng, số lô, số lượng) phải hoạt động bình thường

**Phạm Vi:**
Tất cả các input KHÔNG liên quan đến HSD từ Excel Misa sẽ hoàn toàn không bị ảnh hưởng bởi bản sửa lỗi này. Bao gồm:
- Thao tác click chuột trên giao diện
- Xử lý dữ liệu từ WebKho
- Xử lý các định dạng ngày khác (string patterns, timestamps)

## Phân Tích Nguyên Nhân Gốc

Dựa trên mô tả lỗi, các nguyên nhân có thể xảy ra:

1. **Xử Lý Timezone Offset Sai**: Hàm hiện tại sử dụng `hsd.getTime() + offset` không chính xác
   - Excel lưu Date object theo local timezone
   - Việc cộng thêm offset gây ra sai lệch múi giờ

2. **Hiểu Nhầm Cách Excel Lưu Ngày**: Giả định Excel lưu theo UTC là không chính xác

3. **Logic Xử Lý Không Nhất Quán**: Hàm `parseDate` đã xử lý đúng bằng cách dùng local components nhưng `parseMisaExcel` lại dùng timezone offset

4. **Thiếu Kiểm Tra Múi Giờ**: Không xem xét đến việc múi giờ có thể khác nhau giữa client và server

## Thuộc Tính Đúng Đắn

Property 1: Bug Condition - HSD Từ Excel Hiển Thị Chính Xác

_Đối với bất kỳ_ input nào mà điều kiện lỗi xảy ra (isBugCondition trả về true), hàm parseMisaExcel đã sửa SẼ hiển thị HSD chính xác như trong file Excel gốc, không bị lùi đi 1 ngày.

**Xác Thực: Yêu Cầu 2.1, 2.2**

Property 2: Preservation - Xử Lý Ngày Từ Nguồn Khác

_Đối với bất kỳ_ input nào mà điều kiện lỗi KHÔNG xảy ra (isBugCondition trả về false), mã đã sửa SẼ tạo ra kết quả giống hệt như mã gốc, bảo toàn việc xử lý HSD từ WebKho và các định dạng ngày khác.

**Xác Thực: Yêu Cầu 3.1, 3.2, 3.3**

## Triển Khai Sửa Lỗi

### Các Thay Đổi Cần Thiết

Giả định phân tích nguyên nhân gốc của chúng ta là chính xác:

**File**: `src/pages/InventoryReconciliationPage.jsx`

**Hàm**: `parseMisaExcel`

**Các Thay Đổi Cụ Thể**:
1. **Loại Bỏ Timezone Offset**: Xóa logic `hsd.getTime() + offset` hiện tại
   - Thay thế bằng việc sử dụng local date components
   - Sử dụng `getFullYear()`, `getMonth()`, `getDate()` thay vì timezone calculations

2. **Sử Dụng Local Date Components**: Áp dụng cùng logic như hàm `parseDate`
   - `const year = hsd.getFullYear()`
   - `const month = hsd.getMonth()`  
   - `const day = hsd.getDate()`

3. **Tạo Date Object Mới**: Tạo Date object với local components
   - `new Date(year, month, day)`

4. **Cập Nhật Comment**: Thay đổi comment từ "✅ FIX" thành mô tả chính xác

5. **Đảm Bảo Nhất Quán**: Đảm bảo logic xử lý nhất quán với hàm `parseDate`

## Chiến Lược Kiểm Thử

### Phương Pháp Xác Thực

Chiến lược kiểm thử theo hai giai đoạn: đầu tiên, tìm ra các counterexample chứng minh lỗi trên mã chưa sửa, sau đó xác minh bản sửa hoạt động chính xác và bảo toàn hành vi hiện tại.

### Kiểm Thử Khám Phá Điều Kiện Lỗi

**Mục Tiêu**: Tìm ra counterexample chứng minh lỗi TRƯỚC KHI triển khai bản sửa. Xác nhận hoặc bác bỏ phân tích nguyên nhân gốc. Nếu bác bỏ, chúng ta sẽ cần phân tích lại.

**Kế Hoạch Kiểm Thử**: Viết test mô phỏng việc xử lý HSD từ Excel với các ngày khác nhau và kiểm tra kết quả hiển thị. Chạy test trên mã CHƯA SỬA để quan sát lỗi và hiểu nguyên nhân gốc.

**Các Test Case**:
1. **Test Ngày Cuối Tháng**: Mô phỏng HSD 31/07/2027 từ Excel (sẽ fail trên mã chưa sửa)
2. **Test Ngày Đầu Tháng**: Mô phỏng HSD 01/01/2026 từ Excel (sẽ fail trên mã chưa sửa)  
3. **Test Ngày Giữa Tháng**: Mô phỏng HSD 15/12/2025 từ Excel (sẽ fail trên mã chưa sửa)
4. **Test Ngày Cuối Năm**: Mô phỏng HSD 31/12/2025 từ Excel (có thể fail trên mã chưa sửa)

**Counterexample Mong Đợi**:
- HSD hiển thị bị lùi đi 1 ngày so với dữ liệu Excel gốc
- Nguyên nhân có thể: timezone offset calculation sai, xử lý Date object không chính xác

### Kiểm Thử Sửa Lỗi

**Mục Tiêu**: Xác minh rằng đối với tất cả input mà điều kiện lỗi xảy ra, hàm đã sửa tạo ra hành vi mong muốn.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := parseMisaExcel_fixed(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Kiểm Thử Bảo Toàn

**Mục Tiêu**: Xác minh rằng đối với tất cả input mà điều kiện lỗi KHÔNG xảy ra, hàm đã sửa tạo ra kết quả giống hệt hàm gốc.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT parseMisaExcel_original(input) = parseMisaExcel_fixed(input)
END FOR
```

**Phương Pháp Kiểm Thử**: Property-based testing được khuyến nghị cho kiểm thử bảo toàn vì:
- Tự động tạo ra nhiều test case trên toàn bộ domain input
- Phát hiện các edge case mà unit test thủ công có thể bỏ sót  
- Cung cấp đảm bảo mạnh mẽ rằng hành vi không thay đổi cho tất cả input không bị lỗi

**Kế Hoạch Kiểm Thử**: Quan sát hành vi trên mã CHƯA SỬA trước cho việc xử lý HSD từ WebKho và các tương tác khác, sau đó viết property-based test để capture hành vi đó.

**Các Test Case**:
1. **Bảo Toàn Xử Lý WebKho**: Quan sát rằng HSD từ WebKho hoạt động chính xác trên mã chưa sửa, sau đó viết test để xác minh điều này tiếp tục sau khi sửa
2. **Bảo Toàn Định Dạng Ngày Khác**: Quan sát rằng xử lý string/number/Timestamp hoạt động chính xác trên mã chưa sửa, sau đó viết test để xác minh điều này tiếp tục sau khi sửa
3. **Bảo Toàn Chức Năng Đối Chiếu**: Quan sát rằng so sánh các trường khác hoạt động chính xác trên mã chưa sửa, sau đó viết test để xác minh điều này tiếp tục sau khi sửa

### Unit Tests

- Test xử lý HSD từ Excel với các định dạng ngày khác nhau
- Test edge case (ngày không hợp lệ, null values, empty strings)
- Test rằng xử lý HSD từ WebKho tiếp tục hoạt động chính xác

### Property-Based Tests

- Tạo random Excel data với HSD và xác minh hiển thị chính xác
- Tạo random WebKho data và xác minh hành vi bảo toàn
- Test rằng tất cả input không phải Excel tiếp tục hoạt động trên nhiều scenario

### Integration Tests

- Test full flow import Excel với HSD trong từng context
- Test chuyển đổi giữa dữ liệu WebKho và Misa với HSD chính xác
- Test rằng giao diện hiển thị HSD chính xác sau khi import