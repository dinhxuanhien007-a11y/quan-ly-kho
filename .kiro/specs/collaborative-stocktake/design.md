# Design Document: Collaborative Stocktake

## Overview

Tính năng Collaborative Stocktake bổ sung khả năng kiểm kho nhiều người dùng đồng thời lên hệ thống kiểm kho single-user hiện tại. Owner tạo phiên cộng tác, mời các admin tham gia qua email, và mỗi participant nhập số đếm theo lô trên thiết bị của mình. Dữ liệu đồng bộ realtime qua Firestore `onSnapshot`. Owner theo dõi tiến độ, giải quyết conflict, và thực hiện reconciliation để áp dụng kết quả vào `inventory_lots`.

Thiết kế này **không phá vỡ** flow single-user hiện tại. Phiên không có `isCollaborative: true` tiếp tục hoạt động như cũ qua `StocktakeSessionPage`.

### Kiến trúc tổng quan

```
Owner                    Firestore                  Participant (Admin)
  |                          |                              |
  |-- Tạo phiên cộng tác --> |                              |
  |   (validate emails)      |                              |
  |                          |-- onSnapshot notify -------> |
  |                          |   (ParticipantBanner)        |
  |                          |                              |-- Mở CollaborativeStocktakePage
  |                          |                              |-- Tìm lô, nhập countedQty
  |                          | <-- write count_entries ----- |
  |                          |-- onSnapshot notify -------> | (realtime sync)
  |<-- onSnapshot notify --- |                              |
  |   (conflict detection)   |                              |
  |-- Resolve conflict -----> |                              |
  |-- Reconciliation -------> |                              |
  |   (batch write to        |                              |
  |    inventory_lots)       |                              |
```

---

## Architecture

### Luồng dữ liệu

```mermaid
flowchart TD
    A[Owner: CreateStocktakeModal] -->|isCollaborative=true| B[stocktakes/{id}]
    B -->|validate emails| C[users collection]
    C -->|participantUids| B
    B -->|onSnapshot| D[ParticipantBanner in ViewerLayout]
    D -->|navigate| E[CollaborativeStocktakePage]
    E -->|write| F[stocktakes/{id}/count_entries/{lotId}]
    F -->|onSnapshot| G[StocktakeSessionPage - Owner Dashboard]
    F -->|conflict detection| H[conflict: true on entry]
    H -->|onSnapshot| I[ConflictResolutionModal]
    I -->|resolve| F
    G -->|reconcile| J[inventory_adjustments]
    G -->|reconcile| K[inventory_lots update]
```

### Phân tách trách nhiệm

| Layer | Thành phần | Trách nhiệm |
|---|---|---|
| UI - Owner | `CreateStocktakeModal` (mở rộng) | Tạo phiên, validate email participants |
| UI - Owner | `StocktakeSessionPage` (mở rộng) | Dashboard realtime, conflict list, reconcile |
| UI - Owner | `ConflictResolutionModal` (mới) | Chọn entry nào giữ khi có conflict |
| UI - Participant | `CollaborativeStocktakePage` (mới) | Mobile-optimized, nhập count_entries |
| UI - Participant | `ParticipantBanner` (mới) | Thông báo phiên active trong ViewerLayout |
| Service | `collaborativeStocktakeService.js` (mới) | CRUD count_entries, audit_logs, reconcile |
| Store | `collaborativeStocktakeStore.js` (mới) | Zustand state cho collaborative session |
| Rules | `firestore.rules` (mở rộng) | Participant isolation, write revocation |

---

## Components and Interfaces

### 1. CreateStocktakeModal (mở rộng)

Thêm section "Phiên cộng tác" phía dưới form hiện tại:

```jsx
// Thêm state mới
const [isCollaborative, setIsCollaborative] = useState(false);
const [participantEmailInput, setParticipantEmailInput] = useState('');
const [participantEmails, setParticipantEmails] = useState([]);
const [emailValidationErrors, setEmailValidationErrors] = useState([]);

// Thêm vào handleCreate: validate emails, lưu participantEmails + participantUids + isCollaborative
```

**Thay đổi trong `handleCreate`:**
1. Nếu `isCollaborative`, gọi `validateParticipantEmails(emails)` → trả về `{ valid: [{email, uid}], invalid: [{email, reason}] }`
2. Nếu có email invalid → hiển thị lỗi, không tạo phiên
3. Lưu thêm vào document: `isCollaborative: true`, `participantEmails: string[]`, `participantUids: string[]`

### 2. CollaborativeStocktakePage (mới)

Route: `/stocktakes/:sessionId/collaborate`

```jsx
const CollaborativeStocktakePage = () => {
  const { sessionId } = useParams();
  const { user } = useAuth();
  // Realtime listener cho count_entries của phiên
  // Search lô hàng từ inventory_lots
  // Nhập countedQty → ghi vào count_entries
  // Hiển thị conflict warning nếu entry của mình bị conflict
}
```

**Props/State chính:**
- `sessionData`: document `stocktakes/{id}` (realtime)
- `myEntries`: `count_entries` do user hiện tại nhập (realtime)
- `allEntries`: tất cả `count_entries` của phiên (realtime, để tính progress)
- `searchTerm`: tìm kiếm lô hàng
- `lotResults`: kết quả tìm từ `inventory_lots`

### 3. ParticipantBanner (mới)

Đặt trong `ViewerLayout`, hiển thị khi user (admin) có phiên active mà mình là participant:

```jsx
const ParticipantBanner = ({ sessions, onNavigate }) => {
  // sessions: danh sách phiên active mà user.uid có trong participantUids
  // Hiển thị banner với tên phiên và nút "Tham gia"
}
```

Query trong `ViewerLayout`:
```js
query(
  collection(db, 'stocktakes'),
  where('participantUids', 'array-contains', user.uid),
  where('status', '==', 'active')
)
```

### 4. ConflictResolutionModal (mới)

```jsx
const ConflictResolutionModal = ({ conflict, onResolve, onClose }) => {
  // conflict: { lotId, entries: [entryA, entryB] }
  // onResolve(keptEntryId, rejectedEntryId)
}
```

### 5. StocktakeSessionPage (mở rộng)

Khi `sessionData.isCollaborative === true`, hiển thị thêm:
- Panel "Người tham gia" với danh sách participants và số entries của mỗi người
- Panel "Xung đột" với danh sách `count_entries` có `conflict: true`
- Nút "Giải quyết xung đột" mở `ConflictResolutionModal`
- Progress bar tính từ `count_entries` thay vì `items`

### 6. ViewerLayout (mở rộng)

Thêm `ParticipantBanner` component với realtime listener cho phiên active của user.

---

## Data Models

### Firestore Schema

#### `stocktakes/{id}` — mở rộng

```typescript
interface StocktakeDocument {
  // Fields hiện tại (giữ nguyên)
  name: string;
  scope: 'all' | 'team';
  status: 'in_progress' | 'completed' | 'adjusted' | 'active'; // thêm 'active'
  createdAt: Timestamp;
  ownerUid: string;
  itemCount: number;
  totalItems: number;
  countedItems: number;

  // Fields mới cho collaborative
  isCollaborative: boolean;           // phân biệt phiên cộng tác
  participantEmails: string[];        // email admin được mời
  participantUids: string[];          // uid tương ứng (dùng trong security rules)
}
```

#### `stocktakes/{id}/count_entries/{lotId}` — mới

Document ID = `lotId` (để đảm bảo mỗi participant chỉ có 1 entry/lô, dùng `{lotId}_{uid}` để cho phép nhiều người cùng nhập 1 lô).

> **Quyết định thiết kế**: Document ID = `{lotId}_{enteredBy}` để:
> - Participant overwrite entry của chính mình (idempotent write)
> - Phát hiện conflict khi có 2 document cùng `lotId` nhưng khác `enteredBy`

```typescript
interface CountEntry {
  lotId: string;                      // ID của lô trong inventory_lots
  productId: string;
  productName: string;
  lotNumber: string;
  countedQty: number;                 // >= 0
  enteredBy: string;                  // uid của participant
  enteredAt: Timestamp;               // serverTimestamp()
  note?: string;
  conflict: boolean;                  // true nếu có entry khác cùng lotId
  rejected: boolean;                  // true nếu owner chọn entry khác khi resolve
}
```

#### `stocktakes/{id}/audit_logs/{id}` — mới

```typescript
interface AuditLog {
  action: 'created' | 'updated' | 'rejected' | 'conflict_resolved' | 'reconciled';
  lotId?: string;
  countedQty?: number;
  previousQty?: number;
  performedBy: string;                // uid
  performedAt: Timestamp;
  // Chỉ có khi action = 'conflict_resolved'
  keptEntryId?: string;
  rejectedEntryId?: string;
  // Chỉ có khi action = 'reconciled'
  sessionId?: string;
}
```

### Zustand Store: `collaborativeStocktakeStore.js`

```typescript
interface CollaborativeStocktakeStore {
  sessionData: StocktakeDocument | null;
  countEntries: CountEntry[];         // tất cả entries của phiên (realtime)
  conflicts: CountEntry[];            // entries có conflict: true
  myEntries: CountEntry[];            // entries của user hiện tại
  progress: { total: number; counted: number; percent: number };
  loading: boolean;

  // Actions
  initSession: (sessionData: StocktakeDocument) => void;
  setCountEntries: (entries: CountEntry[]) => void;
  clearStore: () => void;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Session creation invariant

*For any* valid session creation request (name, scope, valid email list), the resulting Firestore document SHALL contain all required fields: `name`, `scope`, `status`, `createdAt`, `ownerUid`, `participantEmails`, `participantUids`, `isCollaborative: true`.

**Validates: Requirements 1.1**

---

### Property 2: Participant email validation

*For any* list of emails submitted as participants, only emails that exist in the `users` collection with `role == 'admin'` SHALL be accepted; any other email SHALL cause the entire creation to fail with a descriptive error identifying the invalid email.

**Validates: Requirements 1.2, 1.3**

---

### Property 3: Participant list round-trip

*For any* active session, adding a participant then removing that same participant SHALL result in the `participantUids` array returning to its original state.

**Validates: Requirements 1.4**

---

### Property 4: Count entry round-trip

*For any* valid count entry (existing `lotId`, `countedQty >= 0`, authenticated participant), writing the entry then reading it back SHALL return a document with identical `lotId`, `countedQty`, and `enteredBy` equal to the writer's uid.

**Validates: Requirements 2.1**

---

### Property 5: Invalid entry rejection

*For any* count entry where either (a) `lotId` does not exist in `inventory_lots`, or (b) `countedQty < 0`, the system SHALL reject the write and the `count_entries` subcollection SHALL remain unchanged.

**Validates: Requirements 2.3, 2.4**

---

### Property 6: Same-participant overwrite idempotence

*For any* participant and any `lotId`, writing N count entries for the same `lotId` from the same participant uid SHALL result in exactly one document in `count_entries` (the latest value), not N documents.

**Validates: Requirements 2.5**

---

### Property 7: Conflict detection invariant

*For any* session and any `lotId`, if two distinct participant uids both have a non-rejected count entry for that `lotId`, then both entries SHALL have `conflict: true`.

**Validates: Requirements 3.1**

---

### Property 8: Reconciliation guard

*For any* session that has at least one count entry with `conflict: true` and `rejected: false`, calling the reconcile function SHALL return an error and SHALL NOT write any documents to `inventory_adjustments` or change the session `status`.

**Validates: Requirements 3.3, 6.1**

---

### Property 9: Conflict resolution clears flag

*For any* conflict (two entries with `conflict: true` for the same `lotId`), after the owner resolves it by selecting one entry, the kept entry SHALL have `conflict: false` and the rejected entry SHALL have `rejected: true`.

**Validates: Requirements 3.4**

---

### Property 10: Progress calculation correctness

*For any* session with a known set of lots in scope, the computed progress percentage SHALL equal `(count of distinct lotIds with at least one non-rejected count entry) / (total lots in scope) * 100`, rounded to the nearest integer.

**Validates: Requirements 4.2**

---

### Property 11: Audit completeness

*For any* write operation on `count_entries` (create, update, or reject), there SHALL exist exactly one corresponding document in `audit_logs` with the matching `lotId`, `performedBy`, `performedAt`, and the correct `action` value.

**Validates: Requirements 5.1, 5.2, 5.3**

---

### Property 12: Audit preservation

*For any* session that transitions to `status: "adjusted"`, all `audit_logs` documents that existed before the transition SHALL still be readable by the owner after the transition.

**Validates: Requirements 5.4, 5.5**

---

### Property 13: Reconciliation outcome

*For any* successful reconciliation of a session with N lots having discrepancies, the system SHALL create exactly N documents in `inventory_adjustments` and update the session `status` to `"adjusted"` atomically.

**Validates: Requirements 6.2, 6.3**

---

### Property 14: Owner-only reconciliation

*For any* session, a request to perform reconciliation from a uid that is NOT the `ownerUid` SHALL be rejected by Firestore Security Rules with `permission-denied`.

**Validates: Requirements 6.5**

---

### Property 15: Participant isolation

*For any* participant uid (present in `participantUids`), Firestore Security Rules SHALL:
- Allow read of the session document
- Allow read/write of `count_entries` within their session only
- Deny read/write of `inventory_lots`, `products`, `import_tickets`, `export_tickets`, `inventory_adjustments`
- Deny write to the root session document

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

---

### Property 16: enteredBy authentication invariant

*For any* count entry write, Firestore Security Rules SHALL reject the write if the `enteredBy` field in the request data does not equal `request.auth.uid`.

**Validates: Requirements 7.5**

---

### Property 17: Write revocation on adjusted status

*For any* session with `status: "adjusted"`, any attempt by a participant to write to `count_entries` SHALL be rejected by Firestore Security Rules.

**Validates: Requirements 7.6**

---

## Error Handling

### Validation errors (client-side)

| Tình huống | Xử lý |
|---|---|
| Email participant không tồn tại trong `users` | Toast error với tên email cụ thể, không tạo phiên |
| Email participant có role khác `admin` | Toast error: "Email [x] không có quyền admin" |
| `countedQty < 0` | Reject ngay tại UI, không gọi Firestore |
| `lotId` không tồn tại | Toast error: "Mã lô không tồn tại trong hệ thống" |

### Firestore errors (runtime)

| Tình huống | Xử lý |
|---|---|
| `permission-denied` khi participant ghi | Toast error: "Bạn không có quyền thực hiện thao tác này" |
| `permission-denied` khi phiên đã `adjusted` | Toast error: "Phiên đã kết thúc, không thể nhập thêm" |
| Reconciliation thất bại giữa chừng | Batch write → tự động rollback, toast error chi tiết |
| Mất kết nối mạng | Firestore SDK tự queue offline, hiển thị banner "Đang offline" |

### Conflict handling

Conflict không phải lỗi — đây là trạng thái hợp lệ cần owner giải quyết. UI phân biệt rõ:
- Participant thấy: cảnh báo "Lô này đã được [người khác] nhập với số lượng khác"
- Owner thấy: danh sách conflict trong dashboard, nút "Giải quyết"

---

## Testing Strategy

### Unit tests

Tập trung vào các hàm pure và service functions:

- `validateParticipantEmails(emails, usersCollection)` — kiểm tra từng email
- `detectConflict(entries, newEntry)` — logic phát hiện conflict
- `calculateProgress(entries, totalLots)` — công thức tính %
- `buildReconciliationBatch(entries, inventoryLots)` — tạo batch write
- `resolveConflict(keptId, rejectedId, entries)` — cập nhật conflict flags

### Property-based tests

Sử dụng thư viện **fast-check** (JavaScript/TypeScript PBT library).

Mỗi property test chạy tối thiểu **100 iterations**. Mỗi test được tag theo format:
`Feature: collaborative-stocktake, Property {N}: {property_text}`

**P4 — Count entry round-trip:**
```js
// Feature: collaborative-stocktake, Property 4: count entry round-trip
fc.assert(fc.asyncProperty(
  fc.record({ lotId: fc.string(), countedQty: fc.nat(), uid: fc.string() }),
  async ({ lotId, countedQty, uid }) => {
    await writeCountEntry(sessionId, lotId, countedQty, uid);
    const entry = await readCountEntry(sessionId, `${lotId}_${uid}`);
    return entry.lotId === lotId && entry.countedQty === countedQty && entry.enteredBy === uid;
  }
), { numRuns: 100 });
```

**P5 — Invalid entry rejection:**
```js
// Feature: collaborative-stocktake, Property 5: invalid entry rejection
fc.assert(fc.asyncProperty(
  fc.oneof(
    fc.record({ lotId: fc.string({ minLength: 20 }), countedQty: fc.nat() }), // non-existent lotId
    fc.record({ lotId: validLotId, countedQty: fc.integer({ max: -1 }) })      // negative qty
  ),
  async (invalidEntry) => {
    const before = await countEntries(sessionId);
    await expect(writeCountEntry(sessionId, invalidEntry)).rejects.toThrow();
    const after = await countEntries(sessionId);
    return before === after;
  }
), { numRuns: 100 });
```

**P6 — Same-participant overwrite idempotence:**
```js
// Feature: collaborative-stocktake, Property 6: same-participant overwrite idempotence
fc.assert(fc.asyncProperty(
  fc.tuple(fc.string(), fc.array(fc.nat(), { minLength: 2, maxLength: 10 })),
  async ([lotId, quantities]) => {
    for (const qty of quantities) {
      await writeCountEntry(sessionId, lotId, qty, uid);
    }
    const entries = await getEntriesForLot(sessionId, lotId, uid);
    return entries.length === 1 && entries[0].countedQty === quantities[quantities.length - 1];
  }
), { numRuns: 100 });
```

**P7 — Conflict detection invariant:**
```js
// Feature: collaborative-stocktake, Property 7: conflict detection invariant
fc.assert(fc.asyncProperty(
  fc.record({ lotId: fc.string(), uid1: fc.string(), uid2: fc.string() })
    .filter(({ uid1, uid2 }) => uid1 !== uid2),
  async ({ lotId, uid1, uid2 }) => {
    await writeCountEntry(sessionId, lotId, 10, uid1);
    await writeCountEntry(sessionId, lotId, 20, uid2);
    const [e1, e2] = await Promise.all([
      readCountEntry(sessionId, `${lotId}_${uid1}`),
      readCountEntry(sessionId, `${lotId}_${uid2}`)
    ]);
    return e1.conflict === true && e2.conflict === true;
  }
), { numRuns: 100 });
```

**P8 — Reconciliation guard:**
```js
// Feature: collaborative-stocktake, Property 8: reconciliation guard
fc.assert(fc.asyncProperty(
  fc.array(fc.record({ lotId: fc.string(), uid: fc.string() }), { minLength: 1 }),
  async (conflictingEntries) => {
    // Setup: create conflicting entries
    for (const { lotId, uid } of conflictingEntries) {
      await writeCountEntry(sessionId, lotId, 10, uid);
    }
    const beforeCount = await countAdjustments();
    await expect(reconcile(sessionId)).rejects.toThrow();
    const afterCount = await countAdjustments();
    return beforeCount === afterCount;
  }
), { numRuns: 100 });
```

**P11 — Audit completeness:**
```js
// Feature: collaborative-stocktake, Property 11: audit completeness
fc.assert(fc.asyncProperty(
  fc.array(fc.record({ lotId: fc.string(), qty: fc.nat(), uid: fc.string() }), { minLength: 1 }),
  async (operations) => {
    for (const op of operations) {
      await writeCountEntry(sessionId, op.lotId, op.qty, op.uid);
    }
    const auditLogs = await getAuditLogs(sessionId);
    return auditLogs.length >= operations.length;
  }
), { numRuns: 100 });
```

**P13 — Reconciliation outcome:**
```js
// Feature: collaborative-stocktake, Property 13: reconciliation outcome
fc.assert(fc.asyncProperty(
  fc.array(fc.record({ lotId: fc.string(), countedQty: fc.nat() }), { minLength: 1 }),
  async (discrepantLots) => {
    // Setup: entries with discrepancies vs inventory_lots
    const beforeAdjCount = await countAdjustments();
    await reconcile(sessionId);
    const afterAdjCount = await countAdjustments();
    const session = await getSession(sessionId);
    return (afterAdjCount - beforeAdjCount) === discrepantLots.length
      && session.status === 'adjusted';
  }
), { numRuns: 100 });
```

**P15, P16, P17 — Security rules tests** (dùng Firebase Emulator + `@firebase/rules-unit-testing`):
```js
// Feature: collaborative-stocktake, Property 15: participant isolation
// Feature: collaborative-stocktake, Property 16: enteredBy authentication
// Feature: collaborative-stocktake, Property 17: write revocation on adjusted
// Dùng fc để generate random uid, lotId, và kiểm tra security rules
```

### Firestore Security Rules tests

Dùng `@firebase/rules-unit-testing` với Firebase Emulator:

```js
// P15: Participant không đọc được inventory_lots
await assertFails(
  getDoc(doc(participantDb, 'inventory_lots', 'some-lot'))
);

// P16: enteredBy phải khớp auth.uid
await assertFails(
  setDoc(doc(participantDb, 'stocktakes', sid, 'count_entries', 'lot1_uid2'), {
    enteredBy: 'uid2', // khác với auth uid của participantDb
    countedQty: 10
  })
);

// P17: Không ghi được khi status = adjusted
await assertFails(
  setDoc(doc(participantDb, 'stocktakes', adjustedSid, 'count_entries', 'lot1_uid1'), {
    enteredBy: 'uid1', countedQty: 5
  })
);
```
