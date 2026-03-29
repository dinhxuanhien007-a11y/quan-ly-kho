# Requirements Document

## Introduction

Tính năng Kiểm kho cộng tác nhiều thiết bị realtime (Collaborative Stocktake) cho phép Owner tạo phiên kiểm kê và mời các admin tham gia kiểm kho đồng thời trên nhiều thiết bị. Mỗi thành viên tự do nhập số lượng đếm được theo lô bất kỳ mà họ thấy, và theo dõi tiến độ của nhau theo thời gian thực. Owner duyệt kết quả cuối cùng trước khi áp dụng vào inventory_lots. Phiên không giới hạn thời gian và chỉ đóng khi Owner chủ động đóng hoặc sau khi Reconciliation hoàn tất.

## Glossary

- **Session**: Phiên kiểm kê cộng tác, được tạo bởi Owner, không giới hạn thời gian, chỉ đóng khi Owner đóng hoặc Reconciliation hoàn tất.
- **Owner**: Người dùng có role `owner`, có toàn quyền tạo/quản lý/duyệt phiên.
- **Participant**: Người dùng có role `admin` được Owner thêm vào phiên bằng email.
- **Count_Entry**: Bản ghi nhập liệu gồm lot_id + số lượng đếm được, do Participant tạo tự do cho bất kỳ lô nào.
- **Conflict**: Trạng thái khi 2 Participant khác nhau cùng nhập Count_Entry cho cùng một `lotId` trong cùng phiên.
- **Audit_Log**: Bản ghi lịch sử mọi thao tác nhập liệu (ai, lô nào, số lượng, thời điểm).
- **Reconciliation**: Quá trình Owner duyệt và áp dụng kết quả kiểm kê vào inventory_lots.
- **Realtime_Listener**: Cơ chế Firestore onSnapshot để đồng bộ dữ liệu tức thì giữa các thiết bị.
- **Stocktake_Collection**: Collection `stocktakes` trong Firestore, hiện có các field: name, scope, status, createdAt.

## Requirements

---

### Requirement 1: Tạo phiên kiểm kê cộng tác

**User Story:** As an Owner, I want to create a collaborative stocktake session with a name, scope, and list of participant emails, so that I can organize a multi-device inventory count.

#### Acceptance Criteria

1. WHEN Owner gửi yêu cầu tạo phiên với name, scope và danh sách email hợp lệ, THE Session SHALL được tạo document mới trong collection `stocktakes` với các field: `name`, `scope`, `status: "active"`, `createdAt` (server timestamp), `ownerUid`, `participantEmails[]`.
2. WHEN Owner thêm email vào phiên, THE Session SHALL kiểm tra email tồn tại trong collection `users` với role `admin` trước khi thêm vào `participantEmails`.
3. IF email được thêm không tồn tại trong `users` hoặc không có role `admin`, THEN THE Session SHALL trả về lỗi mô tả rõ email nào không hợp lệ và lý do.
4. THE Session SHALL cho phép Owner thêm hoặc xóa Participant khỏi phiên khi phiên đang ở trạng thái `active`.
5. WHEN Owner tạo phiên, THE Session SHALL tạo subcollection `count_entries` rỗng bên trong document phiên.

---

### Requirement 2: Nhập liệu kiểm kê theo lô (realtime)

**User Story:** As a Participant, I want to enter counted quantities by lot number in real time, so that my data is immediately visible to all team members.

#### Acceptance Criteria

1. WHEN Participant nhập Count_Entry hợp lệ (lot_id tồn tại trong `inventory_lots`, quantity >= 0), THE Session SHALL lưu document vào subcollection `count_entries` với các field: `lotId`, `productId`, `countedQty`, `enteredBy` (uid), `enteredAt` (server timestamp), `note` (tùy chọn).
2. WHEN Count_Entry được lưu thành công, THE Realtime_Listener SHALL cập nhật dữ liệu trên tất cả thiết bị đang kết nối trong vòng 2 giây.
3. IF lot_id không tồn tại trong `inventory_lots`, THEN THE Session SHALL từ chối Count_Entry và trả về lỗi "Mã lô không tồn tại".
4. IF quantity nhập vào là số âm, THEN THE Session SHALL từ chối Count_Entry và trả về lỗi "Số lượng không hợp lệ".
5. WHEN Participant nhập Count_Entry cho lot_id đã có entry của chính mình trong cùng phiên, THE Session SHALL cập nhật (overwrite) entry cũ thay vì tạo entry mới, và ghi Audit_Log cho cả hai thao tác.

---

### Requirement 3: Phát hiện xung đột nhập liệu

**User Story:** As an Owner, I want to be notified when two participants enter data for the same lot, so that I can resolve discrepancies before approving results.

#### Acceptance Criteria

1. WHEN 2 Participant khác nhau tạo Count_Entry cho cùng một `lotId` trong cùng phiên, THE Session SHALL đánh dấu `conflict: true` trên cả hai Count_Entry liên quan.
2. WHEN xung đột được phát hiện, THE Realtime_Listener SHALL hiển thị cảnh báo xung đột trên giao diện của Owner trong vòng 2 giây.
3. WHILE phiên có xung đột chưa được giải quyết, THE Session SHALL ngăn Owner thực hiện Reconciliation và hiển thị danh sách các lô xung đột.
4. WHEN Owner giải quyết xung đột bằng cách chọn Count_Entry nào được giữ lại, THE Session SHALL cập nhật `conflict: false` và đánh dấu entry bị loại là `rejected: true`.

---

### Requirement 4: Theo dõi tiến độ realtime

**User Story:** As any session member, I want to see the real-time progress of the stocktake, so that I know how much has been completed.

#### Acceptance Criteria

1. WHEN Count_Entry được thêm hoặc cập nhật, THE Realtime_Listener SHALL cập nhật phần trăm hoàn thành tổng thể trên tất cả thiết bị trong vòng 2 giây.
2. THE Session SHALL tính phần trăm hoàn thành tổng thể dựa trên số lot đã có Count_Entry so với tổng số lot trong scope của phiên.
3. WHILE phiên có `status: "active"`, THE Realtime_Listener SHALL cho phép tất cả Participant và Owner xem tiến độ chung của phiên.

---

### Requirement 5: Audit Log

**User Story:** As an Owner, I want a complete audit trail of all data entry actions, so that I can trace who entered what and when.

#### Acceptance Criteria

1. WHEN bất kỳ Count_Entry nào được tạo, cập nhật hoặc bị từ chối, THE Session SHALL ghi một document vào subcollection `audit_logs` với các field: `action` (created/updated/rejected), `lotId`, `countedQty`, `performedBy` (uid), `performedAt` (server timestamp), `previousQty` (nếu là update).
2. THE Session SHALL ghi Audit_Log khi Owner giải quyết xung đột, bao gồm `action: "conflict_resolved"`, `keptEntryId`, `rejectedEntryId`, `resolvedBy`, `resolvedAt`.
3. THE Session SHALL ghi Audit_Log khi Owner thực hiện Reconciliation, bao gồm `action: "reconciled"`, `sessionId`, `performedBy`, `performedAt`.
4. THE Owner SHALL có thể đọc toàn bộ `audit_logs` của phiên bất kỳ lúc nào trong và sau khi phiên kết thúc.
5. THE Session SHALL bảo toàn `audit_logs` ngay cả khi phiên chuyển sang trạng thái `adjusted`.

---

### Requirement 6: Duyệt và áp dụng kết quả (Reconciliation)

**User Story:** As an Owner, I want to review and approve stocktake results before applying them to inventory, so that I maintain full control over inventory data integrity.

#### Acceptance Criteria

1. WHEN Owner yêu cầu Reconciliation, THE Session SHALL kiểm tra phiên không còn xung đột chưa giải quyết trước khi cho phép tiến hành.
2. WHEN Owner xác nhận Reconciliation, THE Session SHALL tạo document trong collection `inventory_adjustments` cho mỗi lô có chênh lệch giữa `countedQty` và `currentQty` trong `inventory_lots`.
3. WHEN Reconciliation hoàn tất, THE Session SHALL cập nhật `status` của phiên sang `"adjusted"` và ghi timestamp `adjustedAt`.
4. IF Reconciliation thất bại do lỗi hệ thống, THEN THE Session SHALL rollback toàn bộ thay đổi và giữ nguyên trạng thái phiên, đồng thời trả về thông báo lỗi chi tiết.
5. THE Session SHALL chỉ cho phép Owner (không phải Participant) thực hiện Reconciliation.
6. WHEN Reconciliation hoàn tất, THE Session SHALL tạo báo cáo chênh lệch tóm tắt gồm: tổng số lô kiểm, số lô có chênh lệch, tổng chênh lệch số lượng, danh sách lô chênh lệch kèm giá trị trước/sau.

---

### Requirement 7: Bảo mật và phân quyền trong phiên

**User Story:** As an Owner, I want participants to only access stocktake data within their session, so that they cannot read or modify core inventory data.

#### Acceptance Criteria

1. THE Session SHALL chỉ cho phép Participant đọc và ghi vào subcollection `count_entries` của phiên mà Participant được thêm vào (uid có trong `participantEmails` mapping).
2. THE Session SHALL không cấp Participant quyền đọc hoặc ghi vào collections `inventory_lots`, `products`, `import_tickets`, `export_tickets`, `inventory_adjustments`.
3. THE Session SHALL không cấp Participant quyền sửa document gốc của phiên trong collection `stocktakes` (chỉ Owner mới được sửa).
4. IF Participant cố gắng truy cập dữ liệu ngoài phạm vi phiên, THEN THE Session SHALL từ chối request với lỗi permission-denied.
5. THE Session SHALL xác thực mọi Count_Entry thông qua Firestore Security Rules, đảm bảo `enteredBy` khớp với `request.auth.uid` của người gửi request.
6. WHEN phiên chuyển sang `adjusted`, THE Session SHALL thu hồi quyền ghi của Participant vào `count_entries`.

---

### Requirement 8: Tối ưu giao diện mobile

**User Story:** As a Participant using a mobile device, I want a touch-optimized interface for entering lot counts, so that I can work efficiently in a warehouse environment.

#### Acceptance Criteria

1. THE Stocktake_UI SHALL hiển thị đúng trên màn hình có chiều rộng từ 320px trở lên mà không cần cuộn ngang.
2. THE Stocktake_UI SHALL có các vùng nhấn (touch target) tối thiểu 44x44px cho tất cả nút thao tác nhập liệu.
3. WHEN kết nối mạng bị gián đoạn, THE Stocktake_UI SHALL hiển thị thông báo "Mất kết nối - dữ liệu sẽ đồng bộ khi có mạng" và hàng đợi Count_Entry chờ đồng bộ.
4. WHEN kết nối mạng được khôi phục, THE Realtime_Listener SHALL tự động đồng bộ các Count_Entry trong hàng đợi mà không cần thao tác thủ công từ người dùng.
