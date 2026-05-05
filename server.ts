import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import admin from "firebase-admin";

// Lazy initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;
const initAdmin = () => {
  if (!db) {
    try {
      if (!admin.apps.length) {
        const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (sa) {
          const config = JSON.parse(sa);
          admin.initializeApp({ credential: admin.credential.cert(config) });
        } else {
          admin.initializeApp();
        }
      }
      db = admin.firestore();
    } catch (err) {
      console.error("Firebase Admin Init Error:", err);
    }
  }
  return db;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helpers for LINE Messaging API
  const sendLineMessage = async (messages: any[]) => {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const to = process.env.LINE_DESTINATION_ID;
    if (!token || !to) {
      console.warn("LINE Bot credentials missing");
      return;
    }
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to, messages }),
      });
      if (!res.ok) console.error("LINE API Error:", await res.text());
    } catch (err) {
      console.error("LINE Messaging API Fetch Error:", err);
    }
  };

  // Unified LINE Bot Endpoint
  app.post("/api/line-bot", async (req, res) => {
    const { message, type, flexData } = req.body;
    
    try {
      if (type === "flex") {
        await sendLineMessage([flexData]);
      } else {
        await sendLineMessage([{ type: "text", text: message }]);
      }
      res.json({ success: true });
    } catch (err) {
      console.error("LINE Bot notify error:", err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // LINE Webhook for Postback (Approve/Reject)
  app.post("/api/line-webhook", async (req, res) => {
    const events = req.body.events || [];
    const firestore = initAdmin();

    for (const event of events) {
      if (event.type === "postback") {
        try {
          const params = new URLSearchParams(event.postback.data);
          const action = params.get("action");
          const withdrawId = params.get("id");
          const appId = params.get("appId");
          
          if (!firestore) {
            await sendLineMessage([{ type: "text", text: "❌ ระบบเบื้องหลัง (Firebase Admin) ยังไม่ได้รับการตั้งค่า ไม่สามารถดำเนินการได้" }]);
            continue;
          }

          if (action && withdrawId && appId) {
            const docPath = `artifacts/${appId}/public/data/withdrawals/${withdrawId}`;
            const docRef = firestore.doc(docPath);
            const snap = await docRef.get();

            if (!snap.exists) {
              await sendLineMessage([{ type: "text", text: `❌ ไม่พบรายการ: ${withdrawId}` }]);
              continue;
            }

            const data = snap.data();
            if (data?.status !== "pending") {
              await sendLineMessage([{ type: "text", text: `⚠️ รายการนี้ถูกดำเนินการไปแล้ว (${data?.status})` }]);
              continue;
            }

            if (action === "approve") {
              const deadline = new Date();
              deadline.setDate(deadline.getDate() + 30);
              await docRef.update({ 
                status: "approved", 
                approvedAt: new Date().toISOString(),
                clearanceDeadline: deadline.toISOString()
              });
              await sendLineMessage([{ 
                type: "text", 
                text: `✅ อนุมัติสำเร็จ!\nรายการ: ${withdrawId}\nพนักงาน: ${data.employeeName}\nยอด: ฿${data.totalAmount?.toLocaleString()}\nกำหนดเคลียร์: ${deadline.toLocaleDateString('th-TH')}` 
              }]);
            } else if (action === "reject") {
              await docRef.update({ status: "rejected" });
              await sendLineMessage([{ 
                type: "text", 
                text: `❌ ปฏิเสธรายการแล้ว!\nรายการ: ${withdrawId}` 
              }]);
            }
          }
        } catch (err) {
          console.error("Webhook processing error:", err);
          await sendLineMessage([{ type: "text", text: "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง" }]);
        }
      }
    }
    res.sendStatus(200);
  });

  // Google Sheets Proxy
  app.post("/api/sheets-sync", async (req, res) => {
    const { url, data } = req.body;
    if (!url) return res.status(400).json({ error: "No Sheet URL provided" });

    try {
      const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify(data),
      });
      const result = await response.text();
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
