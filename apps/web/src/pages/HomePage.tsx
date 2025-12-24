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
  createdAt?: string;
};

const formatAmount = (value: number, currency: string = 'USD') =>
  value.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 2 });

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

const daysUntilRenewal = (dateString: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewalDate = new Date(dateString);
  renewalDate.setHours(0, 0, 0, 0);
  const diff = renewalDate.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const daysSinceCreation = (createdAtString?: string): number => {
  if (!createdAtString) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const created = new Date(createdAtString);
  created.setHours(0, 0, 0, 0);
  const diff = today.getTime() - created.getTime();
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

type TimelineData = {
  upcoming: {
    trialsEndingSoon: Subscription[];
    renewalsInNext30: Subscription[];
  };
  present: {
    actionableItems: Subscription[];
  };
  past: {
    recentlyAdded: Subscription[];
  };
};

const calculateTimeline = (subscriptions: Subscription[]): TimelineData => {
  const activeSubscriptions = subscriptions.filter((sub) => sub.status === 'active');

  // Upcoming: Trials ending soon
  const trialsEndingSoon = activeSubscriptions.filter((sub) => {
    if (!sub.isTrial) return false;
    const days = daysUntilRenewal(sub.nextBillingDate);
    return days >= 0 && days <= 30;
  });

  // Upcoming: Renewals in next 30 days
  const renewalsInNext30 = activeSubscriptions.filter((sub) => {
    if (sub.isTrial) return false; // Don't double-count trials
    const days = daysUntilRenewal(sub.nextBillingDate);
    return days >= 0 && days <= 30;
  });

  // Present: Nothing to do (if no upcoming items)
  const actionableItems = [...trialsEndingSoon, ...renewalsInNext30];

  // Past: Recently added (last 5)
  const recentlyAdded = [...activeSubscriptions]
    .sort((a, b) => {
      const aDate = new Date(a.createdAt || '1970-01-01').getTime();
      const bDate = new Date(b.createdAt || '1970-01-01').getTime();
      return bDate - aDate;
    })
    .slice(0, 5);

  return {
    upcoming: {
      trialsEndingSoon,
      renewalsInNext30,
    },
    present: {
      actionableItems,
    },
    past: {
      recentlyAdded,
    },
  };
};

function HomePage() {
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  const toggleExplanation = (id: string) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const subscriptions = useMemo(() => loadStoredSubscriptions(), []);
  const timeline = useMemo(() => calculateTimeline(subscriptions), [subscriptions]);

  const isEmpty = subscriptions.length === 0;

  return (
    <div className="card">
      <div>
        <h2 style={{ margin: 0 }}>Your Subscriptions Timeline</h2>
        <p className="muted" style={{ margin: 0 }}>Past, present, and what's coming up.</p>
      </div>

      {isEmpty ? (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '32px 24px',
            marginTop: '16px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 12px 0', color: '#64748b', fontSize: '1rem' }}>
            We'll start building your timeline as you add subscriptions.
          </p>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
            Head to <strong>Subscriptions</strong> to get started.
          </p>
        </div>
      ) : (
        <>
          {/* UPCOMING SECTION */}
          <div className="card" style={{ background: '#fefbf3', marginTop: '24px', borderLeft: '4px solid #f59e0b' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#b45309' }}>📅 Upcoming</h3>

            {timeline.upcoming.trialsEndingSoon.length === 0 && timeline.upcoming.renewalsInNext30.length === 0 ? (
              <p style={{ margin: 0, color: '#94a3b8' }}>No trials or renewals coming up in the next 30 days.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Trials Ending Soon */}
                {timeline.upcoming.trialsEndingSoon.length > 0 && (
                  <div>
                    <div className="muted" style={{ marginBottom: '8px', fontSize: '0.9rem' }}>
                      ⏱️ Trials ending soon
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {timeline.upcoming.trialsEndingSoon.map((sub) => (
                        <div
                          key={sub.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px',
                            background: '#fff',
                            border: '1px solid #fed7aa',
                            borderRadius: '4px',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 500 }}>{sub.name}</div>
                            <div className="muted" style={{ fontSize: '0.85rem' }}>
                              Trial ends {formatDate(sub.nextBillingDate)} ({daysUntilRenewal(sub.nextBillingDate)} days)
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Renewals in Next 30 Days */}
                {timeline.upcoming.renewalsInNext30.length > 0 && (
                  <div>
                    <div className="muted" style={{ marginBottom: '8px', fontSize: '0.9rem' }}>
                      🔄 Renewals in next 30 days
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {timeline.upcoming.renewalsInNext30.map((sub) => (
                        <div
                          key={sub.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px',
                            background: '#fff',
                            border: '1px solid #fed7aa',
                            borderRadius: '4px',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 500 }}>{sub.name}</div>
                            <div className="muted" style={{ fontSize: '0.85rem' }}>
                              Renews {formatDate(sub.nextBillingDate)} ({daysUntilRenewal(sub.nextBillingDate)} days)
                            </div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                            {formatAmount(typeof sub.amount === 'string' ? parseFloat(sub.amount) : sub.amount, 'USD')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PRESENT SECTION */}
          <div className="card" style={{ background: '#f0fdf4', marginTop: '24px', borderLeft: '4px solid #22c55e' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#166534' }}>✓ Right Now</h3>

            {timeline.present.actionableItems.length === 0 ? (
              <p style={{ margin: 0, color: '#94a3b8' }}>Nothing to do right now.</p>
            ) : (
              <p style={{ margin: 0, color: '#94a3b8' }}>You're all caught up! {timeline.present.actionableItems.length} upcoming action(s) listed above.</p>
            )}
          </div>

          {/* PAST SECTION */}
          {timeline.past.recentlyAdded.length > 0 && (
            <div className="card" style={{ background: '#f3f4f6', marginTop: '24px', borderLeft: '4px solid #6b7280' }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#374151' }}>🚀 Recently Added</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {timeline.past.recentlyAdded.map((sub) => (
                  <div
                    key={sub.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      background: '#fff',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{sub.name}</div>
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        Added {daysSinceCreation(sub.createdAt)} days ago
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                      {formatAmount(typeof sub.amount === 'string' ? parseFloat(sub.amount) : sub.amount, 'USD')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* INFO SECTION */}
      <div className="card" style={{ background: '#f0f4f8', marginTop: '24px', padding: '16px' }}>
        <details style={{ cursor: 'pointer' }}>
          <summary style={{ fontWeight: 500, userSelect: 'none' }}>How does this work?</summary>
          <div style={{ marginTop: '12px', fontSize: '0.95rem', lineHeight: 1.6, color: '#475569' }}>
            <p>
              Your timeline organizes subscriptions across three timeframes:
            </p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
              <li>
                <strong>Upcoming:</strong> Trials ending or renewals happening in the next 30 days.
              </li>
              <li>
                <strong>Right Now:</strong> Status check. If you have upcoming items, they're listed above.
              </li>
              <li>
                <strong>Recently Added:</strong> Your 5 most recent subscriptions. Great for catching what you just signed up for.
              </li>
            </ul>
            <p style={{ margin: '12px 0 0 0' }}>
              Explore <strong>Subscriptions</strong> to manage your full list, or <strong>Insights</strong> to see spending trends.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

export default HomePage;
