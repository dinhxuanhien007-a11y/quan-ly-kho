// src/services/dashboardService.js
import { collection, getDocs, query, where, orderBy, limit, Timestamp, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// --- BẮT ĐẦU THÊM LẠI CÁC HÀM BỊ THIẾU ---

/**
 * Lấy danh sách các phiếu nhập đang ở trạng thái "pending".
 */
export const getPendingImportTickets = async () => {
    const ticketsQuery = query(
        collection(db, 'import_tickets'),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc"),
        limit(15)
    );
    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Lấy danh sách các phiếu xuất đang ở trạng thái "pending".
 */
export const getPendingExportTickets = async () => {
    const ticketsQuery = query(
        collection(db, 'export_tickets'),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc"),
        limit(15)
    );
    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- KẾT THÚC PHẦN THÊM LẠI ---


/**
 * Lấy các thống kê nhanh cho Dashboard.
 */
export const getDashboardStats = async () => {
    // 1. Đếm số lô sắp hết hạn (trong 120 ngày tới)
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 120);
    const nearExpiryQuery = query(
        collection(db, "inventory_lots"),
        where("expiryDate", ">=", Timestamp.now()),
        where("expiryDate", "<=", Timestamp.fromDate(futureDate))
    );
    const nearExpirySnap = await getCountFromServer(nearExpiryQuery);

    // 2. Đếm số lô đã hết hạn
    const expiredQuery = query(
        collection(db, "inventory_lots"),
        where("expiryDate", "<", Timestamp.now())
    );
    const expiredSnap = await getCountFromServer(expiredQuery);

    // 3. Đếm tổng số mã hàng (SKU)
    const productsQuery = query(collection(db, "products"));
    const productsSnap = await getCountFromServer(productsQuery);
    
    // 4. Đếm tổng số đối tác
    const partnersQuery = query(collection(db, "partners"));
    const partnersSnap = await getCountFromServer(partnersQuery);

    return {
        nearExpiryCount: nearExpirySnap.data().count,
        expiredCount: expiredSnap.data().count,
        skuCount: productsSnap.data().count,
        partnerCount: partnersSnap.data().count,
    };
};

/**
 * Lấy danh sách các phiếu nhập đã hoàn thành gần đây.
 */
export const getRecentCompletedImports = async (count = 5) => {
    const ticketsQuery = query(
        collection(db, 'import_tickets'),
        where("status", "==", "completed"),
        orderBy("createdAt", "desc"),
        limit(count)
    );
    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Lấy danh sách các phiếu xuất đã hoàn thành gần đây.
 */
export const getRecentCompletedExports = async (count = 5) => {
    const ticketsQuery = query(
        collection(db, 'export_tickets'),
        where("status", "==", "completed"),
        orderBy("createdAt", "desc"),
        limit(count)
    );
    const querySnapshot = await getDocs(ticketsQuery);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Lấy dữ liệu cho các biểu đồ.
 */
export const getChartData = async () => {
    // 1. Dữ liệu cho biểu đồ HSD
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 120);

    const safeQuery = query(collection(db, "inventory_lots"), where("expiryDate", ">", Timestamp.fromDate(futureDate)));
    const nearExpiryQuery = query(collection(db, "inventory_lots"), where("expiryDate", ">=", Timestamp.now()), where("expiryDate", "<=", Timestamp.fromDate(futureDate)));
    const expiredQuery = query(collection(db, "inventory_lots"), where("expiryDate", "<", Timestamp.now()));

    const [safeSnap, nearExpirySnap, expiredSnap] = await Promise.all([
        getCountFromServer(safeQuery),
        getCountFromServer(nearExpiryQuery),
        getCountFromServer(expiredQuery),
    ]);
    
    const expiryData = {
        safe: safeSnap.data().count,
        near_expiry: nearExpirySnap.data().count,
        expired: expiredSnap.data().count,
    };

    // 2. Dữ liệu cho biểu đồ Team
    const productsSnapshot = await getDocs(collection(db, "products"));
    const teamCounts = { MED: 0, BIO: 0, 'Spare Part': 0 };
    productsSnapshot.forEach(doc => {
        const team = doc.data().team;
        if (team in teamCounts) {
            teamCounts[team]++;
        }
    });

    return { expiryData, teamData: teamCounts };
};