export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isDefault?: boolean;
}

export interface Receipt {
  name: string;
  amount: number;
  base64?: string;
  driveUrl?: string; // Add this
  fileName: string;
  isProcessing?: boolean;
  projectId: string;
  description: string;
  originalAmount: number;
  isDuplicate?: boolean;
  duplicateInfo?: { project: string; advanceId: string };
  additionalDocs?: Array<{ base64: string; fileName: string; driveUrl?: string }>;
  isEdited?: boolean;
  docStatus?: 'waiting' | 'approved' | 'rejected';
}

export interface Withdrawal {
  id?: string;
  advanceId: string;
  employeeName: string;
  status: 'pending' | 'approved' | 'rejected';
  clearanceStatus: 'none' | 'partial' | 'cleared';
  totalAmount: number;
  actualSpend: number;
  balance: number;
  createdAt: string;
  approvedAt?: string;
  clearedAt?: string;
  clearanceDeadline?: string;
  projectIds: string[];
  bankAccount?: BankAccount; // New field for bank details
  transferSlip?: string; // Base64 proof of transfer
  items: Array<{
    name: string;
    amount: number;
    category: string;
  }>;
  receipts: Receipt[];
  accountStatus?: 'open' | 'closed';
  finalApprovedTotal?: number;
  accountingConclusion?: string;
  closedAt?: string;
}

export interface Approver {
  lineId: string;
  name: string;
}

export interface SystemConfigs {
  execPin: string;
  accPin: string;
  projects?: string[];
  categories?: string[];
  sheetsUrl?: string;
  webAppUrl?: string;
  allowedLineIds?: string[];
  approvers?: Approver[];
  employeeBankAccounts?: { [employeeName: string]: BankAccount[] };
}
