import React from 'react';
import { motion } from 'framer-motion';
import { Withdrawal } from '../types';
import { Wallet, Calendar, AlertCircle } from 'lucide-react';

interface WeeklyReportUIProps {
  withdrawals: Withdrawal[];
  onClear: (advanceId: string) => void;
}

interface EmployeeSummary {
  employeeName: string;
  totalBalance: number;
  items: Withdrawal[];
}

const COLORS = ['#1A4B5F', '#267F8C', '#3F7B9D', '#5FA8D3'];

export const WeeklyReportUI: React.FC<WeeklyReportUIProps> = ({ withdrawals, onClear }) => {
  // Aggregate data by employee
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
    }, {} as Record<string, EmployeeSummary>);

  const employeeList: EmployeeSummary[] = Object.values(pendingByEmployee);

  if (employeeList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
        <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-sm font-black uppercase tracking-widest leading-none">No Pending Reports</p>
        <p className="text-[10px] mt-2 font-bold">All advances have been cleared!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-6 -mx-3 px-3 scrollbar-hide">
      <div className="flex gap-4 min-w-max">
        {employeeList.map((emp, idx) => {
          const bgColor = COLORS[idx % COLORS.length];
          return (
            <motion.div
              key={emp.employeeName}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="w-[280px] bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div 
                className="p-5 text-white" 
                style={{ backgroundColor: bgColor }}
              >
                <h3 className="text-sm font-black uppercase tracking-tight">{emp.employeeName}</h3>
                <p className="text-lg font-black mt-1">
                  ฿{emp.totalBalance.toLocaleString()}
                </p>
                <div className="text-[9px] font-bold opacity-60 uppercase tracking-widest mt-0.5">รวมยอดค้างเคลียร์</div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-6 flex-1">
                {emp.items.map((item) => {
                  const deadline = item.clearanceDeadline ? new Date(item.clearanceDeadline) : new Date(new Date(item.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
                  const now = new Date();
                  const diffTime = deadline.getTime() - now.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  const progress = (item.actualSpend / item.totalAmount) * 100;
                  
                  const isUrgent = diffDays <= 7;

                  return (
                    <div key={item.id} className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black text-slate-800 uppercase">{item.advanceId}</span>
                        <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                           <Calendar className="w-3 h-3" />
                           {deadline.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' })}
                        </div>
                      </div>
                      
                      <div className="flex justify-between text-[11px] font-black text-slate-500">
                        <span>฿{item.actualSpend.toLocaleString()} / ฿{item.totalAmount.toLocaleString()}</span>
                      </div>

                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: `${Math.min(progress, 100)}%`, 
                            backgroundColor: isUrgent ? '#ef4444' : bgColor 
                          }}
                        />
                      </div>

                      <div className="flex justify-end">
                        <span className={`text-[9px] font-black uppercase ${isUrgent ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                          {diffDays < 0 ? `เกินกำหนด ${Math.abs(diffDays)} วัน` : isUrgent ? `ด่วน! ${diffDays} วัน` : `เหลือ ${diffDays} วัน`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 mt-auto border-t border-slate-100">
                <button
                  onClick={() => onClear(emp.items[0].advanceId)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:brightness-95 active:scale-95"
                  style={{ backgroundColor: `${bgColor}20`, color: bgColor }}
                >
                  <Wallet className="w-3 h-3" />
                  เคลียร์ยอด
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
