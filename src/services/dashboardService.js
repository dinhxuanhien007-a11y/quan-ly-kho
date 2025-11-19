// src/services/dashboardService.js
import { collection, getDocs, query, where, orderBy, limit, Timestamp, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { formatDate, parseDateString } from '../utils/dateUtils';
import { ALL_SUBGROUPS, TEAM_OPTIONS, SPECIAL_EXPIRY_SUBGROUPS } from '../constants';
// --- BẮT ĐẦU BỔ SUNG CÁC HÀM BỊ THIẾU ---

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

// --- KẾT THÚC PHẦN BỔ SUNG ---


// src/services/dashboardService.js

export const getDashboardStats = async () => {
    const today = new Date();

    // --- LOGIC MỚI ĐỂ ĐẾM HÀNG CẬN DATE ---
    // 1. Đếm cho các nhóm đặc biệt (BD BDB, BD DS) với ngưỡng 90 ngày
    const specialGroups = SPECIAL_EXPIRY_SUBGROUPS;
    const specialFutureDate = new Date();
    specialFutureDate.setDate(today.getDate() + 90);
    const specialNearExpiryQuery = query(
        collection(db, "inventory_lots"),
        where("subGroup", "in", specialGroups),
        where("expiryDate", ">=", Timestamp.now()),
        where("expiryDate", "<=", Timestamp.fromDate(specialFutureDate))
    );

    // 2. Đếm cho các nhóm còn lại với ngưỡng 210 ngày
    const otherGroups = ALL_SUBGROUPS.filter(group => !specialGroups.includes(group));
    const otherFutureDate = new Date();
    otherFutureDate.setDate(today.getDate() + 210);
    const otherNearExpiryQuery = query(
        collection(db, "inventory_lots"),
        where("subGroup", "in", otherGroups),
        where("expiryDate", ">=", Timestamp.now()),
        where("expiryDate", "<=", Timestamp.fromDate(otherFutureDate))
    );

    // 3. Đếm số lô đã hết hạn (giữ nguyên)
    const expiredQuery = query(
        collection(db, "inventory_lots"),
        where("expiryDate", "<", Timestamp.now())
    );

    // Các truy vấn khác giữ nguyên
    const productsQuery = query(collection(db, "products"));
    const partnersQuery = query(collection(db, "partners"));

    // Thực thi tất cả các truy vấn cùng lúc
    const [specialSnap, otherSnap, expiredSnap, productsSnap, partnersSnap] = await Promise.all([
        getCountFromServer(specialNearExpiryQuery),
        getCountFromServer(otherNearExpiryQuery),
        getCountFromServer(expiredQuery),
        getCountFromServer(productsQuery),
        getCountFromServer(partnersQuery),
    ]);

    // Cộng dồn kết quả đếm cận date
    const nearExpiryCount = specialSnap.data().count + otherSnap.data().count;

    return {
        nearExpiryCount: nearExpiryCount,
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

// src/services/dashboardService.js

export const getChartData = async () => {
    // --- LOGIC MỚI CHO BIỂU ĐỒ HSD ---
    const today = new Date();

    // 1. Lấy số lô cận date cho nhóm đặc biệt (ngưỡng 90 ngày)
    const specialGroups = SPECIAL_EXPIRY_SUBGROUPS;
    const specialFutureDate = new Date();
    specialFutureDate.setDate(today.getDate() + 90);
    const specialNearExpiryQuery = query(
        collection(db, "inventory_lots"),
        where("subGroup", "in", specialGroups),
        where("expiryDate", ">=", Timestamp.now()),
        where("expiryDate", "<=", Timestamp.fromDate(specialFutureDate))
    );

    // 2. Lấy số lô cận date cho nhóm còn lại (ngưỡng 210 ngày)
    const otherGroups = ALL_SUBGROUPS.filter(group => !specialGroups.includes(group));
    const otherFutureDate = new Date();
    otherFutureDate.setDate(today.getDate() + 210);
    const otherNearExpiryQuery = query(
        collection(db, "inventory_lots"),
        where("subGroup", "in", otherGroups),
        where("expiryDate", ">=", Timestamp.now()),
        where("expiryDate", "<=", Timestamp.fromDate(otherFutureDate))
    );

    // 3. Lấy số lô đã hết hạn (giữ nguyên)
    const expiredQuery = query(collection(db, "inventory_lots"), where("expiryDate", "<", Timestamp.now()));

    // 4. Lấy số lô an toàn (phức tạp hơn, cần lấy tổng số lô rồi trừ đi)
    const allLotsQuery = query(collection(db, "inventory_lots"));

    const [specialSnap, otherSnap, expiredSnap, allLotsSnap] = await Promise.all([
        getCountFromServer(specialNearExpiryQuery),
        getCountFromServer(otherNearExpiryQuery),
        getCountFromServer(expiredQuery),
        getCountFromServer(allLotsQuery)
    ]);

    const nearExpiryCount = specialSnap.data().count + otherSnap.data().count;
    const expiredCount = expiredSnap.data().count;
    const totalCount = allLotsSnap.data().count;
    const safeCount = totalCount - nearExpiryCount - expiredCount;

    const expiryData = {
        safe: safeCount,
        near_expiry: nearExpiryCount,
        expired: expiredCount,
    };

    // 2. Dữ liệu cho biểu đồ Team (PHIÊN BẢN MỚI LINH HOẠT)
const productsSnapshot = await getDocs(collection(db, "products"));

// Khởi tạo đối tượng đếm dựa trên TEAM_OPTIONS
const teamCounts = TEAM_OPTIONS.reduce((acc, team) => {
    acc[team] = 0;
    return acc;
}, {});

productsSnapshot.forEach(doc => {
    const team = doc.data().team;
    // Chỉ đếm nếu team của sản phẩm có trong danh sách TEAM_OPTIONS
    if (team in teamCounts) {
        teamCounts[team]++;
    }
});

return { expiryData, teamData: teamCounts };
};

/**
 * Lấy và xử lý dữ liệu phân tích bán hàng dựa trên bộ lọc.
 * @param {object} filters - Đối tượng chứa các bộ lọc { startDate, endDate, customerId, productId }.
 * @returns {Promise<Array>} - Một mảng chứa các dòng dữ liệu đã được xử lý.
 */
// src/services/dashboardService.js

export const getSalesAnalytics = async (filters = {}) => {
    let salesQuery = query(
        collection(db, 'export_tickets'),
        where("status", "==", "completed"),
        orderBy("createdAt", "desc")
    );

    // Áp dụng bộ lọc
    if (filters.startDate) {
        salesQuery = query(salesQuery, where("createdAt", ">=", Timestamp.fromDate(new Date(filters.startDate))));
    }
    if (filters.endDate) {
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        salesQuery = query(salesQuery, where("createdAt", "<=", Timestamp.fromDate(endOfDay)));
    }
    if (filters.customerId) {
        salesQuery = query(salesQuery, where("customerId", "==", filters.customerId));
    }
    if (filters.productId && filters.productId.trim() !== '') {
        salesQuery = query(salesQuery, where("productIds", "array-contains", filters.productId.trim()));
    }

    // --- LOGIC LỌC THEO TEAM ---
    if (filters.team && filters.team !== 'all') {
        const productsByTeamQuery = query(collection(db, 'products'), where("team", "==", filters.team));
        const productsSnapshot = await getDocs(productsByTeamQuery);
        const productIdsInTeam = productsSnapshot.docs.map(doc => doc.id);

        if (productIdsInTeam.length > 0) {
            // Firestore v10 không hỗ trợ `array-contains-any` kết hợp với các toán tử bất bình đẳng khác.
            // Do đó, chúng ta sẽ lọc trên client-side sau khi lấy dữ liệu.
            // Để tối ưu, nếu có thể, bạn nên thêm trường `teams` vào export_tickets.
            // Tạm thời, chúng ta sẽ không thêm bộ lọc này vào query chính.
        } else {
            return []; // Nếu không có sản phẩm nào thuộc team, trả về mảng rỗng
        }
    }

    const querySnapshot = await getDocs(salesQuery);

    // Xử lý và làm phẳng dữ liệu
    const detailedRows = [];
    querySnapshot.forEach(doc => {
        const slip = doc.data();
        slip.items.forEach(item => {
            // Lọc sản phẩm trong trường hợp có cả bộ lọc team và sản phẩm
            if (filters.productId && filters.productId.trim() !== '' && item.productId !== filters.productId.trim()) {
                return;
            }
            // Lọc team trên client-side
            if (filters.team && filters.team !== 'all' && item.team !== filters.team) {
                return;
            }
            
            detailedRows.push({
                slipId: doc.id,
                exportDate: slip.createdAt,
                customer: slip.customer,
                productId: item.productId,
                productName: item.productName,
                lotNumber: item.lotNumber,
                quantityExported: item.quantityToExport || item.quantityExported,
                unit: item.unit,
                team: item.team // Đảm bảo trường team được trả về 
            });
        });
    });
    return detailedRows;
};

/**
 * Lấy toàn bộ lịch sử giao dịch (thẻ kho) cho một mã hàng.
 * @param {string} productId - Mã hàng cần truy vấn.
 * @returns {Promise<object>} - Dữ liệu thẻ kho đã xử lý.
 */
// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

// src/services/dashboardService.js

export const getProductLedger = async (productId, lotNumberFilter, startDate, endDate, partnerName) => { // <-- Thêm partnerName vào tham số
    // ... (code cũ giữ nguyên đến phần xử lý giao dịch)
    if (!productId) {
        throw new Error("Mã hàng không được để trống.");
    }

    const upperProductId = productId.toUpperCase().trim();
    const startDateObj = startDate ? new Date(startDate) : null;
    let openingBalance = 0;

    // --- BƯỚC 1: TÍNH TỒN ĐẦU KỲ ---
    const cutoffDate = startDateObj ? Timestamp.fromDate(startDateObj) : null;

    if (cutoffDate) {
        // Lấy TẤT CẢ các lần nhập kho trước ngày bắt đầu, không phân biệt NCC
        const openingImportsQuery = query(
            collection(db, 'inventory_lots'),
            where('productId', '==', upperProductId),
            where("importDate", "<", cutoffDate)
        );
        const openingExportsQuery = query(
            collection(db, 'export_tickets'),
            where('status', '==', 'completed'),
            where('productIds', 'array-contains', upperProductId),
            where("createdAt", "<", cutoffDate)
        );

        const [openingImportsSnap, openingExportsSnap] = await Promise.all([
            getDocs(openingImportsQuery),
            getDocs(openingExportsQuery)
        ]);

        const totalImportedBefore = openingImportsSnap.docs.reduce((sum, doc) => {
            const lot = doc.data();
            return (!lotNumberFilter || lot.lotNumber === lotNumberFilter) ? sum + lot.quantityImported : sum;
        }, 0);
        
        let totalExportedBefore = 0;
        openingExportsSnap.forEach(doc => {
            doc.data().items.forEach(item => {
                if (item.productId === upperProductId && (!lotNumberFilter || item.lotNumber === lotNumberFilter)) {
                    totalExportedBefore += Number(item.quantityToExport || item.quantityExported);
                }
            });
        });
        openingBalance = totalImportedBefore - totalExportedBefore;
    }

    // --- BƯỚC 2: LẤY CÁC GIAO DỊCH TRONG KỲ ---
    let transactions = [];

    // Tạo các điều kiện lọc chung
    const dateFiltersCreatedAt = [];
    if (startDate) dateFiltersCreatedAt.push(where("createdAt", ">=", Timestamp.fromDate(new Date(startDate))));
    if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        dateFiltersCreatedAt.push(where("createdAt", "<=", Timestamp.fromDate(endOfDay)));
    }

    const lotDateFilters = [];
    if (startDate) lotDateFilters.push(where("importDate", ">=", Timestamp.fromDate(new Date(startDate))));
    if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        lotDateFilters.push(where("importDate", "<=", Timestamp.fromDate(endOfDay)));
    }
    
    // Lọc phiếu nhập và xuất từ tickets
    const importQuery = query(collection(db, 'import_tickets'), where('status', '==', 'completed'), where('productIds', 'array-contains', upperProductId), ...dateFiltersCreatedAt);
    const exportQuery = query(collection(db, 'export_tickets'), where('status', '==', 'completed'), where('productIds', 'array-contains', upperProductId), ...dateFiltersCreatedAt);
    
    // Lọc Tồn Đầu Kỳ từ inventory_lots, kiểm tra cả 2 biến thể tên và 2 biến thể giá trị
    const baseLotConstraints = [where('productId', '==', upperProductId)];
    if(lotNumberFilter) baseLotConstraints.push(where('lotNumber', '==', lotNumberFilter));
    
    const tdkQueries = [
        query(collection(db, 'inventory_lots'), ...baseLotConstraints, where('supplierName', '==', 'Tồn đầu kỳ'), ...lotDateFilters),
        query(collection(db, 'inventory_lots'), ...baseLotConstraints, where('supplierName', '==', 'Tồn kho đầu kỳ'), ...lotDateFilters),
        query(collection(db, 'inventory_lots'), ...baseLotConstraints, where('supplier', '==', 'Tồn đầu kỳ'), ...lotDateFilters),
        query(collection(db, 'inventory_lots'), ...baseLotConstraints, where('supplier', '==', 'Tồn kho đầu kỳ'), ...lotDateFilters),
    ];

    const [importSnap, exportSnap, ...tdkSnaps] = await Promise.all([
        getDocs(importQuery),
        getDocs(exportQuery),
        ...tdkQueries.map(q => getDocs(q))
    ]);

    // Xử lý các lần nhập kho từ phiêú
    importSnap.forEach(doc => {
        const slip = doc.data();
        slip.items.forEach(item => {
            if (item.productId === upperProductId && (!lotNumberFilter || item.lotNumber === lotNumberFilter)) {
                transactions.push({
                    date: slip.createdAt.toDate(), docId: doc.id, isTicket: true, type: 'NHẬP',
                    description: `Nhập từ: ${slip.supplierName}`, importQty: Number(item.quantity), exportQty: 0,
                    lotNumber: item.lotNumber, expiryDate: item.expiryDate, expiryDateObject: parseDateString(item.expiryDate)
                });
            }
        });
    });

    // Xử lý các lần nhập "Tồn (kho) đầu kỳ"
    tdkSnaps.forEach(snap => {
        snap.forEach(doc => {
            const lot = doc.data();
            // Chỉ thêm vào giao dịch nếu nó chưa được tính vào tồn đầu kỳ.
            if (!startDateObj) {
                transactions.push({
                    date: lot.importDate.toDate(), docId: `(Tồn đầu kỳ - Lô ${doc.id.substring(0,5)})`, isTicket: false, 
                    type: 'NHẬP', description: `Nhập từ: ${lot.supplierName || lot.supplier}`, importQty: Number(lot.quantityImported),
                    exportQty: 0, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate ? formatDate(lot.expiryDate) : '',
                    expiryDateObject: lot.expiryDate
                });
            }
        });
    });

    // Xử lý các lần xuất kho
    exportSnap.forEach(doc => {
        const slip = doc.data();
        slip.items.forEach(item => {
            if (item.productId === upperProductId && (!lotNumberFilter || item.lotNumber === lotNumberFilter)) {
                transactions.push({
                    date: slip.createdAt.toDate(), docId: doc.id, isTicket: true, type: 'XUẤT',
                    description: `Xuất cho: ${slip.customer}`, importQty: 0,
                    exportQty: Number(item.quantityToExport || item.quantityExported),
                    lotNumber: item.lotNumber, expiryDate: item.expiryDate,
                    expiryDateObject: parseDateString(item.expiryDate)
                });
            }
        });
    });

    // --- BẮT ĐẦU THÊM LOGIC LỌC MỚI ---
    let finalTransactions = transactions;
    if (partnerName && partnerName.trim() !== '') {
        const normalizedPartnerName = partnerName.trim().toLowerCase();
        finalTransactions = transactions.filter(tx => 
            tx.description.toLowerCase().includes(normalizedPartnerName)
        );
    }
    // --- KẾT THÚC LOGIC LỌC MỚI ---

    // Sắp xếp lại sau khi đã lọc
    finalTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Tính toán lại các giá trị tổng dựa trên dữ liệu đã lọc
    const totalImport = finalTransactions.reduce((sum, tx) => sum + tx.importQty, 0);
    const totalExport = finalTransactions.reduce((sum, tx) => sum + tx.exportQty, 0);

    let currentBalance = openingBalance;
    const ledgerRows = [];

    finalTransactions.forEach(tx => {
        currentBalance += (tx.importQty - tx.exportQty);
        ledgerRows.push({ ...tx, balance: currentBalance });
    });

    return {
        openingBalance, 
        totalImport, // Trả về tổng đã lọc
        totalExport, // Trả về tổng đã lọc
        closingBalance: currentBalance,
        rows: ledgerRows
    };
};

/**
 * Hàm lấy lịch sử tồn kho để vẽ biểu đồ Sparklines (Biến động)
 * @param {string} productId - ID của sản phẩm
 * @param {number} days - Số ngày muốn lấy dữ liệu (mặc định 30)
 * @returns {Promise<number[]>} - Mảng các con số tồn kho
 */
export const getInventoryHistory = async (productId, days = 30) => {
    try {
        // 1. Định nghĩa Collection lưu lịch sử (Giả sử bạn có collection này)
        // Nếu chưa có logic lưu lịch sử hàng ngày, hàm này sẽ trả về mảng rỗng để không bị lỗi web.
        const historyRef = collection(db, "inventory_snapshots"); 
        
        const q = query(
            historyRef,
            where("productId", "==", productId),
            orderBy("date", "asc"), // Sắp xếp ngày tăng dần
            limit(days)
        );

        const querySnapshot = await getDocs(q);
        
        // 2. Lấy ra mảng số lượng tồn (Ví dụ: [100, 98, 95, 102...])
        const data = querySnapshot.docs.map(doc => doc.data().totalQuantity || 0);
        
        // Nếu không có dữ liệu (do chưa setup job lưu snapshot), trả về mảng rỗng
        if (!data || data.length === 0) {
             return []; 
        }

        return data;
    } catch (error) {
        console.warn(`Không thể lấy lịch sử cho SP ${productId} (có thể do chưa tạo collection 'inventory_snapshots'):`, error);
        return []; // Trả về mảng rỗng để web vẫn chạy bình thường
    }
};
