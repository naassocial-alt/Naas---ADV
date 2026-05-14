import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import crypto from "crypto";
import { google } from "googleapis";

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

  app.use(express.json({
    limit: "50mb",
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));

  // Health check
  app.get("/api/health", (req, res) => {
    console.log("Health check hit");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Helpers for usage tracking
  const incrementUsage = async (field: "ocrCount" | "lineCount" | "requestCount") => {
    const firestore = initAdmin();
    if (!firestore) return;
    const appId = process.env.APP_ID || "advance-system-v3";
    const usageRef = firestore.doc(`artifacts/${appId}/public/data/system_configs/usage`);
    try {
      await usageRef.set({ [field]: admin.firestore.FieldValue.increment(1) }, { merge: true });
    } catch (err) {
      console.error(`Error incrementing ${field}:`, err);
    }
  };

  // Middleware to track every server request for Cloud Run metrics
  app.use((req, res, next) => {
    // Only track API calls (not static files)
    if (req.path.startsWith('/api')) {
      incrementUsage('requestCount');
    }
    next();
  });

  // Helpers for LINE Messaging API
  const sendLineMessage = async (messages: any[]) => {
    const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const toId = process.env.LINE_DESTINATION_ID;

    if (!channelToken || !toId) {
      console.warn("LINE Bot credentials missing (LINE_CHANNEL_ACCESS_TOKEN, LINE_DESTINATION_ID)");
      throw new Error("ระบบ LINE Bot ยังไม่ได้รับการตั้งค่าใน Environment Variables กรุณาตรวจสอบ LINE_CHANNEL_ACCESS_TOKEN และ LINE_DESTINATION_ID");
    }

    try {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${channelToken}`,
        },
        body: JSON.stringify({ to: toId, messages }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        
        let userMessage = errorText;
        let isQuotaError = false;
        try {
          const errObj = JSON.parse(errorText);
          if (errObj.message && (errObj.message.includes("monthly limit") || errObj.message.includes("quota"))) {
            userMessage = "ขณะนี้โควตาข้อความฟรีของ LINE Official Account (200 ข้อความ/เดือน) เต็มแล้ว กรุณาอัปเกรดแพ็กเกจที่ LINE Official Account Manager หรือรอจนถึงต้นเดือนหน้าเพื่อเริ่มโควตาใหม่";
            isQuotaError = true;
          }
        } catch (e) { /* not JSON */ }
        
        if (isQuotaError) {
          console.warn("LINE Messaging API Limit Reached:", errorText);
        } else {
          console.error("LINE Messaging API Error:", errorText);
        }
        
        throw new Error(userMessage);
      }

      // Track usage
      await incrementUsage("lineCount");
    } catch (err) {
      if ((err as Error).message.includes("โควตาข้อความฟรี")) {
        // Already logged as warn above or handled
      } else {
        console.error("LINE Messaging API Fetch Error:", err);
      }
      throw err;
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
      const errMsg = (err as Error).message;
      if (errMsg.includes("โควตาข้อความฟรี") || errMsg.includes("limit")) {
        console.warn("LINE Bot notification skipped (Quota/Config):", errMsg);
      } else {
        console.error("LINE Bot notify error:", err);
      }
      res.status(500).json({ error: errMsg });
    }
  });

  // LINE Webhook for Postback (Approve/Reject)
  const webhookHandler = async (req: express.Request, res: express.Response) => {
    console.log(`[LINE Webhook] ${req.method} ${req.originalUrl}`);
    
    // Always return 200 for GET requests (LINE verification)
    if (req.method === "GET") {
      return res.status(200).send("OK");
    }

    const signature = req.headers["x-line-signature"] as string;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    
    // Verify signature
    if (channelSecret && signature && (req as any).rawBody) {
      const hash = crypto.createHmac("SHA256", channelSecret).update((req as any).rawBody).digest("base64");
      if (hash !== signature) {
        console.warn("[LINE Webhook] Invalid Signature");
        return res.status(401).send("Unauthorized");
      }
    }

    const events = req.body?.events || [];
    if (events.length === 0) {
      // Could be a connection test from LINE
      return res.status(200).send("OK");
    }

    console.log(`[LINE Webhook] Processing ${events.length} events`);
    const firestore = initAdmin();

    const replyMessage = async (replyToken: string, messages: any[]) => {
      const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!channelToken) return;
      try {
        const response = await fetch("https://api.line.me/v2/bot/message/reply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${channelToken}`,
          },
          body: JSON.stringify({ 
            replyToken, 
            messages 
          }),
        });
        if (!response.ok) {
          const body = await response.text();
          if (body.includes("monthly limit") || body.includes("quota")) {
            console.warn(`[LINE Reply Limit Reached] Status: ${response.status}, Body: ${body}`);
          } else {
            console.error(`[LINE Reply Error] Status: ${response.status}, Body: ${body}`);
          }
        } else {
          await incrementUsage("lineCount");
        }
      } catch (err) {
        console.error("Error replying to LINE:", err);
      }
    };

    const createResultFlex = (title: string, color: string, data: any, statusLabel: string, deadline?: string, buttonConfig?: { label: string, url: string }) => {
      const bubble: any = {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#0F172A",
          contents: [
            {
              type: "text",
              text: "ADVANCE SYSTEM",
              color: "#94A3B8",
              size: "xxs",
              weight: "bold"
            },
            {
              type: "text",
              text: title,
              color: "#FFFFFF",
              weight: "bold",
              size: "sm"
            }
          ]
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                {
                  type: "text",
                  text: "สถานะ",
                  size: "xs",
                  color: "#64748B",
                  flex: 1
                },
                {
                  type: "text",
                  text: statusLabel,
                  size: "xs",
                  color: color,
                  weight: "bold",
                  flex: 3,
                  align: "end"
                }
              ]
            },
            {
              type: "separator",
              margin: "md"
            },
            {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: "ID", size: "xxs", color: "#94A3B8", flex: 1 },
                    { type: "text", text: data.advanceId || "-", size: "xxs", color: "#1E293B", flex: 3, align: "end", weight: "bold" }
                  ]
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: "พนักงาน", size: "xxs", color: "#94A3B8", flex: 1 },
                    { type: "text", text: data.employeeName || "-", size: "xxs", color: "#1E293B", flex: 3, align: "end" }
                  ]
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: "ยอดเงิน", size: "xxs", color: "#94A3B8", flex: 1 },
                    { type: "text", text: `฿${(data.totalAmount || 0).toLocaleString()}`, size: "xxs", color: "#1E293B", flex: 3, align: "end", weight: "bold" }
                  ]
                },
                deadline ? {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: "กำหนดเคลียร์", size: "xxs", color: "#94A3B8", flex: 1 },
                    { type: "text", text: new Date(deadline).toLocaleDateString("th-TH"), size: "xxs", color: "#EF4444", flex: 3, align: "end", weight: "bold" }
                  ]
                } : { type: "spacer", size: "xs" }
              ]
            }
          ]
        }
      };

      if (buttonConfig) {
        bubble.footer = {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              color: color,
              height: "sm",
              action: {
                type: "uri",
                label: buttonConfig.label,
                uri: buttonConfig.url
              }
            }
          ]
        };
      }

      return {
        type: "flex",
        altText: `Status Update: ${title}`,
        contents: bubble
      };
    };

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const text = event.message.text.trim();
        const replyToken = event.replyToken;
        const userId = event.source.userId;

        if (!firestore) continue;
        const appId = process.env.APP_ID || "advance-system-v3";
        const configsRef = firestore.doc(`artifacts/${appId}/public/data/system_configs/passwords`);
        const configsSnap = await configsRef.get();
        const configs = configsSnap.data() || {};
        const allowedLineIds = configs.allowedLineIds || [];
        const approvers = configs.approvers || [];
        const webAppUrl = (configs.webAppUrl || "").replace(/\/$/, "");

        // Helper to build request flex (matching frontend style)
        const getRequestFlex = (data: any) => {
          const deadlineDate = new Date(new Date(data.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
          const deadlineStr = `${deadlineDate.getDate()}/${deadlineDate.getMonth() + 1}/${deadlineDate.getFullYear() + 543}`;
          return {
            type: "flex",
            altText: `แจ้งเตือนขออนุมัติ: ${data.advanceId}`,
            contents: {
              type: "bubble",
              size: "mega",
              header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#343A40",
                paddingTop: "lg",
                paddingBottom: "lg",
                paddingStart: "xl",
                paddingEnd: "xl",
                contents: [
                  { type: "text", text: "แจ้งเตือนขออนุมัติ", color: "#A6D9E8", size: "xs", weight: "bold" },
                  { type: "text", text: "เบิกเงินทดรองจ่าย (Advance)", color: "#FFFFFF", size: "md", weight: "bold", margin: "sm" }
                ]
              },
              body: {
                type: "box",
                layout: "vertical",
                paddingAll: "xl",
                contents: [
                  {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                      { type: "text", text: "รหัสรายการ", size: "sm", color: "#888888", flex: 4 },
                      { type: "text", text: data.advanceId, size: "sm", color: "#111111", weight: "bold", flex: 6, align: "end" }
                    ]
                  },
                  {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                      { type: "text", text: "พนักงาน", size: "sm", color: "#888888", flex: 4 },
                      { type: "text", text: data.employeeName, size: "sm", color: "#111111", weight: "bold", flex: 6, align: "end" }
                    ],
                    margin: "md"
                  },
                  {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                      { type: "text", text: "ยอดขอเบิก", size: "sm", color: "#111111", weight: "bold", gravity: "center" },
                      { type: "text", text: `฿${(data.totalAmount || 0).toLocaleString()}`, size: "xl", color: "#267F8C", weight: "bold", align: "end" }
                    ],
                    margin: "lg"
                  },
                  {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                      { type: "text", text: "กำหนดเคลียร์:", size: "xs", color: "#888888" },
                      { type: "text", text: deadlineStr, size: "xs", color: "#888888", align: "end" }
                    ],
                    margin: "sm"
                  }
                ]
              },
              footer: {
                type: "box",
                layout: "horizontal",
                spacing: "md",
                paddingStart: "xl",
                paddingEnd: "xl",
                paddingBottom: "xl",
                contents: [
                  {
                    type: "button",
                    style: "primary",
                    color: "#267F8C",
                    height: "sm",
                    action: {
                      type: "uri",
                      label: "อนุมัติ",
                      uri: `${webAppUrl}?approve=${data.id}`
                    }
                  },
                  {
                    type: "button",
                    style: "primary",
                    color: "#E53935",
                    height: "sm",
                    action: {
                      type: "message",
                      label: "ไม่อนุมัติ",
                      text: `ไม่อนุมัติ ${data.advanceId}`
                    }
                  }
                ]
              }
            }
          };
        };

        // Handle basic keywords first (support partial match for group convenience)
        const lowerText = text.toLowerCase();
        if (lowerText === "id" || lowerText === "ไอดี") {
          if (replyToken && userId) {
            await replyMessage(replyToken, [
              { type: "text", text: `🆔 LINE User ID ของคุณคือ:` },
              { type: "text", text: userId }
            ]);
          }
          continue;
        }

        if (text.includes("รออนุมัติ")) {
          try {
            const snap = await firestore.collection(`artifacts/${appId}/public/data/withdrawals`).where("status", "==", "pending").limit(10).get();
            if (snap.empty) {
              if (replyToken) await replyMessage(replyToken, [{ type: "text", text: "✨ ไม่มีรายการค้างอนุมัติในขณะนี้" }]);
              continue;
            }
            if (replyToken) {
              const carousel = {
                type: "flex",
                altText: "รายการรออนุมัติ",
                contents: {
                  type: "carousel",
                  contents: snap.docs.map(d => getRequestFlex({ id: d.id, ...d.data() }).contents)
                }
              };
              await replyMessage(replyToken, [carousel]);
            }
          } catch (e) { console.error("รออนุมัติ error:", e); }
          continue;
        }

        if (text.includes("สถานะ")) {
          if (replyToken) {
            await replyMessage(replyToken, [{ type: "text", text: "🔎 กรุณาพิมพ์เลขที่เอกสาร (เช่น ADV-260505-001) เพื่อตรวจสอบสถานะครับ" }]);
          }
          continue;
        }

        // Match Advance ID (Public Status Lookup)
        if (/^ADV-\d{6}-\d{3}$/.test(text)) {
          try {
            const snap = await firestore.collection(`artifacts/${appId}/public/data/withdrawals`).where("advanceId", "==", text).get();
            if (snap.empty) {
              if (replyToken) await replyMessage(replyToken, [{ type: "text", text: `❌ ไม่พบรายการ: ${text}` }]);
              continue;
            }
            const data = snap.docs[0].data();
            if (replyToken) {
              const statusMap: any = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ/ไม่อนุมัติ" };
              const colorMap: any = { pending: "#F59E0B", approved: "#10B981", rejected: "#EF4444" };
              const flex = createResultFlex("ตรวจสอบข้อมูล", colorMap[data.status] || "#64748B", data, statusMap[data.status] || data.status, data.clearanceDeadline);
              await replyMessage(replyToken, [flex]);
            }
          } catch (e) { console.error("ID lookup error:", e); }
          continue;
        }

        // Protection logic: if IDs are defined, must be in the list for SENSITIVE ACTIONS
        if (text.startsWith("ไม่อนุมัติ ")) {
          if ((allowedLineIds.length > 0 || approvers.length > 0) && userId) {
            const isLegacyAuth = allowedLineIds.includes(userId);
            const isApproverAuth = approvers.some((a: any) => a.lineId === userId);
            if (!isLegacyAuth && !isApproverAuth) {
              if (replyToken) {
                await replyMessage(replyToken, [
                  { type: "text", text: "🔒 เฉพาะผู้อนุมัติเท่านั้นที่สามารถใช้คำสั่งนี้ได้" },
                  { type: "text", text: `ID: ${userId}` }
                ]);
              }
              continue;
            }
          }

          const advId = text.replace("ไม่อนุมัติ ", "").trim();
          // ... rest of logic
          
          try {
            const withdrawalsRef = firestore.collection(`artifacts/${appId}/public/data/withdrawals`);
            const query = await withdrawalsRef.where("advanceId", "==", advId).get();

            if (query.empty) {
              if (replyToken) await replyMessage(replyToken, [{ type: "text", text: `❌ ไม่พบรายการ: ${advId}` }]);
              continue;
            }

            const docRef = query.docs[0].ref;
            const data = query.docs[0].data();

            if (data.status !== "pending") {
              if (replyToken) await replyMessage(replyToken, [{ type: "text", text: `⚠️ รายการนี้ถูกดำเนินการไปแล้ว (${data.status})` }]);
              continue;
            }

            await docRef.update({ status: "rejected" });
            
            // Sync to sheets
            const sheetsUrl = configs.sheetsUrl;
            if (sheetsUrl) {
              await fetch(sheetsUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: data.advanceId,
                  employee: data.employeeName,
                  amount: data.totalAmount,
                  projects: (data.projectIds || []).join(", "),
                  approvedAt: new Date().toISOString(),
                  status: "Rejected",
                  clearanceDeadline: ""
                }),
              }).catch(e => console.error("Sheets sync error:", e));
            }

            if (replyToken) {
              const flex = createResultFlex("ผลการปฏิเสธ", "#EF4444", data, "ถูกปฏิเสธแล้ว (ผ่านข้อความ)");
              await replyMessage(replyToken, [flex]);
            }
          } catch (err) {
            console.error("Error in message handler:", err);
            if (replyToken) await replyMessage(replyToken, [{ type: "text", text: `❌ เกิดข้อผิดพลาด: ${(err as Error).message}` }]);
          }
        }
      }

      if (event.type === "postback") {
        try {
          const params = new URLSearchParams(event.postback.data);
          const action = params.get("action");
          const withdrawId = params.get("id");
          const appIdFromParams = params.get("appId");
          const replyToken = event.replyToken;
          const userId = event.source.userId;
          
          if (!firestore) continue;

          const appId = appIdFromParams || process.env.APP_ID || "advance-system-v3";
          const configsRef = firestore.doc(`artifacts/${appId}/public/data/system_configs/passwords`);
          const configsSnap = await configsRef.get();
          const configs = configsSnap.data() || {};
          const allowedLineIds = configs.allowedLineIds || [];
          const approvers = configs.approvers || [];

          if ((allowedLineIds.length > 0 || approvers.length > 0) && userId) {
            const isLegacyAuth = allowedLineIds.includes(userId);
            const isApproverAuth = approvers.some((a: any) => a.lineId === userId);
            
            if (!isLegacyAuth && !isApproverAuth) {
              if (replyToken) await replyMessage(replyToken, [{ type: "text", text: "🔒 คุณไม่มีสิทธิ์สั่งการผ่านเมนูนี้" }]);
              continue;
            }
          }

          if (action && withdrawId) {
            const docPath = `artifacts/${appId}/public/data/withdrawals/${withdrawId}`;
            const docRef = firestore.doc(docPath);
            const snap = await docRef.get();

            if (!snap.exists) {
              if (replyToken) await replyMessage(replyToken, [{ type: "text", text: `❌ ไม่พบรายการ: ${withdrawId}` }]);
              continue;
            }

            const data = snap.data();
            if (data?.status !== "pending") {
              if (replyToken) {
                const flex = createResultFlex("แจ้งเตือนสถานะ", "#F59E0B", data, `รายการนี้ถูกดำเนินการไปแล้ว (${data?.status})`);
                await replyMessage(replyToken, [flex]);
              }
              continue;
            }

            // Sync to Sheets logic
            const syncToSheets = async (status: string, deadline?: string) => {
              const systemConfigRef = firestore?.doc(`artifacts/${appId}/public/data/system_configs/passwords`);
              const configSnap = await systemConfigRef?.get();
              const sheetsUrl = configSnap?.data()?.sheetsUrl;

              if (sheetsUrl) {
                try {
                  await fetch(sheetsUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: data.advanceId,
                      employee: data.employeeName,
                      amount: data.totalAmount,
                      projects: (data.projectIds || []).join(", "),
                      approvedAt: new Date().toISOString(),
                      status: status,
                      clearanceDeadline: deadline || ""
                    }),
                  });
                } catch (sheetsErr) {
                  console.error("Sheets sync error in webhook:", sheetsErr);
                }
              }
            };

            if (action === "approve") {
              const deadline = new Date();
              deadline.setDate(deadline.getDate() + 30);
              const deadlineIso = deadline.toISOString();
              
              await docRef.update({ 
                status: "approved", 
                approvedAt: new Date().toISOString(),
                clearanceDeadline: deadlineIso
              });

              // Create Drive Folder upon approval via LINE
              try {
                const drive = initDrive();
                const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
                if (drive && parentFolderId) {
                  await getFolderId(drive, data.advanceId, parentFolderId);
                }
              } catch (e) {
                console.error("Drive folder creation failed in webhook:", e);
              }

              await syncToSheets("Approved", deadlineIso);

              if (replyToken) {
                const appUrl = (configs.webAppUrl || "").replace(/\/$/, "");
                const flex = createResultFlex(
                  "ผลการดำเนินการ", 
                  "#10B981", 
                  data, 
                  "ได้รับการอนุมัติแล้ว", 
                  deadlineIso,
                  { label: "แนบสลิปโอนเงิน", url: `${appUrl}?view=${withdrawId}&action=slip` }
                );
                await replyMessage(replyToken, [flex]);
              }
            } else if (action === "reject") {
              await docRef.update({ status: "rejected" });
              await syncToSheets("Rejected");
              if (replyToken) {
                const flex = createResultFlex("ผลการดำเนินการ", "#EF4444", data, "ถูกปฏิเสธแล้ว");
                await replyMessage(replyToken, [flex]);
              }
            }
          }
        } catch (err) {
          console.error("Webhook processing error:", err);
        }
      }
    }
    return res.status(200).send("OK");
  };

  // API to check for overdue/near-deadline advances
  app.post("/api/check-overdue", async (req, res) => {
    const firestore = initAdmin();
    if (!firestore) return res.status(500).json({ error: "Firebase not ready" });

    const appId = process.env.APP_ID || "advance-system-v3";
    try {
      const now = new Date();
      const sevenDaysLater = new Date();
      sevenDaysLater.setDate(now.getDate() + 7);

      const withdrawalsRef = firestore.collection(`artifacts/${appId}/public/data/withdrawals`);
      // We check for approved ones and filter the rest in memory to avoid composite index requirement
      const snap = await withdrawalsRef
        .where("status", "==", "approved")
        .get();

      const overdueItems = snap.docs.filter(doc => {
        const data = doc.data();
        if (data.clearanceStatus === "cleared") return false;
        if (!data.clearanceDeadline) return false;
        const deadline = new Date(data.clearanceDeadline);
        return deadline <= sevenDaysLater;
      });

      if (overdueItems.length === 0) {
        return res.json({ success: true, message: "No overdue items found" });
      }

      // Build a notification summary
      const messages = overdueItems.map(doc => {
        const data = doc.data();
        const deadline = new Date(data.clearanceDeadline);
        const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const statusText = diffDays < 0 ? `⚠️ เกินกำหนดแล้ว (${Math.abs(diffDays)} วัน)` : `⏳ เหลือเวลาอีก ${diffDays} วัน`;

        return `🔸 ${data.advanceId}: ${data.employeeName}\nยอด: ฿${(data.totalAmount || 0).toLocaleString()}\nกำหนด: ${deadline.toLocaleDateString("th-TH")}\n(${statusText})`;
      });

      await sendLineMessage([{
        type: "text",
        text: `📢 แจ้งเตือนรายการค้างเคลียร์ (ใกล้กำหนด)\n\n${messages.join("\n\n")}\n\nกรุณาดำเนินการเคลียร์เอกสารโดยด่วนครับ`
      }]);

      res.json({ success: true, count: overdueItems.length });
    } catch (err) {
      const errMsg = (err as Error).message;
      if (errMsg.includes("โควตาข้อความฟรี") || errMsg.includes("limit")) {
        console.warn("Overdue check notification skipped (Quota Limit)");
      } else {
        console.error("Overdue check error:", err);
      }
      res.status(500).json({ error: errMsg });
    }
  });

  // Explicitly handle both with and without trailing slash to avoid 302 redirects
  app.all("/api/line-webhook", webhookHandler);
  app.all("/api/line-webhook/", webhookHandler);

  // Google Drive Helper
  let driveClient: any = null;
  const initDrive = () => {
    if (driveClient) return driveClient;
    try {
      const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!sa) return null;
      const config = JSON.parse(sa);
      const auth = new google.auth.JWT({
        email: config.client_email,
        key: config.private_key,
        scopes: ["https://www.googleapis.com/auth/drive"],
      });
      driveClient = google.drive({ version: "v3", auth });
      return driveClient;
    } catch (err) {
      console.error("Drive Init Error:", err);
      return null;
    }
  };

  const getFolderId = async (drive: any, name: string, parentId: string) => {
    const res = await drive.files.list({
      q: `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });
    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }
    // Create if not exists
    const folderMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    };
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id',
    });
    return folder.data.id;
  };

  const uploadToDrive = async (drive: any, fileName: string, folderId: string, base64: string, mimeType = 'image/jpeg') => {
    const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };
    const media = {
      mimeType: mimeType,
      body: new (class extends require('stream').Readable {
        _read() {
          this.push(buffer);
          this.push(null);
        }
      })(),
    };
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });

    // Make file public if needed, or just return the view link
    await drive.permissions.create({
      fileId: file.data.id,
      resource: {
        role: 'reader',
        type: 'anyone',
      },
    });

    return file.data.webViewLink;
  };

  app.post("/api/drive-action", async (req, res) => {
    const { action, advanceId, receipts, slip } = req.body;
    const drive = initDrive();
    const parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

    if (!drive) return res.status(500).json({ error: "Google Drive Client fail to initialize. Please check FIREBASE_SERVICE_ACCOUNT." });
    if (!parentFolderId) return res.status(500).json({ error: "GOOGLE_DRIVE_PARENT_FOLDER_ID is missing in server environment." });

    try {
      const folderId = await getFolderId(drive, advanceId, parentFolderId);

      if (action === "init_folder") {
        return res.json({ success: true, folderId });
      }

      if (action === "upload_slip" && slip) {
        const fileName = `${advanceId}_สลิปยืนยันการโอน.jpg`;
        const url = await uploadToDrive(drive, fileName, folderId, slip);
        return res.json({ success: true, url });
      }

      if (action === "upload_receipts" && receipts) {
        // Find existing files to get next sequence number
        const existingFiles = await drive.files.list({
          q: `'${folderId}' in parents and name contains 'หลักฐานการเคลียร์ยอด' and trashed = false`,
          fields: 'files(name)',
        });
        const currentCount = existingFiles.data.files ? existingFiles.data.files.length : 0;
        let globalSeqOffset = 0;

        const results = await Promise.all(receipts.map(async (r: any) => {
          const seqMain = (currentCount + globalSeqOffset + 1).toString().padStart(3, '0');
          globalSeqOffset++;
          const mainUrl = r.base64 ? await uploadToDrive(drive, `${advanceId}_หลักฐานการเคลียร์ยอด-${seqMain}.jpg`, folderId, r.base64) : null;
          
          const additionalUrls = await Promise.all((r.additionalDocs || []).map(async (ad: any) => {
            const seqAd = (currentCount + globalSeqOffset + 1).toString().padStart(3, '0');
            globalSeqOffset++;
            return {
               url: ad.base64 ? await uploadToDrive(drive, `${advanceId}_หลักฐานการเคลียร์ยอด-${seqAd}.jpg`, folderId, ad.base64) : null,
               fileName: ad.fileName
            };
          }));

          return { mainUrl, additionalUrls };
        }));

        return res.json({ success: true, results });
      }

      res.status(400).json({ error: "Invalid action or missing parameters" });
    } catch (err) {
      console.error("Drive Action Error:", err);
      res.status(500).json({ error: (err as Error).message });
    }
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
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const buildPath = path.join(process.cwd(), "build");
    app.use(express.static(buildPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(buildPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
