const CFG = window.APP_CONFIG;

// -------------------- Thai date helpers --------------------
const THAI_MONTHS_ABBR = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function monthFolderName(date) {
  const be2 = String(date.getFullYear() + 543).slice(-2);
  return `${THAI_MONTHS_ABBR[date.getMonth()]}${be2}`;
}
function dayFolderName(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const be4 = date.getFullYear() + 543;
  return `${dd}-${mm}-${be4}`;
}
function timeFilename(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}${mi}${ss}.jpg`;
}

// -------------------- IndexedDB queue --------------------
const DB_NAME = "photo-upload-queue";
const STORE = "pending";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function addPending(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getAllPending() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function deletePending(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// -------------------- แปลงรูปเป็น base64 --------------------
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // reader.result หน้าตาแบบ "data:image/jpeg;base64,XXXXX" ตัวโฟลว์ (base64ToBinary)
      // ต้องการเฉพาะส่วน base64 ล้วนๆ หลังเครื่องหมายจุลภาค
      resolve(String(reader.result).split(",")[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// -------------------- ส่งเข้า Power Automate (HTTP request) --------------------
async function sendToFlow(item) {
  const fileContent = await blobToBase64(item.blob);
  const res = await fetch(CFG.flowUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: item.filename,
      monthFolder: item.monthFolder,
      dayFolder: item.dayFolder,
      fileContent,
      secret: CFG.uploadSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`ส่งไม่สำเร็จ (HTTP ${res.status})`);
  }
  return res.json().catch(() => ({}));
}

// -------------------- Sync loop --------------------
let syncing = false;
async function syncPending() {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const items = await getAllPending();
    updateQueueUI(items.length);
    if (!items.length) return;

    for (const item of items) {
      try {
        setStatus(`กำลังส่ง ${item.filename} ...`);
        await sendToFlow(item);
        await deletePending(item.id);
      } catch (e) {
        console.error("sync error", e);
        setStatus("ส่งไม่สำเร็จ จะลองใหม่ภายหลัง");
        break; // หยุด ไว้ลองรอบถัดไป ไม่ข้ามคิว
      }
    }
    const remaining = await getAllPending();
    updateQueueUI(remaining.length);
    if (remaining.length === 0) setStatus("ส่งครบแล้ว");
  } finally {
    syncing = false;
  }
}

// -------------------- UI --------------------
const videoEl = document.getElementById("camera");
const canvasEl = document.getElementById("canvas");
const shutterBtn = document.getElementById("shutter");
const statusEl = document.getElementById("status");
const queueEl = document.getElementById("queueCount");
const flashEl = document.getElementById("flash");

function setStatus(text) {
  statusEl.textContent = text;
}
function updateQueueUI(n) {
  queueEl.textContent = n > 0 ? `รอส่ง ${n} รูป` : "";
}

let imageCapture = null;

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        // ขอความละเอียดสูงสุดเท่าที่กล้องรองรับ (เบราว์เซอร์จะลดลงเองถ้ากล้องทำไม่ได้)
        width: { ideal: 4096 },
        height: { ideal: 2160 },
      },
      audio: false,
    });
    videoEl.srcObject = stream;

    // ถ้าเครื่องรองรับ ImageCapture ให้ใช้ถ่ายภาพนิ่งเต็มความละเอียดจากเซนเซอร์
    // (คมชัดกว่าการแคปเจอร์เฟรมจากวิดีโอสตรีมมาก) ถ้าไม่รองรับจะ fallback เป็น canvas
    const [track] = stream.getVideoTracks();
    if ("ImageCapture" in window && track) {
      try {
        imageCapture = new ImageCapture(track);
      } catch (e) {
        imageCapture = null;
      }
    }
  } catch (e) {
    setStatus("เปิดกล้องไม่ได้: " + e.message);
  }
}

// ถ่ายภาพด้วยการแคปเจอร์เฟรมจากวิดีโอสตรีม (fallback สำหรับเครื่องที่ไม่รองรับ ImageCapture)
function captureViaCanvas() {
  return new Promise((resolve, reject) => {
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) return reject(new Error("วิดีโอยังไม่พร้อม"));
    canvasEl.width = w;
    canvasEl.height = h;
    canvasEl.getContext("2d").drawImage(videoEl, 0, 0, w, h);
    canvasEl.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("แปลงภาพไม่สำเร็จ"))),
      "image/jpeg",
      0.92
    );
  });
}

// ภาพจาก ImageCapture.takePhoto() อาจมีแค่ "ป้าย EXIF บอกทิศทาง" ติดมาแทนการหมุนพิกเซลจริง
// ซึ่งโปรแกรมดูรูปหลายตัว (เช่น SharePoint) ไม่อ่านป้ายนี้ ทำให้เห็นภาพเอียง/นอนผิดทาง
// ฟังก์ชันนี้จะถอดรหัสภาพโดยหมุนพิกเซลจริงตามป้าย EXIF ให้เรียบร้อย แล้วส่งออกเป็น JPEG ใหม่
// ที่ไม่มีป้าย EXIF ติดไปด้วย รับประกันว่าถูกทางไม่ว่าปลายทางจะอ่าน EXIF หรือไม่ก็ตาม
async function normalizeOrientation(blob) {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    canvasEl.width = bitmap.width;
    canvasEl.height = bitmap.height;
    canvasEl.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return await new Promise((resolve, reject) =>
      canvasEl.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("แปลงภาพไม่สำเร็จ"))),
        "image/jpeg",
        0.92
      )
    );
  } catch (e) {
    console.error("normalize orientation failed, using original blob", e);
    return blob; // เบราว์เซอร์เก่ามากอาจไม่รองรับ - ใช้ภาพเดิมไปก่อนดีกว่าไม่ได้ภาพเลย
  }
}

async function capture() {
  // เอฟเฟกต์ชัตเตอร์ - ให้ผู้ใช้เห็นทันทีโดยไม่ต้องรอถ่ายเสร็จ
  flashEl.classList.add("flash-active");
  setTimeout(() => flashEl.classList.remove("flash-active"), 150);

  let blob;
  try {
    if (imageCapture) {
      blob = await imageCapture.takePhoto();
      blob = await normalizeOrientation(blob);
    } else {
      blob = await captureViaCanvas();
    }
  } catch (e) {
    console.error("capture error, falling back to canvas", e);
    try {
      blob = await captureViaCanvas();
    } catch (e2) {
      setStatus("ถ่ายภาพไม่สำเร็จ: " + e2.message);
      return;
    }
  }

  const now = new Date();
  const item = {
    blob,
    filename: timeFilename(now),
    monthFolder: monthFolderName(now),
    dayFolder: dayFolderName(now),
    capturedAt: now.toISOString(),
  };
  await addPending(item);
  const items = await getAllPending();
  updateQueueUI(items.length);
  setStatus(navigator.onLine ? "บันทึกแล้ว กำลังส่ง..." : "ออฟไลน์ - เก็บรูปไว้ก่อน");
  syncPending();
}

// -------------------- ปรับฝั่งแถบปุ่มตามทิศทางการหมุนเครื่องจริง --------------------
const stageEl = document.querySelector(".stage");
function updateControlsSide() {
  const type = (screen.orientation && screen.orientation.type) || "";
  // landscape-secondary = หมุนเครื่องไปอีกทางหนึ่ง (สลับข้างแถบปุ่มให้ตรงกัน)
  stageEl.classList.toggle("flip-controls", type === "landscape-secondary");
}
if (screen.orientation) {
  screen.orientation.addEventListener("change", updateControlsSide);
}
window.addEventListener("resize", updateControlsSide);
updateControlsSide();

async function main() {
  await startCamera();

  const items = await getAllPending();
  updateQueueUI(items.length);
  syncPending();

  shutterBtn.addEventListener("click", capture);
  window.addEventListener("online", syncPending);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncPending();
  });
  setInterval(syncPending, 60000);
}

main();

if ("serviceWorker" in navigator) {
  // ปัญหาที่พบ: แอพที่ "เพิ่มลงหน้าจอ" (standalone) มักถูก OS พักไว้เบื้องหลัง
  // (ไม่ได้ปิดจริง) หน้าเว็บเดิมจึงยังรัน app.js เวอร์ชันเก่าค้างอยู่ในหน่วยความจำ
  // แม้ Service Worker ตัวใหม่จะเข้าคุมหน้าแล้ว (skipWaiting + clients.claim)
  // ก็ไม่ได้แปลว่าหน้าเว็บที่เปิดค้างจะโหลดโค้ดใหม่เองอัตโนมัติ
  // วิธีแก้: ฟัง event "controllerchange" แล้วสั่ง reload หน้าเองทันทีที่มี SW ใหม่คุม
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return; // กัน reload วนซ้ำ (controllerchange อาจยิงได้มากกว่า 1 ครั้ง)
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("./sw.js")
    .then((reg) => {
      // ปกติเบราว์เซอร์จะไม่เช็ค sw.js ใหม่บ่อยกว่า 1 ครั้ง/24 ชม. เอง
      // สั่ง update() ตรงๆ ทุกครั้งที่เปิด/กลับมาที่แอพ เพื่อให้เช็คทันทีเสมอ
      reg.update();
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) reg.update();
      });
    })
    .catch(console.error);
}
