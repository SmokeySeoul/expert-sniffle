import { AIProvider, ExplainItem, ExplainTopic, RedactedSubscription } from './provider';
import { RedactedSubscriptionWithMeta, RecategorizeProposalItem, SavingsProposalItem } from './provider';

export class MockAIProvider implements AIProvider {
  async explain(topic: ExplainTopic, subs: RedactedSubscription[]): Promise<ExplainItem[]> {
    const base: ExplainItem = {
      title: `Mock ${topic} insight`,
      whyItMatters: 'Helps you review subscriptions calmly.',
      explanation: `We looked at ${subs.length} subscriptions and generated a neutral note for ${topic}.`,
      confidence: 0.42,
      inputsUsed: subs.slice(0, 3).map((s) => `${s.name} ${s.amount}/${s.billingInterval}`)
    };
    return [base];
  }

  async proposeRecategorize(subs: RedactedSubscriptionWithMeta[]): Promise<RecategorizeProposalItem[]> {
    return subs.slice(0, 3).map((s, idx) => ({
      subscriptionId: s.id,
      fromCategory: s.fromCategory || null,
      toCategory: (s.category && s.category !== '') ? s.category : `Proposed ${idx + 1}`,
      rationale: `Categorized based on name "${s.name}"`,
      confidence: 0.6
    }));
  }

  async proposeSavingsList(subs: RedactedSubscriptionWithMeta[]): Promise<SavingsProposalItem[]> {
    return subs.slice(0, 3).map((s) => ({
      subscriptionId: s.id,
      potentialAnnualDelta: Number((s.amount * 12 * 0.1).toFixed(2)),
      explanation: `Switching ${s.name} to annual may save ~10%`,
      confidence: 0.55
    }));
  }
}
