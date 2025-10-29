// File: scripts/systemHealthCheck.js (Phiên bản Cuối cùng & Hoàn thiện nhất)

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- BỘ CÔNG CỤ HỖ TRỢ ---
const log = (message) => console.log(message);
const logError = (message) => console.error(`❌ LỖI NGHIÊM TRỌNG: ${message}`);
const logWarning = (message) => console.warn(`⚠️ CẢNH BÁO: ${message}`);
const logSuccess = (message) => console.log(`✅ ${message}`);

// --- CÁC HÀM KIỂM TRA CHUYÊN BIỆT ---

async function checkNegativeInventory() {
    log("\n[1/24] Đang kiểm tra tồn kho âm...");
    const snap = await db.collection('inventory_lots').where('quantityRemaining', '<', 0).get();
    if (snap.empty) { logSuccess("Không tìm thấy lô hàng nào có tồn kho âm."); return 0; }
    logError(`Phát hiện ${snap.size} lô hàng có tồn kho âm.`);
    snap.forEach(doc => { const d = doc.data(); log(`   - Lot ID: ${doc.id} (Sản phẩm: ${d.productId}, Lô: ${d.lotNumber}, SL: ${d.quantityRemaining})`); });
    return snap.size;
}

async function checkAllocationConsistency() {
    log("\n[2/24] Đang kiểm tra tính nhất quán của số lượng đặt giữ...");
    const theoretical = new Map();
    const pendingSnap = await db.collection('export_tickets').where('status', '==', 'pending').get();
    pendingSnap.forEach(doc => { (doc.data().items || []).forEach(item => { if (item.lotId) { const qty = Number(item.quantityToExport || item.quantityExported || 0); theoretical.set(item.lotId, (theoretical.get(item.lotId) || 0) + qty); } }); });
    const actual = new Map();
    const allocatedSnap = await db.collection('inventory_lots').where('quantityAllocated', '>', 0).get();
    allocatedSnap.forEach(doc => actual.set(doc.id, doc.data().quantityAllocated));
    const allIds = new Set([...theoretical.keys(), ...actual.keys()]);
    let discrepancies = 0;
    for (const lotId of allIds) {
        const theoreticalQty = theoretical.get(lotId) || 0;
        const actualQty = actual.get(lotId) || 0;
        if (theoreticalQty !== actualQty) { discrepancies++; logError(`Chênh lệch đặt giữ ở Lô ID: ${lotId} (Cần: ${theoreticalQty}, Thực tế: ${actualQty})`); }
    }
    if (discrepancies === 0) { logSuccess("Số lượng đặt giữ hoàn toàn khớp."); }
    return discrepancies;
}

async function checkOverAllocation() {
    log("\n[3/24] Đang kiểm tra đặt giữ vượt tồn kho...");
    const lotsSnap = await db.collection('inventory_lots').get();
    let count = 0;
    lotsSnap.forEach(doc => { const lot = doc.data(); if ((lot.quantityAllocated || 0) > (lot.quantityRemaining || 0)) { count++; logError(`Đặt giữ vượt tồn kho ở Lô ID: ${doc.id} (Đặt giữ: ${lot.quantityAllocated}, Tồn kho: ${lot.quantityRemaining})`); } });
    if (count === 0) { logSuccess("Không tìm thấy trường hợp đặt giữ vượt tồn kho."); }
    return count;
}

async function checkSummaryConsistency() {
    log("\n[4/24] Đang kiểm tra tính nhất quán của tồn kho tổng hợp...");
    const summariesSnap = await db.collection('product_summaries').get();
    let discrepancies = 0;
    for (const doc of summariesSnap.docs) {
        const productId = doc.id;
        const summaryTotal = doc.data().totalRemaining;
        const lotsSnap = await db.collection('inventory_lots').where('productId', '==', productId).get();
        const actualTotal = lotsSnap.docs.reduce((sum, lotDoc) => sum + (lotDoc.data().quantityRemaining || 0), 0);
        if (summaryTotal !== actualTotal) { discrepancies++; logError(`Chênh lệch tồn kho tổng hợp ở Sản phẩm ID: ${productId} (Summary: ${summaryTotal}, Thực tế: ${actualTotal})`); }
    }
    if (discrepancies === 0) { logSuccess("Dữ liệu tồn kho tổng hợp hoàn toàn khớp."); }
    return discrepancies;
}

async function checkOrphanedLots() {
    log("\n[5/24] Đang kiểm tra dữ liệu 'mồ côi' (Lô hàng)...");
    const productIds = new Set((await db.collection('products').get()).docs.map(doc => doc.id));
    const lotsSnap = await db.collection('inventory_lots').get();
    let orphans = 0;
    lotsSnap.forEach(doc => { if (!productIds.has(doc.data().productId)) { orphans++; logWarning(`Lô hàng mồ côi - Lot ID: ${doc.id} tham chiếu đến Product ID không tồn tại: ${doc.data().productId}`); } });
    if (orphans === 0) { logSuccess("Không tìm thấy lô hàng mồ côi nào."); }
    return orphans;
}

async function checkIncompleteProducts() {
    log("\n[6/24] Đang kiểm tra sản phẩm thiếu thông tin cơ bản...");
    const productsSnap = await db.collection('products').get();
    let count = 0;
    const requiredFields = ['productName', 'unit', 'team'];
    productsSnap.forEach(doc => { const missing = requiredFields.filter(f => !doc.data()[f] || String(doc.data()[f]).trim() === ''); if (missing.length > 0) { count++; logWarning(`Sản phẩm ID: ${doc.id} thiếu thông tin: [${missing.join(', ')}]`); } });
    if (count === 0) { logSuccess("Tất cả sản phẩm đều có đủ thông tin cơ bản."); }
    return count;
}

async function checkOrphanedSlips() {
    log("\n[7/24] Đang kiểm tra phiếu Nhập/Xuất 'mồ côi'...");
    const partnerIds = new Set((await db.collection('partners').get()).docs.map(doc => doc.id));
    let orphans = 0;
    const importSnaps = await db.collection('import_tickets').get();
    importSnaps.forEach(doc => { if (doc.data().supplierId && !partnerIds.has(doc.data().supplierId)) { orphans++; logWarning(`Phiếu nhập mồ côi - ID: ${doc.id} tham chiếu đến NCC ID không tồn tại: ${doc.data().supplierId}`); } });
    const exportSnaps = await db.collection('export_tickets').get();
    exportSnaps.forEach(doc => { if (doc.data().customerId && !partnerIds.has(doc.data().customerId)) { orphans++; logWarning(`Phiếu xuất mồ côi - ID: ${doc.id} tham chiếu đến KH ID không tồn tại: ${doc.data().customerId}`); } });
    if (orphans === 0) { logSuccess("Không tìm thấy phiếu nhập/xuất mồ côi nào."); }
    return orphans;
}

async function checkInconsistentUsers() {
    log("\n[8/24] Đang kiểm tra người dùng không nhất quán...");
    const allowedEmails = new Set((await db.collection('allowlist').get()).docs.map(doc => doc.data().email.toLowerCase()));
    const usersSnap = await db.collection('users').get();
    let count = 0;
    usersSnap.forEach(doc => { if (doc.data().email && !allowedEmails.has(doc.data().email.toLowerCase())) { count++; logWarning(`Người dùng không nhất quán - UID: ${doc.id} (Email: ${doc.data().email}) không có trong allowlist.`); } });
    if (count === 0) { logSuccess("Dữ liệu người dùng nhất quán."); }
    return count;
}

async function checkInconsistentClassification() {
    log("\n[9/24] Đang kiểm tra phân loại Team/Nhóm hàng...");
    const SUBGROUPS_BY_TEAM = { MED: ["BD MDS", "BD SM", "BD BDC", "BD BDI", "CVC", "DentaLife", "Schulke", "Smiths Medical", "Gojo", "Purell"], BIO: ["BD BDB", "BD DS", "Spare Part", "Rovers", "KHÁC"] };
    let count = 0;
    const productsSnap = await db.collection('products').get();
    productsSnap.forEach(doc => { const p = doc.data(); if (p.team && p.subGroup && SUBGROUPS_BY_TEAM[p.team] && !SUBGROUPS_BY_TEAM[p.team].includes(p.subGroup)) { count++; logWarning(`Phân loại không nhất quán - Product ID: ${doc.id} có team '${p.team}' nhưng subgroup là '${p.subGroup}'.`); } });
    if (count === 0) { logSuccess("Dữ liệu phân loại Team/Nhóm hàng nhất quán."); }
    return count;
}

async function checkDuplicateData() {
    log("\n[10/24] Đang kiểm tra dữ liệu trùng lặp (Tên Sản phẩm/Đối tác)...");
    let duplicates = 0;
    const collections = { products: 'productName', partners: 'partnerName' };
    for (const [col, field] of Object.entries(collections)) {
        const itemsByName = new Map();
        const snap = await db.collection(col).get();
        snap.forEach(doc => { const name = (doc.data()[field] || '').trim().toLowerCase(); if (name) { if (!itemsByName.has(name)) itemsByName.set(name, []); itemsByName.get(name).push(doc.id); } });
        for (const [name, ids] of itemsByName.entries()) { if (ids.length > 1) { duplicates++; logWarning(`Trùng lặp ${field}: Tên "${name}" được sử dụng bởi các ID: [${ids.join(', ')}]`); } }
    }
    if (duplicates === 0) { logSuccess("Không tìm thấy dữ liệu sản phẩm/đối tác trùng lặp."); }
    return duplicates;
}

async function checkOrphanedSummaries() {
    log("\n[11/24] Đang kiểm tra dữ liệu 'mồ côi' (Tồn kho tổng hợp)...");
    const productIds = new Set((await db.collection('products').get()).docs.map(doc => doc.id));
    const summariesSnap = await db.collection('product_summaries').get();
    let orphans = 0;
    summariesSnap.forEach(doc => { if (!productIds.has(doc.id)) { orphans++; logWarning(`Summary mồ côi - ID: ${doc.id} tồn tại nhưng sản phẩm gốc đã bị xóa.`); } });
    if (orphans === 0) { logSuccess("Không tìm thấy summary mồ côi nào."); }
    return orphans;
}

async function checkDateLogic() {
    log("\n[12/24] Đang kiểm tra logic ngày tháng (HSD < Ngày Nhập)...");
    const lotsSnap = await db.collection('inventory_lots').where('expiryDate', '!=', null).get();
    let count = 0;
    lotsSnap.forEach(doc => { const lot = doc.data(); if (lot.importDate && lot.expiryDate.toMillis() < lot.importDate.toMillis()) { count++; logWarning(`Logic ngày tháng không hợp lệ - Lot ID: ${doc.id} có HSD (${lot.expiryDate.toDate().toLocaleDateString('vi-VN')}) trước Ngày nhập (${lot.importDate.toDate().toLocaleDateString('vi-VN')}).`); } });
    if (count === 0) { logSuccess("Logic ngày tháng hợp lệ."); }
    return count;
}

async function checkOwnerCount() {
    log("\n[13/24] Đang kiểm tra số lượng quản trị viên (Owner)...");
    const ownersSnap = await db.collection('allowlist').where('role', '==', 'owner').get();
    if (ownersSnap.size === 0) { logError("Hệ thống không có người dùng nào có vai trò 'owner'."); return 1; }
    if (ownersSnap.size > 2) { logWarning(`Hệ thống có ${ownersSnap.size} người dùng vai trò 'owner'. Khuyến nghị chỉ nên có 1-2.`); }
    logSuccess(`Hệ thống có ${ownersSnap.size} người dùng vai trò 'owner'.`);
    return 0;
}

async function checkGhostSummaries() {
    log("\n[14/24] Đang kiểm tra dữ liệu tổng hợp 'rác'...");
    const summariesSnap = await db.collection('product_summaries').get();
    let ghosts = 0;
    for (const doc of summariesSnap.docs) {
        const lotsSnap = await db.collection('inventory_lots').where('productId', '==', doc.id).where('quantityRemaining', '>', 0).limit(1).get();
        if (lotsSnap.empty) { ghosts++; logWarning(`Summary rác - ID: ${doc.id} tồn tại nhưng sản phẩm đã hết sạch hàng.`); }
    }
    if (ghosts === 0) { logSuccess("Không tìm thấy summary rác nào."); }
    return ghosts;
}

async function checkInvalidRoles() {
    log("\n[15/24] Đang kiểm tra vai trò người dùng không hợp lệ...");
    const VALID_ROLES = ['owner', 'admin', 'med', 'bio'];
    const allowlistSnap = await db.collection('allowlist').get();
    let count = 0;
    allowlistSnap.forEach(doc => { if (!VALID_ROLES.includes(doc.data().role)) { count++; logWarning(`Vai trò không hợp lệ - Email: ${doc.id} đang có vai trò '${doc.data().role}'.`); } });
    if (count === 0) { logSuccess("Tất cả người dùng đều có vai trò hợp lệ."); }
    return count;
}

async function checkStalePendingSlips() {
    log("\n[16/24] Đang kiểm tra phiếu 'pending' quá hạn...");
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 7);
    const staleSlipsSnap = await db.collection('export_tickets').where('status', '==', 'pending').where('createdAt', '<', threshold).get();
    if (staleSlipsSnap.empty) { logSuccess("Không có phiếu 'pending' nào quá 7 ngày."); return 0; }
    logWarning(`Phát hiện ${staleSlipsSnap.size} phiếu 'pending' đã quá 7 ngày chưa được xử lý:`);
    staleSlipsSnap.forEach(doc => { log(`   - ID Phiếu: ${doc.id} (Ngày tạo: ${doc.data().createdAt.toDate().toLocaleDateString('vi-VN')})`); });
    return staleSlipsSnap.size;
}

async function checkZeroQuantityTransactions() {
    log("\n[17/24] Đang kiểm tra giao dịch có số lượng bằng 0...");
    let count = 0;
    const collections = ['import_tickets', 'export_tickets'];
    for (const col of collections) {
        const snap = await db.collection(col).get();
        snap.forEach(doc => {
            (doc.data().items || []).forEach((item, index) => {
                const qty = Number(item.quantity || item.quantityToExport || item.quantityExported || -1);
                if (qty === 0) { count++; logWarning(`Giao dịch số lượng 0 - Phiếu ${col.replace('_tickets', '')} ID: ${doc.id}, dòng ${index + 1}`); }
            });
        });
    }
    if (count === 0) { logSuccess("Không tìm thấy giao dịch nào có số lượng bằng 0."); }
    return count;
}

async function checkFutureDatedTransactions() {
    log("\n[18/24] Đang kiểm tra giao dịch trong tương lai...");
    const now = new Date();
    let count = 0;
    const collections = ['import_tickets', 'export_tickets'];
    for (const col of collections) {
        const snap = await db.collection(col).where('createdAt', '>', now).get();
        if (!snap.empty) { count += snap.size; snap.forEach(doc => { logWarning(`Giao dịch tương lai - Phiếu ${col.replace('_tickets', '')} ID: ${doc.id} có ngày tạo ở tương lai.`); }); }
    }
    if (count === 0) { logSuccess("Không tìm thấy giao dịch nào có ngày tạo ở tương lai."); }
    return count;
}

async function checkSummaryExpiryDateConsistency() {
    log("\n[19/24] Đang kiểm tra tính nhất quán của HSD gần nhất...");
    const summariesSnap = await db.collection('product_summaries').get();
    let discrepancies = 0;
    for (const doc of summariesSnap.docs) {
        const productId = doc.id;
        const summaryData = doc.data();
        const summaryDate = summaryData.nearestExpiryDate ? summaryData.nearestExpiryDate.toMillis() : null;
        const lotsSnap = await db.collection('inventory_lots').where('productId', '==', productId).where('quantityRemaining', '>', 0).where('expiryDate', '!=', null).orderBy('expiryDate', 'asc').limit(1).get();
        const actualNearestDate = !lotsSnap.empty ? lotsSnap.docs[0].data().expiryDate.toMillis() : null;
        if (summaryDate !== actualNearestDate) {
            discrepancies++;
            logError(`Chênh lệch HSD gần nhất ở Sản phẩm ID: ${productId} (Summary: ${summaryDate ? new Date(summaryDate).toLocaleDateString('vi-VN') : 'N/A'}, Thực tế: ${actualNearestDate ? new Date(actualNearestDate).toLocaleDateString('vi-VN') : 'N/A'})`);
        }
    }
    if (discrepancies === 0) { logSuccess("Dữ liệu HSD gần nhất hoàn toàn khớp."); }
    return discrepancies;
}

async function checkPhantomProductsInSlips() {
    log("\n[20/24] Đang kiểm tra sản phẩm 'tàng hình' trong phiếu...");
    const productIds = new Set((await db.collection('products').get()).docs.map(doc => doc.id));
    let phantoms = 0;
    const collections = ['import_tickets', 'export_tickets'];
    for (const col of collections) {
        const snap = await db.collection(col).get();
        snap.forEach(doc => { (doc.data().items || []).forEach(item => { if (item.productId && !productIds.has(item.productId)) { phantoms++; logWarning(`Sản phẩm tàng hình - Phiếu ${col.replace('_tickets', '')} ID: ${doc.id} tham chiếu đến Product ID không tồn tại: ${item.productId}`); } }); });
    }
    if (phantoms === 0) { logSuccess("Không tìm thấy sản phẩm tàng hình nào trong các phiếu."); }
    return phantoms;
}

async function checkStaleAllowlistEntries() {
    log("\n[21/24] Đang kiểm tra 'allowlist' tồn đọng...");
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);
    const activeUserEmails = new Set((await db.collection('users').get()).docs.map(doc => doc.data().email.toLowerCase()));
    const staleEntriesSnap = await db.collection('allowlist').where('addedAt', '<', threshold).get();
    let staleCount = 0;
    staleEntriesSnap.forEach(doc => { const entry = doc.data(); if (!activeUserEmails.has(entry.email.toLowerCase())) { staleCount++; logWarning(`Allowlist tồn đọng - Email: ${entry.email} được thêm vào hơn 30 ngày nhưng chưa kích hoạt.`); } });
    if (staleCount === 0) { logSuccess("Không có email nào trong allowlist bị tồn đọng."); }
    return staleCount;
}

// --- CÁC HÀM KIỂM TRA MỚI ---

async function checkLargeDocuments() {
    log("\n[22/24] Đang kiểm tra kích thước tài liệu bất thường...");
    const sizeThreshold = 500 * 1024; // 500 KB
    let largeDocCount = 0;
    const collections = ['import_tickets', 'export_tickets', 'product_summaries'];
    for (const col of collections) {
        const snap = await db.collection(col).get();
        snap.forEach(doc => {
            const size = JSON.stringify(doc.data()).length;
            if (size > sizeThreshold) {
                largeDocCount++;
                logWarning(`Tài liệu lớn - Collection: ${col}, ID: ${doc.id} có kích thước ~${(size / 1024).toFixed(2)} KB.`);
            }
        });
    }
    if (largeDocCount === 0) { logSuccess("Không tìm thấy tài liệu nào có kích thước quá lớn."); }
    return largeDocCount;
}

async function checkMissingConversionFactor() {
    log("\n[23/24] Đang kiểm tra sản phẩm thiếu hệ số quy đổi (conversionFactor)...");
    const productsSnap = await db.collection('products').get();
    let missingCount = 0;
    productsSnap.forEach(doc => {
        if (doc.data().conversionFactor === undefined) {
            missingCount++;
            logWarning(`Thiếu conversionFactor - Product ID: ${doc.id}`);
        }
    });
    if (missingCount === 0) { logSuccess("Tất cả sản phẩm đều có trường conversionFactor."); }
    return missingCount;
}

async function checkMissingSubgroupInLots() {
    log("\n[24/24] Đang kiểm tra lô hàng thiếu thông tin Nhóm hàng (subGroup)...");
    const lotsSnap = await db.collection('inventory_lots').where('subGroup', '==', null).get();
    if (lotsSnap.empty) {
        logSuccess("Tất cả lô hàng đều có thông tin Nhóm hàng.");
        return 0;
    }
    logWarning(`Phát hiện ${lotsSnap.size} lô hàng thiếu thông tin Nhóm hàng:`);
    lotsSnap.forEach(doc => {
        const d = doc.data();
        log(`   - Lot ID: ${doc.id} (Sản phẩm: ${d.productId}, Lô: ${d.lotNumber})`);
    });
    return lotsSnap.size;
}

// --- HÀM CHÍNH ---
async function runHealthCheck() {
    log("=============================================");
    log("🚀 BẮT ĐẦU KIỂM TRA SỨC KHỎE HỆ THỐNG KHO 🚀");
    log("=============================================");
    let totalErrors = 0, totalWarnings = 0;

    try {
        // Lỗi nghiêm trọng
        totalErrors += await checkNegativeInventory();
        totalErrors += await checkAllocationConsistency();
        totalErrors += await checkOverAllocation();
        totalErrors += await checkSummaryConsistency();
        totalErrors += await checkOwnerCount();
        totalErrors += await checkSummaryExpiryDateConsistency();

        // Cảnh báo
        totalWarnings += await checkOrphanedLots();
        totalWarnings += await checkIncompleteProducts();
        totalWarnings += await checkOrphanedSlips();
        totalWarnings += await checkInconsistentUsers();
        totalWarnings += await checkInconsistentClassification();
        totalWarnings += await checkDuplicateData();
        totalWarnings += await checkOrphanedSummaries();
        totalWarnings += await checkDateLogic();
        totalWarnings += await checkGhostSummaries();
        totalWarnings += await checkInvalidRoles();
        totalWarnings += await checkStalePendingSlips();
        totalWarnings += await checkZeroQuantityTransactions();
        totalWarnings += await checkFutureDatedTransactions();
        totalWarnings += await checkPhantomProductsInSlips();
        totalWarnings += await checkStaleAllowlistEntries();
        totalWarnings += await checkLargeDocuments();
        totalWarnings += await checkMissingConversionFactor();
        totalWarnings += await checkMissingSubgroupInLots();
        
        log("\n=============================================");
        log("📊 KẾT QUẢ TỔNG QUAN 📊");
        log("=============================================");
        if (totalErrors > 0) { logError(`Tổng cộng tìm thấy ${totalErrors} LỖI NGHIÊM TRỌNG.`); } 
        else { logSuccess("Không tìm thấy lỗi nghiêm trọng nào."); }
        
        if (totalWarnings > 0) { logWarning(`Tổng cộng tìm thấy ${totalWarnings} vấn đề cần chú ý (cảnh báo).`); } 
        else { logSuccess("Không tìm thấy vấn đề nào cần chú ý."); }

        if (totalErrors === 0 && totalWarnings === 0) {
            log("\n🎉 Xin chúc mừng! Dữ liệu hệ thống của bạn đang ở trạng thái rất tốt!");
        }
    } catch (error) {
        logError("Một lỗi không xác định đã xảy ra trong quá trình kiểm tra:", error);
    }
}

runHealthCheck();
