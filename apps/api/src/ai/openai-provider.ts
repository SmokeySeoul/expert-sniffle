import OpenAI from 'openai';
import { z } from 'zod';
import { ExplainProvider, ExplainResult, ExplainTopic, SubscriptionSummary } from './types';

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

export class OpenAIExplainProvider implements ExplainProvider {
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
}
