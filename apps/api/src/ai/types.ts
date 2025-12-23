import { BillingInterval } from '@prisma/client';

export const EXPLAIN_TOPICS = ['duplicate', 'yearly_vs_monthly', 'category_rationale'] as const;
export type ExplainTopic = (typeof EXPLAIN_TOPICS)[number];

export const PROPOSAL_TYPES = ['RECATEGORIZE', 'SAVINGS_LIST'] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export type SubscriptionSummary = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingInterval: BillingInterval;
  nextBillingDate: string;
  category?: string | null;
  isTrial: boolean;
};

export type ExplainItem = {
  subscriptionId: string;
  summary: string;
  rationale?: string;
};

export type ExplainResult = {
  items: ExplainItem[];
  confidence?: number;
};

export type RecategorizeProposalPayload = {
  recommendations: {
    subscriptionId: string;
    proposedCategory: string;
    rationale?: string;
  }[];
};

export type SavingsListProposalPayload = {
  suggestions: {
    subscriptionId: string;
    suggestion: string;
    rationale?: string;
    estimatedSavings?: number;
  }[];
};

export type ProposalResult<TPayload extends RecategorizeProposalPayload | SavingsListProposalPayload> = {
  title: string;
  summary: string;
  payload: TPayload;
  confidence?: number;
};

export interface ExplainProvider {
  readonly name: string;
  explain(topic: ExplainTopic, subscriptions: SubscriptionSummary[]): Promise<ExplainResult>;
}

export interface ProposalProvider {
  readonly name: string;
  proposeRecategorize(
    subscriptions: SubscriptionSummary[],
  ): Promise<ProposalResult<RecategorizeProposalPayload>>;
  proposeSavingsList(
    subscriptions: SubscriptionSummary[],
  ): Promise<ProposalResult<SavingsListProposalPayload>>;
}
