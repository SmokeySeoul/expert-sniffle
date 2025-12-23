import OpenAI from 'openai';
import { z } from 'zod';
import {
  ExplainProvider,
  ExplainResult,
  ExplainTopic,
  ProposalProvider,
  ProposalResult,
  RecategorizeProposalPayload,
  SavingsListProposalPayload,
  SubscriptionSummary,
} from './types';

const explainSchema = z.object({
  items: z
    .array(
      z.object({
        subscriptionId: z.string(),
        summary: z.string().min(1).max(400),
        rationale: z.string().min(1).max(400).optional(),
      }),
    )
    .min(1),
  confidence: z.number().min(0).max(1).optional(),
});

const recategorizeSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(300),
  payload: z.object({
    recommendations: z
      .array(
        z.object({
          subscriptionId: z.string(),
          proposedCategory: z.string().min(1).max(50),
          rationale: z.string().min(1).max(400).optional(),
        }),
      )
      .min(1),
  }),
  confidence: z.number().min(0).max(1).optional(),
});

const savingsListSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(300),
  payload: z.object({
    suggestions: z
      .array(
        z.object({
          subscriptionId: z.string(),
          suggestion: z.string().min(1).max(200),
          rationale: z.string().min(1).max(400).optional(),
          estimatedSavings: z.number().min(0).max(1_000_000).optional(),
        }),
      )
      .min(1),
  }),
  confidence: z.number().min(0).max(1).optional(),
});

export class OpenAIExplainProvider implements ExplainProvider, ProposalProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async explain(topic: ExplainTopic, subscriptions: SubscriptionSummary[]): Promise<ExplainResult> {
    const sanitizedSubscriptions = subscriptions.map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      amount: subscription.amount,
      currency: subscription.currency,
      billingInterval: subscription.billingInterval,
      nextBillingDate: subscription.nextBillingDate,
      category: subscription.category ?? 'uncategorized',
      isTrial: subscription.isTrial,
    }));

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You explain subscription data with short, neutral statements. Do not suggest actions or make decisions. Respond ONLY with valid JSON.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Provide a short explanation for the subscriptions with respect to the topic.',
            topic,
            subscriptions: sanitizedSubscriptions,
            requiredSchema: {
              items: 'Array of { subscriptionId, summary, rationale? }',
              confidence: 'Optional number 0-1 expressing certainty',
            },
          }),
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content;

    if (!rawContent) {
      throw new Error('Empty response from AI provider');
    }

    let parsed: ExplainResult;
    try {
      parsed = explainSchema.parse(JSON.parse(rawContent));
    } catch (error) {
      throw new Error('Invalid response from AI provider');
    }

    return parsed;
  }

  async proposeRecategorize(
    subscriptions: SubscriptionSummary[],
  ): Promise<ProposalResult<RecategorizeProposalPayload>> {
    return this.requestProposal({
      schema: recategorizeSchema,
      task: 'Provide a short, read-only proposal for category alignment without recommending any actions.',
      type: 'RECATEGORIZE',
      subscriptions,
    });
  }

  async proposeSavingsList(
    subscriptions: SubscriptionSummary[],
  ): Promise<ProposalResult<SavingsListProposalPayload>> {
    return this.requestProposal({
      schema: savingsListSchema,
      task: 'Summarize possible savings to review. Do not include instructions, commands, or steps to execute.',
      type: 'SAVINGS_LIST',
      subscriptions,
    });
  }

  private async requestProposal<T extends RecategorizeProposalPayload | SavingsListProposalPayload>({
    schema,
    task,
    type,
    subscriptions,
  }: {
    schema: z.ZodSchema<ProposalResult<T>>;
    task: string;
    type: 'RECATEGORIZE' | 'SAVINGS_LIST';
    subscriptions: SubscriptionSummary[];
  }): Promise<ProposalResult<T>> {
    const sanitizedSubscriptions = subscriptions.map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      amount: subscription.amount,
      currency: subscription.currency,
      billingInterval: subscription.billingInterval,
      nextBillingDate: subscription.nextBillingDate,
      category: subscription.category ?? 'uncategorized',
      isTrial: subscription.isTrial,
    }));

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You draft concise, review-only proposals for subscriptions. Never include commands, links, or automation steps. Respond ONLY with valid JSON.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task,
            type,
            subscriptions: sanitizedSubscriptions,
            requiredSchema: 'Follow the provided schema exactly; keep statements neutral and non-executable.',
          }),
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content;

    if (!rawContent) {
      throw new Error('Empty response from AI provider');
    }

    try {
      return schema.parse(JSON.parse(rawContent));
    } catch (error) {
      throw new Error('Invalid response from AI provider');
    }
  }
}
