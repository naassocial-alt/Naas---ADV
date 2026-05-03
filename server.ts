import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import cron from "node-cron";
import fs from "fs";

// Read Firebase config for backend use
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));

// Lazy initialize Firebase Admin
let db: Firestore | null = null;
const initAdmin = () => {
  if (!db) {
    try {
      let app: App;
      if (!getApps().length) {
        const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (sa) {
          const config = JSON.parse(sa);
          app = initializeApp({ 
            credential: cert(config),
            projectId: firebaseConfig.projectId
          });
        } else {
          // Fallback to default credentials but explicitly set projectId
          app = initializeApp({
            projectId: firebaseConfig.projectId
          });
        }
      } else {
        app = getApps()[0];
      }
      // Use specific database instance from config
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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

  const runWeeklyReport = async () => {
    console.log("Generating Weekly Report...");
    const firestore = initAdmin();
    if (!firestore) return;

    try {
      const appId = 'advance-system-v3';
      const now = new Date();
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const allSnapshot = await firestore
        .collection(`artifacts/${appId}/public/data/withdrawals`)
        .get();

      const allData = allSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      // Calculate stats for the past week
      const lastWeekRequests = allData.filter(w => new Date(w.createdAt) >= lastWeek);
      const lastWeekApproved = lastWeekRequests.filter(w => w.status === 'approved');
      const approvedAmount = lastWeekApproved.reduce((s, w) => s + (w.totalAmount || 0), 0);
      
      // System-wide totals
      const totalPendingBalance = allData
        .filter(w => w.status === 'approved' && w.clearanceStatus !== 'cleared')
        .reduce((s, w) => s + (w.balance || 0), 0);
      
      const totalEverWithdrawn = allData
        .filter(w => w.status === 'approved')
        .reduce((s, w) => s + (w.totalAmount || 0), 0);

      // Message 1: Summary Text
      const summaryText = `📊 รายงานสรุปภาพรวมรายสัปดาห์\n(ประจำวันที่ ${lastWeek.toLocaleDateString("th-TH")} - ${now.toLocaleDateString("th-TH")})\n\n` +
        `📝 รายการเบิกใหม่สัปดาห์นี้: ${lastWeekRequests.length} รายการ\n` +
        `💎 ยอดอนุมัติสัปดาห์นี้: ฿${approvedAmount.toLocaleString()}\n` +
        `💰 ยอดรวมที่เบิกไปทั้งหมด: ฿${totalEverWithdrawn.toLocaleString()}\n\n` +
        `⚠️ ยอดค้างเคลียร์ในระบบปัจจุบัน: ฿${totalPendingBalance.toLocaleString()}`;

      const messages: any[] = [{ type: "text", text: summaryText }];

      // Message 2: Flex Carousel (Grouped by Employee)
      const pending = allData.filter((w) => w.status === "approved" && w.clearanceStatus !== "cleared");
      if (pending.length > 0) {
        const grouped = pending.reduce((acc: any, w: any) => {
          if (!acc[w.employeeName]) acc[w.employeeName] = [];
          acc[w.employeeName].push(w);
          return acc;
        }, {});

        const bgColors = ["#1A4B5F", "#267F8C", "#3F7B9D", "#5FA8D3", "#0F172A"];
        const progressColors = ["#368A9F", "#4DB6AC", "#62B6CB", "#8ECAE6", "#334155"];

        const bubbles = Object.entries(grouped)
          .slice(0, 10)
          .map(([name, items]: [string, any[]], idx) => {
            const totalBalance = items.reduce((s, w) => s + (w.balance || 0), 0);
            const colorIdx = idx % bgColors.length;

            return {
              type: "bubble",
              size: "micro",
              header: {
                type: "box",
                layout: "vertical",
                backgroundColor: bgColors[colorIdx],
                paddingTop: "16px",
                paddingAll: "12px",
                paddingBottom: "16px",
                contents: [
                  { type: "text", text: name, color: "#FFFFFF", size: "xs", weight: "bold", wrap: true },
                  { type: "text", text: `รวม ฿${totalBalance.toLocaleString()}`, color: "#FFFFFF", size: "xs", margin: "xs" },
                ],
              },
              body: {
                type: "box",
                layout: "vertical",
                paddingAll: "12px",
                contents: items.slice(0, 3).map((w, i) => {
                  const created = new Date(w.createdAt).getTime();
                  const deadline = w.clearanceDeadline
                    ? new Date(w.clearanceDeadline).getTime()
                    : created + 30 * 24 * 60 * 60 * 1000;
                  const diffTime = deadline - new Date().getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  const isUrgent = diffDays <= 5;

                  const percent = Math.min(100, Math.max(0, ((w.totalAmount - (w.balance || 0)) / w.totalAmount) * 100));

                  return {
                    type: "box",
                    layout: "vertical",
                    margin: i > 0 ? "lg" : "none",
                    contents: [
                      { type: "text", text: w.advanceId, size: "xxs", color: "#111111", weight: "bold" },
                      {
                        type: "text",
                        text: `฿${(w.balance || 0).toLocaleString()} / ฿${w.totalAmount.toLocaleString()}`,
                        size: "xxs",
                        color: "#555555",
                        margin: "xs",
                      },
                      {
                        type: "box",
                        layout: "vertical",
                        height: "4px",
                        backgroundColor: "#EEEEEE",
                        margin: "sm",
                        contents: [
                          {
                            type: "box",
                            layout: "vertical",
                            width: `${percent}%`,
                            backgroundColor: isUrgent ? "#D40808" : progressColors[colorIdx],
                            height: "4px",
                          },
                        ],
                      },
                      {
                        type: "text",
                        text:
                          diffDays < 0
                            ? `เกินกำหนด ${Math.abs(diffDays)} วัน`
                            : isUrgent
                            ? `ด่วน! ${diffDays} วัน`
                            : `เหลือ ${diffDays} วัน`,
                        size: "xxs",
                        color: isUrgent ? "#D40808" : "#888888",
                        weight: isUrgent ? "bold" : "regular",
                        align: "end",
                        margin: "xs",
                      },
                    ],
                  };
                }),
              },
              footer: {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "button",
                    style: "secondary",
                    height: "sm",
                    color: colorIdx === 0 ? "#A6D9E8" : colorIdx === 1 ? "#C4EAE4" : "#D8F1FA",
                    action: {
                      type: "uri",
                      label: "เคลียร์ยอด",
                      uri: "https://ais-pre-2cqr2ogim7ho44kzyrqqga-125162703188.asia-east1.run.app/",
                    },
                  },
                ],
              },
            };
          });

        messages.push({
          type: "flex",
          altText: "Weekly Clearance Report",
          contents: { type: "carousel", contents: bubbles },
        });
      }

      await sendLineMessage(messages);
      return true;
    } catch (err) {
      console.error("Weekly Report Error:", err);
      return false;
    }
  };

  // Weekly Report Cron Job (Every Monday at 07:30 AM Thailand Time = 00:30 AM UTC)
  cron.schedule("30 0 * * 1", async () => {
    console.log("Running Weekly Report Cron Job...");
    await runWeeklyReport();
  });

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

  app.post("/api/trigger-weekly-report", async (req, res) => {
    const success = await runWeeklyReport();
    if (success) res.json({ success: true });
    else res.status(500).json({ error: "Failed to send report" });
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
