import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Plus, Wallet, History as HistoryIcon, BarChart3, Lock, 
  CheckCircle2, XCircle, Search, Loader2, AlertTriangle, Trash2, 
  Image as ImageIcon, ScanLine, User, PieChart, Settings, UserPlus, Zap,
  X, FileText, Calendar
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, collection, doc, addDoc, updateDoc, onSnapshot, setDoc, getDocFromServer
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { GoogleGenAI } from "@google/genai";
import firebaseConfig from '../firebase-applet-config.json';
import { OperationType, Withdrawal, Receipt, SystemConfigs } from './types';

// --- 1. Firebase & AI Setup ---
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const appId = 'advance-system-v3'; 
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- 2. Error Handling ---
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- 3. Constants & Helpers ---
const INITIAL_EMPLOYEES = ["สมชาย มั่นคง", "วิภา มีสุข", "ธนากร งานดี", "กาญจนา เรืองโพน", "ปิยะพงษ์ ผิวอ่อน"];
const INITIAL_PROJECTS = ["PROJ-A", "PROJ-B", "PROJ-C", "PROJ-D"];
const INITIAL_CATEGORIES = ["ค่าเดินทาง/น้ำมัน", "ค่าอาหาร/รับรอง", "ค่าที่พัก", "ค่าวัสดุอุปกรณ์", "ค่าแรง/ค่าบริการ", "อื่นๆ"];

const notifyLine = async (message: string, type: 'text' | 'flex' = 'text', flexData?: any) => {
  try {
    await fetch("/api/line-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, type, flexData }),
    });
  } catch (err) {
    console.error("LINE Bot notify failed:", err);
  }
};

const buildRequestFlex = (data: Withdrawal, appId: string) => {
  return {
    type: "flex",
    altText: `New Request from ${data.employeeName}: ฿${data.totalAmount.toLocaleString()}`,
    contents: {
      type: "bubble",
      size: "flat",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "ADVANCE REQUEST", weight: "bold", color: "#64748b", size: "xs", letterSpacing: "xl" },
          { type: "text", text: data.advanceId, weight: "bold", size: "xl", margin: "md", color: "#1e293b" }
        ],
        paddingBottom: "none"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "Requester", size: "sm", color: "#94a3b8", flex: 3 },
              { type: "text", text: data.employeeName, size: "sm", color: "#334155", flex: 7, weight: "bold", align: "end" }
            ],
            margin: "lg"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "Amount", size: "sm", color: "#94a3b8", flex: 3 },
              { type: "text", text: `฿${data.totalAmount.toLocaleString()}`, size: "lg", color: "#2563eb", flex: 7, weight: "bold", align: "end" }
            ],
            margin: "md"
          },
          {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: "Details", size: "xxs", color: "#94a3b8", weight: "bold" },
              { type: "text", text: data.items.map(i => i.name).join(", "), wrap: true, size: "xs", color: "#475569", margin: "sm" }
            ],
            margin: "xl",
            backgroundColor: "#f8fafc",
            paddingAll: "md",
            cornerRadius: "md"
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "md",
            color: "#0f172a",
            action: {
              type: "postback",
              label: "Approve Request",
              data: `action=approve&id=${data.id}&appId=${appId}`,
              displayText: "I approve this withdrawal"
            }
          },
          {
            type: "button",
            style: "secondary",
            height: "md",
            action: {
              type: "postback",
              label: "Reject",
              data: `action=reject&id=${data.id}&appId=${appId}`,
              displayText: "I reject this withdrawal"
            }
          }
        ],
        paddingTop: "none"
      },
      styles: {
        header: { separator: true }
      }
    }
  };
};

const syncToSheets = async (url: string, data: any) => {
  if (!url) return;
  try {
    await fetch("/api/sheets-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, data }),
    });
  } catch (err) {
    console.error("Sheets Sync failed:", err);
  }
};

const compressImg = (file: File, maxWidth = 400): Promise<string> => {
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
        resolve(canvas.toDataURL('image/jpeg', 0.3));
      };
    };
  });
};

const detectDuplicates = (items: Receipt[]) => {
  const seen: { [key: string]: number } = {};
  const processed = items.map(item => {
    const key = `${item.name || ''}-${item.amount || 0}`.toLowerCase().trim();
    if (seen[key]) { seen[key] += 1; return { ...item, isDuplicate: true }; }
    seen[key] = 1; return { ...item, isDuplicate: false };
  });
  return processed.map(item => {
    const key = `${item.name || ''}-${item.amount || 0}`.toLowerCase().trim();
    return { ...item, isDuplicate: seen[key] > 1 };
  });
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = (status || 'pending').toLowerCase();
  const styles: { [key: string]: string } = {
    pending: "bg-amber-50 text-amber-600 border-amber-100",
    approved: "bg-emerald-50 text-emerald-600 border-emerald-100",
    rejected: "bg-rose-50 text-rose-600 border-rose-100"
  };
  return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase ${styles[s] || styles.pending}`}>{s}</span>;
};

// --- 4. Main App ---
export default function App() {
  const [fbUserReady, setFbUserReady] = useState(false);
  const [activeTab, setActiveTab] = useState('history'); 
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  
  const [aiUsage, setAiUsage] = useState({ ocrCount: 0 });

  const resetAiUsage = async () => {
    if (!confirm("คุณต้องการล้างประวัติการใช้งาน AI ใช่หรือไม่? (ยอดเงินจะกลับเป็น 0)")) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'usage'), { ocrCount: 0 });
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/usage'); }
  };

  const estimatedCost = aiUsage.ocrCount * 0.0105; // ~0.0105 THB per request (estimated for 1.5 Flash)
  const [dynamicEmployees, setDynamicEmployees] = useState<string[]>(INITIAL_EMPLOYEES);
  const [dynamicProjects, setDynamicProjects] = useState<string[]>(INITIAL_PROJECTS);
  const [dynamicCategories, setDynamicCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [systemConfigs, setSystemConfigs] = useState<SystemConfigs>({ execPin: '888', accPin: '123', sheetsUrl: '' });
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
    startDate: '',
    endDate: ''
  });
  const [dashboardFilter, setDashboardFilter] = useState('all');

  const [newReq, setNewReq] = useState<{
    employeeName: string;
    projectIds: string[];
    items: Array<{ name: string; amount: number; category: string }>;
  }>({ 
    employeeName: '', 
    projectIds: [], 
    items: [{ name: '', amount: 0, category: '' }] 
  });
  const [clrForm, setClrForm] = useState({ advanceId: '', receipts: [{ name: '', amount: 0, base64: '', fileName: '', isProcessing: false, projectId: '', description: '', originalAmount: 0 }] });
  
  const [showPassModal, setShowPassModal] = useState<{ show: boolean, action: string | null, targetId: string | null, type: string, receiptIndex: number | null, nextDocStatus: string }>({ show: false, action: null, targetId: null, type: '', receiptIndex: null, nextDocStatus: '' });
  const [password, setPassword] = useState('');
  const [ocrModal, setOcrModal] = useState({ show: false, total: 0 });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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

    signInAnonymously(auth).catch(e => console.error("Auth:", e));
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
      if (data.projects && data.projects.list) setDynamicProjects(data.projects.list);
      if (data.categories && data.categories.list) setDynamicCategories(data.categories.list);
    }, (error) => handleFirestoreError(error, OperationType.GET, configsPath));

    return () => { unsubW(); unsubC(); unsubU(); };
  }, [fbUserReady]);

  const approvedAdvances = useMemo(() => withdrawals.filter(w => w.status === 'approved' && w.clearanceStatus !== 'cleared'), [withdrawals]);
  const selectedAdvData = useMemo(() => withdrawals.find(a => a.advanceId === clrForm.advanceId), [clrForm.advanceId, withdrawals]);
  
  const historyList = useMemo(() => {
    return withdrawals.filter(w => {
      const s = searchTerm.toLowerCase();
      const matchSearch = s === '' || (w.employeeName || '').toLowerCase().includes(s) || (w.advanceId || '').toLowerCase().includes(s);
      const matchEmp = historyFilters.employee === 'all' || w.employeeName === historyFilters.employee;
      const matchProj = historyFilters.project === 'all' || (w.projectIds || []).includes(historyFilters.project);
      const matchStat = historyFilters.status === 'all' || 
                        (historyFilters.status === 'pending' && w.status === 'pending') ||
                        (historyFilters.status === 'approved' && w.status === 'approved' && w.clearanceStatus === 'none') ||
                        (historyFilters.status === 'cleared' && w.clearanceStatus === 'cleared') ||
                        (historyFilters.status === 'rejected' && w.status === 'rejected');
      
      const date = new Date(w.createdAt).getTime();
      const matchStart = !historyFilters.startDate || date >= new Date(historyFilters.startDate).getTime();
      const matchEnd = !historyFilters.endDate || date <= new Date(historyFilters.endDate).setHours(23,59,59,999);
      
      return matchSearch && matchEmp && matchStat && matchProj && matchStart && matchEnd;
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
    const projectMap: { [key: string]: number } = {};
    const categoryMap: { [key: string]: number } = {};
    const staffMap: { [key: string]: number } = {};

    withdrawals.forEach(w => {
      // Top Spenders logic (from total requested)
      staffMap[w.employeeName] = (staffMap[w.employeeName] || 0) + w.totalAmount;

      if (w.receipts) {
        w.receipts.forEach(r => {
          if (dashboardFilter === 'all' || r.projectId === dashboardFilter) {
            const amount = Number(r.amount || 0);
            list.push({ ...r, advanceId: w.advanceId, employeeName: w.employeeName, clearedAt: w.clearedAt });
            
            // Stats logic
            projectMap[r.projectId] = (projectMap[r.projectId] || 0) + amount;
            // Note: category is not directly on receipt, it's on requested items, 
            // but we can try to find matching category or just use item categories
          }
        });
      }
    });

    const topSpenders = Object.entries(staffMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a,b) => b.amount - a.amount)
      .slice(0, 5);

    const projectStats = Object.entries(projectMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a,b) => b.amount - a.amount);

    return { 
      list: list.sort((a,b) => new Date(b.clearedAt).getTime() - new Date(a.clearedAt).getTime()), 
      total: list.reduce((s, x) => s + Number(x.amount || 0), 0),
      topSpenders,
      projectStats
    };
  }, [withdrawals, dashboardFilter]);

  const handleRequestSubmit = async () => {
    if (isBusy || !newReq.employeeName || newReq.projectIds.length === 0 || newReq.items.some(i => !i.amount)) return alert("ข้อมูลไม่ครบ (โปรดเลือกอย่างน้อย 1 โปรเจกต์)");
    setIsBusy(true);
    const path = `artifacts/${appId}/public/data/withdrawals`;
    try {
      const total = newReq.items.reduce((s, i) => s + Number(i.amount || 0), 0);
      const id = `ADV-${new Date().toISOString().split('T')[0].slice(2).replace(/-/g,'')}-${(withdrawals.length + 1).toString().padStart(3,'0')}`;
      const docData = {
        ...newReq, 
        advanceId: id, 
        totalAmount: total, 
        status: 'pending', 
        createdAt: new Date().toISOString(),
        clearanceStatus: 'none', 
        actualSpend: 0, 
        balance: total, 
        receipts: []
      };
      const docRef = await addDoc(collection(db, path), docData);
      
      const flex = buildRequestFlex({ id: docRef.id, ...docData } as any, appId);
      await notifyLine(`🔔 มีคำขอเบิกใหม่: ${id} (${docData.employeeName})`, 'flex', flex);

      setNewReq({ employeeName: '', projectIds: [], items: [{ name: '', amount: 0, category: '' }] });
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

  const runAI = async () => {
    if (clrForm.receipts.some(r => !r.base64)) return alert("แนบรูปสลิปให้ครบก่อน");
    setIsBusy(true);
    try {
      const updated = await Promise.all(clrForm.receipts.map(async (r) => {
        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              { text: 'Extract store name and total amount from this receipt. Return JSON only: {"name": "store_name", "amount": 123.45}' },
              { inlineData: { mimeType: 'image/jpeg', data: r.base64.split(',')[1] } }
            ]
          }
        });
        const text = result.text || "";
        const jsonMatch = text.match(/\{.*\}/s);
        const d = jsonMatch ? JSON.parse(jsonMatch[0]) : { name: 'Unknown', amount: 0 };
        return { ...r, name: d.name || 'ไม่ระบุ', amount: d.amount || 0, originalAmount: d.amount || 0 } as Receipt;
      }));
      setClrForm({ ...clrForm, receipts: detectDuplicates(updated) });
      setOcrModal({ show: true, total: updated.reduce((s, x) => s + Number(x.amount || 0), 0) });
    } catch (e) { alert("AI ล้มเหลว โปรดลองอีกครั้ง"); console.error(e); } finally { setIsBusy(false); }
  };

  const saveClearance = async () => {
    if (isBusy || !selectedAdvData || !selectedAdvData.id) return;
    setIsBusy(true);
    const path = `artifacts/${appId}/public/data/withdrawals/${selectedAdvData.id}`;
    try {
      const total = clrForm.receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
      const newItems = clrForm.receipts.map((r, i) => ({
        ...r, 
        isEdited: Number(r.amount) !== Number(r.originalAmount),
        docStatus: 'waiting', 
        fileName: `${new Date().toISOString().split('T')[0]}_${selectedAdvData.advanceId}_${i}.jpg`
      }));
      const newSpend = selectedAdvData.actualSpend + total;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'withdrawals', selectedAdvData.id), {
        clearanceStatus: (selectedAdvData.totalAmount - newSpend) <= 0 ? 'cleared' : 'partial',
        actualSpend: newSpend, 
        balance: selectedAdvData.totalAmount - newSpend,
        receipts: [...(selectedAdvData.receipts || []), ...newItems], 
        clearedAt: new Date().toISOString()
      });
      setOcrModal({ show: false, total: 0 });
      setClrForm({ advanceId: '', receipts: [{ name: '', amount: 0, base64: '', fileName: '', isProcessing: false, projectId: '', description: '', originalAmount: 0 }] });
      setActiveTab('history');
      
      const spendingDetail = clrForm.receipts.map(r => `• ${r.name}: ฿${r.amount.toLocaleString()}`).join('\n');
      notifyLine(`✅ เคลียร์ยอดแล้ว\nADV: ${selectedAdvData.advanceId}\nพนักงาน: ${selectedAdvData.employeeName}\nยอดเคลียร์ครั้งนี้: ฿${total.toLocaleString()}\nคงเหลือ: ฿${(selectedAdvData.totalAmount - newSpend).toLocaleString()}\n\nรายละเอียด:\n${spendingDetail}`);
      
      if (systemConfigs.sheetsUrl) {
         syncToSheets(systemConfigs.sheetsUrl, {
            target: 'Clearance',
            id: selectedAdvData.advanceId,
            employee: selectedAdvData.employeeName,
            amountCleared: total,
            totalRequested: selectedAdvData.totalAmount,
            remainingBalance: selectedAdvData.balance - total,
            clearedAt: new Date().toISOString(),
            status: 'Cleared'
         });
      }
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, path); } finally { setIsBusy(false); }
  };

  const verifyAction = async () => {
    const pin = showPassModal.type === 'executive' ? systemConfigs.execPin : systemConfigs.accPin;
    if (password === pin) {
      if (!showPassModal.targetId) return;
      const path = `artifacts/${appId}/public/data/withdrawals/${showPassModal.targetId}`;
      try {
        const ref = doc(db, path);
        const parent = withdrawals.find(w => w.id === showPassModal.targetId);
        
        if (showPassModal.action === 'approve') {
          const deadline = new Date();
          deadline.setDate(deadline.getDate() + 30);
          await updateDoc(ref, { 
            status: 'approved', 
            approvedAt: new Date().toISOString(),
            clearanceDeadline: deadline.toISOString()
          });
          notifyLine(`💎 อนุมัติการเบิก\nID: ${parent?.advanceId}\nพนักงาน: ${parent?.employeeName}\nยอด: ฿${parent?.totalAmount.toLocaleString()}\nกำหนดเคลียร์: ${deadline.toLocaleDateString('th-TH')}`);
          
          if (systemConfigs.sheetsUrl) {
            syncToSheets(systemConfigs.sheetsUrl, {
              target: 'Advances',
              id: parent?.advanceId,
              employee: parent?.employeeName,
              amount: parent?.totalAmount,
              projects: (parent?.projectIds || []).join(', '),
              approvedAt: new Date().toISOString(),
              status: 'Approved'
            });
          }
        } else if (showPassModal.action === 'reject') {
          await updateDoc(ref, { status: 'rejected' });
          notifyLine(`❌ ปฏิเสธการเบิก\nID: ${parent?.advanceId}\nพนักงาน: ${parent?.employeeName}`);
        } else if (showPassModal.action === 'doc_toggle') {
          if (parent && showPassModal.receiptIndex !== null) {
            const updated = [...parent.receipts];
            const oldStatus = updated[showPassModal.receiptIndex].docStatus;
            updated[showPassModal.receiptIndex].docStatus = showPassModal.nextDocStatus as any;
            await updateDoc(ref, { receipts: updated });
            if (selectedWithdrawal?.id === parent.id) setSelectedWithdrawal({...parent, receipts: updated});
            
            if (showPassModal.nextDocStatus === 'approved' && oldStatus !== 'approved') {
              notifyLine(`🏢 บัญชีรับรองสลิป\nADV: ${parent.advanceId}\nร้าน: ${updated[showPassModal.receiptIndex].name}\nยอด: ฿${updated[showPassModal.receiptIndex].amount.toLocaleString()}`);
            }
          }
        }
        setShowPassModal({ show: false, action: null, targetId: null, type: '', receiptIndex: null, nextDocStatus: '' }); setPassword('');
      } catch (e) { handleFirestoreError(e, OperationType.UPDATE, path); }
    } else alert("รหัสผ่านไม่ถูกต้อง");
  };

  const sendWeeklySummary = async () => {
    setIsBusy(true);
    try {
      const res = await fetch("/api/trigger-weekly-report", { method: "POST" });
      if (res.ok) alert("ส่งสรุปประจำสัปดาห์เข้า LINE สำเร็จ");
      else alert("เกิดข้อผิดพลาดในการส่งสรุป");
    } catch (err) {
      console.error(err);
      alert("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
    } finally {
      setIsBusy(false);
    }
  };

  const updateDeadline = async (dateStr: string) => {
    if (!selectedWithdrawal || !selectedWithdrawal.id) return;
    try {
      const ref = doc(db, `artifacts/${appId}/public/data/withdrawals/${selectedWithdrawal.id}`);
      await updateDoc(ref, { clearanceDeadline: dateStr });
      setSelectedWithdrawal({ ...selectedWithdrawal, clearanceDeadline: dateStr });
      notifyLine(`📅 เลื่อนกำหนดเคลียร์ยอด\nADV: ${selectedWithdrawal.advanceId}\nพนักงาน: ${selectedWithdrawal.employeeName}\nกำหนดใหม่: ${new Date(dateStr).toLocaleDateString('th-TH')}`);
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
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'projects'), { list: [...dynamicProjects, newProjectName.toUpperCase()] });
      setNewProjectName('');
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/projects'); }
  };

  const removeProject = async (name: string) => {
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'projects'), { list: dynamicProjects.filter(p => p !== name) });
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
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'system_configs', 'passwords'), systemConfigs);
      alert("อัปเดตรหัสผ่านสำเร็จ");
    } catch (e) { handleFirestoreError(e, OperationType.WRITE, 'system_configs/passwords'); }
  };

  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-4"><Loader2 className="w-10 h-10 animate-spin text-blue-600"/><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading System...</p></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 pb-20 sm:pb-0 overflow-x-hidden">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40 px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0F172A] rounded-lg flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-black text-sm tracking-tight text-slate-900 uppercase leading-none">Advance</h1>
            <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest mt-0.5">Management System</p>
          </div>
        </div>
        <nav className="hidden lg:flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
          {[
            { id: 'request', label: 'ขอเบิก', icon: Plus },
            { id: 'clearance', label: 'เคลียร์', icon: Wallet },
            { id: 'history', label: 'ประวัติ', icon: HistoryIcon },
            { id: 'dashboard', label: 'สรุป', icon: BarChart3 },
            { id: 'approvals', label: 'อนุมัติ', icon: Lock },
            { id: 'settings', label: 'ตั้งค่า', icon: Settings }
          ].map(t => (
            <button key={t.id} onClick={() => t.id === 'settings' ? setShowSettingsLogin(true) : setActiveTab(t.id)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${activeTab === t.id ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
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
                <select className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm font-bold" value={newReq.employeeName} onChange={e => setNewReq({...newReq, employeeName: e.target.value})}>
                  <option value="">-- พนักงานผู้ขอเบิก --</option>{dynamicEmployees.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เลือกโปรเจกต์ที่เกี่ยวข้อง (เลือกได้มากกว่า 1)</p>
                  <div className="flex flex-wrap gap-2">
                    {dynamicProjects.map(p => {
                      const isSelected = newReq.projectIds.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            const next = isSelected 
                              ? newReq.projectIds.filter(x => x !== p)
                              : [...newReq.projectIds, p];
                            setNewReq({ ...newReq, projectIds: next });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${
                            isSelected 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' 
                              : 'bg-white text-slate-400 border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          {isSelected ? '✓ ' : ''}{p}
                        </button>
                      );
                    })}
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
              <select className="w-full bg-slate-50 border rounded-xl px-4 py-2 text-sm font-bold outline-none" value={clrForm.advanceId} onChange={e => setClrForm({...clrForm, advanceId: e.target.value})}>
                <option value="">-- เลือกรายการ ADV ที่เบิกไป --</option>{approvedAdvances.map(a => <option key={a.id} value={a.advanceId}>{a.advanceId} ({a.employeeName})</option>)}
              </select>
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
                      <select className="bg-white border rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none" value={r.projectId} onChange={e => { const nr = [...clrForm.receipts]; nr[i].projectId = e.target.value; setClrForm({...clrForm, receipts: nr}); }}>
                        <option value="">-- ลงโปรเจกต์ --</option>
                        {dynamicProjects.map(p => {
                          const isRequested = selectedAdvData?.projectIds?.includes(p);
                          return <option key={p} value={p}>{isRequested ? `⭐ ${p}` : p}</option>;
                        })}
                      </select>
                      <input className="bg-white border rounded-lg px-2 py-1.5 text-[10px]" placeholder="รายละเอียดสั้นๆ" value={r.description} onChange={e => { const nr = [...clrForm.receipts]; nr[i].description = e.target.value; setClrForm({...clrForm, receipts: nr}); }} />
                    </div>
                  </div>
                ))}
                <button onClick={() => setClrForm({...clrForm, receipts: [...clrForm.receipts, {name:'', amount:0, base64: '', fileName: '', isProcessing: false, projectId: '', description: '', originalAmount: 0}]})} className="w-full py-1.5 text-blue-600 font-bold text-[9px] uppercase border border-dashed border-blue-100 rounded-xl">+ เพิ่มสลิป</button>
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
                <h2 className="text-2xl font-black tracking-tighter text-slate-900 uppercase leading-none">Audit Records</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Global Transaction History</p>
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
                    <option value="approved">Approved / Open</option>
                    <option value="cleared">Settled</option>
                    <option value="rejected">Rejected</option>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {historyList.map(item => {
                const hasDupe = (item.receipts || []).some(r => r.isDuplicate);
                const hasEdit = (item.receipts || []).some(r => r.isEdited);
                return (
                  <div key={item.id} onClick={() => setSelectedWithdrawal(item)} className="group bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px] active:scale-95">
                    {item.clearanceStatus === 'cleared' && <div className="absolute top-0 right-0 p-1.5 bg-blue-600 text-white text-[7px] font-black uppercase rounded-bl-xl tracking-tighter">SETTLED</div>}
                    {(hasDupe || hasEdit) && <div className="absolute top-4 right-4 text-rose-500 animate-pulse"><AlertTriangle className="w-4 h-4"/></div>}
                    <div>
                      <div className="mb-3"><StatusBadge status={item.status} /></div>
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
                      <div className="text-right">
                         <p className={`text-[10px] font-black tracking-tighter ${item.balance < 0 ? 'text-rose-500' : 'text-blue-500'}`}>฿{item.balance.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {historyList.length === 0 && (
              <div className="py-20 text-center space-y-3 bg-white rounded-3xl border border-dashed border-slate-200">
                <Search className="w-10 h-10 text-slate-100 mx-auto" />
                <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No matching records found</p>
              </div>
            )}
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
              <div className="md:col-span-2 bg-[#0F172A] p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden flex flex-col justify-center min-h-[200px]">
                 <div className="absolute -top-10 -right-10 p-4 opacity-5"><PieChart className="w-64 h-64" /></div>
                 <div className="relative z-10">
                   <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.4em] mb-2">Total Settled Spend</p>
                   <h4 className="text-5xl sm:text-7xl font-black tracking-tighter">฿{dashboardData.total.toLocaleString()}</h4>
                 </div>
              </div>

              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><PieChart className="w-3 h-3"/> Project Distribution</h3>
                <div className="space-y-3">
                  {dashboardData.projectStats.map(ps => {
                    const pct = (ps.amount / (dashboardData.total || 1)) * 100;
                    return (
                      <div key={ps.name} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span className="text-slate-600">{ps.name}</span>
                          <span className="text-slate-900">฿{ps.amount.toLocaleString()} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                  {dashboardData.projectStats.length === 0 && <p className="text-[9px] text-slate-300 font-bold italic">No data for selected project</p>}
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
                    <div className="flex gap-2">
                      <button onClick={() => setShowPassModal({ show: true, action: 'approve', targetId: item.id || null, type: 'executive', receiptIndex: null, nextDocStatus: '' })} className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-lg active:scale-95 transition-all"><CheckCircle2 className="w-5 h-5"/></button>
                      <button onClick={() => setShowPassModal({ show: true, action: 'reject', targetId: item.id || null, type: 'executive', receiptIndex: null, nextDocStatus: '' })} className="bg-rose-50 text-rose-600 p-2.5 rounded-xl active:scale-95 transition-all"><XCircle className="w-5 h-5"/></button>
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
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800 uppercase leading-none">Projects</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manage Active Projects</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input type="text" className="flex-1 bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none" placeholder="Project ID..." value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
                  <button onClick={addProject} className="bg-[#0F172A] text-white px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest">Add</button>
                </div>
                <div className="space-y-2 max-h-[20vh] overflow-y-auto pr-1">
                  {dynamicProjects.map((p, i) => (
                    <div key={i} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-xl text-[10px] font-bold text-slate-600">
                      <span>{p}</span>
                      <button onClick={() => removeProject(p)} className="text-slate-300 hover:text-rose-500"><X className="w-3.5 h-3.5"/></button>
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
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase leading-none">AI Consumption Monitor</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time API Usage & Costs</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col items-center justify-center text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">OCR Usage</p>
                  <p className="text-3xl font-black text-slate-900">{aiUsage.ocrCount.toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Requests</p>
                </div>
                <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 flex flex-col items-center justify-center text-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10"><Zap className="w-12 h-12" /></div>
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Estimated Cost</p>
                  <p className="text-3xl font-black text-indigo-600">฿{estimatedCost.toFixed(4)}</p>
                  <p className="text-[8px] font-bold text-indigo-400 uppercase mt-1">Est. THB (Gemini 1.5)</p>
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-[9px] font-bold text-amber-700 leading-relaxed">
                  📢 <span className="font-black uppercase">Cost Alert:</span> ยอดเงินนี้เป็นการคำนวณเบื้องต้น (0.0105 บาท/ครั้ง) เพื่อช่วยควบคุมเครดิตไม่ให้เกินงบประมาณ
                </p>
              </div>

              <button onClick={resetAiUsage} className="w-full bg-white border border-slate-200 text-slate-400 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:text-rose-500 hover:border-rose-100 transition-all active:scale-95">Reset Counter</button>
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

              <button onClick={updatePasswords} className="w-full bg-[#0F172A] text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all">Update Access Pins</button>
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

              {/* Google Sheets Sync */}
              <div className="space-y-4">
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
                <button onClick={updatePasswords} className="w-full bg-blue-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg">Save Sync Settings</button>
              </div>

              <div className="border-t border-slate-50 pt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[11px] font-black text-slate-900 uppercase">LINE Messaging Bot (API)</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">สถานะ: ระบบรองรับ Flex Message & Postback</p>
                  </div>
                  <button onClick={() => notifyLine("🧪 Test System: การแจ้งเตือนผ่าน LINE Bot ทำงานปกติ!")} className="bg-white border border-slate-200 text-slate-900 px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-100 active:scale-95 transition-all shadow-sm">Test Bot</button>
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
                    <code className="text-[9px] font-bold text-slate-700 break-all select-all">{window.location.origin}/api/line-webhook</code>
                  </div>
                </div>

                <button onClick={sendWeeklySummary} className="w-full bg-slate-900 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
                  <PieChart className="w-4 h-4" /> ส่งสรุปรายงานประจำสัปดาห์ (ทุกวันจันทร์ 07:30 น.)
                </button>
              </div>
            </div>

            <button onClick={() => { setIsSettingsAuthed(false); setActiveTab('history'); }} className="w-full bg-slate-100 text-slate-400 py-4 rounded-[2rem] font-black text-[10px] uppercase tracking-widest border border-slate-200">Close Settings</button>
          </div>
        )}

      </main>

      {/* --- ALL MODALS --- */}
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

      {showPassModal.show && (
        <div className="fixed inset-0 bg-[#0F172A]/98 backdrop-blur-2xl z-[300] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl border-t-8 border-blue-600 animate-in zoom-in-95">
            <h3 className="text-2xl font-black mb-1 text-center text-slate-900 uppercase">Identity Access</h3>
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verifyAction()} placeholder="••••••" className="w-full bg-slate-50 border-none rounded-xl px-6 py-5 text-center text-4xl tracking-[0.4em] mb-8 font-black" />
            <div className="flex gap-4">
              <button onClick={() => { setShowPassModal({ show: false, action: null, targetId: null, type: '', receiptIndex: null, nextDocStatus: '' }); setPassword(''); }} className="flex-1 py-3.5 text-slate-400 font-black text-[10px] uppercase">Cancel</button>
              <button onClick={verifyAction} className="flex-1 bg-[#111827] text-white py-3.5 rounded-xl font-black text-[10px] uppercase shadow-xl">Verify</button>
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
                       {r.isDuplicate && <span className="text-[9px] font-black text-rose-500 animate-pulse">DUPLICATE DETECTED</span>}
                    </div>
                    <div className="flex gap-4">
                       <img src={r.base64} className="w-16 h-16 rounded-2xl object-cover border" alt="Receipt" />
                       <div className="flex-1 space-y-1">
                          <input className="w-full bg-transparent font-black text-sm text-slate-800 outline-none" value={r.name} onChange={e => { const nr = [...clrForm.receipts]; nr[i].name = e.target.value; setClrForm({...clrForm, receipts: nr})}} />
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400">฿</span>
                            <input type="number" className={`bg-transparent font-black text-xl text-slate-900 outline-none w-28 ${Number(r.amount) !== Number(r.originalAmount) ? 'text-amber-600' : ''}`} value={r.amount || ''} onChange={e => { const nr = [...clrForm.receipts]; nr[i].amount = Number(e.target.value); setClrForm({...clrForm, receipts: nr})}} />
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
                 <StatusBadge status={selectedWithdrawal.status} />
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
               <button onClick={() => setSelectedWithdrawal(null)} className="p-3 bg-slate-100 rounded-full hover:bg-slate-200 transition-all"><X className="w-6 h-6" /></button>
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
                <div className="space-y-3">
                   {(selectedWithdrawal.receipts || []).length === 0 ? (
                     <div className="p-10 border-2 border-dashed rounded-3xl text-center"><p className="text-xs font-bold text-slate-300">No receipts uploaded yet.</p></div>
                   ) : (
                     selectedWithdrawal.receipts.map((r, idx) => (
                       <div key={idx} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                          <img src={r.base64} className="w-12 h-12 rounded-2xl object-cover cursor-zoom-in" alt="Receipt" onClick={() => setPreviewImage(r.base64 || null)} />
                          <div className="flex-1">
                             <p className="text-[10px] font-black text-slate-800 leading-tight">{r.name}</p>
                             <p className="text-[8px] font-bold text-slate-400 uppercase leading-none mt-1">{r.projectId}</p>
                             <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase border ${
                                  r.docStatus === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                  r.docStatus === 'rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                                  'bg-slate-50 text-slate-400 border-slate-100'
                                }`}>{r.docStatus || 'waiting'}</span>
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
                             <div className="flex gap-1">
                                <button onClick={() => setShowPassModal({ show: true, action: 'doc_toggle', targetId: selectedWithdrawal.id || null, type: 'accountant', receiptIndex: idx, nextDocStatus: 'approved' })} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle2 className="w-3.5 h-3.5"/></button>
                                <button onClick={() => setShowPassModal({ show: true, action: 'doc_toggle', targetId: selectedWithdrawal.id || null, type: 'accountant', receiptIndex: idx, nextDocStatus: 'rejected' })} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><XCircle className="w-3.5 h-3.5"/></button>
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

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-[#0F172A]/95 z-[600] p-6 flex items-center justify-center" onClick={() => setPreviewImage(null)}>
           <img src={previewImage} className="max-w-full max-h-full rounded-3xl shadow-2xl animate-in zoom-in-95" alt="Large View" />
        </div>
      )}

      {/* Mobile Nav */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 h-14 flex items-center justify-around px-2 z-40 shadow-2xl rounded-t-2xl">
        {[
          { id: 'request', label: 'ขอเบิก', icon: Plus },
          { id: 'clearance', label: 'เคลียร์', icon: Wallet },
          { id: 'history', label: 'ประวัติ', icon: HistoryIcon },
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
