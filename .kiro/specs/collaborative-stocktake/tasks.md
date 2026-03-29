# Implementation Plan: Collaborative Stocktake

## Overview

Triển khai tính năng kiểm kho cộng tác nhiều thiết bị realtime. Thứ tự implement từ nền tảng dữ liệu lên UI, đảm bảo không phá vỡ flow single-user hiện tại.

## Tasks

- [x] 1. Firestore schema & security rules
  - [x] 1.1 Mở rộng Firestore Security Rules cho collaborative stocktake
    - Thêm helper function `isParticipant(sessionId)` kiểm tra `request.auth.uid` có trong `participantUids` của document `stocktakes/{sessionId}`
    - Mở rộng rule `stocktakes/{sessionId}`: participant được read document phiên
    - Thêm rule `stocktakes/{sessionId}/count_entries/{entryId}`: participant được read/write nếu `isParticipant(sessionId)` và phiên chưa `adjusted`
    - Thêm rule `stocktakes/{sessionId}/audit_logs/{logId}`: owner được read/write, participant chỉ được read
    - Đảm bảo rule từ chối write nếu `request.resource.data.enteredBy != request.auth.uid` (Property 16)
    - Đảm bảo rule từ chối write vào `count_entries` khi `resource.data.status == 'adjusted'` (Property 17)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 1.2 Viết security rules unit tests (Firebase Emulator + `@firebase/rules-unit-testing`)
    - **Property 15: Participant isolation** — participant không đọc được `inventory_lots`, `products`, `import_tickets`, `export_tickets`, `inventory_adjustments`
    - **Property 16: enteredBy authentication invariant** — write bị từ chối nếu `enteredBy != auth.uid`
    - **Property 17: Write revocation on adjusted status** — write bị từ chối khi phiên `adjusted`
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

- [x] 2. Service layer — `collaborativeStocktakeService.js`
  - [x] 2.1 Tạo file `src/services/collaborativeStocktakeService.js` với các hàm core
    - `validateParticipantEmails(emails)`: query `users` collection, kiểm tra từng email tồn tại và có `role == 'admin'`, trả về `{ valid: [{email, uid}], invalid: [{email, reason}] }`
    - `createCollaborativeSession(sessionData, participantList)`: tạo document `stocktakes` với fields `isCollaborative: true`, `participantEmails[]`, `participantUids[]`, `status: 'active'`
    - `writeCountEntry(sessionId, lotId, countedQty, uid, note)`: validate `countedQty >= 0`, ghi document `{lotId}_{uid}` vào `count_entries`, ghi `audit_log`, sau đó gọi `detectAndMarkConflicts`
    - `detectAndMarkConflicts(sessionId, lotId)`: query tất cả entries cùng `lotId` chưa bị `rejected`, nếu có >= 2 entries khác `enteredBy` thì batch update `conflict: true` cho tất cả
    - `resolveConflict(sessionId, keptEntryId, rejectedEntryId)`: batch update kept entry `conflict: false`, rejected entry `rejected: true`, ghi `audit_log` với `action: 'conflict_resolved'`
    - `reconcileSession(sessionId, ownerUid)`: kiểm tra không còn conflict chưa giải quyết, batch write `inventory_adjustments` cho các lô có chênh lệch, update session `status: 'adjusted'`, ghi `audit_log`
    - `subscribeToCountEntries(sessionId, callback)`: trả về unsubscribe function của `onSnapshot` trên `count_entries`
    - `subscribeToActiveSessions(uid, callback)`: query `stocktakes` where `participantUids array-contains uid` and `status == 'active'`, trả về unsubscribe
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 2.4, 2.5, 3.1, 3.4, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 2.2 Viết unit tests cho các hàm pure trong service
    - Test `validateParticipantEmails` với email hợp lệ, email không tồn tại, email có role khác admin
    - Test `detectAndMarkConflicts` logic: 1 entry → không conflict, 2 entries cùng lotId khác uid → conflict
    - Test `resolveConflict` state transitions
    - _Requirements: 1.2, 1.3, 3.1, 3.4_

  - [ ]* 2.3 Viết property-based tests cho service (fast-check)
    - **Property 4: Count entry round-trip** — write entry rồi read lại phải trả về đúng `lotId`, `countedQty`, `enteredBy`
    - **Validates: Requirements 2.1**
    - **Property 5: Invalid entry rejection** — `countedQty < 0` hoặc `lotId` không tồn tại phải bị reject, `count_entries` không thay đổi
    - **Validates: Requirements 2.3, 2.4**
    - **Property 6: Same-participant overwrite idempotence** — ghi N lần cùng `lotId` + `uid` → chỉ còn 1 document với giá trị cuối
    - **Validates: Requirements 2.5**
    - **Property 7: Conflict detection invariant** — 2 uid khác nhau cùng ghi 1 `lotId` → cả 2 entries có `conflict: true`
    - **Validates: Requirements 3.1**
    - **Property 8: Reconciliation guard** — phiên còn conflict chưa giải quyết → `reconcile` throw error, `inventory_adjustments` không thay đổi
    - **Validates: Requirements 3.3, 6.1**
    - **Property 11: Audit completeness** — mỗi write operation phải tạo đúng 1 `audit_log` tương ứng
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - **Property 13: Reconciliation outcome** — reconcile thành công tạo đúng N `inventory_adjustments` và session `status == 'adjusted'`
    - **Validates: Requirements 6.2, 6.3**

- [x] 3. Checkpoint — Đảm bảo service layer hoạt động đúng
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Zustand Store — `collaborativeStocktakeStore.js`
  - [x] 4.1 Tạo file `src/stores/collaborativeStocktakeStore.js`
    - State: `sessionData`, `countEntries[]`, `myEntries[]`, `conflicts[]`, `progress: { total, counted, percent }`, `loading`
    - Action `initSession(sessionData)`: set sessionData, reset entries
    - Action `setCountEntries(entries)`: set countEntries, tính lại `myEntries` (filter by `user.uid`), tính lại `conflicts` (filter `conflict: true && !rejected`), tính lại `progress`
    - Action `clearStore()`: reset về initialState
    - Selector `progressPercent`: `Math.round((counted / total) * 100)` — đúng với Property 10
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 4.2 Viết property-based test cho progress calculation
    - **Property 10: Progress calculation correctness** — `percent == round((distinct non-rejected lotIds) / totalLots * 100)`
    - **Validates: Requirements 4.2**

- [x] 5. Mở rộng CreateStocktakeModal
  - [x] 5.1 Thêm collaborative option vào `src/components/CreateStocktakeModal.jsx`
    - Thêm state: `isCollaborative`, `participantEmailInput`, `participantEmails[]`, `emailValidationErrors[]`
    - Thêm UI section "Phiên cộng tác" phía dưới form hiện tại: toggle checkbox, input email + nút "Thêm", danh sách email đã thêm với nút xóa từng email
    - Chỉ hiển thị section này khi `userRole === 'owner'`
    - _Requirements: 1.1, 1.4_

  - [x] 5.2 Tích hợp email validation vào `handleCreate`
    - Khi `isCollaborative === true`, gọi `validateParticipantEmails(participantEmails)` trước khi tạo phiên
    - Nếu có email invalid → hiển thị lỗi cụ thể từng email, không tạo phiên
    - Nếu tất cả valid → tạo phiên với `isCollaborative: true`, `participantEmails[]`, `participantUids[]`, `status: 'active'` (thay vì `in_progress`)
    - Phiên không collaborative vẫn tạo như cũ với `status: 'in_progress'`
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 5.3 Viết property-based test cho email validation
    - **Property 2: Participant email validation** — chỉ email tồn tại trong `users` với `role == 'admin'` mới được chấp nhận; email khác → fail với mô tả lỗi
    - **Validates: Requirements 1.2, 1.3**
    - **Property 1: Session creation invariant** — mọi phiên collaborative tạo thành công phải có đủ fields bắt buộc
    - **Validates: Requirements 1.1**

- [x] 6. CollaborativeStocktakePage (trang mobile cho participant)
  - [x] 6.1 Tạo file `src/pages/CollaborativeStocktakePage.jsx`
    - Route: `/stocktakes/:sessionId/collaborate`
    - Dùng `useAuth()` lấy `user.uid`, kiểm tra uid có trong `sessionData.participantUids` — nếu không thì redirect về `/view`
    - Subscribe `onSnapshot` vào `count_entries` của phiên qua `subscribeToCountEntries`
    - Hiển thị: tên phiên, progress bar (từ store), danh sách entries của mình (`myEntries`)
    - _Requirements: 2.1, 2.2, 4.1, 4.3, 8.1, 8.2_

  - [x] 6.2 Implement tìm kiếm lô hàng và nhập count entry
    - Search box tìm lô theo `productId` hoặc `lotNumber` từ `inventory_lots` (client-side query)
    - Kết quả tìm kiếm hiển thị dạng list card: productName, lotNumber, expiryDate, systemQty
    - Tap vào lô → mở inline input nhập `countedQty` (số >= 0) + optional note
    - Submit gọi `writeCountEntry(sessionId, lotId, countedQty, uid, note)`
    - Hiển thị conflict warning nếu entry của mình có `conflict: true`: "Lô này đã được người khác nhập với số lượng khác"
    - _Requirements: 2.1, 2.3, 2.4, 3.1, 8.1, 8.2_

  - [x] 6.3 Xử lý offline state
    - Hiển thị banner "Mất kết nối - dữ liệu sẽ đồng bộ khi có mạng" khi `navigator.onLine === false`
    - Firestore SDK tự queue offline writes, không cần xử lý thêm
    - _Requirements: 8.3, 8.4_

- [x] 7. ParticipantBanner + tích hợp vào ViewerLayout
  - [x] 7.1 Tạo component `src/components/ParticipantBanner.jsx`
    - Props: `sessions[]` (danh sách phiên active mà user là participant), `onNavigate(sessionId)`
    - Hiển thị banner sticky phía trên với tên phiên và nút "Tham gia" cho mỗi phiên active
    - Nếu không có phiên active thì không render gì
    - _Requirements: 2.2, 4.3_

  - [x] 7.2 Tích hợp ParticipantBanner vào `src/components/ViewerLayout.jsx`
    - Thêm `useEffect` subscribe `subscribeToActiveSessions(user.uid, callback)` khi user có role `admin`
    - Lưu danh sách phiên active vào local state `activeSessions`
    - Render `<ParticipantBanner sessions={activeSessions} onNavigate={(id) => navigate(\`/stocktakes/${id}/collaborate\`)} />`
    - Cleanup unsubscribe khi unmount
    - _Requirements: 2.2, 4.3_

- [x] 8. ConflictResolutionModal
  - [x] 8.1 Tạo file `src/components/ConflictResolutionModal.jsx`
    - Props: `conflict: { lotId, entries: [entryA, entryB] }`, `onResolve(keptEntryId, rejectedEntryId)`, `onClose()`
    - Hiển thị 2 entries cạnh nhau: người nhập, số lượng, thời gian nhập
    - 2 nút "Giữ entry này" cho mỗi entry
    - Khi chọn → gọi `resolveConflict(sessionId, keptId, rejectedId)` rồi `onResolve()`
    - _Requirements: 3.4_

- [x] 9. Mở rộng StocktakeSessionPage (collaborative dashboard)
  - [x] 9.1 Thêm collaborative dashboard vào `src/pages/StocktakeSessionPage.jsx`
    - Khi `sessionData.isCollaborative === true`, subscribe `onSnapshot` vào `count_entries` qua store
    - Hiển thị panel "Người tham gia": danh sách `participantEmails` kèm số entries mỗi người đã nhập
    - Hiển thị progress bar tính từ `count_entries` (distinct non-rejected lotIds / totalLots)
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 9.2 Thêm conflict management panel
    - Hiển thị panel "Xung đột" với danh sách entries có `conflict: true && !rejected`
    - Nút "Giải quyết" mở `ConflictResolutionModal` với conflict tương ứng
    - Khi còn conflict, disable nút Reconciliation và hiển thị tooltip giải thích
    - _Requirements: 3.2, 3.3_

  - [x] 9.3 Thêm collaborative reconciliation flow
    - Thay `handleAdjustInventory` bằng `reconcileSession` từ service khi `isCollaborative === true`
    - Sau reconcile thành công: hiển thị báo cáo tóm tắt (tổng lô kiểm, số lô chênh lệch, tổng chênh lệch)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 10. Routing
  - [x] 10.1 Thêm route `/stocktakes/:sessionId/collaborate` vào `src/components/AdminLayout.jsx`
    - Import lazy `CollaborativeStocktakePage`
    - Thêm `<Route path="/stocktakes/:sessionId/collaborate" element={<CollaborativeStocktakePage />} />`
    - _Requirements: 2.1_

  - [x] 10.2 Thêm route `/stocktakes/:sessionId/collaborate` vào `src/components/ViewerLayout.jsx` (mobile path cho admin)
    - Khi `isMobile === true` và path match `/stocktakes/:sessionId/collaborate`, render `CollaborativeStocktakePage` thay vì `MobileInventoryPage`
    - _Requirements: 8.1, 8.2_

- [x] 11. Checkpoint cuối — Đảm bảo toàn bộ flow hoạt động
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks đánh dấu `*` là optional, có thể bỏ qua để ra MVP nhanh hơn
- Property tests dùng **fast-check**, security rules tests dùng **@firebase/rules-unit-testing** + Firebase Emulator
- Flow single-user hiện tại (`isCollaborative` không có hoặc `false`) không bị ảnh hưởng
- Document ID của `count_entries` = `{lotId}_{enteredBy}` để đảm bảo idempotent overwrite (Property 6)
