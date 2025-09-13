const functions = require("firebase-functions");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {onCall} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const recalculateSummary = async (productId) => {
    const productRef = db.collection("products").doc(productId);
    const summaryRef = db.collection("product_summaries").doc(productId);

    const lotsQuery = db.collection("inventory_lots")
        .where("productId", "==", productId)
        .where("quantityRemaining", ">", 0);
    
    // SỬA LỖI Ở ĐÂY: Dùng .get() thay vì getDocs()
    const lotsSnapshot = await lotsQuery.get();

    if (lotsSnapshot.empty) {
        console.log(`Product ${productId} has no remaining lots. Deleting summary.`);
        await summaryRef.delete();
        return;
    }

    let totalRemaining = 0;
    let nearestExpiryDate = null;

    lotsSnapshot.forEach(doc => {
        const lot = doc.data();
        totalRemaining += lot.quantityRemaining;
        const expiryDate = lot.expiryDate.toDate();
        if (!nearestExpiryDate || expiryDate < nearestExpiryDate) {
            nearestExpiryDate = expiryDate;
        }
    });

    const productSnap = await productRef.get();
    if (!productSnap.exists) {
        console.error(`Product ${productId} not found during recalculation!`);
        return;
    }
    const productData = productSnap.data();
    
    await summaryRef.set({
        totalRemaining: totalRemaining,
        nearestExpiryDate: nearestExpiryDate,
        productName: productData.productName,
        unit: productData.unit,
        packaging: productData.packaging,
        storageTemp: productData.storageTemp,
        manufacturer: productData.manufacturer,
        team: productData.team,
    }, { merge: true });

    console.log(`Recalculated summary for product ${productId}. Total: ${totalRemaining}`);
};

exports.updateProductSummary = onDocumentWritten("inventory_lots/{lotId}", async (event) => {
    const dataBefore = event.data.before.data();
    const dataAfter = event.data.after.data();
    const productId = dataAfter?.productId || dataBefore?.productId;

    if (!productId) {
        console.log("No productId found in the change. Exiting.");
        return;
    }
    
    await recalculateSummary(productId);

    if (dataBefore && dataAfter && dataBefore.productId !== dataAfter.productId) {
        await recalculateSummary(dataBefore.productId);
    }
});

exports.backfillProductSummaries = onCall(async (request) => {
    console.log("Starting backfill process...");

    // SỬA LỖI Ở ĐÂY: Dùng .get() thay vì getDocs()
    const allLotsSnapshot = await db.collection("inventory_lots").get();
    if (allLotsSnapshot.empty) {
        return { status: "success", message: "No lots to process." };
    }

    const lotsByProduct = new Map();
    allLotsSnapshot.forEach(doc => {
        const lot = doc.data();
        if (lot.productId) {
            if (!lotsByProduct.has(lot.productId)) {
                lotsByProduct.set(lot.productId, []);
            }
            lotsByProduct.get(lot.productId).push(lot);
        }
    });
    
    const batch = db.batch();
    // SỬA LỖI Ở ĐÂY: Dùng .get() thay vì getDocs()
    const allSummariesSnapshot = await db.collection("product_summaries").get();
    allSummariesSnapshot.forEach(doc => batch.delete(doc.ref));

    let writeCount = 0;

    for (const [productId, lots] of lotsByProduct.entries()) {
        let total = 0;
        let nearestExpiry = null;
        
        lots.forEach(lot => {
            total += lot.quantityRemaining;
            const expiry = lot.expiryDate.toDate();
            if (lot.quantityRemaining > 0 && (!nearestExpiry || expiry < nearestExpiry)) {
                nearestExpiry = expiry;
            }
        });

        if (total > 0) {
            const productRef = db.collection("products").doc(productId);
            const productSnap = await productRef.get();
            if (productSnap.exists) {
                const productData = productSnap.data();
                const summaryRef = db.collection("product_summaries").doc(productId);
                batch.set(summaryRef, {
                    totalRemaining: total,
                    nearestExpiryDate: nearestExpiry,
                    productName: productData.productName,
                    unit: productData.unit,
                    packaging: productData.packaging,
                    storageTemp: productData.storageTemp,
                    manufacturer: productData.manufacturer,
                    team: productData.team,
                });
                writeCount++;
            }
        }
    }

    await batch.commit();
    console.log(`Backfill complete. Wrote ${writeCount} summaries.`);
    return { status: "success", message: `Successfully created/updated ${writeCount} summaries.` };
});