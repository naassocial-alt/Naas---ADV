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
  };
}

export interface Receipt {
  name: string;
  amount: number;
  base64?: string;
  fileName: string;
  isProcessing?: boolean;
  projectId: string;
  description: string;
  originalAmount: number;
  isDuplicate?: boolean;
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
  projectIds: string[];
  items: Array<{
    name: string;
    amount: number;
    category: string;
  }>;
  receipts: Receipt[];
}

export interface SystemConfigs {
  execPin: string;
  accPin: string;
  projects?: string[];
  categories?: string[];
  sheetsUrl?: string;
}
