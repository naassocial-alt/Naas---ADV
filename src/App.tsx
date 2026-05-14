import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { 
  Plus, Wallet, History as HistoryIcon, BarChart3, Lock, 
  CheckCircle2, XCircle, Search, Loader2, AlertTriangle, Trash2, Edit,
  Image as ImageIcon, ScanLine, User, PieChart, Settings, UserPlus, Zap,
  X, FileText, Calendar, AlertCircle, Activity, MessageSquare, Server as ServerIcon,
  Tags, ChevronDown, Paperclip
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc, getDocFromServer
} from 'firebase/firestore';
import { 
  signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';
import { Withdrawal, Receipt, SystemConfigs, BankAccount } from './types';
import { WeeklyReportUI } from './components/WeeklyReportUI';
// --- 2. Configuration ---
const appId = 'advance-system-v3'; 

// --- 3. Constants & Helpers ---
const INITIAL_EMPLOYEES = ["สมชาย มั่นคง", "วิภา มีสุข", "ธนากร งานดี", "กาญจนา เรืองโพน", "ปิยะพงษ์ ผิวอ่อน"];
const INITIAL_PROJECTS = [
  "คุณแฮม ลัดดาวรรณ (K.HAM LADDAWAN)",
  "คุณเตชิน (K TACHIN)",
  "คุณตะกร้อ กาญจนบุรี (K TAKOR KANCHANABURI)",
  "คุณตุ๊ก เขาค้อ (K.TOOK KHAO KOH)",
  "พลัส เพชรเกษม หาดใหญ่ (PLUS PHETKASEM HADYAI)",
  "สวนหลวง เรสซิเดนซ์ (SUANLUNG RESIDENCE)",
  "คุณยุ้ย เรสซิเดนซ์ (K.YUI RESIDENCE)",
  "มอน เอคโค่ 1 ลาดกระบัง (MON ECHO1 LADKRABANG)",
  "คุณนิมิต งานถมดิน",
  "คุณเอ็ดดี้ ปรับปรุงอาคารสำนักงาน",
  "จีเอ็มที เฮาส์ (GMT HOUSE)",
  "โปรเฮาส์ คุณมะเหมี่ยว เฉลิมพระเกียรติ 30",
  "อาณา เอกมัย (ARNA EKKAMAI)",
  "รายา บางเทา ภูเก็ต แปลง 12A",
  "กรีน เอเชีย เชียงใหม่ (GREEN ASIA CHIANG MAI)",
  "รายา บางโจ ภูเก็ต แปลง 18",
  "พลัส หาดใหญ่ (PLUS HADYAI)",
  "งานออกแบบ พลัส ยูดี มิดทาวน์ (PLUS UD MIDTOWN)",
  "คุณเก่ง พระราม 9 เรสซิเดนซ์",
  "คุณปิ เชียงใหม่",
  "ชะอำ วิลล่า (สำรวจโครงสร้างอาคารเดิมและการรับน้ำหนัก)",
  "ชะอำ วิลล่า (สำรวจพื้นที่โครงการ)",
  "โรงเรียนนายร้อยตำรวจ อ.สามพราน จ.นครปฐม",
  "ทีโอเอ ทีทีเอฟ สถาปนิก เอ็กซ์โป (TOA TTF ARCHITECT EXPO)",
  "รายา บางเทา ภูเก็ต แปลง 11",
  "โรงแรมสุนัข (DOG HOTEL)",
  "เอ็มดีเอช เรสซิเดนซ์ (MDH RESIDENCE)",
  "คุณเอ็กซ์ บ้านโป่ง",
  "ริชเชอร์ เจ โฮเทล (ล็อบบี้)",
  "พีที เฮาส์ (งานตกแต่งภายใน)",
  "คุณบีม เรสซิเดนซ์",
  "หอประชุมสารสาสน์ (AUDITORIUM SARASAS)",
  "สำนักงาน ยูนิกซ์เดฟ (UNIXDEV OFFICE)",
  "สมาร์ท คอนโด โรจนะ อยุธยา (SMYNE CONDO ROJJANA AYUTTHAYA)",
  "เอเชีย ธนามล กรุ๊ป",
  "สารสาสน์ (ล็อบบี้)",
  "บ้านอิสสระ พระราม 9",
  "177 ศุภาลัย สุวรรณภูมิ",
  "ทีทีที เฮาส์ (TTT HOUSE)",
  "คุณโบว์ ลัดดาลักษณ์ ราชพฤกษ์",
  "นิด้า ชั้น 1 อินโนเวชั่น (NIDA FL.1 INNOVATION)",
  "คุณเนย ปัญญา เรสซิเดนซ์",
  "คุณแม็กซ์ เรสซิเดนซ์",
  "โรสเตอร์ รูม ชั้น 5 เซ็นทรัล เอ็มบาสซี",
  "คุณทิพย์ สาทร",
  "โรงงานรีไซเคิล คุณวิจิตร"
];
const INITIAL_CATEGORIES = ["ค่าเดินทาง/น้ำมัน", "ค่าอาหาร/รับรอง", "ค่าที่พัก", "ค่าวัสดุอุปกรณ์", "ค่าแรง/ค่าบริการ", "อื่นๆ"];

const notifyLine = async (message: string, type: 'text' | 'flex' = 'text', flexData?: any) => {
  try {
    const res = await fetch("/api/line-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, type, flexData }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error || `Server returned ${res.status}`;
      
      // If it's a limit error, log as warn instead of error to reduce noise
      if (errMsg.includes("monthly limit") || errMsg.includes("โควตาข้อความฟรี") || errMsg.includes("200 ข้อความ") || errMsg.includes("limit")) {
        console.warn("LINE notification skipped (Quota Limit):", errMsg);
      } else {
        console.error("LINE Bot notify failed:", errMsg);
      }
    }
  } catch (err) {
    console.error("LINE Bot notify failed (Network):", err);
  }
};

const callDrive = async (data: any) => {
  try {
    const res = await fetch('/api/drive-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("Drive error:", e);
    return null;
  }
};

const buildRequestFlex = (data: Withdrawal, appBaseUrl: string) => {
  const deadlineDate = new Date(new Date(data.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  const deadlineStr = `${deadlineDate.getDate()}/${deadlineDate.getMonth() + 1}/${deadlineDate.getFullYear() + 543}`;

  // Normalize URL: remove trailing slash
  const appUrl = appBaseUrl.replace(/\/$/, '');

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
          {
            type: "text",
            text: "แจ้งเตือนขออนุมัติ",
            color: "#A6D9E8",
            size: "xs",
            weight: "bold"
          },
          {
            type: "text",
            text: "เบิกเงินทดรองจ่าย (Advance)",
            color: "#FFFFFF",
            size: "md",
            weight: "bold",
            margin: "sm"
          }
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
              {
                type: "text",
                text: "รหัสรายการ",
                size: "sm",
                color: "#888888",
                flex: 4
              },
              {
                type: "text",
                text: data.advanceId,
                size: "sm",
                color: "#111111",
                weight: "bold",
                flex: 6,
                align: "end"
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "พนักงาน",
                size: "sm",
                color: "#888888",
                flex: 4
              },
              {
                type: "text",
                text: data.employeeName,
                size: "sm",
                color: "#111111",
                weight: "bold",
                flex: 6,
                align: "end"
              }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "โปรเจค",
                size: "sm",
                color: "#888888",
                flex: 4
              },
              {
                type: "text",
                text: (data.projectIds || []).join(", ") || "-",
                size: "sm",
                color: "#111111",
                flex: 6,
                align: "end"
              }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "หมวดหมู่ค่าใช้จ่าย",
                size: "sm",
                color: "#888888",
                flex: 5
              },
              {
                type: "text",
                text: data.items.map(i => i.category || "-").filter((v,i,a) => a.indexOf(v)===i).join(", ") || "-",
                size: "sm",
                color: "#111111",
                flex: 5,
                align: "end"
              }
            ],
            margin: "md"
          },
          {
            type: "separator",
            margin: "lg",
            color: "#EEEEEE"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "ยอดขอเบิก",
                size: "sm",
                color: "#111111",
                weight: "bold",
                gravity: "center"
              },
              {
                type: "text",
                text: `฿${(data.totalAmount || 0).toLocaleString()}`,
                size: "xl",
                color: "#267F8C",
                weight: "bold",
                align: "end"
              }
            ],
            margin: "lg"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "กำหนดเคลียร์ภายในวันที่:",
                size: "xs",
                color: "#888888"
              },
              {
                type: "text",
                text: deadlineStr,
                size: "xs",
                color: "#888888",
                align: "end"
              }
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
              uri: `${appUrl}?approve=${data.id}`
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

const buildStatusFlex = (title: string, message: string, color: string = "#0F172A", icon?: string, buttonConfig?: { label: string, url: string }) => {
  const contents: any = {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: icon || "🔔", size: "lg", flex: 0 },
            {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: title, weight: "bold", size: "sm", color: color },
                { type: "text", text: message, size: "xs", color: "#64748B", wrap: true, margin: "xs" }
              ],
              margin: "md"
            }
          ]
        }
      ],
      paddingAll: "lg"
    }
  };

  if (buttonConfig) {
    contents.footer = {
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
    altText: title,
    contents
  };
};

const buildWeeklySummaryFlex = (withdrawals: Withdrawal[]) => {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Last week's activities
  const lastWeekItems = withdrawals.filter(w => new Date(w.createdAt) >= oneWeekAgo);
  const count = lastWeekItems.length;
  const totalAmount = lastWeekItems.reduce((sum, w) => sum + w.totalAmount, 0);
  
  // Clearances in last week (sum of receipts)
  let clearedLastWeek = 0;
  withdrawals.forEach(w => {
    (w.receipts || []).forEach(r => {
      clearedLastWeek += (Number(r.amount) || 0);
    });
  });

  // Overall pending
  const overallPending = withdrawals.reduce((sum, w) => sum + (w.status === 'approved' ? (w.balance || 0) : 0), 0);

  return {
    type: "flex",
    altText: "สรุปรายงานประจำสัปดาห์",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0F172A",
        contents: [
          { type: "text", text: "ADVANCE SYSTEM", color: "#94A3B8", size: "xxs", weight: "bold" },
          { type: "text", text: "สรุปรายงานรวมประจำสัปดาห์", color: "#FFFFFF", weight: "bold", size: "sm", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "รายการใหม่ (7 วัน)", size: "xs", color: "#64748B", flex: 3 },
              { type: "text", text: `${count} รายการ`, size: "xs", color: "#0F172A", flex: 7, weight: "bold", align: "end" }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ยอดรวมที่ให้เบิก", size: "xs", color: "#64748B", flex: 3 },
              { type: "text", text: `฿${totalAmount.toLocaleString()}`, size: "xs", color: "#0F172A", flex: 7, weight: "bold", align: "end" }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ยอดที่มีพนักงานเคลียร์เข้ามา", size: "xs", color: "#64748B", flex: 3, wrap: true },
              { type: "text", text: `฿${clearedLastWeek.toLocaleString()}`, size: "xs", color: "#10B981", flex: 7, weight: "bold", align: "end" }
            ]
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ยอดคงค้าง", size: "sm", color: "#0F172A", flex: 3, weight: "bold" },
              { type: "text", text: `฿${overallPending.toLocaleString()}`, size: "sm", color: "#EF4444", flex: 7, weight: "bold", align: "end" }
            ]
          }
        ]
      }
    }
  };
};

const buildWeeklyCarouselFlex = (withdrawals: Withdrawal[], appBaseUrl: string) => {
  const appUrl = appBaseUrl.replace(/\/$/, '');
  const pendingByEmployee = withdrawals
    .filter(w => w.status === 'approved' && w.clearanceStatus !== 'cleared')
    .reduce((acc, w) => {
      if (!acc[w.employeeName]) {
        acc[w.employeeName] = {
          employeeName: w.employeeName,
          totalBalance: 0,
          items: []
        };
      }
      acc[w.employeeName].totalBalance += w.balance;
      acc[w.employeeName].items.push(w);
      return acc;
    }, {} as Record<string, { employeeName: string; totalBalance: number; items: Withdrawal[] }>);

  const employees = Object.values(pendingByEmployee);
  const COLORS = ['#1A4B5F', '#267F8C', '#3F7B9D', '#5FA8D3'];
  const BTN_COLORS = ['#A6D9E8', '#C4EAE4', '#BDE4F4', '#D8F1FA'];

  const bubbles = employees.slice(0, 10).map((emp, idx) => {
    const bgColor = COLORS[idx % COLORS.length];
    const btnColor = BTN_COLORS[idx % BTN_COLORS.length];
    
    const itemContents = emp.items.slice(0, 5).map((item, iIndex) => {
      const deadline = item.clearanceDeadline ? new Date(item.clearanceDeadline) : new Date(new Date(item.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
      const diffDays = Math.ceil((deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      const progress = Math.min((item.actualSpend / item.totalAmount) * 100, 100);
      const isUrgent = diffDays <= 7;

      return {
        type: "box",
        layout: "vertical",
        margin: iIndex === 0 ? "none" : "lg",
        contents: [
          {
            type: "text",
            text: item.advanceId,
            size: "xxs",
            color: "#111111",
            weight: "bold"
          },
          {
            type: "text",
            text: `฿${item.actualSpend.toLocaleString()} / ฿${item.totalAmount.toLocaleString()}`,
            size: "xxs",
            color: "#555555",
            margin: "xs"
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "box",
                layout: "vertical",
                contents: [{ type: "filler" }],
                width: `${Math.max(progress, 1)}%`,
                backgroundColor: isUrgent ? "#D40808" : "#368A9F",
                height: "4px"
              }
            ],
            backgroundColor: "#EEEEEE",
            height: "4px",
            margin: "sm"
          },
          {
            type: "text",
            text: diffDays < 0 ? `เกินกำหนด ${Math.abs(diffDays)} วัน` : isUrgent ? `ด่วน! ${diffDays} วัน` : `เหลือ ${diffDays} วัน`,
            size: "xxs",
            color: isUrgent ? "#D40808" : "#888888",
            align: "end",
            margin: "xs"
          }
        ]
      };
    });

    return {
      type: "bubble",
      size: "micro",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: bgColor,
        paddingTop: "16px",
        paddingAll: "12px",
        paddingBottom: "16px",
        contents: [
          {
            type: "text",
            text: emp.employeeName,
            color: "#FFFFFF",
            size: "xs",
            weight: "bold",
            wrap: true
          },
          {
            type: "text",
            text: `รวม ฿${emp.totalBalance.toLocaleString()}`,
            color: "#FFFFFF",
            size: "xs",
            margin: "xs"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: itemContents
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            margin: "xs",
            style: "secondary",
            height: "sm",
            color: btnColor,
            adjustMode: "shrink-to-fit",
            offsetTop: "none",
            action: {
              type: "uri",
              label: "เคลียร์ยอด",
              uri: appUrl
            }
          }
        ]
      }
    };
  });

  return {
    type: "flex",
    altText: "รายละเอียดรายการเบิกคงค้าง",
    contents: {
      type: "carousel",
      contents: bubbles
    }
  };
};

const syncToSheets = async (url: string, data: any) => {
  if (!url) return null;
  try {
    const response = await fetch("/api/sheets-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, data }),
    });
    const result = await response.json();
    return result;
  } catch (err) {
    console.error("Sheets Sync failed:", err);
    return null;
  }
};

const compressImg = (file: File, maxWidth = 800): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        // Reduce quality to 0.5 for receipts to save space (enough to read)
        resolve(canvas.toDataURL('image/jpeg', 0.5));
      };
    };
  });
};

const optimizeReceipts = (receipts: Receipt[]): Receipt[] => {
  // 1. Clear base64 if driveUrl exists (already safely stored in Drive)
  let updated = receipts.map(r => {
    let nr = (r.driveUrl && r.base64) ? { ...r, base64: '' } : { ...r };
    if (nr.additionalDocs) {
      nr.additionalDocs = nr.additionalDocs.map(d => (d.driveUrl && d.base64) ? { ...d, base64: '' } : d);
    }
    return nr;
  });
  
  // 2. If the document size is approaching 1MB limit (1,048,576 bytes)
  const approxSize = JSON.stringify(updated).length;
  if (approxSize > 900000) { 
    let currentEst = approxSize;
    updated = updated.map(r => {
      // Clear main receipt base64 first
      if (currentEst > 800000 && r.base64) {
        currentEst -= r.base64.length;
        r.base64 = '';
      }
      // Then clear additional docs if still too big
      if (currentEst > 800000 && r.additionalDocs) {
        r.additionalDocs = r.additionalDocs.map(d => {
           if (currentEst > 800000 && d.base64) {
             currentEst -= d.base64.length;
             return { ...d, base64: '' };
           }
           return d;
        });
      }
      return r;
    });
  }
  return updated;
};

const detectDuplicates = (items: Receipt[], allWithdrawals: Withdrawal[] = []) => {
  const globalRegistry: { [key: string]: { project: string; advanceId: string } } = {};
  allWithdrawals.forEach(w => {
    (w.receipts || []).forEach(r => {
      const key = `${r.name || ''}-${r.amount || 0}`.toLowerCase().trim();
      if (key !== "-0") {
        globalRegistry[key] = { project: r.projectId || 'N/A', advanceId: w.advanceId };
      }
    });
  });

  const seenInBatch: { [key: string]: number } = {};
  items.forEach(item => {
    const key = `${item.name || ''}-${item.amount || 0}`.toLowerCase().trim();
    if (key === "-0") return;
    seenInBatch[key] = (seenInBatch[key] || 0) + 1;
  });

  return items.map(item => {
    const key = `${item.name || ''}-${item.amount || 0}`.toLowerCase().trim();
    if (key === "-0") return { ...item, isDuplicate: false, duplicateInfo: undefined };
    
    const globalSource = globalRegistry[key];
    const isBatchDuplicate = seenInBatch[key] > 1;
    
    if (globalSource) {
      return { ...item, isDuplicate: true, duplicateInfo: globalSource };
    }
    
    if (isBatchDuplicate) {
      return { ...item, isDuplicate: true, duplicateInfo: { project: 'Same Batch', advanceId: 'Current Box' } };
    }

    return { ...item, isDuplicate: false, duplicateInfo: undefined };
  });
};

const StatusBadge = ({ item }: { item: Withdrawal }) => {
  let s = (item.status || 'pending').toLowerCase();
  let label = s;
  
  if (s === 'approved' && !item.transferSlip) {
    label = 'waiting';
  } else if (s === 'approved' && item.transferSlip) {
    label = 'Approved';
  }
  
  const styles: { [key: string]: string } = {
    pending: "bg-amber-50 text-amber-600 border-amber-100",
    approved: "bg-emerald-50 text-emerald-600 border-emerald-100",
    transferring: "bg-blue-50 text-blue-600 border-blue-100",
    rejected: "bg-rose-50 text-rose-600 border-rose-100"
  };

  const currentStyle = label === 'waiting' ? styles.transferring : styles[s] || styles.pending;
  
  return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase ${currentStyle}`}>{label}</span>;
};

// --- 4. Main App ---
export default function App() {
  const [fbUserReady, setFbUserReady] = useState(false);
  const [activeTab, setActiveTab] = useState('history'); 
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  
  const [aiUsage, setAiUsage] = useState({ ocrCount: 0, lineCount: 0, requestCount: 0 });

  const resetAiUsage = async () => {
    if (!confirm("คุณต้องการล้างประวัติการใช้งานระบบใช่หรือไม่? (ค่านับทั้งหมดจะกลับเป็น 0)")) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'usage'), { ocrCount: 0, lineCount: 0, requestCount: 0 });
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/usage'); }
  };

  const estimatedCost = aiUsage.ocrCount * 0.0105; // ~0.0105 THB per request (estimated for 1.5 Flash)
  const [dynamicEmployees, setDynamicEmployees] = useState<string[]>(INITIAL_EMPLOYEES);
  const [dynamicProjects, setDynamicProjects] = useState<string[]>(INITIAL_PROJECTS);
  const [dynamicCategories, setDynamicCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [systemConfigs, setSystemConfigs] = useState<SystemConfigs>({ execPin: '888', accPin: '123', sheetsUrl: 'https://script.google.com/macros/s/AKfycbzJ35sguFnu7RANIhAKmzeV-63Jc53A1sSRfpi0TZ0ZOqB2v1pazW7c6BLTp_6GoJS0/exec', webAppUrl: window.location.origin, allowedLineIds: [], approvers: [] });
  const [newLineId, setNewLineId] = useState('');
  const [newApproverName, setNewApproverName] = useState('');
  const [isSettingsAuthed, setIsSettingsAuthed] = useState(false);
  const [showSettingsLogin, setShowSettingsLogin] = useState(false);
  const [settingsPassword, setSettingsPassword] = useState('');
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');

  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [historyFilters, setHistoryFilters] = useState({ 
    employee: 'all', 
    status: 'all', 
    project: 'all',
    accountingStatus: 'all',
    startDate: '',
    endDate: ''
  });
  const [dashboardFilter, setDashboardFilter] = useState('all');

  const [newReq, setNewReq] = useState<{
    employeeName: string;
    projectIds: string[];
    items: Array<{ name: string; amount: number; category: string }>;
    bankAccount?: BankAccount;
  }>({ 
    employeeName: '', 
    projectIds: [], 
    items: [{ name: '', amount: 0, category: '' }] 
  });

  const [employeeBankAccounts, setEmployeeBankAccounts] = useState<{ [key: string]: BankAccount[] }>({});
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [tempBank, setTempBank] = useState<BankAccount>({ id: '', bankName: '', accountNumber: '', accountName: '' });
  const [bankEmp, setBankEmp] = useState('');
  const [clrForm, setClrForm] = useState({ advanceId: '', receipts: [{ name: '', amount: 0, base64: '', fileName: '', isProcessing: false, projectId: '', description: '', originalAmount: 0, additionalDocs: [] }] });
  const [projSearch, setProjSearch] = useState('');
  const [clrAdvSearch, setClrAdvSearch] = useState('');
  const [showAdvList, setShowAdvList] = useState(false);
  const [clrProjSearchIdx, setClrProjSearchIdx] = useState<number | null>(null);
  const [clrProjSearchTerm, setClrProjSearchTerm] = useState('');
  const [settingsProjSearch, setSettingsProjSearch] = useState('');
  
  const [showReqProjList, setShowReqProjList] = useState(false);
  const [showPassModal, setShowPassModal] = useState<{ 
    show: boolean, 
    action: string | null, 
    targetId: string | null, 
    targetIds: string[],
    type: string, 
    receiptIndex: number | null, 
    receiptIndices: number[],
    nextDocStatus: string 
  }>({ 
    show: false, 
    action: null, 
    targetId: null, 
    targetIds: [],
    type: '', 
    receiptIndex: null, 
    receiptIndices: [],
    nextDocStatus: '' 
  });
  const [selectedHistItems, setSelectedHistItems] = useState<string[]>([]);
  const [selectedProjectItems, setSelectedProjectItems] = useState<string[]>([]);
  const [selectedReceipts, setSelectedReceipts] = useState<number[]>([]);
  const [password, setPassword] = useState('');
  const [ocrModal, setOcrModal] = useState({ show: false, total: 0 });
  const [editingReceipt, setEditingReceipt] = useState<{ withdrawalId: string, index: number, data: Receipt } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [passError, setPassError] = useState('');

  // Test connection and Auth
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const initAuth = async (retries = 3) => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error(`Auth Attempt Failed (Retries left: ${retries}):`, e);
        if (retries > 0) {
          setTimeout(() => initAuth(retries - 1), 2000);
        } else {
          const errMsg = (e as any).message || String(e);
          if (errMsg.includes('network-request-failed')) {
            alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ Firebase ได้ (Network Error)\n\nกรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต หรือปิด Adblocker แล้วลองใหม่อีกครั้ง");
          } else {
            alert("❌ ระบบยืนยันตัวตนล้มเหลว: " + errMsg);
          }
        }
      }
    };
    initAuth();

    const unsub = onAuthStateChanged(auth, (user) => {
      setFbUserReady(!!user);
    });
    return () => unsub();
  }, []);

  // Sync with Firestore
  useEffect(() => {
    if (!fbUserReady) return;

    const usagePath = doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'usage');
    const unsubU = onSnapshot(usagePath, (snap) => {
      if (snap.exists()) setAiUsage(snap.data() as any);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'system_configs/usage'));

    const withdrawalsPath = `artifacts/${appId}/public/data/withdrawals`;
    const unsubW = onSnapshot(collection(db, withdrawalsPath), (snap) => {
      setWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Withdrawal)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, withdrawalsPath));

    const configsPath = `artifacts/${appId}/public/data/system_configs`;
    const unsubC = onSnapshot(collection(db, configsPath), (snap) => {
      const data: any = {};
      snap.docs.forEach(d => data[d.id] = d.data());
      if (data.passwords) setSystemConfigs(data.passwords);
      if (data.employees && data.employees.list) setDynamicEmployees(data.employees.list);
      
      if (data.projects && data.projects.list) {
        const list = data.projects.list as string[];
        // More aggressive migration: if the list has less than 20 items, it's likely the old list or incomplete.
        // The user explicitly asked for the new list of 46 projects.
        if (list.length < 20 || list.includes("PROJ-A")) {
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'projects'), { list: INITIAL_PROJECTS });
        }
        setDynamicProjects(list);
      } else if (!data.projects) {
        // Initialize if empty
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'projects'), { list: INITIAL_PROJECTS });
      }

      if (data.categories && data.categories.list) setDynamicCategories(data.categories.list);
      if (data.bank_accounts) setEmployeeBankAccounts(data.bank_accounts);
    }, (error) => handleFirestoreError(error, OperationType.GET, configsPath));

    return () => { unsubW(); unsubC(); unsubU(); };
  }, [fbUserReady]);

  // Handle Quick Approve from LINE URL
  useEffect(() => {
    if (!fbUserReady || withdrawals.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const approveId = params.get('approve');
    const viewId = params.get('view');
    const action = params.get('action');

    if (viewId && withdrawals.length > 0) {
      const target = withdrawals.find(w => w.id === viewId);
      if (target) {
        setSelectedWithdrawal(target);
        if (action === 'slip') {
           setActiveTab('history');
           // Modal should open automatically because selectedWithdrawal is set
        }
        // Clean URL but keep track that we handled it to avoid loops
        const newParams = new URLSearchParams(window.location.search);
        newParams.delete('view');
        newParams.delete('action');
        const search = newParams.toString();
        window.history.replaceState({}, document.title, window.location.pathname + (search ? `?${search}` : ''));
      }
    }

    if (approveId && withdrawals.length > 0) {
      const target = withdrawals.find(w => w.id === approveId);
      if (target) {
        if (target.status === 'pending') {
          const deadline = new Date();
          deadline.setDate(deadline.getDate() + 30);
          const ref = doc(db, `artifacts/${appId}/public/data/withdrawals/${target.id}`);
          const appUrl = systemConfigs.webAppUrl || window.location.origin;

          updateDoc(ref, { 
            status: 'approved', 
            approvedAt: new Date().toISOString(),
            clearanceDeadline: deadline.toISOString()
          }).then(async () => {
            // Create folder in Drive
            await callDrive({ action: 'init_folder', advanceId: target.advanceId });

            const flex = buildStatusFlex(
              "💎 อนุมัติการเบิก (ผ่าน URL)", 
              `ID: ${target.advanceId}\nพนักงาน: ${target.employeeName}\nยอด: ฿${(target.totalAmount || 0).toLocaleString()}`, 
              "#10B981", 
              "✅",
              { label: "แนบสลิปโอนเงิน", url: `${appUrl}?view=${target.id}&action=slip` }
            );
            await notifyLine("ผลการอนุมัติ (URL)", 'flex', flex);
            
            if (systemConfigs.sheetsUrl) {
              await syncToSheets(systemConfigs.sheetsUrl, {
                action: 'approve_withdrawal',
                data: {
                  advanceId: target.advanceId,
                  status: 'Approved',
                  approvedAt: new Date().toISOString(),
                  clearanceDeadline: deadline.toISOString()
                }
              });
            }
            alert(`อนุมัติรายการ ${target.advanceId} เรียบร้อยแล้ว`);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
          });
        } else {
          alert(`รายการนี้ถูกดำเนินการไปแล้ว (สถานะปัจจุบัน: ${target.status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ'})`);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    }
  }, [fbUserReady, withdrawals]);

  const activeWithdrawals = useMemo(() => {
    return withdrawals.filter(w => (w.projectIds || []).some(pid => dynamicProjects.includes(pid)));
  }, [withdrawals, dynamicProjects]);

  const approvedAdvances = useMemo(() => activeWithdrawals.filter(w => w.status === 'approved' && w.clearanceStatus !== 'cleared'), [activeWithdrawals]);
  const selectedAdvData = useMemo(() => activeWithdrawals.find(a => a.advanceId === clrForm.advanceId), [clrForm.advanceId, activeWithdrawals]);
  
  const historyList = useMemo(() => {
    return activeWithdrawals.filter(w => {
      const s = searchTerm.toLowerCase();
      const matchSearch = s === '' || (w.employeeName || '').toLowerCase().includes(s) || (w.advanceId || '').toLowerCase().includes(s);
      const matchEmp = historyFilters.employee === 'all' || w.employeeName === historyFilters.employee;
      const matchProj = historyFilters.project === 'all' || (w.projectIds || []).includes(historyFilters.project);
      const matchStat = historyFilters.status === 'all' || 
                        (historyFilters.status === 'pending' && w.status === 'pending') ||
                        (historyFilters.status === 'waiting' && w.status === 'approved' && !w.transferSlip) ||
                        (historyFilters.status === 'approved' && w.status === 'approved' && w.clearanceStatus === 'none') ||
                        (historyFilters.status === 'cleared' && w.clearanceStatus === 'cleared') ||
                        (historyFilters.status === 'rejected' && w.status === 'rejected');
      
      const date = new Date(w.createdAt).getTime();
      const matchStart = !historyFilters.startDate || date >= new Date(historyFilters.startDate).getTime();
      const matchEnd = !historyFilters.endDate || date <= new Date(historyFilters.endDate).setHours(23,59,59,999);
      
      const diff = (w.finalApprovedTotal || 0) - (w.totalAmount || 0);
      const matchAcc = historyFilters.accountingStatus === 'all' || (
        w.accountStatus === 'closed' && (
          (historyFilters.accountingStatus === 'balanced' && diff === 0) ||
          (historyFilters.accountingStatus === 'refund' && diff < 0) ||
          (historyFilters.accountingStatus === 'extra' && diff > 0)
        )
      );

      return matchSearch && matchEmp && matchStat && matchProj && matchStart && matchEnd && matchAcc;
    }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [withdrawals, searchTerm, historyFilters]);

  const exportToCSV = () => {
    if (historyList.length === 0) return;

    const headers = ["Date", "ADV ID", "Employee", "Projects", "Status", "Receipt Name", "Receipt Project", "Amount", "Clearance Status"];
    const rows = historyList.flatMap(w => {
      const date = new Date(w.createdAt).toLocaleDateString('th-TH');
      const projects = (w.projectIds || []).join(', ');
      
      if (!w.receipts || w.receipts.length === 0) {
        return [[date, w.advanceId, w.employeeName, projects, w.status, "N/A", "N/A", w.totalAmount, w.clearanceStatus]];
      }

      return w.receipts.map(r => [
        date,
        w.advanceId,
        w.employeeName,
        projects,
        w.status,
        r.name,
        r.projectId,
        r.amount,
        w.clearanceStatus
      ]);
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `advance_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const dashboardData = useMemo(() => {
    const list: any[] = [];
    const projectMap: { [key: string]: { requested: number, cleared: number, balance: number } } = {};
    const categoryMap: { [key: string]: number } = {};
    const staffMap: { [key: string]: number } = {};

    activeWithdrawals.forEach(w => {
      // Top Spenders logic (from total requested)
      staffMap[w.employeeName] = (staffMap[w.employeeName] || 0) + w.totalAmount;

      // Project logic - requested
      (w.projectIds || []).forEach(pid => {
        if (!projectMap[pid]) projectMap[pid] = { requested: 0, cleared: 0, balance: 0 };
        // Attribute requested amount equally split among mentioned projects
        projectMap[pid].requested += (w.totalAmount || 0) / (w.projectIds.length || 1);
      });

      // Global category stats from the request items
      (w.items || []).forEach(it => {
        const cat = it.category || 'Other';
        categoryMap[cat] = (categoryMap[cat] || 0) + (Number(it.amount) || 0);
      });

      if (w.receipts) {
        w.receipts.forEach(r => {
          if (dynamicProjects.includes(r.projectId)) {
             const amt = Number(r.amount || 0);
             if (!projectMap[r.projectId]) projectMap[r.projectId] = { requested: 0, cleared: 0, balance: 0 };
             projectMap[r.projectId].cleared += amt;

             if (dashboardFilter === 'all' || r.projectId === dashboardFilter) {
               list.push({ ...r, advanceId: w.advanceId, employeeName: w.employeeName, clearedAt: w.clearedAt });
             }
          }
        });
      }
    });

    Object.keys(projectMap).forEach(pid => {
      projectMap[pid].balance = projectMap[pid].requested - projectMap[pid].cleared;
    });

    const topSpenders = Object.entries(staffMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a,b) => b.amount - a.amount)
      .slice(0, 5);

    const projectStats = Object.entries(projectMap)
      .filter(([name]) => dashboardFilter === 'all' || name === dashboardFilter)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a,b) => b.requested - a.requested);

    const categoryStats = Object.entries(categoryMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a,b) => b.amount - a.amount);

    return { 
      list: list.sort((a,b) => new Date(b.clearedAt).getTime() - new Date(a.clearedAt).getTime()), 
      totalRequested: projectStats.reduce((s, x) => s + x.requested, 0),
      totalCleared: projectStats.reduce((s, x) => s + x.cleared, 0),
      totalBalance: projectStats.reduce((s, x) => s + x.balance, 0),
      topSpenders,
      projectStats,
      categoryStats
    };
  }, [withdrawals, dashboardFilter, activeWithdrawals, dynamicProjects]);

  const handleRequestSubmit = async () => {
    if (isBusy || !newReq.employeeName || newReq.projectIds.length === 0 || newReq.items.some(i => !i.amount)) return alert("ข้อมูลไม่ครบ (โปรดเลือกอย่างน้อย 1 โปรเจกต์)");
    if (!newReq.bankAccount) return alert("กรุณาระบุหรือเลือกบัญชีธนาคารสำหรับรับเงิน");
    
    setIsBusy(true);
    const path = `artifacts/${appId}/public/data/withdrawals`;
    try {
      const total = newReq.items.reduce((s, i) => s + Number(i.amount || 0), 0);
      const id = `ADV-${new Date().toISOString().split('T')[0].slice(2).replace(/-/g,'')}-${(withdrawals.length + 1).toString().padStart(3,'0')}`;
      const createdAt = new Date().toISOString();
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);
      
      const docData = {
        ...newReq, 
        advanceId: id, 
        totalAmount: total, 
        status: 'pending', 
        createdAt: createdAt,
        clearanceDeadline: deadline.toISOString(),
        clearanceStatus: 'none', 
        actualSpend: 0, 
        balance: total, 
        receipts: []
      };
      const docRef = await addDoc(collection(db, path), docData);
      
      const appUrl = systemConfigs.webAppUrl || window.location.origin;
      const flex = buildRequestFlex({ id: docRef.id, ...docData } as any, appUrl);
      await notifyLine(`รายการใหม่: ${id}`, 'flex', flex);

      if (systemConfigs.sheetsUrl) {
        await syncToSheets(systemConfigs.sheetsUrl, {
          action: 'submit_withdrawal',
          data: {
            id: docRef.id,
            advanceId: id,
            employee: docData.employeeName,
            amount: total,
            projects: docData.projectIds.join(', '),
            items: docData.items.map(i => `${i.name} (${i.amount})`).join(' | '),
            createdAt: docData.createdAt,
            bankDetails: `${docData.bankAccount.bankName} ${docData.bankAccount.accountNumber} (${docData.bankAccount.accountName})`
          }
        });
      }

      setNewReq({ employeeName: '', projectIds: [], items: [{ name: '', amount: 0, category: '' }], bankAccount: undefined });
      setActiveTab('history');
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, path); } finally { setIsBusy(false); }
  };

  const handleFile = async (idx: number, file: File | null) => {
    if (!file) return;
    const temp = [...clrForm.receipts]; temp[idx].isProcessing = true; setClrForm({ ...clrForm, receipts: temp });
    const b64 = await compressImg(file);
    const updated = [...clrForm.receipts];
    updated[idx] = { ...updated[idx], fileName: file.name, base64: b64, isProcessing: false };
    setClrForm({ ...clrForm, receipts: updated });
  };

  const handleAdditionalFile = async (idx: number, file: File | null) => {
    if (!file) return;
    const temp = [...clrForm.receipts];
    temp[idx].isProcessing = true;
    setClrForm({ ...clrForm, receipts: temp });
    
    const b64 = await compressImg(file);
    const updated = [...clrForm.receipts];
    const newDoc = { base64: b64, fileName: file.name };
    updated[idx] = { 
      ...updated[idx], 
      additionalDocs: [...(updated[idx].additionalDocs || []), newDoc],
      isProcessing: false 
    };
    setClrForm({ ...clrForm, receipts: updated });
  };

  const runAI = async () => {
    if (clrForm.receipts.some(r => !r.base64)) return alert("แนบรูปสลิปให้ครบก่อน");
    setIsBusy(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured. Please check Settings > Secrets.");
      }

      const genAI = new GoogleGenAI({ apiKey });
      
      const updated = await Promise.all(clrForm.receipts.map(async (r) => {
        try {
          const imageData = r.base64.includes(",") ? r.base64.split(",")[1] : r.base64;
          
          const response = await genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: {
              parts: [
                { text: "ช่วยดึงชื่อร้านค้า และยอดเงินรวมจากสลิปนี้ให้หน่อย (Extract store name and total amount)" },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: imageData
                  }
                }
              ]
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  name: {
                    type: Type.STRING,
                    description: "The name of the store or merchant."
                  },
                  amount: {
                    type: Type.NUMBER,
                    description: "The total amount of the transaction."
                  }
                },
                required: ["name", "amount"]
              }
            }
          });

          const json = JSON.parse(response.text || '{}');
          return { ...r, name: json.name || 'ไม่ระบุ', amount: json.amount || 0, originalAmount: json.amount || 0 } as Receipt;
        } catch (err) {
          console.error("Single receipt AI error:", err);
          return { ...r, name: 'AI Error', amount: 0, originalAmount: 0 } as Receipt;
        }
      }));
      
      setClrForm({ ...clrForm, receipts: detectDuplicates(updated, withdrawals) });
      setOcrModal({ show: true, total: updated.reduce((s, x) => s + Number(x.amount || 0), 0) });
    } catch (e) { 
      const errMsg = (e as Error).message;
      if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("PERMISSION_DENIED")) {
        alert("API Key ไม่ถูกต้องหรือยังไม่ได้ตั้งค่า กรุณาตรวจสอบที่เมนู Settings > Secrets");
      } else {
        alert(`AI ล้มเหลว: ${errMsg}`);
      }
      console.error(e); 
    } finally { 
      setIsBusy(false); 
    }
  };

  const handleSlipUpload = async (file: File | null) => {
    if (!file || !selectedWithdrawal?.id) return;
    setIsBusy(true);
    try {
      const b64 = await compressImg(file);
      
      // Upload to Drive
      const driveRes = await callDrive({ 
        action: 'upload_slip', 
        advanceId: selectedWithdrawal.advanceId, 
        slip: b64 
      });

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'withdrawals', selectedWithdrawal.id), {
        transferSlip: driveRes?.url ? '' : b64,
        transferSlipDriveUrl: driveRes?.url || null,
        status: 'approved'
      });
      await notifyLine(`💸 อัปโหลดหลักฐานการโอนเงินแล้ว\nID: ${selectedWithdrawal.advanceId}\nพนักงาน: ${selectedWithdrawal.employeeName}\nยอด: ฿${selectedWithdrawal.totalAmount.toLocaleString()}`, 'text');
      setSelectedWithdrawal({ ...selectedWithdrawal, transferSlip: b64, status: 'approved' });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'withdrawals'); } finally { setIsBusy(false); }
  };

  const saveClearance = async () => {
    if (isBusy || !selectedAdvData || !selectedAdvData.id) return;
    setIsBusy(true);
    const path = `artifacts/${appId}/public/data/withdrawals/${selectedAdvData.id}`;
    try {
      const total = clrForm.receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
      
      // 1. Upload to Google Drive
      const driveRes = await callDrive({
        action: 'upload_receipts',
        advanceId: selectedAdvData.advanceId,
        receipts: clrForm.receipts
      });
      const driveResults = driveRes?.results || [];

      const newItems = clrForm.receipts.map((r, i) => {
        const res = driveResults[i];
        return {
          ...r, 
          isEdited: Number(r.amount) !== Number(r.originalAmount),
          docStatus: 'waiting', 
          fileName: `${new Date().toISOString().split('T')[0]}_${selectedAdvData.advanceId}_${i}.jpg`,
          driveUrl: res?.mainUrl || null,
          base64: res?.mainUrl ? '' : r.base64,
          additionalDocs: (r.additionalDocs || []).map((ad: any, adIdx: number) => {
             const adRes = res?.additionalUrls?.[adIdx];
             return {
                ...ad,
                driveUrl: adRes?.url || null,
                base64: adRes?.url ? '' : ad.base64
             };
          })
        };
      });
      const newSpend = selectedAdvData.actualSpend + total;

      const combinedReceipts = optimizeReceipts([...(selectedAdvData.receipts || []), ...newItems]);
      
      // 2. Update Firestore
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'withdrawals', selectedAdvData.id), {
        clearanceStatus: (selectedAdvData.totalAmount - newSpend) <= 0 ? 'cleared' : 'partial',
        actualSpend: newSpend, 
        balance: selectedAdvData.totalAmount - newSpend,
        receipts: combinedReceipts, 
        clearedAt: new Date().toISOString()
      });
      
      setOcrModal({ show: false, total: 0 });
      setClrForm({ advanceId: '', receipts: [{ name: '', amount: 0, base64: '', fileName: '', isProcessing: false, projectId: '', description: '', originalAmount: 0, additionalDocs: [] }] });
      setActiveTab('history');
      
      const driveLinks = driveResults.flatMap(res => [
        res.mainUrl,
        ...(res.additionalUrls || []).map((ad: any) => ad.url)
      ]).filter(Boolean).join(', ');

      const spendingDetail = clrForm.receipts.map(r => `• ${r.name}: ฿${r.amount.toLocaleString()}`).join('\n');
      const flex = buildStatusFlex("✅ เคลียร์ยอดแล้ว", `ADV: ${selectedAdvData.advanceId}\nพนักงาน: ${selectedAdvData.employeeName}\nยอดเคลียร์: ฿${total.toLocaleString()}`, "#10B981", "💰");
      notifyLine("รายการเคลียร์ยอดใหม่", 'flex', flex);
      
      // 3. Sync to Sheets
      if (systemConfigs.sheetsUrl) {
         await syncToSheets(systemConfigs.sheetsUrl, {
            action: 'submit_clearing',
            data: {
              id: selectedAdvData.id,
              advanceId: selectedAdvData.advanceId,
              employee: selectedAdvData.employeeName,
              amountCleared: total,
              totalRequested: selectedAdvData.totalAmount,
              remainingBalance: selectedAdvData.totalAmount - newSpend,
              clearedAt: new Date().toISOString(),
              receiptsSummary: spendingDetail,
              driveLinks: driveLinks
            }
         });
      }
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, path); } finally { setIsBusy(false); }
  };

  const verifyAction = async () => {
    const pin = showPassModal.type === 'executive' ? systemConfigs.execPin : systemConfigs.accPin;
    if (password === pin) {
      if (!showPassModal.targetId && showPassModal.targetIds.length === 0) {
        setShowPassModal({ show: false, action: null, targetId: null, targetIds: [], type: '', receiptIndex: null, receiptIndices: [], nextDocStatus: '' });
        return;
      }
      
      setIsBusy(true);
      const ids = showPassModal.targetId ? [showPassModal.targetId] : showPassModal.targetIds;
      
      try {
        let successCount = 0;
        let deletedInfo: string[] = [];

        // Process all operations in parallel for better performance
        await Promise.all(ids.map(async (tid) => {
          try {
            const path = `artifacts/${appId}/public/data/withdrawals/${tid}`;
            const ref = doc(db, path);
            let parent = withdrawals.find(w => w.id === tid);
            if (!parent && selectedWithdrawal?.id === tid) parent = selectedWithdrawal;
            
            const dn = parent ? parent.advanceId : tid;
            const en = parent ? parent.employeeName : 'Unknown';

            if (showPassModal.action === 'approve') {
              if (!parent) return;
              const deadline = new Date();
              deadline.setDate(deadline.getDate() + 30);
              await updateDoc(ref, { 
                status: 'approved', 
                approvedAt: new Date().toISOString(),
                clearanceDeadline: deadline.toISOString()
              });
              const appUrl = systemConfigs.webAppUrl || window.location.origin;
              const flex = buildStatusFlex(
                "💎 อนุมัติการเบิก", 
                `ID: ${parent.advanceId}\nพนักงาน: ${parent.employeeName}\nยอด: ฿${(Number(parent.totalAmount) || 0).toLocaleString()}`, 
                "#10B981", 
                "✅",
                { label: "แนบสลิปโอนเงิน", url: `${appUrl}?view=${parent.id}&action=slip` }
              );
              notifyLine("ผลการอนุมัติ", 'flex', flex).catch(err => console.warn("LINE Notify failed:", err));
              successCount++;
            } else if (showPassModal.action === 'reject') {
              if (!parent) return;
              await updateDoc(ref, { status: 'rejected' });
              const flex = buildStatusFlex("❌ ปฏิเสธการเบิก", `ID: ${parent.advanceId}\nพนักงาน: ${parent.employeeName}`, "#EF4444", "🚫");
              notifyLine("ผลการปฏิเสธ", 'flex', flex).catch(err => console.warn("LINE Notify failed:", err));
              successCount++;
            } else if (showPassModal.action === 'withdraw_delete') {
              await deleteDoc(ref);
              if (selectedWithdrawal?.id === tid) setSelectedWithdrawal(null);
              deletedInfo.push(`${dn} (${en})`);
              successCount++;
            } else if (showPassModal.action === 'doc_toggle') {
              if (!parent) return;
              const indices = showPassModal.receiptIndex !== null ? [showPassModal.receiptIndex] : showPassModal.receiptIndices;
              if (indices.length > 0) {
                const updated = optimizeReceipts([...(parent.receipts || [])]);
                indices.sort((a,b) => b-a).forEach(idx => {
                  if (updated[idx]) updated[idx].docStatus = showPassModal.nextDocStatus as any;
                });
                await updateDoc(ref, { receipts: updated });
                if (selectedWithdrawal?.id === parent.id) setSelectedWithdrawal({...parent, receipts: updated});
                
                if (showPassModal.nextDocStatus === 'approved') {
                  const flex = buildStatusFlex("🏢 บัญชีรับรองสลิป (กลุ่ม)", `ADV: ${parent.advanceId}\nจำนวน: ${indices.length} รายการ`, "#0F172A", "💼");
                  notifyLine("การรับรองสลิป", 'flex', flex).catch(err => console.warn("LINE Notify failed:", err));
                }
                successCount++;
              }
            } else if (showPassModal.action === 'receipt_delete') {
              if (!parent) return;
              const indices = showPassModal.receiptIndex !== null ? [showPassModal.receiptIndex] : showPassModal.receiptIndices;
              if (indices.length > 0) {
                const updated = optimizeReceipts([...(parent.receipts || [])]);
                indices.sort((a,b) => b-a).forEach(idx => {
                  updated.splice(idx, 1);
                });
                await updateDoc(ref, { receipts: updated });
                if (selectedWithdrawal?.id === parent.id) setSelectedWithdrawal({...parent, receipts: updated});
                successCount++;
              }
            } else if (showPassModal.action === 'receipt_edit') {
              if (!parent) return;
              if (showPassModal.receiptIndex !== null && editingReceipt) {
                const updated = optimizeReceipts([...(parent.receipts || [])]);
                updated[showPassModal.receiptIndex] = { ...editingReceipt.data, isEdited: true };
                await updateDoc(ref, { receipts: updated });
                if (selectedWithdrawal?.id === parent.id) setSelectedWithdrawal({...parent, receipts: updated});
                setEditingReceipt(null);
                successCount++;
              }
            } else if (showPassModal.action === 'close_account') {
              if (!parent) return;
               const receipts = parent.receipts || [];
               const approvedReceipts = receipts.filter(r => r.docStatus === 'approved');
               const totalApproved = approvedReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
               const originalTotal = (Number(parent.totalAmount) || 0);
               const diff = totalApproved - originalTotal;
               let statusLabel = diff === 0 ? '✅ ยอดใช้จ่ายพอดี' : (diff > 0 ? '🔴 คืนพนักงาน' : '🔵 คืนบริษัท');
               await updateDoc(ref, { 
                 accountStatus: 'closed',
                 finalApprovedTotal: totalApproved,
                 accountingConclusion: statusLabel,
                 closedAt: new Date().toISOString()
               });
               const summaryText = approvedReceipts.map(r => `• ${r.name}: ฿${(Number(r.amount)||0).toLocaleString()}`).join('\n');
               notifyLine(`🏁 ปิดยอดบัญชีเรียบร้อย\nADV: ${parent.advanceId}\nสรุป:\n${summaryText}`).catch(err => console.warn("LINE Notify failed:", err));
               if (selectedWithdrawal?.id === parent.id) {
                 setSelectedWithdrawal({...parent, accountStatus: 'closed', finalApprovedTotal: totalApproved, accountingConclusion: statusLabel, closedAt: new Date().toISOString()});
               }
               successCount++;
            }
          } catch (err) {
            console.error(`Error processing item ${tid}:`, err);
          }
        }));

        if (showPassModal.action === 'withdraw_delete' && deletedInfo.length > 0) {
          const summary = deletedInfo.length > 5 
            ? `${deletedInfo.slice(0, 5).join(', ')}... และอีก ${deletedInfo.length - 5} รายการ`
            : deletedInfo.join('\n');
          notifyLine(`🗑️ บัญชีลบรายการเบิก (${deletedInfo.length} รายการ)\n${summary}`).catch(err => console.warn("LINE Notify failed:", err));
        }

        if (successCount === 0 && ids.length > 0) {
          alert("ไม่สามารถทำรายการได้ กรุณาลองใหม่อีกครั้ง");
        }

        if (showPassModal.action === 'withdraw_delete') {
          setSelectedHistItems([]);
          if (selectedWithdrawal) setSelectedWithdrawal(null);
        }
        if (showPassModal.action === 'doc_toggle') setSelectedReceipts([]);
      } catch (e) { 
        handleFirestoreError(e, OperationType.UPDATE, 'withdrawals');
      } finally {
        setIsBusy(false);
        setShowPassModal({ show: false, action: null, targetId: null, targetIds: [], type: '', receiptIndex: null, receiptIndices: [], nextDocStatus: '' }); 
        setPassword('');
        setPassError('');
      }
    } else {
      setPassError("รหัสผ่านไม่ถูกต้อง");
    }
  };

  const sendDailySummary = async () => {
    const pending = withdrawals.filter(w => w.status === 'approved' && w.clearanceStatus !== 'cleared');
    if (pending.length === 0) return alert("ไม่มีรายการค้างเคลียร์สำหรับวันนี้");
    
    const summary = pending.map(w => {
      const created = new Date(w.createdAt).getTime();
      const deadline = w.clearanceDeadline ? new Date(w.clearanceDeadline).getTime() : (created + 30 * 24 * 60 * 60 * 1000);
      const remainingDays = Math.ceil((deadline - new Date().getTime()) / (1000 * 60 * 60 * 24));
      const statusText = remainingDays < 0 ? `เกินกำหนด ${Math.abs(remainingDays)} วัน` : `เหลือเวลา ${remainingDays} วัน`;
      return `• ${w.advanceId} [${w.employeeName}]\n  ค้าง: ฿${w.balance.toLocaleString()} / ฿${w.totalAmount.toLocaleString()}\n  ${statusText} (ครบกำหนด: ${new Date(deadline).toLocaleDateString('th-TH')})`;
    }).join('\n\n');
    
    await notifyLine(`📊 สรุปรายการค้างเคลียร์ประจำวัน\nณ วันที่: ${new Date().toLocaleDateString('th-TH')}\nจำนวน: ${pending.length} รายการ\n\n${summary}`);
    alert("ส่งสรุปประจำวันเข้า LINE แล้ว");
  };

  const sendWeeklyReport = async () => {
    const appUrl = systemConfigs.webAppUrl || window.location.origin;
    const summaryFlex = buildWeeklySummaryFlex(withdrawals);
    const carouselFlex = buildWeeklyCarouselFlex(withdrawals, appUrl);
    
    await notifyLine("📊 Weekly Advance Summary", 'flex', summaryFlex);
    await notifyLine("📋 Weekly Detailed Report", 'flex', carouselFlex);
    
    alert("ส่งรายงานรายสัปดาห์ (2 ข้อความ) เข้า LINE แล้ว");
  };

  const updateDeadline = async (dateStr: string) => {
    if (!selectedWithdrawal || !selectedWithdrawal.id) return;
    try {
      const ref = doc(db, `artifacts/${appId}/public/data/withdrawals/${selectedWithdrawal.id}`);
      await updateDoc(ref, { clearanceDeadline: dateStr });
      setSelectedWithdrawal({ ...selectedWithdrawal, clearanceDeadline: dateStr });
      const flex = buildStatusFlex("📅 เลื่อนกำหนดเคลียร์", `ADV: ${selectedWithdrawal.advanceId}\nพนักงาน: ${selectedWithdrawal.employeeName}\nกำหนดใหม่: ${new Date(dateStr).toLocaleDateString('th-TH')}`, "#F59E0B", "⏳");
      notifyLine("เลื่อนวันครบกำหนด", 'flex', flex);
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, `withdrawals/${selectedWithdrawal.id}`); }
  };

  const handleSettingsLogin = () => {
    if (settingsPassword === systemConfigs.accPin || settingsPassword === systemConfigs.execPin) {
      setIsSettingsAuthed(true); setShowSettingsLogin(false); setActiveTab('settings'); setSettingsPassword('');
    } else { alert("รหัสผ่านไม่ถูกต้อง เฉพาะบัญชีและผู้บริหารเท่านั้น"); }
  };

  const addEmployee = async () => {
    if (!newEmployeeName) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'employees'), { list: [...dynamicEmployees, newEmployeeName] });
      setNewEmployeeName('');
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/employees'); }
  };

  const removeEmployee = async (name: string) => {
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'employees'), { list: dynamicEmployees.filter(e => e !== name) });
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/employees'); }
  };
  
  const addProject = async () => {
    if (!newProjectName) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'projects'), { list: [...dynamicProjects, newProjectName] });
      setNewProjectName('');
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/projects'); }
  };

  const removeProject = async (name: string) => {
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'projects'), { list: dynamicProjects.filter(p => p !== name) });
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/projects'); }
  };

  const resetToDefaultProjects = async () => {
    if (!confirm("คุณต้องการล้างรายชื่อโครงการทั้งหมดและใช้รายชื่อใหม่ตามค่าเริ่มต้นใช่หรือไม่?")) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'projects'), { list: INITIAL_PROJECTS });
      alert("รีเซ็ตรายชื่อโครงการใหม่สำเร็จ");
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/projects'); }
  };

  const addCategory = async () => {
    if (!newCategoryName) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'categories'), { list: [...dynamicCategories, newCategoryName] });
      setNewCategoryName('');
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/categories'); }
  };

  const removeCategory = async (name: string) => {
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'categories'), { list: dynamicCategories.filter(c => c !== name) });
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/categories'); }
  };

  const updatePasswords = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'passwords'), systemConfigs);
      alert("บันทึกการตั้งค่าระบบและรหัสผ่านสำเร็จ");
    } catch (e) { 
      handleFirestoreError(e, OperationType.WRITE, 'system_configs/passwords'); 
    } finally {
      setIsBusy(false);
    }
  };

  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-4"><Loader2 className="w-10 h-10 animate-spin text-blue-600"/><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading System...</p></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 pb-20 sm:pb-0 overflow-x-hidden">
      
      {/* Header */}
      <header className="bg-slate-950 border-b border-white/5 sticky top-0 z-40 px-6 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 flex items-center justify-center overflow-hidden">
            <img 
              src="https://img1.pic.in.th/images/IMG_9235.png" 
              alt="Logo" 
              className="h-full w-auto object-contain" 
              referrerPolicy="no-referrer" 
            />
          </div>
          <div>
            <h1 className="font-black text-sm tracking-tight text-white uppercase leading-none">Advance</h1>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Management System</p>
          </div>
        </div>
        <nav className="hidden lg:flex gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
          {[
            { id: 'request', label: 'ขอเบิก', icon: Plus },
            { id: 'clearance', label: 'เคลียร์', icon: Wallet },
            { id: 'history', label: 'รายการเบิก', icon: HistoryIcon },
            { id: 'weekly', label: 'รายงาน', icon: PieChart },
            { id: 'dashboard', label: 'สรุป', icon: BarChart3 },
            { id: 'approvals', label: 'อนุมัติ', icon: Lock },
            { id: 'settings', label: 'ตั้งค่า', icon: Settings }
          ].map(t => (
            <button key={t.id} onClick={() => t.id === 'settings' ? setShowSettingsLogin(true) : setActiveTab(t.id)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${activeTab === t.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}>
              <t.icon className="w-3 h-3" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
           {isBusy && <Loader2 className="w-4 h-4 animate-spin text-blue-500"/>}
           <div className="flex items-center gap-2 text-right">
             <div className="hidden sm:block">
               <p className="text-[10px] font-black text-slate-900 uppercase leading-none">Operator</p>
               <p className="text-[8px] font-bold text-slate-400 uppercase leading-none mt-0.5">System Admin</p>
             </div>
             <div className="w-9 h-9 bg-slate-100 rounded-full border border-slate-200 flex items-center justify-center">
               <User className="w-5 h-5 text-slate-400" />
             </div>
           </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-3 sm:p-8">
        
        {/* TAB 1: Request */}
        {activeTab === 'request' && (
          <div className="max-w-xl mx-auto animate-in fade-in">
            <div className="bg-white p-5 rounded-2xl border shadow-sm space-y-5">
              <h2 className="text-sm font-black flex items-center justify-between text-slate-800 uppercase tracking-tight">
                <div className="flex items-center gap-2"><Plus className="w-4 h-4 text-blue-600"/> ขอเบิกเงินสด (ADV)</div>
                <span className="text-[8px] text-blue-400 normal-case font-black opacity-60">เบิกหลายโปรเจกต์ได้ในใบเดียว</span>
              </h2>
              <div className="space-y-4">
                <select className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm font-bold" value={newReq.employeeName} onChange={e => {
                  const emp = e.target.value;
                  const accounts = employeeBankAccounts[emp] || [];
                  setNewReq({...newReq, employeeName: emp, bankAccount: accounts.find(a => a.isDefault) || accounts[0] });
                }}>
                  <option value="">-- พนักงานผู้ขอเบิก --</option>{dynamicEmployees.map(e => <option key={e} value={e}>{e}</option>)}
                </select>

                {newReq.employeeName && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ข้อมูลบัญชีสำหรับการโอนเงิน</label>
                      <button onClick={() => { setBankEmp(newReq.employeeName); setShowAddBankModal(true); setTempBank({ id: '', bankName: '', accountNumber: '', accountName: '', isDefault: false }); }} className="text-[9px] font-bold text-blue-600 uppercase hover:underline">+ เพิ่มบัญชีใหม่</button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {(employeeBankAccounts[newReq.employeeName] || []).length > 0 ? (
                        <select 
                          className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-xs font-bold" 
                          value={newReq.bankAccount?.id || ''}
                          onChange={e => {
                            const accounts = employeeBankAccounts[newReq.employeeName] || [];
                            const selected = accounts.find(a => a.id === e.target.value);
                            setNewReq({ ...newReq, bankAccount: selected });
                          }}
                        >
                          <option value="">-- เลือกบัญชีรับเงิน --</option>
                          {(employeeBankAccounts[newReq.employeeName] || []).map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.bankName} - {acc.accountNumber} ({acc.accountName})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center justify-between">
                          <p className="text-[10px] text-amber-700 font-bold">ยังไม่มีข้อมูลบัญชีธนาคารมาตรฐาน</p>
                        </div>
                      )}
                      
                      {newReq.bankAccount && (
                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl relative">
                           <p className="text-[10px] font-black text-blue-700 uppercase leading-none mb-1">{newReq.bankAccount.bankName}</p>
                           <p className="text-[11px] font-black text-slate-800">{newReq.bankAccount.accountNumber}</p>
                           <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">{newReq.bankAccount.accountName}</p>
                           <div className="absolute top-2 right-2">
                             <CheckCircle2 className="w-4 h-4 text-blue-500" />
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                   <div className="space-y-1.5 relative">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">เลือกโปรเจกต์ ({newReq.projectIds.length} เลือกแล้ว)</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-3.5 h-3.5" />
                        <input 
                          type="text"
                          placeholder="พิมพ์ชื่อโปรเจกต์เพื่อค้นหา..." 
                          value={projSearch}
                          onChange={e => { setProjSearch(e.target.value); setShowReqProjList(true); }}
                          onFocus={() => setShowReqProjList(true)}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-xs font-black outline-none focus:ring-2 ring-blue-500/10 transition-all"
                        />
                        <button 
                          onClick={() => setShowReqProjList(!showReqProjList)}
                          className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-blue-500 transition-transform ${showReqProjList ? 'rotate-180' : ''}`}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>

                      {showReqProjList && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowReqProjList(false)} />
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1">
                            {dynamicProjects
                              .filter(p => !projSearch || p.toLowerCase().includes(projSearch.toLowerCase()))
                              .map(p => {
                                const isSelected = newReq.projectIds.includes(p);
                                return (
                                  <div 
                                    key={p}
                                    onClick={() => {
                                      const next = isSelected 
                                        ? newReq.projectIds.filter(x => x !== p)
                                        : [...newReq.projectIds, p];
                                      setNewReq({ ...newReq, projectIds: next });
                                    }}
                                    className={`px-4 py-2.5 hover:bg-blue-50 cursor-pointer transition-colors border-b border-slate-50 last:border-none flex items-center justify-between ${isSelected ? 'bg-blue-50/50' : ''}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                                        {isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                                      </div>
                                      <span className={`text-[11px] font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{p}</span>
                                    </div>
                                  </div>
                                );
                              })
                            }
                            {dynamicProjects.filter(p => !projSearch || p.toLowerCase().includes(projSearch.toLowerCase())).length === 0 && (
                              <div className="px-4 py-4 text-center italic text-slate-300 text-[10px] font-bold">ไม่พบโปรเจกต์</div>
                            )}
                          </div>
                        </>
                      )}
                      
                      {newReq.projectIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {newReq.projectIds.map(p => (
                            <div key={p} className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase flex items-center gap-1.5 animate-in zoom-in border border-blue-200">
                               <span>{p}</span>
                               <button onClick={() => setNewReq({ ...newReq, projectIds: newReq.projectIds.filter(x => x !== p) })} className="hover:text-blue-900"><X className="w-2.5 h-2.5" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                   </div>
                </div>

                <div className="space-y-3">
                  {newReq.items.map((it, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-xl border space-y-2 relative">
                      <div className="grid grid-cols-1 gap-2">
                        <select className="bg-white border rounded-lg px-2 py-1.5 text-[10px] font-bold" value={it.category} onChange={e => { const ni = [...newReq.items]; ni[idx].category = e.target.value; setNewReq({...newReq, items: ni}); }}><option value="">-- หมวดหมู่ค่าใช้จ่าย --</option>{dynamicCategories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                      </div>
                      <div className="flex gap-2">
                        <input className="flex-1 bg-white border rounded-lg px-3 py-1.5 text-[11px]" placeholder="ระบุรายการ..." value={it.name} onChange={e => { const ni = [...newReq.items]; ni[idx].name = e.target.value; setNewReq({...newReq, items: ni}); }} />
                        <input type="number" className="w-20 bg-white border rounded-lg px-2 py-1.5 text-xs font-black text-right" value={it.amount || ''} onChange={e => { const ni = [...newReq.items]; ni[idx].amount = Number(e.target.value); setNewReq({...newReq, items: ni}); }} />
                        {newReq.items.length > 1 && <button onClick={() => setNewReq({...newReq, items: newReq.items.filter((_, i) => i !== idx)})} className="text-rose-400 px-2"><Trash2 className="w-4 h-4"/></button>}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setNewReq({...newReq, items: [...newReq.items, {name:'', amount:0, category: ''}]})} className="w-full py-1.5 text-blue-600 font-bold text-[9px] uppercase border border-dashed border-blue-100 rounded-xl">+ เพิ่มแถว</button>
                </div>
                <button onClick={handleRequestSubmit} disabled={isBusy} className="w-full bg-[#0F172A] text-white py-3 rounded-xl font-black shadow-lg uppercase text-xs active:scale-95 transition-all">ส่งคำขอเบิกเงิน</button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Clearance */}
        {activeTab === 'clearance' && (
          <div className="max-w-xl mx-auto animate-in fade-in">
            <div className="bg-white p-5 rounded-2xl border shadow-sm space-y-5">
              <h2 className="text-sm font-black flex items-center gap-2 text-amber-600 uppercase"><Wallet className="w-4 h-4" /> เคลียร์ยอดใช้จ่าย (Settlement)</h2>
              <div className="space-y-1.5 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-3.5 h-3.5" />
                  <input 
                    type="text"
                    placeholder="พิมพ์เลขที่ ADV หรือชื่อพนักงานเพื่อค้นหา..." 
                    value={clrAdvSearch || (approvedAdvances.find(a => a.advanceId === clrForm.advanceId)?.advanceId || clrForm.advanceId)}
                    onChange={e => {
                      setClrAdvSearch(e.target.value);
                      setShowAdvList(true);
                      if (!e.target.value) setClrForm({...clrForm, advanceId: ''});
                    }}
                    onFocus={() => {
                      const current = approvedAdvances.find(a => a.advanceId === clrForm.advanceId);
                      if (current) setClrAdvSearch(current.advanceId);
                      setShowAdvList(true);
                    }}
                    className="w-full bg-slate-50 border-none rounded-xl pl-9 pr-14 py-2.5 text-xs font-black outline-none focus:ring-2 ring-amber-500/10"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {clrAdvSearch && (
                      <button 
                        onClick={() => { setClrAdvSearch(''); setClrForm({...clrForm, advanceId: ''}); setShowAdvList(false); }}
                        className="text-slate-300 hover:text-slate-500 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button 
                      onClick={() => setShowAdvList(!showAdvList)}
                      className={`text-slate-300 hover:text-amber-500 p-1 transition-transform ${showAdvList ? 'rotate-180' : ''}`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {showAdvList && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowAdvList(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-1">
                      {approvedAdvances
                        .filter(a => 
                          !clrAdvSearch ||
                          a.advanceId.toLowerCase().includes(clrAdvSearch.toLowerCase()) || 
                          a.employeeName.toLowerCase().includes(clrAdvSearch.toLowerCase())
                        )
                        .map(a => (
                          <div 
                            key={a.id}
                            onClick={() => {
                              setClrForm({...clrForm, advanceId: a.advanceId});
                              setClrAdvSearch(''); 
                              setShowAdvList(false);
                            }}
                            className="px-4 py-2.5 hover:bg-amber-50 cursor-pointer transition-colors border-b border-slate-50 last:border-none"
                          >
                            <div className="text-[10px] font-black text-amber-600 leading-none">{a.advanceId}</div>
                            <div className="text-[11px] font-bold text-slate-700 mt-1">{a.employeeName}</div>
                          </div>
                        ))
                      }
                      {approvedAdvances.filter(a => 
                        !clrAdvSearch ||
                        a.advanceId.toLowerCase().includes(clrAdvSearch.toLowerCase()) || 
                        a.employeeName.toLowerCase().includes(clrAdvSearch.toLowerCase())
                      ).length === 0 && (
                        <div className="px-4 py-4 text-center italic text-slate-300 text-[10px] font-bold">ไม่บพรายการที่ค้นหา</div>
                      )}
                    </div>
                  </>
                )}

                {clrForm.advanceId && !clrAdvSearch && (
                  <div className="px-3 py-1 bg-amber-50 text-amber-700 text-[9px] font-black rounded-lg inline-flex items-center gap-1.5 mt-1.5 animate-in zoom-in">
                    <CheckCircle2 className="w-3 h-3" /> Selected: {clrForm.advanceId}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                 {clrForm.receipts.map((r, i) => (
                  <div key={i} className="bg-slate-50 p-3 rounded-xl border space-y-3 relative">
                    <div className="flex gap-2">
                      <label className={`flex-1 border-2 border-dashed rounded-xl py-2 text-[10px] font-black flex items-center justify-center gap-2 cursor-pointer transition-all ${r.base64 ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-400'}`}>
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFile(i, e.target.files ? e.target.files[0] : null)} />
                        {r.isProcessing ? <Loader2 className="w-3 h-3 animate-spin"/> : <ImageIcon className="w-3 h-3" />} {r.fileName ? `✓ ${r.fileName}` : 'แนบรูปภาพ'}
                      </label>
                      {clrForm.receipts.length > 1 && <button onClick={() => setClrForm({...clrForm, receipts: clrForm.receipts.filter((_, idx) => idx !== i)})} className="text-rose-400 px-2"><Trash2 className="w-4 h-4"/></button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <input 
                          type="text"
                          className="w-full bg-white border rounded-lg pl-2 pr-7 py-1.5 text-[10px] font-bold outline-none focus:ring-1 ring-blue-500/20" 
                          placeholder="เลือกหรือพิมพ์ชื่อโปรเจกต์..."
                          value={clrProjSearchIdx === i ? clrProjSearchTerm : r.projectId} 
                          onFocus={() => {
                            setClrProjSearchIdx(i);
                            setClrProjSearchTerm(r.projectId);
                          }}
                          onChange={e => { 
                            setClrProjSearchTerm(e.target.value);
                            const nr = [...clrForm.receipts]; 
                            nr[i].projectId = e.target.value; 
                            setClrForm({...clrForm, receipts: nr}); 
                          }} 
                        />
                        <button 
                          onClick={() => {
                            if (clrProjSearchIdx === i) {
                              setClrProjSearchIdx(null);
                              setClrProjSearchTerm('');
                            } else {
                              setClrProjSearchIdx(i);
                              setClrProjSearchTerm(r.projectId);
                            }
                          }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-blue-500 transition-transform"
                        >
                          <ChevronDown className={`w-3 h-3 ${clrProjSearchIdx === i ? 'rotate-180' : ''}`} />
                        </button>
                        {clrProjSearchIdx === i && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-32 overflow-y-auto animate-in fade-in slide-in-from-top-1">
                            {dynamicProjects
                              .filter(p => !clrProjSearchTerm || p.toLowerCase().includes(clrProjSearchTerm.toLowerCase()))
                              .map(p => {
                                const isRequested = selectedAdvData?.projectIds?.includes(p);
                                return (
                                  <div 
                                    key={p}
                                    onClick={() => {
                                      const nr = [...clrForm.receipts]; 
                                      nr[i].projectId = p; 
                                      setClrForm({...clrForm, receipts: nr}); 
                                      setClrProjSearchIdx(null);
                                      setClrProjSearchTerm('');
                                    }}
                                    className="px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-[10px] font-bold text-slate-700 border-b border-slate-50 last:border-none flex items-center justify-between transition-colors"
                                  >
                                    <span className="truncate">{p}</span>
                                    {isRequested && <Zap className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />}
                                  </div>
                                );
                              })
                            }
                            {dynamicProjects.filter(p => !clrProjSearchTerm || p.toLowerCase().includes(clrProjSearchTerm.toLowerCase())).length === 0 && (
                              <div className="px-3 py-2 text-center italic text-slate-300 text-[9px] font-bold">ไม่พบโปรเจกต์</div>
                            )}
                          </div>
                        )}
                        {clrProjSearchIdx === i && (
                          <div className="fixed inset-0 z-40" onClick={() => { setClrProjSearchIdx(null); setClrProjSearchTerm(''); }} />
                        )}
                      </div>
                      <input className="bg-white border rounded-lg px-2 py-1.5 text-[10px]" placeholder="รายละเอียดสั้นๆ" value={r.description} onChange={e => { const nr = [...clrForm.receipts]; nr[i].description = e.target.value; setClrForm({...clrForm, receipts: nr}); }} />
                    </div>
                    
                    {/* Additional Docs Section */}
                    <div className="pt-1.5 border-t border-slate-100 flex flex-wrap gap-2 items-center">
                       <label className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[8px] font-black text-slate-500 cursor-pointer hover:border-blue-300 hover:text-blue-600 transition-all">
                          <input type="file" className="hidden" multiple onChange={(e) => {
                            if (e.target.files) {
                              Array.from(e.target.files).forEach((f: any) => handleAdditionalFile(i, f as File));
                            }
                          }} />
                          <Paperclip className="w-2.5 h-2.5" /> แนบเอกสารเพิ่ม
                       </label>
                       
                       {(r.additionalDocs || []).map((doc, dIdx) => (
                         <div key={dIdx} className="group relative">
                            <div className="flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-lg border border-blue-100 text-[8px] font-bold">
                               <FileText className="w-2.5 h-2.5" />
                               <span className="max-w-[60px] truncate">{doc.fileName}</span>
                               <button 
                                 onClick={() => {
                                   const nr = [...clrForm.receipts];
                                   nr[i].additionalDocs = nr[i].additionalDocs?.filter((_, idx) => idx !== dIdx);
                                   setClrForm({...clrForm, receipts: nr});
                                 }}
                                 className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                               >
                                 <X className="w-2.5 h-2.5 text-rose-400 hover:text-rose-600" />
                               </button>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                ))}
                <button onClick={() => setClrForm({...clrForm, receipts: [...clrForm.receipts, {name:'', amount:0, base64: '', fileName: '', isProcessing: false, projectId: '', description: '', originalAmount: 0, additionalDocs: []}]})} className="w-full py-1.5 text-blue-600 font-bold text-[9px] uppercase border border-dashed border-blue-100 rounded-xl">+ เพิ่มสลิป</button>
              </div>
              <button onClick={runAI} disabled={isBusy || !clrForm.advanceId || clrForm.receipts.every(r => !r.base64)} className="w-full bg-[#0F172A] text-white py-3 rounded-xl font-black shadow-lg uppercase text-xs tracking-widest flex items-center justify-center gap-2 active:scale-95 disabled:opacity-30">
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin"/> : <ScanLine className="w-4 h-4"/>} สแกน AI และสรุปยอด
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: History */}
        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-end px-1">
              <div>
                <h2 className="text-2xl font-black tracking-tighter text-slate-900 uppercase leading-none">รายการเบิก</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">รายการเบิกทั้งหมด</p>
              </div>
              <p className="text-[10px] text-slate-900 font-black px-2 py-1 bg-slate-100 rounded-lg">{historyList.length} Entries</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                  <input type="text" className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-4 py-3.5 text-xs font-bold outline-none placeholder:text-slate-300" placeholder="Search by ID or Employee..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={exportToCSV} className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all border border-emerald-100 shadow-sm active:scale-95">
                  <FileText className="w-4 h-4" /> Export CSV
                </button>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">ชื่อผู้เบิก</label>
                  <select className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-[10px] font-bold outline-none" value={historyFilters.employee} onChange={e => setHistoryFilters({...historyFilters, employee: e.target.value})}>
                    <option value="all">All Staff</option>
                    {dynamicEmployees.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Project</label>
                  <select className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-[10px] font-bold outline-none" value={historyFilters.project} onChange={e => setHistoryFilters({...historyFilters, project: e.target.value})}>
                    <option value="all">All Projects</option>
                    {dynamicProjects.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Status</label>
                  <select className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-[10px] font-bold outline-none" value={historyFilters.status} onChange={e => setHistoryFilters({...historyFilters, status: e.target.value})}>
                    <option value="all">All States</option>
                    <option value="pending">Pending Admin</option>
                    <option value="waiting">waiting</option>
                    <option value="approved">Approved / Open</option>
                    <option value="cleared">Settled</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Accounting Status</label>
                  <select className="w-full bg-slate-50 border-none rounded-xl px-3 py-2 text-[10px] font-bold outline-none" value={historyFilters.accountingStatus} onChange={e => setHistoryFilters({...historyFilters, accountingStatus: e.target.value})}>
                    <option value="all">ทั้งหมด (All)</option>
                    <option value="balanced">ยอดพอดี (Balanced)</option>
                    <option value="refund">ยอดต้องคืน (Employee Refund)</option>
                    <option value="extra">ยอดต้องจ่ายเพิ่ม (Company Payout)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Time Range</label>
                  <div className="flex gap-1">
                    <input type="date" className="bg-slate-50 border-none rounded-xl px-2 py-2 text-[9px] font-bold outline-none flex-1" value={historyFilters.startDate} onChange={e => setHistoryFilters({...historyFilters, startDate: e.target.value})} />
                    <input type="date" className="bg-slate-50 border-none rounded-xl px-2 py-2 text-[9px] font-bold outline-none flex-1" value={historyFilters.endDate} onChange={e => setHistoryFilters({...historyFilters, endDate: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
              {historyList.map(item => {
                const hasDupe = (item.receipts || []).some(r => r.isDuplicate);
                const hasEdit = (item.receipts || []).some(r => r.isEdited);
                return (
                  <div 
                    key={item.id} 
                    onClick={() => {
                      if (selectedHistItems.length > 0) {
                        setSelectedHistItems(prev => prev.includes(item.id!) ? prev.filter(id => id !== item.id) : [...prev, item.id!]);
                      } else {
                        setSelectedWithdrawal(item);
                      }
                    }} 
                    className={`group bg-white p-5 rounded-[2rem] border transition-all hover:shadow-xl hover:-translate-y-1 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px] active:scale-95 ${
                      selectedHistItems.includes(item.id!) ? 'border-blue-500 ring-4 ring-blue-500/10 bg-blue-50/10 shadow-lg scale-[1.02]' : 'border-slate-100 shadow-sm'
                    }`}
                  >
                    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                       <input 
                         type="checkbox" 
                         checked={selectedHistItems.includes(item.id!)}
                         onChange={(e) => {
                            e.stopPropagation();
                            setSelectedHistItems(prev => e.target.checked ? [...prev, item.id!] : prev.filter(id => id !== item.id));
                         }}
                         className="w-5 h-5 rounded-lg border-2 border-slate-200 text-blue-600 focus:ring-blue-500/20 transition-all cursor-pointer shadow-sm"
                       />
                    </div>
                    {item.clearanceStatus === 'cleared' && !selectedHistItems.includes(item.id!) && <div className="absolute top-0 right-0 p-1.5 bg-blue-600 text-white text-[7px] font-black uppercase rounded-bl-xl tracking-tighter">SETTLED</div>}
                    {item.accountStatus === 'closed' && !selectedHistItems.includes(item.id!) && (
                      <div className="absolute top-0 right-[50px] p-1.5 bg-emerald-600 text-white text-[7px] font-black uppercase rounded-bl-xl tracking-tighter">CLOSED</div>
                    )}
                    {(hasDupe || hasEdit) && <div className="absolute top-4 right-4 text-rose-500 animate-pulse"><AlertTriangle className="w-4 h-4"/></div>}
                    <div>
                      <div className="mb-3"><StatusBadge item={item} /></div>
                      <h3 className="font-black text-sm text-slate-900 truncate leading-tight">{item.employeeName}</h3>
                      <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tight flex items-center gap-1">
                        {item.receipts && item.receipts.length > 0 
                          ? item.receipts.map(r => r.name || r.description).join(', ')
                          : item.items && item.items.length > 0
                            ? item.items.map(i => i.name).join(', ')
                            : 'ไม่มีรายละเอียดรายการ'}
                      </p>
                      <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mt-1 group-hover:text-blue-400 transition-colors">{item.advanceId}</p>
                      
                      {item.projectIds && item.projectIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.projectIds.map(p => (
                            <span key={p} className="text-[7px] font-black text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded uppercase border border-slate-100">{p}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-end">
                      <div>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Budget Alloc</p>
                        <p className="text-lg font-black text-slate-900 tracking-tighter leading-none">฿{item.totalAmount.toLocaleString()}</p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                         <p className={`text-[10px] font-black tracking-tighter ${item.balance < 0 ? 'text-rose-500' : 'text-blue-500'}`}>฿{item.balance.toLocaleString()}</p>
                         <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             setShowPassModal({ show: true, action: 'withdraw_delete', targetId: item.id || null, targetIds: [], type: 'accountant', receiptIndex: null, receiptIndices: [], nextDocStatus: '' });
                           }}
                           className="p-2 bg-rose-50 text-rose-400 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm group-hover:scale-110 active:scale-95"
                         >
                           <Trash2 className="w-3.5 h-3.5" />
                         </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedHistItems.length > 0 && (
              <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#0F172A] text-white px-8 py-4 rounded-[2.5rem] shadow-2xl flex items-center gap-8 z-50 animate-in slide-in-from-bottom-10 border border-white/10 backdrop-blur-xl w-[90%] max-w-lg">
                 <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Selection Active</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const allIds = historyList.map(h => h.id!);
                          const areAllSelected = allIds.every(id => selectedHistItems.includes(id));
                          if (areAllSelected) {
                            setSelectedHistItems(selectedHistItems.filter(id => !allIds.includes(id)));
                          } else {
                            setSelectedHistItems(Array.from(new Set([...selectedHistItems, ...allIds])));
                          }
                        }}
                        className="text-[8px] font-black underline opacity-50 hover:opacity-100 uppercase"
                      >
                        {historyList.every(h => selectedHistItems.includes(h.id!)) ? 'Deselect All' : 'Select All Visible'}
                      </button>
                    </div>
                    <span className="text-lg font-black tracking-tighter leading-none">{selectedHistItems.length} รายการ</span>
                 </div>
                 <div className="h-8 w-px bg-white/10" />
                 <div className="flex items-center gap-3">
                   {historyFilters.status === 'pending' && (
                     <button 
                       onClick={() => setShowPassModal({ show: true, action: 'approve', targetId: null, targetIds: selectedHistItems, type: 'executive', receiptIndex: null, receiptIndices: [], nextDocStatus: '' })}
                       className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                     >
                       Approve Selected
                     </button>
                   )}
                   <button 
                     onClick={() => {
                        setShowPassModal({ show: true, action: 'withdraw_delete', targetId: null, targetIds: selectedHistItems, type: 'accountant', receiptIndex: null, receiptIndices: [], nextDocStatus: '' });
                     }}
                     className="bg-rose-600 hover:bg-rose-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                   >
                     Delete Selected
                   </button>
                   <button 
                     onClick={() => setSelectedHistItems([])}
                     className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                   >
                     Cancel
                   </button>
                 </div>
              </div>
            )}
            {historyList.length === 0 && (
              <div className="py-20 text-center space-y-3 bg-white rounded-3xl border border-dashed border-slate-200">
                <Search className="w-10 h-10 text-slate-100 mx-auto" />
                <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No matching records found</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Weekly Report */}
        {activeTab === 'weekly' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-end px-1">
              <div>
                <h2 className="text-2xl font-black tracking-tighter text-slate-900 uppercase leading-none">Weekly Report</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pending Advances Overview</p>
              </div>
              <button 
                onClick={sendWeeklyReport}
                className="flex items-center gap-2 bg-[#06C755] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-95 transition-all shadow-md active:scale-95"
              >
                <Zap className="w-3 h-3 fill-current" /> Send to LINE
              </button>
            </div>

            <WeeklyReportUI 
              withdrawals={activeWithdrawals} 
              onClear={(advanceId) => {
                setClrForm({ ...clrForm, advanceId });
                setActiveTab('clearance');
              }} 
            />
          </div>
        )}
        {/* TAB 4: Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in pb-10">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 px-1">
              <div>
                <h2 className="text-2xl font-black tracking-tighter text-slate-900 uppercase leading-none">Global Dashboard</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Settled Expenses & Spends</p>
              </div>
              <select className="bg-[#0F172A] text-white border-none rounded-xl px-4 py-2 text-[10px] font-black uppercase shadow-lg" value={dashboardFilter} onChange={(e) => setDashboardFilter(e.target.value)}>
                <option value="all">-- ทั้งหมดทุกโปรเจกต์ --</option>{dynamicProjects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <div className="bg-[#0F172A] p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-blue-400 text-[9px] font-black uppercase tracking-widest mb-1">Total Requested (เบิกสะสม)</p>
                      <h4 className="text-3xl font-black tracking-tighter">฿{dashboardData.totalRequested.toLocaleString()}</h4>
                    </div>
                 </div>
                 <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-green-500 text-[9px] font-black uppercase tracking-widest mb-1">Total Cleared (เคลียร์แล้ว)</p>
                      <h4 className="text-3xl font-black tracking-tighter text-slate-800">฿{dashboardData.totalCleared.toLocaleString()}</h4>
                      {dashboardData.totalRequested > 0 && (
                        <div className="mt-2 text-[10px] font-bold text-slate-400">
                           Progress: {((dashboardData.totalCleared / dashboardData.totalRequested) * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                 </div>
                 <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-amber-500 text-[9px] font-black uppercase tracking-widest mb-1">Outstanding (คงค้าง)</p>
                      <h4 className="text-3xl font-black tracking-tighter text-slate-800">฿{dashboardData.totalBalance.toLocaleString()}</h4>
                      <p className="text-[10px] font-medium text-slate-400 mt-1 italic leading-none">เงินที่ยังไม่ได้เคลียร์สลิป</p>
                    </div>
                 </div>
              </div>

              <div className="md:col-span-2 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-5">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5"/> รายละเอียดตามโปรเจกต์</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-slate-400 uppercase tracking-widest border-b border-slate-50 text-left">
                        <th className="pb-3 px-2 font-black">Project</th>
                        <th className="pb-3 px-2 font-black text-right">Requested</th>
                        <th className="pb-3 px-2 font-black text-right">Cleared</th>
                        <th className="pb-3 px-2 font-black text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {dashboardData.projectStats.map(ps => (
                         <tr key={ps.name} className="hover:bg-slate-50 transition-colors">
                           <td className="py-4 px-2 font-black text-slate-800">{ps.name}</td>
                           <td className="py-4 px-2 text-right font-bold text-slate-500">฿{ps.requested.toLocaleString()}</td>
                           <td className="py-4 px-2 text-right font-bold text-green-600">฿{ps.cleared.toLocaleString()}</td>
                           <td className="py-4 px-2 text-right font-black text-slate-900">฿{ps.balance.toLocaleString()}</td>
                         </tr>
                      ))}
                      {dashboardData.projectStats.length === 0 && (
                        <tr><td colSpan={4} className="py-10 text-center italic text-slate-300 font-bold">No data found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Tags className="w-3 h-3"/> Category Breakdown</h3>
                <div className="space-y-3">
                  {dashboardData.categoryStats.map(cs => {
                    const pct = (cs.amount / (dashboardData.totalRequested || 1)) * 100;
                    return (
                      <div key={cs.name} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span className="text-slate-600 truncate mr-2">{cs.name}</span>
                          <span className="text-slate-900 flex-shrink-0">฿{cs.amount.toLocaleString()} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                  {dashboardData.categoryStats.length === 0 && <p className="text-[9px] text-slate-300 font-bold italic">No category data</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><User className="w-3 h-3"/> Top Spenders (Staff Request)</h3>
                <div className="space-y-4">
                  {dashboardData.topSpenders.map((s, i) => (
                    <div key={s.name} className="flex justify-between items-center group">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-slate-100 group-hover:text-blue-50 transition-colors">0{i+1}</span>
                        <span className="text-[11px] font-bold text-slate-700">{s.name}</span>
                      </div>
                      <span className="text-xs font-black text-slate-900 tracking-tight">฿{s.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4 overflow-hidden">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Settled Receipts</h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {dashboardData.list.slice(0, 15).map((r, i) => (
                    <div key={i} className="flex justify-between items-center border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="text-[11px] font-black text-slate-900 truncate leading-tight uppercase">{r.name || r.description}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1.5 mt-1">
                           <span className="text-blue-500 font-black">{r.projectId}</span> 
                           <span className="opacity-30">•</span> 
                           <User className="w-2.5 h-2.5" /> {r.employee}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-black text-blue-600 tracking-tight">฿{r.amount.toLocaleString()}</p>
                        <p className="text-[7px] font-bold text-slate-300 uppercase">{new Date(r.date).toLocaleDateString('th-TH')}</p>
                      </div>
                    </div>
                  ))}
                  {dashboardData.list.length === 0 && <p className="text-[9px] text-slate-300 font-bold italic py-10 text-center">No receipts settled yet</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Approvals */}
        {activeTab === 'approvals' && (
          <div className="space-y-4 animate-in fade-in">
             <div className="flex items-center gap-3 px-1"><div className="bg-amber-500 p-2.5 rounded-xl shadow-xl shadow-amber-500/20"><Lock className="w-5 h-5 text-white" /></div><h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Executive Queue</h2></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {withdrawals.filter(w => w.status === 'pending').map(item => (
                <div key={item.id} className="bg-white p-4 rounded-2xl border shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div><p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">{item.advanceId}</p><h3 className="font-bold text-sm text-slate-900 leading-tight">{item.employeeName}</h3></div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                    <div className="flex flex-col"><span className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Requested Sum</span><span className="text-base font-black text-slate-900 tracking-tighter">฿{item.totalAmount.toLocaleString()}</span></div>
                    <div className="flex gap-2 items-center">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPassModal({ show: true, action: 'withdraw_delete', targetId: item.id || null, targetIds: [], type: 'accountant', receiptIndex: null, receiptIndices: [], nextDocStatus: '' });
                        }}
                        className="p-1.5 text-rose-300 hover:text-rose-600 transition-colors"
                        title="ลบรายการ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setShowPassModal({ show: true, action: 'approve', targetId: item.id || null, targetIds: [], type: 'executive', receiptIndex: null, receiptIndices: [], nextDocStatus: '' }); }} className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-lg active:scale-95 transition-all"><CheckCircle2 className="w-5 h-5"/></button>
                      <button onClick={(e) => { e.stopPropagation(); setShowPassModal({ show: true, action: 'reject', targetId: item.id || null, targetIds: [], type: 'executive', receiptIndex: null, receiptIndices: [], nextDocStatus: '' }); }} className="bg-rose-50 text-rose-600 p-2.5 rounded-xl active:scale-95 transition-all"><XCircle className="w-5 h-5"/></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: Settings */}
        {activeTab === 'settings' && isSettingsAuthed && (
          <div className="space-y-6 animate-in slide-in-from-bottom-5 max-w-2xl mx-auto pb-10">
             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase leading-none">Staff Roster</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manage Authorized Employees</p>
                </div>
              </div>

              <div className="flex gap-2">
                <input type="text" className="flex-1 bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-sm font-bold placeholder:text-slate-300 outline-none focus:ring-2 ring-blue-500/20" placeholder="Full name..." value={newEmployeeName} onChange={e => setNewEmployeeName(e.target.value)} />
                <button onClick={addEmployee} className="bg-[#0F172A] text-white px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Add Staff</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
                {dynamicEmployees.map((emp, i) => (
                  <div key={i} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-50 hover:border-slate-200 transition-all">
                    <span className="text-[11px] font-bold text-slate-600">{emp}</span>
                    <button onClick={() => removeEmployee(emp)} className="text-slate-300 hover:text-rose-500 transition-colors p-1"><X className="w-4 h-4"/></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-800 uppercase leading-none">Projects</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manage Active Projects ({dynamicProjects.length})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedProjectItems.length > 0 && (
                      <button 
                        onClick={async () => {
                          if (confirm(`คุณกำลังจะลบ ${selectedProjectItems.length} โปรเจกต์ที่เลือก ยืนยันหรือไม่?\n(ข้อมูลรายการเบิกจะไม่ถูกลบ แต่ชื่อโปรเจกต์จะหายไปจากตัวเลือก)`)) {
                            const updated = dynamicProjects.filter(p => !selectedProjectItems.includes(p));
                            try {
                              setIsBusy(true);
                              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'projects'), { list: updated });
                              setSelectedProjectItems([]);
                            } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/projects'); }
                            finally { setIsBusy(false); }
                          }
                        }}
                        className="bg-rose-50 text-rose-500 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center gap-1.5 border border-rose-100"
                      >
                        <Trash2 className="w-3 h-3" /> Delete ({selectedProjectItems.length})
                      </button>
                    )}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-3.5 h-3.5" />
                      <input 
                        type="text" 
                        placeholder="Search Projects..." 
                        value={settingsProjSearch}
                        onChange={e => setSettingsProjSearch(e.target.value)}
                        className="bg-slate-50 border-none rounded-xl pl-9 pr-4 py-2 text-[10px] font-bold outline-none focus:ring-2 ring-blue-500/10 w-full sm:w-48"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <input type="text" className="flex-1 bg-slate-50 border-none rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 ring-blue-500/10" placeholder="New Project Name..." value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
                  <button onClick={addProject} className="bg-[#0F172A] text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all">Add</button>
                </div>
                
                <button onClick={resetToDefaultProjects} className="w-full py-2.5 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all border border-blue-100">Reset to Default List (46 Projects)</button>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar pb-10">
                  {dynamicProjects.filter(p => !settingsProjSearch || p.toLowerCase().includes(settingsProjSearch.toLowerCase())).map((p, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedProjectItems(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                      className={`flex justify-between items-center px-4 py-3 rounded-2xl text-[10px] font-bold transition-all cursor-pointer border ${
                        selectedProjectItems.includes(p) 
                        ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' 
                        : 'bg-slate-50/50 hover:bg-slate-50 text-slate-600 border-transparent hover:border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selectedProjectItems.includes(p) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-200'}`}>
                          {selectedProjectItems.includes(p) && <CheckCircle2 className="w-3 h-3" />}
                        </div>
                        <span className="truncate">{p}</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeProject(p); }} 
                        className={`transition-colors p-1 ${selectedProjectItems.includes(p) ? 'text-blue-400 hover:text-rose-500' : 'text-slate-300 hover:text-rose-500'}`}
                      >
                        <X className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center shadow-sm">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800 uppercase leading-none">Categories</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Expense Categories</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input type="text" className="flex-1 bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none" placeholder="Category Name..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} />
                  <button onClick={addCategory} className="bg-[#0F172A] text-white px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest">Add</button>
                </div>
                <div className="space-y-2 max-h-[20vh] overflow-y-auto pr-1">
                  {dynamicCategories.map((c, i) => (
                    <div key={i} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-xl text-[10px] font-bold text-slate-600">
                      <span>{c}</span>
                      <button onClick={() => removeCategory(c)} className="text-slate-300 hover:text-rose-500"><X className="w-3.5 h-3.5"/></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
               <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase leading-none">System Usage & Costs</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time Service Monitoring</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gemini AI (OCR)</p>
                    <Zap className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <p className="text-3xl font-black text-slate-900">{aiUsage.ocrCount.toLocaleString()} <span className="text-xs text-slate-400">Reqs</span></p>
                  <p className="text-[10px] font-bold text-indigo-600 mt-1">Model: 1.5 Flash (฿{estimatedCost.toFixed(3)})</p>
                  <div className="mt-3 h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${Math.min((aiUsage.ocrCount / 1500) * 100, 100)}%` }}></div>
                  </div>
                  <p className="text-[8px] text-slate-400 mt-1 uppercase font-bold">Quota: {aiUsage.ocrCount}/1,500 (Free Tier)</p>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">GCP Compute & Storage</p>
                    <ServerIcon className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-[10px] font-bold mb-1">
                        <span className="text-slate-600">Cloud Run Traffic</span>
                        <span className="text-blue-600">{aiUsage.requestCount || 0}/2M</span>
                      </div>
                      <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${Math.min(((aiUsage.requestCount || 0) / 2000000) * 100, 100)}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-bold mb-1">
                        <span className="text-slate-600">LINE Messages</span>
                        <span className="text-emerald-600">{aiUsage.lineCount || 0}/200</span>
                      </div>
                      <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(((aiUsage.lineCount || 0) / 200) * 100, 100)}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[7px] text-slate-400 mt-2 uppercase font-bold leading-tight">
                    *โควตา LINE 200 ข้อความ รวมทุกการส่งในระบบและนอกระบบ (เช่น บรอดแคสต์ผ่าน LINE Manager) <br/>
                    หากคุณได้รับข้อความ "Monthly limit reached" แสดงว่าโควตาเดือนนี้เต็มจริงบน LINE OA ครับ
                  </p>
                  <p className="text-[7px] text-blue-400 mt-1 uppercase font-bold leading-tight">
                    *ยอด 200+ บาท ตัวอย่าง GCP อาจมาจาก Artifact Registry (ค่าเก็บไฟล์ Image) <br/>
                    กรุณาลบ Version เก่าใน Google Cloud Console เพื่อประหยัดค่าใช้จ่าย
                  </p>
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <p className="text-[10px] font-black text-amber-800 uppercase">เมื่อ API Key เกินลิมิต (Limit Reached):</p>
                </div>
                <ul className="text-[9px] text-amber-700 font-medium space-y-1 list-disc px-4">
                  <li><b>Gemini (AI):</b> หากโควตาฟรีหมด ระบบจะหยุด OCR ให้คุณกรอกข้อมูลร้านค้า/ยอดเงินเอง (ระบบไม่ล่ม)</li>
                  <li><b>LINE:</b> หากเกิน 200 ข้อความ/เดือน ระบบจะหยุดส่งแจ้งเตือน แต่บันทึกข้อมูลได้ปกติ</li>
                  <li><b>Cloud Run:</b> มีโควตา 2 ล้าน Request/เดือน (แอปนี้แทบจะไม่เสียเงินในส่วนนี้)</li>
                </ul>
              </div>

              <button onClick={resetAiUsage} className="w-full bg-white border border-slate-200 text-slate-400 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:text-rose-500 hover:border-rose-100 transition-all active:scale-95">Reset Metrics Counter</button>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
               <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase leading-none">Access Control</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Private PINS (Approver & Accounts)</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Approver (Admin)</label>
                  <input type="password" value={systemConfigs.execPin} onChange={e => setSystemConfigs({...systemConfigs, execPin: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-center text-xl font-black tracking-[0.4em] outline-none" placeholder="••••" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Accountant (Clearing)</label>
                  <input type="password" value={systemConfigs.accPin} onChange={e => setSystemConfigs({...systemConfigs, accPin: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-center text-xl font-black tracking-[0.4em] outline-none" placeholder="••••" />
                </div>
              </div>

              <button 
                disabled={isBusy}
                onClick={updatePasswords} 
                className="w-full bg-[#0F172A] text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isBusy ? 'Updating...' : 'Update Access Pins'}
              </button>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
               <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <ScanLine className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase leading-none">Integrations</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">External Services & Webhooks</p>
                </div>
              </div>

              {/* URL & Integrations */}
              <div className="space-y-4">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Web App URL (Shared App URL)</label>
                   <input 
                     type="text" 
                     className={`w-full ${!systemConfigs.webAppUrl ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-none'} border rounded-2xl px-5 py-3.5 text-xs font-bold font-mono outline-none transition-all`} 
                     placeholder="https://..." 
                     value={systemConfigs.webAppUrl || ''} 
                     onChange={e => setSystemConfigs({...systemConfigs, webAppUrl: e.target.value.trim()})} 
                   />
                   <div className="px-1 space-y-1">
                     <p className="text-[8px] text-slate-500 font-bold uppercase tracking-tight italic leading-relaxed">
                       * จำเป็นสำหรับปุ่มใน LINE! กรุณานำ URL จากปุ่ม "แชร์" (Shared App URL) มาใส่ที่นี่
                     </p>
                     {!systemConfigs.webAppUrl && (
                       <p className="text-[8px] text-rose-500 font-black uppercase flex items-center gap-1">
                         <AlertCircle className="w-2.5 h-2.5" /> ยังไม่ได้ระบุ URL - ปุ่มใน LINE จะใช้งานไม่ได้
                       </p>
                     )}
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Google Sheets Webhook (Apps Script)</label>
                   <input type="text" className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-xs font-bold font-mono outline-none" placeholder="https://script.google.com/macros/s/..." value={systemConfigs.sheetsUrl || ''} onChange={e => setSystemConfigs({...systemConfigs, sheetsUrl: e.target.value})} />
                </div>
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-[8px] font-bold text-blue-700 leading-relaxed">
                    💡 <span className="font-black">วิธีใช้งานสำหรับฝ่ายบัญชี:</span> ระบบจะแยกข้อมูลเข้า 2 แผ่นงานอัตโนมัติ คือ <span className="font-black">"Advances"</span> (เมื่ออนุมัติ) และ <span className="font-black">"Clearance"</span> (เมื่อเคลียร์ยอด) 
                    <br/>กรุณาสร้างแผ่นงาน Google Sheets ให้มีชื่อตรงกันทั้ง 2 หน้าก่อนนำ Webhook มาใส่
                  </p>
                </div>
                <button 
                  disabled={isBusy}
                  onClick={updatePasswords} 
                  className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isBusy ? 'Saving...' : 'Save Sync Settings'}
                </button>
              </div>

              <div className="border-t border-slate-50 pt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[11px] font-black text-slate-900 uppercase">LINE Messaging Bot (API)</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">สถานะ: ระบบรองรับ Flex Message & Postback</p>
                  </div>
                  <button onClick={() => {
                    const flex = buildStatusFlex("🧪 Test System", "การแจ้งเตือนผ่าน LINE Bot ทำงานปกติ!", "#0F172A", "✅");
                    notifyLine("Test Connection", 'flex', flex);
                  }} className="bg-white border border-slate-200 text-slate-900 px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-100 active:scale-95 transition-all shadow-sm">Test Bot</button>
                </div>

                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3">
                  <p className="text-[8px] font-bold text-emerald-800 leading-relaxed">
                    ⚙️ <span className="font-black">ขั้นตอนการเชื่อมต่อ LINE BOT:</span>
                    <br/>1. นำ Webhook URL ด้านล่างไปใส่ใน LINE Developers Console
                    <br/>2. ตั้งค่า Environment Variables: <span className="font-mono bg-white/50 px-1">LINE_CHANNEL_ACCESS_TOKEN</span> และ <span className="font-mono bg-white/50 px-1">LINE_DESTINATION_ID</span>
                    <br/>3. ตั้งค่า <span className="font-mono bg-white/50 px-1">FIREBASE_SERVICE_ACCOUNT</span> เพื่อกดอนุมัติผ่าน LINE ได้ทันที
                  </p>
                  <div className="bg-white/80 p-2 rounded-lg border border-emerald-200">
                    <p className="text-[8px] font-black text-emerald-600 uppercase mb-1">Your Webhook URL:</p>
                    <code className="text-[9px] font-bold text-slate-700 break-all select-all">{(systemConfigs.webAppUrl || window.location.origin).replace(/\/$/, '')}/api/line-webhook</code>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-emerald-500" /> บัญชีธนาคารมาตรฐาน (Requester Accounts)
                    </h3>
                    <div className="space-y-4">
                      {dynamicEmployees.map(emp => (
                        <div key={emp} className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">{emp}</label>
                          <div className="grid grid-cols-1 gap-2">
                            {(employeeBankAccounts[emp] || []).map(acc => (
                              <div key={acc.id} className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between shadow-sm">
                                <div>
                                  <p className="text-[10px] font-black text-slate-800 uppercase">{acc.bankName} - {acc.accountNumber}</p>
                                  <p className="text-[9px] font-bold text-slate-400">{acc.accountName}</p>
                                </div>
                                <button 
                                  onClick={async () => {
                                    if (!confirm(`ลบบัญชีของ ${emp} ใช่หรือไม่?`)) return;
                                    const updated = (employeeBankAccounts[emp] || []).filter(a => a.id !== acc.id);
                                    try {
                                      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'bank_accounts'), {
                                        ...employeeBankAccounts,
                                        [emp]: updated
                                      });
                                    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/bank_accounts'); }
                                  }}
                                  className="w-8 h-8 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                ><X className="w-4 h-4" /></button>
                              </div>
                            ))}
                            <button 
                              onClick={() => {
                                setBankEmp(emp);
                                setShowAddBankModal(true);
                                setTempBank({ id: '', bankName: '', accountNumber: '', accountName: '', isDefault: true });
                              }}
                              className="w-full py-2 bg-white border border-dashed border-slate-200 rounded-xl text-[9px] font-black text-slate-400 uppercase hover:border-emerald-200 hover:text-emerald-500 transition-all active:scale-95"
                            >+ เพิ่มบัญชีสำหรับ {emp}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center justify-between">
                      Authorized Approvers (รายชื่อผู้อนุมัติ)
                      <span className="text-[8px] font-bold text-blue-500 normal-case italic hover:underline cursor-pointer" onClick={() => alert("LINE User ID คือรหัสเฉพาะตัว (U...) สามารถหาได้โดยพิมพ์ 'id' ในแชทบอท\nและควรตั้งชื่อเล่นเพื่อให้จำง่ายว่าใครเป็นคนอนุมัติ")}>คืออะไร?</span>
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          className="flex-[2] bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-[10px] font-bold font-mono outline-none" 
                          placeholder="LINE User ID (U...)" 
                          value={newLineId}
                          onChange={e => setNewLineId(e.target.value.trim())}
                        />
                        <input 
                          type="text" 
                          className="flex-1 bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-[10px] font-bold outline-none" 
                          placeholder="ชื่อเล่น/ตำแหน่ง" 
                          value={newApproverName}
                          onChange={e => setNewApproverName(e.target.value)}
                        />
                        <button 
                          onClick={() => {
                            if (newLineId.trim() && newApproverName.trim()) {
                              const current = systemConfigs.approvers || [];
                              if (!current.some(a => a.lineId === newLineId.trim())) {
                                setSystemConfigs({
                                  ...systemConfigs, 
                                  approvers: [...current, { lineId: newLineId.trim(), name: newApproverName.trim() }]
                                });
                                setNewLineId('');
                                setNewApproverName('');
                              } else {
                                alert("ID นี้มีอยู่ในรายชื่อแล้ว");
                              }
                            } else {
                              alert("กรุณากรอกทั้ง LINE ID และชื่อกำกับ");
                            }
                          }}
                          className="bg-slate-900 text-white px-5 rounded-2xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all shadow-lg"
                        >Add</button>
                      </div>
                      <p className="text-[8px] text-blue-500 font-bold px-1 italic uppercase">💡 วิธีหา ID: ให้ผู้อนุมัติพิมพ์คำว่า "id" ในช่องแชทหาบอท เพื่อดูรหัสของตัวเอง</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(systemConfigs.approvers || []).map(appr => (
                      <div key={appr.lineId} className="bg-white border border-slate-100 p-3 rounded-2xl flex items-center justify-between group animate-in fade-in slide-in-from-top-1 duration-300 shadow-sm">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{appr.name}</span>
                          <span className="text-[8px] font-bold font-mono text-slate-400">{appr.lineId.slice(0, 8)}...{appr.lineId.slice(-4)}</span>
                        </div>
                        <button 
                          onClick={() => setSystemConfigs({
                            ...systemConfigs, 
                            approvers: (systemConfigs.approvers || []).filter(a => a.lineId !== appr.lineId)
                          })}
                          className="w-8 h-8 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center transition-all hover:bg-rose-500 hover:text-white"
                        ><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    
                    {/* Legacy support display if still used */}
                    {(systemConfigs.allowedLineIds || []).map(id => (
                      <div key={id} className="bg-slate-50 border border-dashed border-slate-200 p-3 rounded-2xl flex items-center justify-between group shadow-sm opacity-60">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Legacy ID (No Name)</span>
                          <span className="text-[8px] font-bold font-mono text-slate-400">{id.slice(0, 8)}...{id.slice(-4)}</span>
                        </div>
                        <button 
                          onClick={() => setSystemConfigs({
                            ...systemConfigs, 
                            allowedLineIds: (systemConfigs.allowedLineIds || []).filter(i => i !== id)
                          })}
                          className="w-8 h-8 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"
                        ><X className="w-4 h-4" /></button>
                      </div>
                    ))}

                    {((systemConfigs.approvers || []).length === 0 && (systemConfigs.allowedLineIds || []).length === 0) && (
                      <div className="col-span-full py-6 bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center text-center px-4">
                        <UserPlus className="w-8 h-8 text-slate-200 mb-2" />
                        <p className="text-[9px] text-slate-400 italic font-bold uppercase tracking-widest">ยังไม่ได้ระบุรายชื่อผู้มีสิทธิ์สั่งการผ่านแชท</p>
                        <p className="text-[8px] text-slate-300 font-bold uppercase mt-1">เพิ่ม LINE ID เพื่อให้ระบบอนุญาตการสั่งงานจาก LINE กลุ่ม</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={sendDailySummary} className="bg-slate-900 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all">
                    <PieChart className="w-4 h-4" /> สรุปประจำวัน
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/check-overdue', { method: 'POST' });
                        const data = await res.json();
                        alert(data.message || `ตรวจสอบเรียบร้อย: พบ ${data.count || 0} รายการที่ใกล้กำหนด`);
                      } catch (e) {
                        alert("เกิดข้อผิดพลาดในการตรวจสอบ");
                      }
                    }} 
                    className="border-2 border-slate-900 text-slate-900 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <AlertTriangle className="w-4 h-4" /> เช็ครายการค้าง
                  </button>
                </div>
                <button onClick={sendWeeklyReport} className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
                  <Calendar className="w-4 h-4" /> ส่งสรุปรายงานประจำสัปดาห์ (Manual Trigger)
                </button>
              </div>
            </div>

            <button onClick={() => { setIsSettingsAuthed(false); setActiveTab('history'); }} className="w-full bg-slate-100 text-slate-400 py-4 rounded-[2rem] font-black text-[10px] uppercase tracking-widest border border-slate-200">Close Settings</button>
          </div>
        )}

      </main>

      {/* --- ALL MODALS --- */}
      {showAddBankModal && (
        <div className="fixed inset-0 bg-[#0F172A]/90 backdrop-blur-md z-[600] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h3 className="text-xl font-black mb-6 text-slate-900 uppercase flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> ข้อมูลบัญชี {bankEmp}
            </h3>
            <div className="space-y-4">
              <div className="space-y-1 px-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">ธนาคาร</label>
                <input autoFocus className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 ring-blue-100" placeholder="เช่น กสิกรไทย, ไทยพาณิชย์..." value={tempBank.bankName} onChange={e => setTempBank({...tempBank, bankName: e.target.value})} />
              </div>
              <div className="space-y-1 px-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">เลขที่บัญชี</label>
                <input className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 ring-blue-100" placeholder="000-0-00000-0" value={tempBank.accountNumber} onChange={e => setTempBank({...tempBank, accountNumber: e.target.value})} />
              </div>
              <div className="space-y-1 px-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">ชื่อบัญชี</label>
                <input className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 ring-blue-100" placeholder="ชื่อ-นามสกุล (ตรงกับสมุดบัญชี)" value={tempBank.accountName} onChange={e => setTempBank({...tempBank, accountName: e.target.value})} />
              </div>
              <div className="flex items-center gap-2 p-2">
                <input type="checkbox" id="save-standard" className="w-4 h-4 rounded-lg border-slate-300 text-blue-600 accent-blue-600" checked={tempBank.isDefault} onChange={e => setTempBank({...tempBank, isDefault: e.target.checked})} />
                <label htmlFor="save-standard" className="text-[10px] font-black text-slate-600 uppercase tracking-tight">ตั้งเป็นบัญชีมาตรฐาน (Default)</label>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowAddBankModal(false)} className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase">ยกเลิก</button>
              <button 
                onClick={async () => {
                  if (!tempBank.bankName || !tempBank.accountNumber || !tempBank.accountName) return alert("กรุณากรอกข้อมูลให้ครบถ้วน");
                  const newId = Math.random().toString(36).substring(2, 9);
                  const bankWithId = { ...tempBank, id: newId };
                  
                  // If we are in request tab, also set as selected bank
                  if (activeTab === 'request') {
                    setNewReq({ ...newReq, bankAccount: bankWithId });
                  }
                  
                  // If save as default requested (or coming from Settings always true)
                  if (tempBank.isDefault) {
                    const currentAccounts = employeeBankAccounts[bankEmp] || [];
                    const updated = [...currentAccounts, bankWithId];
                    try {
                      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'bank_accounts'), {
                        ...employeeBankAccounts,
                        [bankEmp]: updated
                      });
                    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/bank_accounts'); }
                  }
                  
                  setShowAddBankModal(false);
                }} 
                className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all"
              >บันทึก</button>
            </div>
          </div>
        </div>
      )}
      {showSettingsLogin && (
        <div className="fixed inset-0 bg-[#0F172A]/98 backdrop-blur-2xl z-[500] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl border-t-8 border-slate-900 animate-in zoom-in-95">
            <h3 className="text-2xl font-black mb-1 text-center text-slate-900 uppercase">Admin Access</h3>
            <input type="password" autoFocus value={settingsPassword} onChange={(e) => setSettingsPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSettingsLogin()} placeholder="••••••" className="w-full bg-slate-50 border-none rounded-xl px-6 py-5 text-center text-4xl tracking-[0.4em] outline-none mb-8 font-black" />
            <div className="flex gap-4">
              <button onClick={() => setShowSettingsLogin(false)} className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase">ยกเลิก</button>
              <button onClick={handleSettingsLogin} className="flex-1 bg-[#111827] text-white py-4 rounded-xl font-black text-[10px] uppercase shadow-xl">ยืนยัน</button>
            </div>
          </div>
        </div>
      )}


      {ocrModal.show && (
        <div className="fixed inset-0 bg-[#0F172A]/95 backdrop-blur-3xl z-[400] flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
             <h3 className="text-2xl font-black text-center text-slate-900 uppercase mb-6 flex items-center justify-center gap-3"><ScanLine className="text-blue-600"/> AI Result</h3>
             <div className="space-y-4 mb-8">
                {clrForm.receipts.map((r, i) => (
                  <div key={i} className={`p-4 rounded-3xl border transition-all ${r.isDuplicate ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-[9px] font-black uppercase text-slate-400 px-2 bg-white rounded-full border">{r.projectId || 'N/A'}</span>
                       {r.isDuplicate && (
                         <div className="bg-rose-500 text-white text-[8px] font-black py-0.5 px-2 rounded-full animate-pulse flex items-center gap-1">
                           <AlertTriangle className="w-2.5 h-2.5" /> 
                           ซ้ำกับ: {r.duplicateInfo?.project} ({r.duplicateInfo?.advanceId})
                         </div>
                       )}
                    </div>
                    <div className="flex gap-4">
                       {r.base64 ? (
                         <img src={r.base64} className="w-16 h-16 rounded-2xl object-cover border" alt="Receipt" />
                       ) : (
                         <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200">
                           <FileText className="w-8 h-8 text-slate-300" />
                         </div>
                       )}
                       <div className="flex-1 space-y-1">
                          <input className="w-full bg-transparent font-black text-sm text-slate-800 outline-none" value={r.name} onChange={e => { const nr = [...clrForm.receipts]; nr[i].name = e.target.value; setClrForm({...clrForm, receipts: detectDuplicates(nr, withdrawals)})}} />
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400">฿</span>
                            <input type="number" className={`bg-transparent font-black text-xl text-slate-900 outline-none w-28 ${Number(r.amount) !== Number(r.originalAmount) ? 'text-amber-600' : ''}`} value={r.amount || ''} onChange={e => { const nr = [...clrForm.receipts]; nr[i].amount = Number(e.target.value); setClrForm({...clrForm, receipts: detectDuplicates(nr, withdrawals)})}} />
                             {Number(r.amount) !== Number(r.originalAmount) && (
                               <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 text-[8px] font-black uppercase">
                                 <AlertTriangle className="w-2.5 h-2.5" /> แก้ไขแล้ว
                               </div>
                             )}
                          </div>
                       </div>
                    </div>
                  </div>
                ))}
             </div>
             <div className="border-t pt-6 flex justify-between items-center mb-8">
               <span className="font-black text-slate-400 uppercase text-xs">Total Items Spend</span>
               <span className="text-3xl font-black tracking-tighter">฿{clrForm.receipts.reduce((s, x) => s + Number(x.amount || 0), 0).toLocaleString()}</span>
             </div>
             <button onClick={saveClearance} className="w-full bg-[#0F172A] text-white py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-2xl active:scale-95 transition-all">บันทึกยอดเคลียร์</button>
             <button onClick={() => setOcrModal({ show: false, total: 0 })} className="w-full mt-2 text-slate-400 font-bold text-[10px] uppercase">ยกเลิกแล้วแก้ไข</button>
           </div>
        </div>
      )}

      {selectedWithdrawal && (
        <div className="fixed inset-0 bg-[#0F172A]/90 backdrop-blur-2xl z-[200] flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-2xl sm:rounded-[3rem] rounded-t-[3rem] p-6 sm:p-10 shadow-2xl animate-in slide-in-from-bottom-full duration-500 overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-start mb-8">
               <div className="space-y-1">
                 <StatusBadge item={selectedWithdrawal} />
                 <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{selectedWithdrawal.employeeName}</h3>
                 <p className="text-[11px] font-bold text-slate-500 uppercase tracking-tight flex items-center gap-1.5">
                    {selectedWithdrawal.receipts && selectedWithdrawal.receipts.length > 0 
                      ? selectedWithdrawal.receipts.map(r => r.name || r.description).join(', ')
                      : selectedWithdrawal.items && selectedWithdrawal.items.length > 0
                        ? selectedWithdrawal.items.map(i => i.name).join(', ')
                        : 'ไม่มีรายละเอียดรายการ'}
                 </p>
                 <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{selectedWithdrawal.advanceId}</p>
               </div>
               <div className="flex items-center gap-2">
                 <button 
                   onClick={() => {
                     setShowPassModal({ show: true, action: 'withdraw_delete', targetId: selectedWithdrawal.id || null, targetIds: [], type: 'accountant', receiptIndex: null, receiptIndices: [], nextDocStatus: '' });
                   }}
                   className="p-3 bg-rose-50 text-rose-500 rounded-full hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                   title="ลบรายการเบิก"
                 >
                   <Trash2 className="w-6 h-6" />
                 </button>
                 <button onClick={() => setSelectedWithdrawal(null)} className="p-3 bg-slate-100 rounded-full hover:bg-slate-200 transition-all"><X className="w-6 h-6" /></button>
               </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Budget</p>
                <p className="text-2xl font-black text-slate-900 leading-none">฿{selectedWithdrawal.totalAmount.toLocaleString()}</p>
              </div>
              <div className={`p-5 rounded-3xl border ${selectedWithdrawal.balance < 0 ? 'bg-rose-50 border-rose-100' : 'bg-blue-50 border-blue-100'}`}>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Balance</p>
                <p className={`text-2xl font-black leading-none ${selectedWithdrawal.balance < 0 ? 'text-rose-600' : 'text-blue-600'}`}>฿{selectedWithdrawal.balance.toLocaleString()}</p>
              </div>
              <div className="bg-white p-5 rounded-3xl border border-amber-100 col-span-2 sm:col-span-1 shadow-sm">
                <p className="text-[9px] font-black text-amber-600 uppercase mb-1 flex items-center gap-1"><Calendar className="w-2.5 h-2.5"/> Deadline</p>
                {selectedWithdrawal.status === 'approved' ? (
                  <div className="space-y-2">
                    <input 
                      type="date" 
                      className="w-full bg-slate-50 border-none rounded-lg px-2 py-1 text-[10px] font-bold outline-none" 
                      value={selectedWithdrawal.clearanceDeadline ? selectedWithdrawal.clearanceDeadline.split('T')[0] : ''} 
                      onChange={(e) => {
                        const date = new Date(e.target.value);
                        updateDeadline(date.toISOString());
                      }}
                    />
                    <p className="text-[7px] text-slate-400 font-bold uppercase text-center">Accountant can edit</p>
                  </div>
                ) : (
                  <p className="text-xl font-black text-slate-300 leading-none">WAIT APPROVE</p>
                )}
              </div>
            </div>
            
            {selectedWithdrawal.bankAccount && (
              <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 flex items-center gap-4 mb-4 animate-in slide-in-from-left-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-blue-200">
                  <Wallet className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h5 className="text-[9px] font-black text-blue-600 uppercase mb-0.5 tracking-widest">โอนเข้าบัญชี (Transfer To)</h5>
                  <p className="text-sm font-black text-slate-800 leading-tight">{selectedWithdrawal.bankAccount.bankName} - {selectedWithdrawal.bankAccount.accountNumber}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{selectedWithdrawal.bankAccount.accountName}</p>
                </div>
              </div>
            )}

            {selectedWithdrawal.status === 'approved' && (
              <div className="mb-8 p-6 bg-emerald-50 rounded-[2.5rem] border-2 border-dashed border-emerald-200">
                <div className="flex items-center justify-between mb-4">
                   <h5 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-2">
                     <ImageIcon className="w-4 h-4" /> หลักฐานการโอนเงิน (Transfer Slip)
                   </h5>
                   {selectedWithdrawal.transferSlip && (
                     <span className="text-[8px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase">Uploaded</span>
                   )}
                </div>
                
                {selectedWithdrawal.transferSlip ? (
                  <div className="relative group">
                    <img 
                      src={selectedWithdrawal.transferSlip} 
                      className="w-full h-48 object-cover rounded-2xl border border-white cursor-zoom-in" 
                      onClick={() => setPreviewImage(selectedWithdrawal.transferSlip || null)}
                      alt="Transfer Slip"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                       <label className="bg-white/90 text-slate-900 px-4 py-2 rounded-xl text-[9px] font-black uppercase cursor-pointer hover:bg-white transition-all">
                         เปลี่ยนไฟล์
                         <input type="file" className="hidden" accept="image/*" onChange={e => handleSlipUpload(e.target.files?.[0] || null)} />
                       </label>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center py-8 bg-white/50 rounded-2xl border-2 border-dashed border-emerald-200 cursor-pointer hover:bg-white transition-all group">
                    <ScanLine className="w-8 h-8 text-emerald-300 group-hover:scale-110 transition-transform mb-2" />
                    <p className="text-[10px] font-black text-emerald-600 uppercase">คลิกเพื่ออัปโหลดสลิป</p>
                    <p className="text-[8px] text-emerald-400 font-bold uppercase mt-1">Proof of Payment</p>
                    <input type="file" className="hidden" accept="image/*" onChange={e => handleSlipUpload(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
            )}

            <div className="space-y-6">
              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4"/> Requested Items (by Project)
                </h4>
                <div className="bg-slate-50 rounded-3xl p-5 space-y-3 border border-slate-100">
                  {selectedWithdrawal.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] border-b border-white/50 last:border-0 pb-2 last:pb-0">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700">{it.name || 'Budget Item'}</span>
                        <span className="text-[8.5px] text-blue-500 font-black uppercase tracking-wider">{it.category}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-slate-900">฿{it.amount.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4"/> Settlement History
                </h4>
                
                {/* Close Account Actions */}
                <div className="mb-6">
                   {selectedWithdrawal.status === 'approved' && selectedWithdrawal.accountStatus !== 'closed' && (
                     <div className="space-y-3">
                       <button 
                         onClick={() => setShowPassModal({ show: true, action: 'close_account', targetId: selectedWithdrawal.id || null, targetIds: [], type: 'accountant', receiptIndex: null, receiptIndices: [], nextDocStatus: '' })}
                         className="w-full bg-slate-900 border-b-4 border-slate-700 active:border-b-0 active:translate-y-1 text-white py-4 rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2"
                       >
                         <Lock className="w-3.5 h-3.5" />
                         ตรวจสอบและปิดยอดบัญชี (Finalize)
                       </button>
                       {selectedWithdrawal.clearanceStatus !== 'cleared' && (
                         <p className="text-[9px] text-amber-500 font-bold text-center uppercase tracking-tighter">
                           * รายการนี้ยังเคลียร์ยอดไม่ครบ แต่สามารถปิดยอดเพื่อสรุปส่วนต่างได้
                         </p>
                       )}
                     </div>
                   )}
                   {selectedWithdrawal.accountStatus === 'closed' && (
                      <div className="space-y-4 mb-6">
                        <div className="bg-emerald-50 border-2 border-emerald-100 text-emerald-900 p-6 rounded-[2rem] shadow-sm">
                           <div className="flex items-center gap-2 mb-4 border-b border-emerald-200 pb-3">
                             <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                             <span className="font-black text-xs uppercase tracking-widest">สรุปผลการปิดยอดโดยบัญชี</span>
                           </div>
                           
                           <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                 <p className="text-[10px] text-emerald-600 font-bold uppercase">ยอดที่อนุมัติจริง</p>
                                 <p className="text-xl font-black italic">฿{selectedWithdrawal.finalApprovedTotal?.toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                 <p className="text-[10px] text-emerald-600 font-bold uppercase">ยอดเบิกเดิม</p>
                                 <p className="text-lg font-bold text-slate-400">฿{selectedWithdrawal.totalAmount?.toLocaleString()}</p>
                              </div>
                           </div>
                           
                           <div className="bg-white/50 p-4 rounded-2xl mb-4 text-center">
                              <p className="text-[11px] font-black text-emerald-700">{selectedWithdrawal.accountingConclusion}</p>
                              <p className="text-[9px] text-emerald-600 mt-1">ปิดยอดเมื่อ: {selectedWithdrawal.closedAt ? new Date(selectedWithdrawal.closedAt).toLocaleString('th-TH') : '-'}</p>
                           </div>

                           <div className="space-y-2 pt-4 border-t border-emerald-200 border-dashed">
                              <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-2">📊 สรุปยอดจ่ายจริงตามโปรเจกต์:</p>
                              {Object.entries(
                                (selectedWithdrawal.receipts || [])
                                  .filter(r => r.docStatus === 'approved')
                                  .reduce((acc: any, r) => {
                                    const pk = r.projectId || 'ไม่ระบุโปรเจกต์';
                                    acc[pk] = (acc[pk] || 0) + (Number(r.amount) || 0);
                                    return acc;
                                  }, {})
                              ).map(([proj, amt]) => (
                                <div key={proj} className="flex justify-between text-[11px] font-bold py-1 border-b border-emerald-100/50 last:border-0 grow">
                                   <span className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                      {proj}
                                   </span>
                                   <span>฿{(amt as number).toLocaleString()}</span>
                                </div>
                              ))}
                           </div>
                        </div>
                      </div>
                    )}
                </div>

                {selectedReceipts.length > 0 && (
                  <div className="bg-[#0F172A] text-white p-4 rounded-2xl mb-4 flex items-center justify-between shadow-xl animate-in fade-in zoom-in-95 group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-black text-xs">{selectedReceipts.length}</div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Items Selected</span>
                    </div>
                    <div className="flex gap-2">
                       <button onClick={() => setShowPassModal({ show: true, action: 'doc_toggle', targetId: selectedWithdrawal.id || null, targetIds: [], type: 'accountant', receiptIndex: null, receiptIndices: selectedReceipts, nextDocStatus: 'approved' })} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">Approve ({selectedReceipts.length})</button>
                       <button onClick={() => setShowPassModal({ show: true, action: 'doc_toggle', targetId: selectedWithdrawal.id || null, targetIds: [], type: 'accountant', receiptIndex: null, receiptIndices: selectedReceipts, nextDocStatus: 'rejected' })} className="bg-rose-600 hover:bg-rose-500 px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all">Reject</button>
                       <button onClick={() => setSelectedReceipts([])} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest">Cancel</button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                   {(selectedWithdrawal.receipts || []).length === 0 ? (
                     <div className="p-10 border-2 border-dashed rounded-3xl text-center"><p className="text-xs font-bold text-slate-300">No receipts uploaded yet.</p></div>
                   ) : (
                     selectedWithdrawal.receipts.map((r, idx) => (
                       <div 
                         key={idx} 
                         className={`p-4 rounded-3xl border transition-all shadow-sm flex items-center gap-4 cursor-pointer ${
                           selectedReceipts.includes(idx) ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-300'
                         }`}
                         onClick={() => {
                            setSelectedReceipts(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
                         }}
                       >
                          <div className="flex items-center gap-3">
                             <input 
                               type="checkbox" 
                               checked={selectedReceipts.includes(idx)} 
                               onChange={(e) => {
                                 e.stopPropagation();
                                 setSelectedReceipts(prev => e.target.checked ? [...prev, idx] : prev.filter(i => i !== idx));
                               }} 
                               className="w-4 h-4 rounded border-slate-200 text-blue-600 cursor-pointer"
                             />
                             {r.driveUrl || r.base64 ? (
                               <img 
                                 src={r.driveUrl || r.base64} 
                                 className="w-12 h-12 rounded-2xl object-cover cursor-zoom-in border border-slate-100 shadow-sm" 
                                 alt="Receipt" 
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   if (r.driveUrl) window.open(r.driveUrl, '_blank');
                                   else setPreviewImage(r.base64 || null);
                                 }} 
                               />
                             ) : (
                               <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200" title="Image archived to save space">
                                  <FileText className="w-6 h-6 text-slate-300" />
                               </div>
                             )}
                          </div>
                          <div className="flex-1">
                             <p className="text-[10px] font-black text-slate-800 leading-tight">{r.name}</p>
                             <p className="text-[8px] font-bold text-slate-400 uppercase leading-none mt-1">{r.projectId}</p>
                             
                             {r.additionalDocs && r.additionalDocs.length > 0 && (
                               <div className="flex flex-wrap gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
                                  {r.additionalDocs.map((doc, dIdx) => (
                                    <button 
                                      key={dIdx}
                                      onClick={() => setPreviewImage(doc.base64)}
                                      className="flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 text-[7px] font-bold hover:bg-blue-100 transition-all"
                                      title={doc.fileName}
                                    >
                                      <Paperclip className="w-2 h-2" /> Doc {dIdx + 1}
                                    </button>
                                  ))}
                               </div>
                             )}
                             <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase border ${
                                  r.docStatus === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                  r.docStatus === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                                  'bg-slate-50 text-slate-400 border-slate-100'
                                }`}>{r.docStatus || 'waiting'}</span>
                                {r.isDuplicate && (
                                  <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-rose-500 text-white uppercase animate-pulse">
                                    ซ้ำ: {r.duplicateInfo?.project}
                                  </span>
                                )}
                             </div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-2">
                             <div className="flex flex-col items-end">
                               <p className="text-sm font-black text-slate-900 tracking-tighter">฿{r.amount.toLocaleString()}</p>
                               {r.isEdited && (
                                 <div className="flex items-center gap-1 text-[7px] font-black text-amber-600 bg-amber-50 px-1 rounded border border-amber-100 uppercase mt-0.5">
                                   <AlertTriangle className="w-2 h-2" /> กรอกตัวเลขเอง
                                 </div>
                               )}
                             </div>
                             <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                <button onClick={() => setShowPassModal({ show: true, action: 'doc_toggle', targetId: selectedWithdrawal.id || null, targetIds: [], type: 'accountant', receiptIndex: idx, receiptIndices: [], nextDocStatus: 'approved' })} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all font-bold" title="Approve"><CheckCircle2 className="w-3.5 h-3.5"/></button>
                                <button onClick={() => setShowPassModal({ show: true, action: 'doc_toggle', targetId: selectedWithdrawal.id || null, targetIds: [], type: 'accountant', receiptIndex: idx, receiptIndices: [], nextDocStatus: 'rejected' })} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-all font-bold" title="Reject"><XCircle className="w-3.5 h-3.5"/></button>
                                <button onClick={() => setEditingReceipt({ withdrawalId: selectedWithdrawal.id || '', index: idx, data: { ...r } })} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all font-bold" title="Edit"><Edit className="w-3.5 h-3.5"/></button>
                                <button onClick={() => setShowPassModal({ show: true, action: 'receipt_delete', targetId: selectedWithdrawal.id || null, targetIds: [], type: 'accountant', receiptIndex: idx, receiptIndices: [], nextDocStatus: '' })} className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-rose-100 hover:text-rose-600 transition-all font-bold" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
                             </div>
                          </div>
                       </div>
                     ))
                   )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Receipt Modal */}
      {editingReceipt && (
        <div className="fixed inset-0 bg-[#0F172A]/90 backdrop-blur-xl z-[700] flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl space-y-6">
             <div className="flex justify-between items-center">
               <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">แก้ไขรายจ่าย</h3>
               <button onClick={() => setEditingReceipt(null)} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5"/></button>
             </div>

             <div className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">ชื่อร้าน / รายการ</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-xs font-bold outline-none ring-2 ring-transparent focus:ring-blue-600/10 transition-all" 
                    value={editingReceipt.data.name} 
                    onChange={e => setEditingReceipt({ ...editingReceipt, data: { ...editingReceipt.data, name: e.target.value } })}
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">ยอดเงิน</label>
                  <input 
                    type="number" 
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-xs font-bold outline-none ring-2 ring-transparent focus:ring-blue-600/10 transition-all" 
                    value={editingReceipt.data.amount} 
                    onChange={e => setEditingReceipt({ ...editingReceipt, data: { ...editingReceipt.data, amount: Number(e.target.value) } })}
                  />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">โปรเจกต์</label>
                  <select 
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-xs font-bold outline-none appearance-none cursor-pointer"
                    value={editingReceipt.data.projectId}
                    onChange={e => setEditingReceipt({ ...editingReceipt, data: { ...editingReceipt.data, projectId: e.target.value } })}
                  >
                    {dynamicProjects.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
             </div>

             <button 
                onClick={() => setShowPassModal({ show: true, action: 'receipt_edit', targetId: editingReceipt.withdrawalId, targetIds: [], type: 'accountant', receiptIndex: editingReceipt.index, receiptIndices: [], nextDocStatus: '' })}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
             >
               ยืนยันการแก้ไข (ต้องระบุรหัสบัญชี)
             </button>
          </motion.div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-[#0F172A]/95 z-[600] p-6 flex items-center justify-center" onClick={() => setPreviewImage(null)}>
           <img src={previewImage} className="max-w-full max-h-full rounded-3xl shadow-2xl animate-in zoom-in-95" alt="Large View" />
        </div>
      )}

      {showPassModal.show && (
        <div className="fixed inset-0 bg-[#0F172A]/98 backdrop-blur-2xl z-[800] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl border-t-8 border-blue-600 animate-in zoom-in-95">
            <h3 className="text-2xl font-black mb-1 text-center text-slate-900 uppercase">Identity Access</h3>
            <p className="text-[10px] text-slate-400 font-bold text-center mb-6 uppercase tracking-widest">
              {showPassModal.action === 'withdraw_delete' ? 'Confirm Deletion' : 
               showPassModal.type === 'executive' ? 'Executive Approval' : 'Accountant verification'}
            </p>
            
            {showPassModal.action === 'withdraw_delete' && (
               <div className="mb-4 p-4 bg-rose-50 rounded-2xl border border-rose-100">
                  <p className="text-[10px] font-black text-rose-600 uppercase text-center">ยืนยันลบรายการข้อมูลจะหายไปถาวร</p>
                  <p className="text-[10px] text-rose-400 font-bold text-center mt-1">รายการที่เลือก: {showPassModal.targetIds.length > 0 ? showPassModal.targetIds.length : 1} รายการ</p>
               </div>
            )}

            <input 
              type="password" 
              autoFocus 
              value={password} 
              onChange={(e) => { setPassword(e.target.value); setPassError(''); }} 
              onKeyDown={(e) => e.key === 'Enter' && !isBusy && verifyAction()} 
              placeholder="••••••" 
              disabled={isBusy}
              className={`w-full bg-slate-50 border-2 ${passError ? 'border-rose-500' : 'border-transparent'} rounded-xl px-6 py-5 text-center text-4xl tracking-[0.4em] mb-4 font-black transition-all outline-none focus:bg-white focus:border-blue-200 disabled:opacity-50`} 
            />
            {passError && <p className="text-rose-500 text-[10px] font-bold text-center mb-6 animate-bounce">{passError}</p>}
            
            <div className="flex gap-4">
              <button 
                onClick={() => { setShowPassModal({ show: false, action: null, targetId: null, targetIds: [], type: '', receiptIndex: null, receiptIndices: [], nextDocStatus: '' }); setPassword(''); setPassError(''); }} 
                className="flex-1 py-3.5 text-slate-400 font-black text-[10px] uppercase hover:text-slate-600 transition-colors"
                disabled={isBusy}
              >
                Cancel
              </button>
              <button 
                onClick={verifyAction} 
                disabled={isBusy}
                className="flex-1 bg-[#111827] text-white py-3.5 rounded-xl font-black text-[10px] uppercase shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2"
              >
                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 h-14 flex items-center justify-around px-2 z-40 shadow-2xl rounded-t-2xl">
        {[
          { id: 'request', label: 'ขอเบิก', icon: Plus },
          { id: 'clearance', label: 'เคลียร์', icon: Wallet },
          { id: 'history', label: 'รายการเบิก', icon: HistoryIcon },
          { id: 'dashboard', label: 'สรุปผล', icon: BarChart3 },
          { id: 'approvals', label: 'อนุมัติ', icon: Lock },
          { id: 'settings', label: 'ตั้งค่า', icon: Settings }
        ].map(nav => (
          <button key={nav.id} onClick={() => nav.id === 'settings' ? setShowSettingsLogin(true) : setActiveTab(nav.id)} className={`flex flex-col items-center gap-0.5 flex-1 transition-all ${activeTab === nav.id ? 'text-blue-600 scale-110' : 'text-slate-400'}`}>
            <nav.icon className={`w-5 h-5 ${activeTab === nav.id ? 'fill-blue-50' : ''}`} />
            <span className="text-[8px] font-black uppercase tracking-tighter">{nav.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
