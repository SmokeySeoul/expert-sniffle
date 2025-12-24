import { useMemo, useState } from 'react';
import { ExplanationToggle } from '../components/ExplanationToggle';

// localStorage key for subscriptions persistence
const SUBSCRIPTIONS_STORAGE_KEY = 'substream.subscriptions.v1';

type Subscription = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingInterval: 'MONTHLY' | 'YEARLY';
  nextBillingDate: string;
  category?: string | null;
  active: boolean;
  isTrial?: boolean;
  status: 'active' | 'paused' | 'cancelled';
};

type Insights = {
  monthlyTotal: number;
  yearlyTotal: number;
  topThree: Subscription[];
  renewalsIn7Days: number;
  hasEnoughData: boolean;
};

const formatAmount = (value: number, currency: string = 'USD') =>
  value.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 2 });

const daysUntilRenewal = (dateString: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewalDate = new Date(dateString);
  renewalDate.setHours(0, 0, 0, 0);
  const diff = renewalDate.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// Load subscriptions from localStorage
const loadStoredSubscriptions = (): Subscription[] => {
  try {
    const stored = localStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.warn('Failed to load stored subscriptions:', error);
    return [];
  }
};

const calculateInsights = (subscriptions: Subscription[]): Insights => {
  const activeSubscriptions = subscriptions.filter((sub) => sub.status === 'active');

  // Calculate monthly total
  const monthlyTotal = activeSubscriptions.reduce((sum, sub) => {
    const amount = typeof sub.amount === 'string' ? parseFloat(sub.amount) : sub.amount;
    if (sub.billingInterval === 'MONTHLY') {
      return sum + amount;
    } else if (sub.billingInterval === 'YEARLY') {
      return sum + amount / 12;
    }
    return sum;
  }, 0);

  // Calculate yearly total
  const yearlyTotal = activeSubscriptions.reduce((sum, sub) => {
    const amount = typeof sub.amount === 'string' ? parseFloat(sub.amount) : sub.amount;
    if (sub.billingInterval === 'MONTHLY') {
      return sum + amount * 12;
    } else if (sub.billingInterval === 'YEARLY') {
      return sum + amount;
    }
    return sum;
  }, 0);

  // Get top 3 most expensive
  const sortedByAmount = [...activeSubscriptions]
    .sort((a, b) => {
      const aAmount = typeof a.amount === 'string' ? parseFloat(a.amount) : a.amount;
      const bAmount = typeof b.amount === 'string' ? parseFloat(b.amount) : b.amount;
      return bAmount - aAmount;
    })
    .slice(0, 3);

  // Count renewals in next 7 days
  const renewalsIn7Days = activeSubscriptions.filter((sub) => {
    const days = daysUntilRenewal(sub.nextBillingDate);
    return days > 0 && days <= 7;
  }).length;

  const hasEnoughData = activeSubscriptions.length > 0;

  return {
    monthlyTotal,
    yearlyTotal,
    topThree: sortedByAmount,
    renewalsIn7Days,
    hasEnoughData,
  };
};

function InsightsPage() {
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  const toggleExplanation = (id: string) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const subscriptions = useMemo(() => loadStoredSubscriptions(), []);
  const insights = useMemo(() => calculateInsights(subscriptions), [subscriptions]);

  return (
    <div className="card">
      <div>
        <h2 style={{ margin: 0 }}>Insights</h2>
        <p className="muted" style={{ margin: 0 }}>Subscription trends from your data.</p>
      </div>

      {!insights.hasEnoughData ? (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '24px',
            marginTop: '16px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 12px 0', color: '#64748b' }}>Nothing to analyze yet.</p>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
            Add a subscription to see insights.
          </p>
        </div>
      ) : (
        <>
          <div className="card" style={{ background: '#f8fafc', marginTop: '16px' }}>
            <h3 style={{ marginTop: 0 }}>Your Spending</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
              <div>
                <div className="muted" style={{ marginBottom: '8px' }}>Monthly total</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
                  {formatAmount(insights.monthlyTotal, 'USD')}
                </div>
                <ExplanationToggle
                  id="monthly-total"
                  isExpanded={expandedExplanations['monthly-total'] || false}
                  onToggle={toggleExplanation}
                >
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>
                    Sum of all active subscriptions converted to monthly amounts. Yearly subscriptions divided by 12.
                  </p>
                </ExplanationToggle>
              </div>

              <div>
                <div className="muted" style={{ marginBottom: '8px' }}>Yearly total</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
                  {formatAmount(insights.yearlyTotal, 'USD')}
                </div>
                <ExplanationToggle
                  id="yearly-total"
                  isExpanded={expandedExplanations['yearly-total'] || false}
                  onToggle={toggleExplanation}
                >
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>
                    Annual spending projection. Monthly subscriptions × 12 + yearly subscriptions.
                  </p>
                </ExplanationToggle>
              </div>
            </div>
          </div>

          {insights.topThree.length > 0 && (
            <div className="card" style={{ background: '#f8fafc', marginTop: '16px' }}>
              <h3 style={{ marginTop: 0 }}>Most Expensive</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {insights.topThree.map((sub) => (
                  <div
                    key={sub.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{sub.name}</div>
                      <div className="muted" style={{ fontSize: '0.9rem' }}>
                        {sub.billingInterval === 'MONTHLY' ? 'Monthly' : 'Yearly'}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                      {formatAmount(
                        typeof sub.amount === 'string' ? parseFloat(sub.amount) : sub.amount,
                        'USD'
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <ExplanationToggle
                id="top-three"
                isExpanded={expandedExplanations['top-three'] || false}
                onToggle={toggleExplanation}
              >
                <p style={{ margin: '12px 0 0 0', fontSize: '0.95rem' }}>
                  Your three highest-cost subscriptions. Focus on these to find savings.
                </p>
              </ExplanationToggle>
            </div>
          )}

          <div className="card" style={{ background: '#f8fafc', marginTop: '16px' }}>
            <h3 style={{ marginTop: 0 }}>Next 7 Days</h3>
            {insights.renewalsIn7Days > 0 ? (
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
                  {insights.renewalsIn7Days} {insights.renewalsIn7Days === 1 ? 'renewal' : 'renewals'}
                </div>
                <ExplanationToggle
                  id="upcoming-renewals"
                  isExpanded={expandedExplanations['upcoming-renewals'] || false}
                  onToggle={toggleExplanation}
                >
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>
                    Number of subscriptions renewing in the next 7 days based on their renewal dates.
                  </p>
                </ExplanationToggle>
              </div>
            ) : (
              <div>
                <p style={{ margin: 0, color: '#94a3b8' }}>No renewals coming up in the next week.</p>
              </div>
            )}
          </div>
        </>
      )}

      <div className="card" style={{ background: '#f0f4f8', marginTop: '24px', padding: '16px' }}>
        <details style={{ cursor: 'pointer' }}>
          <summary style={{ fontWeight: 500, userSelect: 'none' }}>Why am I seeing this?</summary>
          <div style={{ marginTop: '12px', fontSize: '0.95rem', lineHeight: 1.6, color: '#475569' }}>
            <p>
              <strong>Insights</strong> are calculated entirely from your subscription data. We analyze:
            </p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
              <li>
                <strong>Amounts & Billing Intervals:</strong> Monthly and yearly spending projections from your subscription list.
              </li>
              <li>
                <strong>Top Subscriptions:</strong> Sorted by amount to highlight high costs.
              </li>
              <li>
                <strong>Upcoming Renewals:</strong> Based on the renewal dates you've recorded.
              </li>
            </ul>
            <p>
              <strong>No backend calls or AI</strong> — purely local math on what you've entered.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

export default InsightsPage;
