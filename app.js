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

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    videoEl.srcObject = stream;
  } catch (e) {
    setStatus("เปิดกล้องไม่ได้: " + e.message);
  }
}

function capture() {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (!w || !h) return;
  canvasEl.width = w;
  canvasEl.height = h;
  canvasEl.getContext("2d").drawImage(videoEl, 0, 0, w, h);

  // เอฟเฟกต์ชัตเตอร์
  flashEl.classList.add("flash-active");
  setTimeout(() => flashEl.classList.remove("flash-active"), 150);

  canvasEl.toBlob(
    async (blob) => {
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
    },
    "image/jpeg",
    0.85
  );
}

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
  navigator.serviceWorker.register("./sw.js").catch(console.error);
}
