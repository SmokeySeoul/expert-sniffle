import { ExplainProvider, ExplainResult, ExplainTopic, SubscriptionSummary } from './types';

function intervalLabel(interval: SubscriptionSummary['billingInterval']): string {
  return interval === 'YEARLY' ? 'yearly' : 'monthly';
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

export class MockExplainProvider implements ExplainProvider {
  readonly name = 'mock';

  async explain(topic: ExplainTopic, subscriptions: SubscriptionSummary[]): Promise<ExplainResult> {
    const items = subscriptions.map((subscription) => ({
      subscriptionId: subscription.id,
      summary: this.buildSummary(topic, subscription),
      rationale: this.buildRationale(topic, subscription),
    }));

    return { items, confidence: 0.42 };
  }

  private buildSummary(topic: ExplainTopic, subscription: SubscriptionSummary): string {
    const cadence = intervalLabel(subscription.billingInterval);
    const amount = formatAmount(subscription.amount, subscription.currency);

    switch (topic) {
      case 'duplicate':
        return `${subscription.name} might overlap with another service. It bills ${cadence} at ${amount}.`;
      case 'yearly_vs_monthly':
        return `${subscription.name} bills on a ${cadence} cadence at ${amount}. Confirm that timing fits your usage.`;
      case 'category_rationale':
        return `${subscription.name} is treated as ${subscription.category ?? 'uncategorized'} with a ${cadence} charge of ${amount}.`;
      default:
        return `${subscription.name} has a ${cadence} charge of ${amount}.`;
    }
  }

  private buildRationale(topic: ExplainTopic, subscription: SubscriptionSummary): string {
    switch (topic) {
      case 'duplicate':
        return 'Check recent statements to confirm you still need overlapping services.';
      case 'yearly_vs_monthly':
        return subscription.billingInterval === 'YEARLY'
          ? 'Annual billing can lower total cost if you keep the service long term.'
          : 'Monthly billing keeps flexibility to pause or cancel sooner.';
      case 'category_rationale':
        return subscription.category
          ? `Category comes from your saved tag "${subscription.category}".`
          : 'No category was set; consider tagging it for clearer reports.';
      default:
        return 'Review details to ensure this subscription still makes sense.';
    }
  }
}
