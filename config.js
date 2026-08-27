// ==========================================================================
// ตั้งค่า URL ของ Power Automate flow (ตัว trigger "manual" / HTTP request)
// คัดลอกจากช่อง "HTTP URL" ในหน้า trigger ของโฟลว์ (ไม่ต้องมี Azure AD app registration แล้ว)
// ==========================================================================
window.APP_CONFIG = {
  flowUrl: "https://default5febc69f8e9c4708b70ed8c62be180.5b.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/20/workflows/ec6d1c130faf402c96c3aa2c1b83d1cc/triggers/manual/paths/invoke?api-version=1",

  // รหัสลับที่ต้องตรงกับค่าที่เช็คไว้ฝั่ง Power Automate (ดู README หัวข้อ "ตั้งค่า secret ฝั่งโฟลว์")
  // ตั้งเป็นสตริงยาวๆ สุ่มๆ เอง (เช่น พิมพ์มั่วๆ ยาว 20-30 ตัวอักษร) แล้วเอาค่าเดียวกันไปตั้งในโฟลว์
  // จุดประสงค์: ถ้า URL ของ flow หลุดออกไปเพราะโฮสต์เป็น public repo (เช่น GitHub Pages)
  // คนที่ไม่มี secret นี้จะยิงเข้ามาไม่ได้ ต่อให้มี URL ก็ตาม
  uploadSecret: "31ad51a3d81a3dawd1adadaadad468a4fjfjf1584sf",
};
