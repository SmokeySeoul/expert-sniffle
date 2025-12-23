import { env } from '../env';

export type ExplainTopic = 'duplicate' | 'yearly_vs_monthly' | 'category_rationale';

export interface RedactedSubscription {
  name: string;
  amount: number;
  currency: string;
  billingInterval: string;
  category?: string | null;
}

export interface ExplainItem {
  title: string;
  whyItMatters: string;
  explanation: string;
  confidence: number;
  inputsUsed: string[];
}

export interface AIProvider {
  explain(topic: ExplainTopic, subs: RedactedSubscription[]): Promise<ExplainItem[]>;
  proposeRecategorize(subs: RedactedSubscriptionWithMeta[]): Promise<RecategorizeProposalItem[]>;
  proposeSavingsList(subs: RedactedSubscriptionWithMeta[]): Promise<SavingsProposalItem[]>;
}

export function getProvider(): AIProvider {
  const providerName = env.AI_PROVIDER;
  if (providerName === 'openai') {
    const { OpenAIProvider } = require('./openai');
    return new OpenAIProvider();
  }
  const { MockAIProvider } = require('./mock');
  return new MockAIProvider();
}

export function redactSubscriptions(subs: any[]): RedactedSubscription[] {
  return subs.map((s) => ({
    name: String(s.name || '').slice(0, 64),
    amount: Number(s.amount ?? 0),
    currency: String(s.currency || 'USD').slice(0, 8),
    billingInterval: String(s.billingInterval || ''),
    category: s.category ? String(s.category).slice(0, 32) : undefined
  }));
}

export interface RedactedSubscriptionWithMeta extends RedactedSubscription {
  id: string;
  fromCategory?: string | null;
}

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
