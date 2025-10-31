// Import các thư viện cần thiết
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// --- CẤU HÌNH ---
// 1. Thay đổi đường dẫn này trỏ đến file service account key của bạn
const serviceAccount = require('./serviceAccountKey.json'); 

// 2. Danh sách 40 ID tài liệu từ log của bạn
const lotIdsToUpdate = [
  '0nVgzXPlLaI9ccCxnkK3', '1n9CFVQMkzvsh1qofUvn', '3fWwVbTjnkSbuxULv4RG',
  '5cm7q0JR5j6Du7CEn7nx', '5essTzw3j8RG4xCrXWvW', '8ts8qZcgLsfoIIYTADSi',
  '961bd4ioFG13VE9oxFV4', 'CsN0Y6abu0hzFsUbhYtn', 'EFFEGdSG4OMfMiaMziPk',
  'EHd8UFf6lTZ9vucxKObC', 'HhZ98xsjWR1aPf5HJ8eB', 'LODqFOVs8d6w3qSP6txI',
  'LPmAoucymENVMVDMD6eu', 'NCA2BDweL8cSirKvwN1D', 'ON5X20F7vYVL3SfIAx5d',
  'OjRlV8cUhcbZ9Fb9MYXq', 'Pk4CXLU83vIogY3CCnc7', 'QlKshtx3PQdUXoJhMlNl',
  'SPTpTB3aguxIGpi5ObNe', 'T0sH5jPfaqoQxetzLQwW', 'ToIicj33nTChNGvg1Z2p',
  'U4GqHSU3A9u6xiXDIjV3', 'VTABlkrJawg7XmdwtRas', 'Vd63CIcqWfaTG5ztzXg1',
  'VvcLFK0UnsSIwAM5KrFO', 'X1FaGSeFx36HAbc9FbLd', 'Xf3y1Gs0f95SPRo759q7',
  'ZFLNKcnfb8aJkw5rMBRD', 'al7TSjkIyYqbhuJlUAsq', 'bWgg7hlyr8NOf61kNsCw',
  'eUJ4ihh6I26qUcnjBzjT', 'eWYdag2wbOmWIsO9TytI', 'i3Wf9byFK0mi17BCU2vi',
  'kXglYQs4rSgO9UJb11dU', 'mPqh1xKttOCWdvyNJsCP', 'nMe6zDulNlNZcFvCRphL',
  'nwFiycGqoPH7NKZgEPTT', 'rUmWxJeVxOLXMejjIpRW', 'tlOspcu585amBztWQZrG',
  'vGWojBBKEcqpkPJAZDoZ'
];

// 3. Dữ liệu cần cập nhật
const newData = {
  manufacturer: "Becton Dickinson"
};

// Khởi tạo Firebase Admin
try {
  initializeApp({
    credential: cert(serviceAccount)
  });
} catch (e) {
  if (e.code !== 'app/duplicate-app') {
    console.error('Lỗi khởi tạo Firebase Admin:', e);
    process.exit(1);
  }
}

const db = getFirestore();

// Hàm chạy cập nhật hàng loạt
const updateLots = async () => {
  if (lotIdsToUpdate.length === 0) {
    console.log('Không có ID nào để cập nhật.');
    return;
  }

  console.log(`Bắt đầu quá trình cập nhật ${lotIdsToUpdate.length} lô hàng...`);

  // Sử dụng Batched Write để cập nhật tất cả trong một lần
  const batch = db.batch();

  for (const lotId of lotIdsToUpdate) {
    // Tạo một tham chiếu đến tài liệu trong collection 'inventory_lots'
    const lotRef = db.collection('inventory_lots').doc(lotId);
    
    // Thêm thao tác update vào batch
    // Chúng ta dùng { merge: true } để chỉ thêm/cập nhật trường 'manufacturer'
    // mà không ghi đè toàn bộ tài liệu
    batch.set(lotRef, newData, { merge: true });
  }

  // Commit (thực thi) batch
  try {
    await batch.commit();
    console.log(`✅ THÀNH CÔNG! Đã cập nhật ${lotIdsToUpdate.length} lô hàng.`);
  } catch (error) {
    console.error('❌ LỖI: Không thể thực thi batch cập nhật:', error);
  }
};

// Chạy hàm
updateLots();