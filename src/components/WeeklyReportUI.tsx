import React from 'react';
import { motion } from 'motion/react';
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
    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-50 flex items-center justify-between">
        <div>
           <h3 className="text-sm font-black text-slate-800 uppercase leading-none">Pending Clearances</h3>
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Advances awaiting settlement</p>
        </div>
        <div className="text-right">
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Outstanding</p>
           <p className="text-xl font-black text-slate-900 leading-none">฿{employeeList.reduce((s,e) => s + e.totalBalance, 0).toLocaleString()}</p>
        </div>
      </div>
      <div className="divide-y divide-slate-50">
        {employeeList.map((emp, idx) => (
          <div key={emp.employeeName} className="p-6 hover:bg-slate-50/50 transition-colors">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                 <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black text-white shadow-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }}>
                    {emp.employeeName.charAt(0)}
                 </div>
                 <div>
                    <h4 className="text-base font-black text-slate-800 leading-none">{emp.employeeName}</h4>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">{emp.items.length} Pending Advances</p>
                 </div>
              </div>
              
              <div className="flex-1 lg:max-w-md">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {emp.items.map(item => {
                      const deadline = item.clearanceDeadline ? new Date(item.clearanceDeadline) : new Date(new Date(item.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
                      const now = new Date();
                      const isOverdue = now > deadline;
                      return (
                        <div key={item.id} className={`p-3 rounded-xl border ${isOverdue ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                           <div className="flex justify-between items-start mb-1">
                              <span className="text-[9px] font-black text-slate-900 uppercase">{item.advanceId}</span>
                              <span className={`text-[8px] font-black uppercase ${isOverdue ? 'text-rose-500' : 'text-slate-400'}`}>
                                {isOverdue ? 'Overdue' : `${Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))} Days Left`}
                              </span>
                           </div>
                           <div className="text-[11px] font-black text-slate-900 mb-1">฿{item.balance.toLocaleString()}</div>
                           <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(item.actualSpend / item.totalAmount) * 100}%` }}></div>
                           </div>
                        </div>
                      );
                    })}
                 </div>
              </div>

              <div className="flex items-center gap-3">
                 <div className="text-right pr-4 border-r border-slate-100 hidden sm:block">
                    <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">Balance</p>
                    <p className="text-lg font-black text-slate-900 leading-none">฿{emp.totalBalance.toLocaleString()}</p>
                 </div>
                 <button
                    onClick={() => onClear(emp.items[0].advanceId)}
                    className="bg-[#0F172A] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center gap-2"
                 >
                    <Wallet className="w-3.5 h-3.5" />
                    Settlement
                 </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
