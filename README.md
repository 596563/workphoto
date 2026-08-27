# แอพถ่ายภาพงานซ่อม → อัพขึ้น SharePoint (ผ่าน Power Automate HTTP request)

PWA (ไม่ต้องลง Store/APK) เปิดกล้อง ถ่าย เก็บไว้ในเครื่องถ้าออฟไลน์ พอออนไลน์ค่อยส่งขึ้น SharePoint
โดยสร้างโฟลเดอร์ตามเดือน (เช่น `ก.ค.69`) และวัน (เช่น `01-07-2569`) ให้อัตโนมัติ

เวอร์ชันนี้ตัดขั้นตอน OneDrive ส่วนตัว + Azure AD app registration ออกทั้งหมด
แอพจะยิง `fetch` แบบ POST ไปที่ URL ของ Power Automate flow (trigger "manual" / When an HTTP request is received)
โดยตรง ไม่ต้อง login ไม่ต้องมี client ID ใดๆ

## สิ่งที่ต้องมีก่อนใช้งานได้จริง

### 1. โฮสต์ไฟล์บน HTTPS
กล้อง (`getUserMedia`) และ Service Worker ทำงานได้เฉพาะบน `https://` หรือ `localhost`
เปิดจาก `file://` ตรงๆ จะไม่ได้ - ใช้ GitHub Pages, IIS ภายในองค์กร, หรือเว็บเซิร์ฟเวอร์ที่มี SSL cert ก็ได้

### 2. Power Automate flow ฝั่งรับ (มีอยู่แล้วตามรูปที่ส่งมา)
Flow ต้องมี:
- **Trigger**: "When an HTTP request is received" (manual) รับ JSON schema ที่มี `fileName`, `monthFolder`, `dayFolder`, `fileContent` (ทั้งหมด type string)
- **สร้างไฟล์** ใน SharePoint โดย path ใช้ `concat('/Shared Documents/รูปทำงาน/', triggerBody()?['monthFolder'], '/', triggerBody()?['dayFolder'])`, ชื่อไฟล์ = `fileName`, เนื้อหาไฟล์ = `base64ToBinary(triggerBody()?['fileContent'])`
  - **หมายเหตุ**: การสร้างไฟล์ใน SharePoint connector จะสร้างโฟลเดอร์ปลายทางให้อัตโนมัติถ้ายังไม่มีอยู่แล้ว ไม่ต้องมี action แยกสร้างโฟลเดอร์
- **การตอบรับ** (Response): status code 200, body `{ "status": "ok" }`

คัดลอก **HTTP URL** จากหน้า trigger "manual" มาใส่ในไฟล์ `config.js` (ช่อง `flowUrl`)

### 3. แก้ไฟล์ config.js
```js
window.APP_CONFIG = {
  flowUrl: "https://.../workflows/.../triggers/manual/paths/invoke?api-version=1",
  uploadSecret: "ตั้งเป็นสตริงสุ่มยาวๆ เอง",
};
```
ใส่ URL เต็มจากช่อง "HTTP URL" ของ trigger (ค่าที่มีอยู่ในไฟล์ตอนนี้คือ URL ที่ให้มาในรูป ให้เช็คว่าตรงกับโฟลว์จริง)

> ⚠️ ถ้าโฮสต์แอพนี้ไว้บนที่ที่เป็น public (เช่น GitHub Pages ฟรี) ใครก็ตามที่เจอ URL เว็บจะเปิดดูซอร์สโค้ดเห็น `flowUrl` ได้ด้วย
> จึงต้องเพิ่มชั้นป้องกันด้วย **secret key** ที่เช็คฝั่งโฟลว์ (ดูหัวข้อถัดไป) แทนการพึ่ง URL อย่างเดียว

### 4. ตั้งค่า secret ฝั่งโฟลว์ (สำคัญถ้าโฮสต์แบบ public)
เพิ่มพารามิเตอร์ `secret` (type string) ใน JSON schema ของ trigger "manual" แล้วเพิ่ม action "Condition" ต่อจาก trigger
เทียบ `triggerBody()?['secret']` กับค่าเดียวกับที่ตั้งใน `config.js` (`uploadSecret`) — ถ้าตรงกันค่อยไปสร้างไฟล์ SharePoint + ตอบ 200
ถ้าไม่ตรง (หรือไม่ส่งมา) ให้ตอบ 401 แล้วจบทันที ไม่สร้างไฟล์ใดๆ

วิธีนี้ทำให้ต่อให้ `flowUrl` หลุดไปกับซอร์สโค้ด public คนที่ไม่รู้ `uploadSecret` ก็ยิงเข้ามาอัพโหลดอะไรไม่ได้

## วิธีใช้งาน (ผู้ใช้ปลายทาง)
1. เปิดลิงก์ในเบราว์เซอร์ (Chrome/Safari)
2. เพิ่มลงหน้าจอโฮม ("Add to Home Screen") จะได้ไอคอนเหมือนแอพปกติ
3. เปิดแล้วถ่ายรูปได้เลย ไม่ต้อง login - ถ้าออฟไลน์รูปจะถูกเก็บไว้ในเครื่อง (แสดง "รอส่ง N รูป") พอมีเน็ตจะส่งให้อัตโนมัติ

## ข้อจำกัดที่ควรรู้
- **iOS Safari**: ไม่รองรับ Background Sync API เต็มรูปแบบ ระบบจึงเช็ค/ส่งคิวตอนเปิดแอพ, กลับมาที่หน้าแอพ,
  หรือทุก 60 วินาทีที่แอพเปิดอยู่หน้าจอ (ไม่ส่งตอนแอพถูกปิดสนิทอยู่เบื้องหลัง) - แนะนำให้ผู้ใช้เปิดแอพค้างไว้ระหว่างวันแล้วค่อยเข้าเน็ตจังหวะพัก
- ไฟล์รูปที่ยังไม่ส่งเก็บอยู่ใน IndexedDB ของเบราว์เซอร์ ถ้าผู้ใช้ล้างข้อมูลเบราว์เซอร์/แอพจะหายไปด้วย
- รูปจะถูกแปลงเป็น base64 ก่อนส่ง (ขนาดข้อมูลจะโตขึ้นราว 33%) - ที่คุณภาพ JPEG 0.85 ที่ใช้อยู่ในแอพ ปกติแล้วยังเล็กพอสำหรับ
  request body ของ Power Automate HTTP trigger สบายๆ แต่ถ้าเจอไฟล์ใหญ่ผิดปกติ (เช่น กล้องความละเอียดสูงมาก) แล้ว flow ตอบ error
  เรื่องขนาด ให้ลดค่าคุณภาพในฟังก์ชัน `capture()` ของ `app.js` (พารามิเตอร์ `0.85`) ลง
- ทดสอบครั้งแรกแนะนำให้ลองที่คอมก่อน (เปิด DevTools ดู error ง่ายกว่า) แล้วค่อยย้ายไปเทสบนมือถือจริง

## ทำไมยังโฮสต์เป็นเว็บ (ไม่ทำเป็น APK)
เครือข่ายภายในองค์กร (ที่คุณลองวางไฟล์ไว้ก่อนหน้านี้) มือถือมักเข้าไม่ถึงเพราะแยก network segment กับเซิร์ฟเวอร์ - ปัญหานี้
**ไม่เกี่ยวกับว่าโฮสต์แบบเว็บ (PWA) หรือทำเป็น APK** เพราะตอนอัพโหลดจริง แอพต้องยิงออกไปหา `powerplatform.com`
(คลาวด์ Microsoft) อยู่แล้วไม่ว่าจะเป็น PWA หรือ APK ก็ตาม - ถ้ามือถือยิงจุดนั้นได้ ก็ยิง GitHub Pages (ปลายทางอินเทอร์เน็ต
ทั่วไปเหมือนกัน) ได้เช่นกัน จึงเลือกใช้ GitHub Pages (ฟรี ทำเองได้ไม่ต้องรอ IT) + secret key กันรั่ว แทนการทำ APK
ซึ่งต้องมี Android Studio และ build/เซ็นแอพเอง และใช้ได้แค่ Android เท่านั้น

## สิ่งที่เปลี่ยนจากเวอร์ชันก่อนหน้า
- ตัด MSAL / Azure AD app registration / OneDrive ส่วนตัวออกทั้งหมด (ไม่ต้องลงทะเบียนแอพ ไม่ต้อง login)
- ตัดปุ่ม "เข้าสู่ระบบ" ออกจากหน้าจอ
- การอัพโหลดเปลี่ยนจากเรียก Microsoft Graph API (PUT ไป OneDrive) เป็น `fetch` POST ไปที่ `flowUrl` ตรงๆ พร้อม JSON
  `{ fileName, monthFolder, dayFolder, fileContent }` โดย `fileContent` เป็น base64 ล้วน (ไม่มี prefix `data:image/jpeg;base64,`)
- แก้ path ไอคอนให้ตรงกับที่ `manifest.json`/`sw.js` อ้างถึง (`icons/icon-192.png`, `icons/icon-512.png`) ซึ่งก่อนหน้านี้ไฟล์ไอคอน
  อยู่ผิดตำแหน่ง ทำให้ Service Worker cache ไม่ครบ - ได้ย้ายเข้าโฟลเดอร์ `icons/` ให้แล้ว
- เพิ่ม `uploadSecret` ใน `config.js` และส่งเป็น `secret` ไปพร้อม request ทุกครั้ง เพื่อรองรับการเช็คฝั่งโฟลว์ (กันกรณีโฮสต์แบบ public)
