export type AIExplainTopic = 'duplicate' | 'yearly_vs_monthly' | 'category_rationale';

export interface AIExplainItem {
  title: string;
  whyItMatters: string;
  explanation: string;
  confidence: number;
  inputsUsed: string[];
}

export interface AIStatus {
  enabled: boolean;
  provider: string;
}

export interface AILog {
  id: string;
  createdAt: string;
  topic: string;
  provider: string;
  success: boolean;
  latencyMs: number;
  nextCursor?: string | null;
}

export type AIProposalType = 'RECATEGORIZE' | 'SAVINGS_LIST';
export type AIProposalStatus = 'ACTIVE' | 'DISMISSED' | 'EXPIRED';

export interface RecategorizeProposalItem {
  subscriptionId: string;
  fromCategory?: string | null;
  toCategory: string;
  rationale: string;
  confidence: number;
}

export interface SavingsProposalItem {
  subscriptionId: string;
  potentialAnnualDelta: number;
  explanation: string;
  confidence: number;
}

export interface AIProposal {
  id: string;
  type: AIProposalType;
  status: AIProposalStatus;
  title: string;
  summary: string;
  confidence?: number | null;
  createdAt: string;
  expiresAt: string;
  payload?: {
    items: RecategorizeProposalItem[] | SavingsProposalItem[];
  };
  appliedPatchId?: string | null;
}

export type RecategorizePatch = {
  type: 'RECATEGORIZE';
  changes: Array<{
    subscriptionId: string;
    fromCategory: string | null;
    toCategory: string | null;
  }>;
};

export type AIPatchStatus = 'APPLIED' | 'ROLLED_BACK';

export interface AIPatchSummary {
  id: string;
  proposalId: string;
  status: AIPatchStatus;
  appliedAt: string;
  rolledBackAt?: string | null;
  changeCount: number;
  type: AIProposalType;
}
