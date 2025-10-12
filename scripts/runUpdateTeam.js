// D:\quan-ly-kho\scripts\runUpdateTeam.js

// BƯỚC 1: Nạp các biến môi trường từ file .env
import 'dotenv/config'; 
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch } from 'firebase/firestore';

const BATCH_SIZE = 400;

/**
 * Script tự động cập nhật trường "team" còn thiếu trong các items của phiếu xuất.
 */
async function updateExportTickets() {
    console.log("🚀 Bắt đầu quá trình cập nhật team cho các phiếu xuất cũ...");

    try {
        // --- BƯỚC 2: Khởi tạo kết nối Firebase ngay trong script ---
        console.log("- Đang kết nối đến Firebase...");
        const firebaseConfig = {
            apiKey: process.env.VITE_FIREBASE_API_KEY,
            authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.VITE_FIREBASE_APP_ID,
        };
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        console.log("- ✅ Kết nối thành công!");

        // --- BƯỚC 3: Lấy tất cả sản phẩm và tạo bản đồ tra cứu team ---
        console.log("- Đang tải danh sách sản phẩm để tra cứu team...");
        const productTeamMap = new Map();
        const productsRef = collection(db, 'products');
        const productsSnapshot = await getDocs(productsRef);

        productsSnapshot.forEach(doc => {
            productTeamMap.set(doc.id, doc.data().team);
        });
        console.log(`- ✅ Đã tải thành công ${productTeamMap.size} sản phẩm.`);

        // --- BƯỚC 4: Lấy tất cả các phiếu xuất ---
        console.log("- Đang tải tất cả các phiếu xuất...");
        const exportsRef = collection(db, 'export_tickets');
        const exportsSnapshot = await getDocs(exportsRef);
        console.log(`- ✅ Tìm thấy tổng cộng ${exportsSnapshot.docs.length} phiếu xuất để kiểm tra.`);

        // --- BƯỚC 5: Xử lý và cập nhật theo lô (batch) ---
        let batch = writeBatch(db);
        let operationCount = 0;
        let updatedDocsCount = 0;
        let totalBatches = 0;

        for (const doc of exportsSnapshot.docs) {
            const ticket = doc.data();
            let needsUpdate = false;

            const updatedItems = ticket.items.map(item => {
                if (!item.team && productTeamMap.has(item.productId)) {
                    needsUpdate = true;
                    return { ...item, team: productTeamMap.get(item.productId) };
                }
                return item;
            });

            if (needsUpdate) {
                updatedDocsCount++;
                batch.update(doc.ref, { items: updatedItems });
                operationCount++;
                console.log(`  - Chuẩn bị cập nhật phiếu: ${doc.id}`);
            }

            if (operationCount >= BATCH_SIZE) {
                totalBatches++;
                console.log(`\n📦 Đang gửi lô cập nhật thứ ${totalBatches} (${operationCount} phiếu)...`);
                await batch.commit();
                console.log(`- ✅ Đã gửi thành công!`);
                batch = writeBatch(db);
                operationCount = 0;
            }
        }

        if (operationCount > 0) {
            totalBatches++;
            console.log(`\n📦 Đang gửi lô cập nhật cuối cùng (${operationCount} phiếu)...`);
            await batch.commit();
            console.log(`- ✅ Đã gửi thành công!`);
        }

        console.log("\n---");
        if (updatedDocsCount === 0) {
            console.log("🎉 Không có phiếu xuất nào cần cập nhật. Dữ liệu của bạn đã đầy đủ!");
        } else {
            console.log(`🎉 HOÀN TẤT! Đã cập nhật thành công ${updatedDocsCount} phiếu xuất.`);
        }

    } catch (error) {
        console.error("\n❌ Đã xảy ra lỗi nghiêm trọng:", error);
        console.log("Quá trình đã bị dừng. Vui lòng kiểm tra lỗi và thử lại.");
    }
}

updateExportTickets();