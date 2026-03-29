// src/services/collaborativeStocktakeService.js
import { db } from '../firebaseConfig';
import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch,
    query, where, serverTimestamp, onSnapshot, orderBy
} from 'firebase/firestore';

// ─── Email Validation ────────────────────────────────────────────────────────

/**
 * Validate danh sách email: phải tồn tại trong collection `users` với role `admin`.
 * @param {string[]} emails
 * @returns {{ valid: {email: string, uid: string}[], invalid: {email: string, reason: string}[] }}
 */
export const validateParticipantEmails = async (emails) => {
    const valid = [];
    const invalid = [];

    for (const email of emails) {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) continue;

        const q = query(collection(db, 'users'), where('email', '==', trimmed));
        const snap = await getDocs(q);

        if (snap.empty) {
            invalid.push({ email: trimmed, reason: 'Email không tồn tại trong hệ thống' });
            continue;
        }

        const userDoc = snap.docs[0];
        const userData = userDoc.data();

        if (userData.role !== 'admin') {
            invalid.push({ email: trimmed, reason: `Tài khoản có role "${userData.role}", cần role "admin"` });
            continue;
        }

        valid.push({ email: trimmed, uid: userDoc.id });
    }

    return { valid, invalid };
};

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * Tạo phiên kiểm kê cộng tác.
 * Phiên cộng tác dùng status 'active' thay vì 'in_progress'.
 */
export const createCollaborativeSession = async (sessionDocRef, participantList) => {
    await updateDoc(sessionDocRef, {
        isCollaborative: true,
        participantEmails: participantList.map(p => p.email),
        participantUids: participantList.map(p => p.uid),
        status: 'active',
    });
};

/**
 * Thêm participant vào phiên đang active.
 */
export const addParticipant = async (sessionId, email, uid) => {
    const sessionRef = doc(db, 'stocktakes', sessionId);
    const snap = await getDoc(sessionRef);
    if (!snap.exists()) throw new Error('Phiên không tồn tại');

    const data = snap.data();
    const emails = data.participantEmails || [];
    const uids = data.participantUids || [];

    if (uids.includes(uid)) return; // đã có rồi

    await updateDoc(sessionRef, {
        participantEmails: [...emails, email],
        participantUids: [...uids, uid],
    });
};

/**
 * Xóa participant khỏi phiên.
 */
export const removeParticipant = async (sessionId, uid) => {
    const sessionRef = doc(db, 'stocktakes', sessionId);
    const snap = await getDoc(sessionRef);
    if (!snap.exists()) throw new Error('Phiên không tồn tại');

    const data = snap.data();
    const idx = (data.participantUids || []).indexOf(uid);
    if (idx === -1) return;

    const newUids = [...data.participantUids];
    const newEmails = [...data.participantEmails];
    newUids.splice(idx, 1);
    newEmails.splice(idx, 1);

    await updateDoc(sessionRef, {
        participantEmails: newEmails,
        participantUids: newUids,
    });
};

// ─── Count Entries ────────────────────────────────────────────────────────────

/**
 * Ghi count entry cho một lô hàng.
 * Document ID = `{lotId}_{uid}` để đảm bảo idempotent overwrite.
 * Sau khi ghi, tự động phát hiện và đánh dấu conflict.
 */
export const writeCountEntry = async (sessionId, lotId, countedQty, uid, note = '') => {
    if (countedQty < 0) throw new Error('Số lượng không hợp lệ');

    // Validate lotId tồn tại trong inventory_lots
    const lotSnap = await getDoc(doc(db, 'inventory_lots', lotId));
    if (!lotSnap.exists()) throw new Error('Mã lô không tồn tại');

    const lotData = lotSnap.data();
    const entryId = `${lotId}_${uid}`;
    const entryRef = doc(db, 'stocktakes', sessionId, 'count_entries', entryId);

    // Kiểm tra entry cũ để ghi audit log
    const existingSnap = await getDoc(entryRef);
    const isUpdate = existingSnap.exists();
    const previousQty = isUpdate ? existingSnap.data().countedQty : null;

    const entryData = {
        lotId,
        productId: lotData.productId,
        productName: lotData.productName || '',
        lotNumber: lotData.lotNumber || '',
        countedQty,
        enteredBy: uid,
        enteredAt: serverTimestamp(),
        note: note || '',
        conflict: false,
        rejected: false,
    };

    await setDoc(entryRef, entryData);

    // Ghi audit log
    await _writeAuditLog(sessionId, {
        action: isUpdate ? 'updated' : 'created',
        lotId,
        countedQty,
        previousQty,
        performedBy: uid,
    });

    // Phát hiện và đánh dấu conflict
    await detectAndMarkConflicts(sessionId, lotId);
};

/**
 * Phát hiện conflict: nếu có >= 2 entries khác uid cùng lotId và chưa bị rejected,
 * đánh dấu conflict: true cho tất cả.
 */
export const detectAndMarkConflicts = async (sessionId, lotId) => {
    const entriesRef = collection(db, 'stocktakes', sessionId, 'count_entries');
    const q = query(entriesRef, where('lotId', '==', lotId), where('rejected', '==', false));
    const snap = await getDocs(q);

    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const distinctUids = new Set(entries.map(e => e.enteredBy));

    const hasConflict = distinctUids.size >= 2;

    if (hasConflict) {
        const batch = writeBatch(db);
        entries.forEach(entry => {
            batch.update(doc(db, 'stocktakes', sessionId, 'count_entries', entry.id), {
                conflict: true,
            });
        });
        await batch.commit();
    }
};

/**
 * Owner giải quyết conflict: giữ một entry, reject entry còn lại.
 */
export const resolveConflict = async (sessionId, keptEntryId, rejectedEntryId, ownerUid) => {
    const batch = writeBatch(db);

    batch.update(doc(db, 'stocktakes', sessionId, 'count_entries', keptEntryId), {
        conflict: false,
    });
    batch.update(doc(db, 'stocktakes', sessionId, 'count_entries', rejectedEntryId), {
        conflict: false,
        rejected: true,
    });

    await batch.commit();

    await _writeAuditLog(sessionId, {
        action: 'conflict_resolved',
        keptEntryId,
        rejectedEntryId,
        performedBy: ownerUid,
    });
};

// ─── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Owner duyệt và áp dụng kết quả kiểm kê vào inventory_lots.
 * Chỉ áp dụng các lô có chênh lệch giữa countedQty và systemQty.
 */
export const reconcileSession = async (sessionId, ownerUid) => {
    // Kiểm tra không còn conflict chưa giải quyết
    const conflictQ = query(
        collection(db, 'stocktakes', sessionId, 'count_entries'),
        where('conflict', '==', true),
        where('rejected', '==', false)
    );
    const conflictSnap = await getDocs(conflictQ);
    if (!conflictSnap.empty) {
        throw new Error(`Còn ${conflictSnap.size} xung đột chưa được giải quyết`);
    }

    // Lấy tất cả entries hợp lệ (chưa bị rejected)
    const entriesQ = query(
        collection(db, 'stocktakes', sessionId, 'count_entries'),
        where('rejected', '==', false)
    );
    const entriesSnap = await getDocs(entriesQ);
    const entries = entriesSnap.docs.map(d => d.data());

    if (entries.length === 0) {
        throw new Error('Chưa có dữ liệu kiểm kê nào');
    }

    // Lấy systemQty từ inventory_lots để so sánh
    const batch = writeBatch(db);
    const adjustmentsRef = collection(db, 'inventory_adjustments');
    let discrepancyCount = 0;

    for (const entry of entries) {
        const lotSnap = await getDoc(doc(db, 'inventory_lots', entry.lotId));
        if (!lotSnap.exists()) continue;

        const systemQty = lotSnap.data().quantityRemaining ?? 0;
        if (entry.countedQty === systemQty) continue; // không chênh lệch

        // Cập nhật inventory_lots
        batch.update(doc(db, 'inventory_lots', entry.lotId), {
            quantityRemaining: entry.countedQty,
        });

        // Ghi inventory_adjustments
        const adjRef = doc(adjustmentsRef);
        batch.set(adjRef, {
            createdAt: serverTimestamp(),
            stocktakeId: sessionId,
            productId: entry.productId,
            productName: entry.productName,
            lotNumber: entry.lotNumber,
            quantityBefore: systemQty,
            quantityAfter: entry.countedQty,
            variance: entry.countedQty - systemQty,
            reason: `Điều chỉnh sau kiểm kê cộng tác`,
        });

        discrepancyCount++;
    }

    // Cập nhật trạng thái phiên
    batch.update(doc(db, 'stocktakes', sessionId), {
        status: 'adjusted',
        adjustedAt: serverTimestamp(),
    });

    await batch.commit();

    // Ghi audit log
    await _writeAuditLog(sessionId, {
        action: 'reconciled',
        sessionId,
        performedBy: ownerUid,
        discrepancyCount,
    });

    return { discrepancyCount, totalEntries: entries.length };
};

// ─── Realtime Subscriptions ───────────────────────────────────────────────────

/**
 * Subscribe realtime vào count_entries của phiên.
 * @returns {Function} unsubscribe
 */
export const subscribeToCountEntries = (sessionId, callback) => {
    const q = query(
        collection(db, 'stocktakes', sessionId, 'count_entries'),
        orderBy('enteredAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
        const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(entries);
    });
};

/**
 * Subscribe realtime vào các phiên active mà uid là participant.
 * @returns {Function} unsubscribe
 */
export const subscribeToActiveSessions = (uid, callback) => {
    const q = query(
        collection(db, 'stocktakes'),
        where('participantUids', 'array-contains', uid),
        where('status', '==', 'active')
    );
    return onSnapshot(q, (snap) => {
        const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(sessions);
    });
};

// ─── Internal Helpers ─────────────────────────────────────────────────────────

const _writeAuditLog = async (sessionId, data) => {
    const logRef = doc(collection(db, 'stocktakes', sessionId, 'audit_logs'));
    await setDoc(logRef, {
        ...data,
        performedAt: serverTimestamp(),
    });
};
