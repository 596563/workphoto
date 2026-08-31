const CACHE = "photo-upload-shell-v9";
// ดึงเลขเวอร์ชันจากชื่อ CACHE (เช่น "v7" -> "7") มาต่อท้าย URL ของไฟล์ที่แก้บ่อย
// เพื่อบังคับให้เป็น URL ใหม่ทุกครั้งที่ bump เวอร์ชัน - กัน Cloudflare (หรือ CDN ใดๆ)
// แคชไฟล์ .js ค้างเวอร์ชันเก่าไว้ที่ edge โดยไม่รู้ตัว (cache:"reload" ด้านล่าง
// บังคับข้ามแคชของเบราว์เซอร์ได้ แต่ข้ามแคชของ CDN ไม่ได้ ต้องเปลี่ยน URL เท่านั้นถึงชัวร์)
const CACHE_VERSION = CACHE.split("-v").pop();

const SHELL_FILES = [
  "./index.html",
  `./config.js?v=${CACHE_VERSION}`,
  `./app.js?v=${CACHE_VERSION}`,
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // ใช้ cache: "reload" บังคับดึงไฟล์สดจากเซิร์ฟเวอร์ทุกไฟล์ ไม่พึ่ง HTTP cache เดิมของเบราว์เซอร์
      // (กันกรณีเซิร์ฟเวอร์ไม่ได้ส่ง header ห้ามแคช แล้วเบราว์เซอร์ดันมีไฟล์เก่าค้างอยู่)
      Promise.all(
        SHELL_FILES.map((url) =>
          fetch(url, { cache: "reload" }).then((res) => cache.put(url, res))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// เฉพาะไฟล์ app shell เท่านั้น - ไม่แคชการเรียก Power Automate (fetch ไป flowUrl)
// ใช้ .endsWith() เทียบกับ pathname (ไม่รวม query string) จึงยังจับไฟล์ที่มี ?v=... ต่อท้ายได้ถูกต้อง
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isShellFile = SHELL_FILES.some((f) => {
    const cleanPath = f.replace("./", "/").split("?")[0];
    return url.pathname.endsWith(cleanPath);
  });
  if (isShellFile) {
    // ignoreSearch: true - เพราะ index.html เรียก config.js/app.js แบบไม่มี ?v=
    // แต่ของที่เก็บใน cache ใช้ key แบบมี ?v= ต่อท้าย (ดู SHELL_FILES) ต้อง ignore query
    // ตอนจับคู่ ไม่งั้นจะหาไม่เจอในแคชแล้ววิ่งไปเน็ตทุกครั้ง เสียประโยชน์เรื่องออฟไลน์
    event.respondWith(
      caches
        .match(event.request, { ignoreSearch: true })
        .then((cached) => cached || fetch(event.request))
    );
  }
});
