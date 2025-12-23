import { BillingInterval } from '@prisma/client';

export const EXPLAIN_TOPICS = ['duplicate', 'yearly_vs_monthly', 'category_rationale'] as const;
export type ExplainTopic = (typeof EXPLAIN_TOPICS)[number];

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

export interface ExplainProvider {
  readonly name: string;
  explain(topic: ExplainTopic, subscriptions: SubscriptionSummary[]): Promise<ExplainResult>;
}
