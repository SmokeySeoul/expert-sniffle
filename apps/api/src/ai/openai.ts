import { AIProvider, ExplainItem, ExplainTopic, RedactedSubscription, RedactedSubscriptionWithMeta, RecategorizeProposalItem, SavingsProposalItem } from './provider';
import { env } from '../env';
import { z } from 'zod';

export class OpenAIProvider implements AIProvider {
  async explain(topic: ExplainTopic, subs: RedactedSubscription[]): Promise<ExplainItem[]> {
    if (!env.OPENAI_API_KEY) {
      const err: any = new Error('AI provider unavailable');
      err.code = 'NO_KEY';
      throw err;
    }
    // Placeholder: in real implementation, call OpenAI with redacted inputs.
    return [
      {
        title: `OpenAI ${topic} insight`,
        whyItMatters: 'Summary generated using OpenAI.',
        explanation: `Subscriptions analyzed: ${subs.length}.`,
        confidence: 0.5,
        inputsUsed: subs.slice(0, 3).map((s) => s.name)
      }
    ];
  }

  async proposeRecategorize(subs: RedactedSubscriptionWithMeta[]): Promise<RecategorizeProposalItem[]> {
    this.ensureKey();
    const schema = z.array(
      z.object({
        subscriptionId: z.string(),
        fromCategory: z.string().nullable().optional(),
        toCategory: z.string(),
        rationale: z.string(),
        confidence: z.number()
      })
    );
    // Placeholder deterministic output
    return schema.parse(
      subs.slice(0, 3).map((s) => ({
        subscriptionId: s.id,
        fromCategory: s.fromCategory || null,
        toCategory: s.category || 'General',
        rationale: `Suggested based on name ${s.name}`,
        confidence: 0.65
      }))
    );
  }

  async proposeSavingsList(subs: RedactedSubscriptionWithMeta[]): Promise<SavingsProposalItem[]> {
    this.ensureKey();
    const schema = z.array(
      z.object({
        subscriptionId: z.string(),
        potentialAnnualDelta: z.number(),
        explanation: z.string(),
        confidence: z.number()
      })
    );
    return schema.parse(
      subs.slice(0, 3).map((s) => ({
        subscriptionId: s.id,
        potentialAnnualDelta: Number((s.amount * 12 * 0.1).toFixed(2)),
        explanation: `Estimated annual delta for ${s.name}`,
        confidence: 0.6
      }))
    );
  }

  private ensureKey() {
    if (!env.OPENAI_API_KEY) {
      const err: any = new Error('AI provider unavailable');
      err.code = 'NO_KEY';
      throw err;
    }
  }
}
