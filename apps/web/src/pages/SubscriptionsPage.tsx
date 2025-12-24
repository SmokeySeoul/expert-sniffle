import { useRef, useState, useEffect } from 'react';
import { ExplanationToggle } from '../components/ExplanationToggle';

// Shared button focus styles
const buttonBaseStyles = {
  transition: 'all 0.2s ease-out',
};

const buttonFocusStyles = {
  outline: '2px solid #000',
  outlineOffset: '2px',
};

// localStorage key for subscriptions persistence
const SUBSCRIPTIONS_STORAGE_KEY = 'substream.subscriptions.v1';

// Sample subscription data for MVP
const SAMPLE_SUBSCRIPTIONS = [
  {
    id: '1',
    name: 'Netflix',
    amount: 15.99,
    currency: 'USD',
    billingInterval: 'MONTHLY' as const,
    nextBillingDate: '2025-01-15',
    category: 'Entertainment',
    active: true,
    isTrial: false,
    status: 'active' as const,
  },
  {
    id: '2',
    name: 'Spotify',
    amount: 12.99,
    currency: 'USD',
    billingInterval: 'MONTHLY' as const,
    nextBillingDate: '2025-01-08',
    category: 'Music',
    active: true,
    isTrial: false,
    status: 'active' as const,
  },
  {
    id: '3',
    name: 'Adobe Creative Cloud',
    amount: 54.99,
    currency: 'USD',
    billingInterval: 'MONTHLY' as const,
    nextBillingDate: '2025-01-20',
    category: 'Software',
    active: true,
    isTrial: false,
    status: 'active' as const,
  },
  {
    id: '4',
    name: 'Notion Plus',
    amount: 10,
    currency: 'USD',
    billingInterval: 'MONTHLY' as const,
    nextBillingDate: '2025-02-01',
    category: 'Productivity',
    active: true,
    isTrial: true,
    status: 'active' as const,
  },
  {
    id: '5',
    name: 'Apple One',
    amount: 9.95,
    currency: 'USD',
    billingInterval: 'MONTHLY' as const,
    nextBillingDate: '2025-01-25',
    category: 'Entertainment',
    active: true,
    isTrial: false,
    status: 'active' as const,
  },
];

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

type AddSubscriptionForm = {
  name: string;
  amount: string;
  billingInterval: 'MONTHLY' | 'YEARLY' | 'TRIAL';
  nextBillingDate: string;
  notes: string;
};

const formatAmount = (value: number, currency: string) =>
  value.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 2 });

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

// Load subscriptions from localStorage with error handling
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
    console.warn('Failed to load stored subscriptions, starting fresh:', error);
    return [];
  }
};

// Save subscriptions to localStorage
const saveSubscriptionsToStorage = (subscriptions: Subscription[]): void => {
  try {
    localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(subscriptions));
  } catch (error) {
    console.warn('Failed to save subscriptions to localStorage:', error);
  }
};

// Calculate days until renewal
const daysUntilRenewal = (dateString: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewalDate = new Date(dateString);
  renewalDate.setHours(0, 0, 0, 0);
  const diff = renewalDate.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// Group subscriptions by timeline period
type TimelineGroup = 'within24h' | 'within7days' | 'within30days' | 'later';

const getTimelineGroup = (subscription: Subscription): TimelineGroup => {
  const days = daysUntilRenewal(subscription.nextBillingDate);
  if (days <= 1) return 'within24h';
  if (days <= 7) return 'within7days';
  if (days <= 30) return 'within30days';
  return 'later';
};

const groupSubscriptionsByTimeline = (subs: Subscription[]) => {
  const grouped: Record<TimelineGroup, Subscription[]> = {
    within24h: [],
    within7days: [],
    within30days: [],
    later: [],
  };

  subs.forEach((sub) => {
    const group = getTimelineGroup(sub);
    grouped[group].push(sub);
  });

  // Sort each group by date
  Object.keys(grouped).forEach((key) => {
    grouped[key as TimelineGroup].sort(
      (a, b) =>
        new Date(a.nextBillingDate).getTime() - new Date(b.nextBillingDate).getTime()
    );
  });

  return grouped;
};

function SubscriptionsPage() {
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});
  const [userSubscriptions, setUserSubscriptions] = useState<Subscription[]>(() =>
    loadStoredSubscriptions()
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddSubscriptionForm>({
    name: '',
    amount: '',
    billingInterval: 'MONTHLY',
    nextBillingDate: '',
    notes: '',
  });
  const [addConfirmation, setAddConfirmation] = useState<string | null>(null);
  const [actionConfirmations, setActionConfirmations] = useState<Record<string, string | null>>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Persist subscriptions to localStorage whenever they change
  useEffect(() => {
    saveSubscriptionsToStorage(userSubscriptions);
  }, [userSubscriptions]);

  const toggleExplanation = (id: string) => {
    setExpandedExplanations((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setAddConfirmation(null);
    // Focus first input after modal opens
    setTimeout(() => firstInputRef.current?.focus(), 0);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setAddForm({
      name: '',
      amount: '',
      billingInterval: 'MONTHLY',
      nextBillingDate: '',
      notes: '',
    });
  };

  const handleAddFormChange = (field: keyof AddSubscriptionForm, value: string) => {
    setAddForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveSubscription = () => {
    // Validate required fields
    if (!addForm.name.trim()) {
      alert('Please enter a subscription name');
      return;
    }

    if (addForm.amount && isNaN(Number(addForm.amount))) {
      alert('Please enter a valid amount');
      return;
    }

    // Create new subscription
    const newSub: Subscription = {
      id: `manual-${Date.now()}`,
      name: addForm.name.trim(),
      amount: addForm.amount ? Number(addForm.amount) : 0,
      currency: 'USD',
      billingInterval: addForm.billingInterval === 'TRIAL' ? 'MONTHLY' : (addForm.billingInterval as 'MONTHLY' | 'YEARLY'),
      nextBillingDate: addForm.nextBillingDate || new Date().toISOString().split('T')[0],
      category: addForm.notes || 'Manual',
      active: true,
      isTrial: addForm.billingInterval === 'TRIAL',
      status: 'active',
    };

    // Add to local state
    setUserSubscriptions((prev) => [...prev, newSub]);
    setAddConfirmation('Added. You can edit anytime.');

    // Reset form and close after a moment
    setTimeout(() => {
      handleCloseAddModal();
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCloseAddModal();
    }
  };

  const handlePauseSubscription = (id: string) => {
    setUserSubscriptions((prev) =>
      prev.map((sub) =>
        sub.id === id ? { ...sub, status: 'paused' as const } : sub
      )
    );
    setActionConfirmations((prev) => ({ ...prev, [id]: 'Marked as paused — no action taken externally' }));
    setTimeout(() => {
      setActionConfirmations((prev) => ({ ...prev, [id]: null }));
    }, 3000);
  };

  const handleCancelSubscription = (id: string) => {
    setUserSubscriptions((prev) =>
      prev.map((sub) =>
        sub.id === id ? { ...sub, status: 'cancelled' as const } : sub
      )
    );
    setActionConfirmations((prev) => ({ ...prev, [id]: 'Marked as cancelled — tracking only' }));
    setTimeout(() => {
      setActionConfirmations((prev) => ({ ...prev, [id]: null }));
    }, 3000);
  };

  const handleResumeSubscription = (id: string) => {
    setUserSubscriptions((prev) =>
      prev.map((sub) =>
        sub.id === id ? { ...sub, status: 'active' as const } : sub
      )
    );
    setActionConfirmations((prev) => ({ ...prev, [id]: 'Marked as active' }));
    setTimeout(() => {
      setActionConfirmations((prev) => ({ ...prev, [id]: null }));
    }, 3000);
  };

  // Calculate totals from sample data + user-added subscriptions
  const allSubscriptions = showEmptyState ? [] : [...SAMPLE_SUBSCRIPTIONS, ...userSubscriptions];
  
  const monthlyTotal = allSubscriptions.reduce((sum, sub) => {
    if (sub.billingInterval === 'MONTHLY') return sum + sub.amount;
    return sum;
  }, 0);

  const yearlyProjection = monthlyTotal * 12 + allSubscriptions.reduce((sum, sub) => {
    if (sub.billingInterval === 'YEARLY') return sum + sub.amount;
    return sum;
  }, 0);

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header with Add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0' }}>Subscriptions</h1>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Track and manage your recurring expenses.</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: '500',
            backgroundColor: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            ...buttonBaseStyles,
          }}
          onKeyDown={handleKeyDown}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#222';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#000';
          }}
          onFocus={(e) => {
            Object.assign(e.currentTarget.style, buttonFocusStyles);
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
        >
          + Add subscription
        </button>
      </div>

      {/* Toggle for demo purposes */}
      <div style={{ marginBottom: '24px' }}>
        <button 
          onClick={() => setShowEmptyState(!showEmptyState)}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            backgroundColor: '#f5f5f5',
            border: '1px solid #e0e0e0',
            borderRadius: '6px',
            cursor: 'pointer',
            ...buttonBaseStyles,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#efefef';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#f5f5f5';
          }}
          onFocus={(e) => {
            Object.assign(e.currentTarget.style, buttonFocusStyles);
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
        >
          {showEmptyState ? 'Show sample data' : 'Show empty state'}
        </button>
      </div>

      {/* Summary Card */}
      {!showEmptyState && allSubscriptions.length > 0 && (
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div 
            style={{
              padding: '20px',
              backgroundColor: '#fafafa',
              border: '1px solid #e8e8e8',
              borderRadius: '8px',
            }}
          >
            <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Total monthly spend
            </div>
            <div style={{ fontSize: '28px', fontWeight: '600', color: '#000' }}>
              {formatAmount(monthlyTotal, 'USD')}
            </div>
          </div>
          <div 
            style={{
              padding: '20px',
              backgroundColor: '#fafafa',
              border: '1px solid #e8e8e8',
              borderRadius: '8px',
            }}
          >
            <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Yearly projection
            </div>
            <div style={{ fontSize: '28px', fontWeight: '600', color: '#000' }}>
              {formatAmount(yearlyProjection, 'USD')}
            </div>
          </div>
        </div>
      )}

      {/* Timeline View */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Timeline</h2>

        {allSubscriptions.length === 0 ? (
          <div 
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              backgroundColor: '#fafafa',
              border: '1px solid #e8e8e8',
              borderRadius: '8px',
            }}
          >
            <div style={{ marginBottom: '24px' }}>
              <p style={{ margin: '0 0 12px 0', color: '#333', fontSize: '18px', fontWeight: '500', lineHeight: '1.4' }}>
                Nothing to do right now.
              </p>
              <p style={{ margin: 0, color: '#999', fontSize: '14px', lineHeight: '1.5' }}>
                No renewals on the horizon. You're all set.
              </p>
            </div>
            <p style={{ margin: '16px 0 0 0', color: '#bbb', fontSize: '12px', lineHeight: '1.5' }}>
              Manual entries stay on this device unless you choose to sync later.
            </p>
            <button
              onClick={handleOpenAddModal}
              style={{
                marginTop: '24px',
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                ...buttonBaseStyles,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#222';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#000';
              }}
              onFocus={(e) => {
                Object.assign(e.currentTarget.style, buttonFocusStyles);
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = 'none';
              }}
            >
              Add subscription
            </button>
          </div>
        ) : (() => {
          const grouped = groupSubscriptionsByTimeline(allSubscriptions);
          const hasAny = Object.values(grouped).some((g) => g.length > 0);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {/* Within 24 hours */}
              {grouped.within24h.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    Today or tomorrow
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {grouped.within24h.map((subscription) => (
                      <div 
                        key={subscription.id}
                        style={{
                          padding: '16px',
                          backgroundColor: '#fff',
                          border: '2px solid #ffebee',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '16px',
                          transition: 'all 0.2s ease-out',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                              {subscription.name}
                            </h4>
                            {subscription.isTrial && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#fff3cd',
                                  color: '#856404',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Trial
                              </span>
                            )}
                            {subscription.status === 'paused' && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#e3f2fd',
                                  color: '#1565c0',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Paused
                              </span>
                            )}
                            {subscription.status === 'cancelled' && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#f5f5f5',
                                  color: '#999',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  textDecoration: 'line-through',
                                }}
                              >
                                Cancelled
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '13px', color: '#c62828', fontWeight: '500', marginBottom: '8px' }}>
                            Renews {formatDate(subscription.nextBillingDate)}
                          </div>
                          {actionConfirmations[subscription.id] && (
                            <div style={{ fontSize: '12px', color: '#666', fontWeight: '500', marginBottom: '8px', padding: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                              {actionConfirmations[subscription.id]}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            {subscription.status === 'active' && (
                              <>
                                <button
                                  onClick={() => handlePauseSubscription(subscription.id)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    backgroundColor: '#e3f2fd',
                                    color: '#1565c0',
                                    border: '1px solid #1565c0',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-out',
                                    fontWeight: '500',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#1565c0';
                                    e.currentTarget.style.color = '#fff';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e3f2fd';
                                    e.currentTarget.style.color = '#1565c0';
                                  }}
                                  onFocus={(e) => {
                                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.outline = 'none';
                                  }}
                                >
                                  Pause
                                </button>
                                <button
                                  onClick={() => handleCancelSubscription(subscription.id)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    backgroundColor: 'transparent',
                                    color: '#999',
                                    border: '1px solid #e8e8e8',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-out',
                                    fontWeight: '500',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                                    e.currentTarget.style.borderColor = '#999';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.borderColor = '#e8e8e8';
                                  }}
                                  onFocus={(e) => {
                                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.outline = 'none';
                                  }}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {subscription.status === 'paused' && (
                              <button
                                onClick={() => handleResumeSubscription(subscription.id)}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  backgroundColor: '#e3f2fd',
                                  color: '#1565c0',
                                  border: '1px solid #1565c0',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease-out',
                                  fontWeight: '500',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#1565c0';
                                  e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#e3f2fd';
                                  e.currentTarget.style.color = '#1565c0';
                                }}
                                onFocus={(e) => {
                                  Object.assign(e.currentTarget.style, buttonFocusStyles);
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.outline = 'none';
                                }}
                              >
                                Resume
                              </button>
                            )}
                          </div>
                          <ExplanationToggle
                            id={subscription.id}
                            isExpanded={expandedExplanations[subscription.id] || false}
                            onToggle={toggleExplanation}
                          >
                            {subscription.id.startsWith('manual-') ? (
                              <p style={{ margin: 0 }}>
                                This renewal is coming up very soon. You added it manually.
                              </p>
                            ) : (
                              <p style={{ margin: 0 }}>
                                This <strong>{subscription.category}</strong> subscription renews within the next 24 hours.
                              </p>
                            )}
                          </ExplanationToggle>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: '18px', fontWeight: '600', color: '#000' }}>
                            {formatAmount(subscription.amount, subscription.currency)}
                          </div>
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                            per {subscription.billingInterval === 'MONTHLY' ? 'month' : 'year'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Within 7 days */}
              {grouped.within7days.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    Next 7 days
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {grouped.within7days.map((subscription) => (
                      <div 
                        key={subscription.id}
                        style={{
                          padding: '16px',
                          backgroundColor: '#fff',
                          border: '1px solid #e8e8e8',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '16px',
                          transition: 'all 0.2s ease-out',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                              {subscription.name}
                            </h4>
                            {subscription.isTrial && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#fff3cd',
                                  color: '#856404',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Trial
                              </span>
                            )}
                            {subscription.status === 'paused' && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#e3f2fd',
                                  color: '#1565c0',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Paused
                              </span>
                            )}
                            {subscription.status === 'cancelled' && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#f5f5f5',
                                  color: '#999',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  textDecoration: 'line-through',
                                }}
                              >
                                Cancelled
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                            Renews {formatDate(subscription.nextBillingDate)}
                          </div>
                          {actionConfirmations[subscription.id] && (
                            <div style={{ fontSize: '12px', color: '#666', fontWeight: '500', marginBottom: '8px', padding: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                              {actionConfirmations[subscription.id]}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            {subscription.status === 'active' && (
                              <>
                                <button
                                  onClick={() => handlePauseSubscription(subscription.id)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    backgroundColor: '#e3f2fd',
                                    color: '#1565c0',
                                    border: '1px solid #1565c0',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-out',
                                    fontWeight: '500',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#1565c0';
                                    e.currentTarget.style.color = '#fff';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e3f2fd';
                                    e.currentTarget.style.color = '#1565c0';
                                  }}
                                  onFocus={(e) => {
                                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.outline = 'none';
                                  }}
                                >
                                  Pause
                                </button>
                                <button
                                  onClick={() => handleCancelSubscription(subscription.id)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    backgroundColor: 'transparent',
                                    color: '#999',
                                    border: '1px solid #e8e8e8',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-out',
                                    fontWeight: '500',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                                    e.currentTarget.style.borderColor = '#999';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.borderColor = '#e8e8e8';
                                  }}
                                  onFocus={(e) => {
                                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.outline = 'none';
                                  }}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {subscription.status === 'paused' && (
                              <button
                                onClick={() => handleResumeSubscription(subscription.id)}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  backgroundColor: '#e3f2fd',
                                  color: '#1565c0',
                                  border: '1px solid #1565c0',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease-out',
                                  fontWeight: '500',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#1565c0';
                                  e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#e3f2fd';
                                  e.currentTarget.style.color = '#1565c0';
                                }}
                                onFocus={(e) => {
                                  Object.assign(e.currentTarget.style, buttonFocusStyles);
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.outline = 'none';
                                }}
                              >
                                Resume
                              </button>
                            )}
                          </div>
                          <ExplanationToggle
                            id={subscription.id}
                            isExpanded={expandedExplanations[subscription.id] || false}
                            onToggle={toggleExplanation}
                          >
                            {subscription.id.startsWith('manual-') ? (
                              <p style={{ margin: 0 }}>
                                This renewal is coming up within the next week. You added it manually.
                              </p>
                            ) : (
                              <p style={{ margin: 0 }}>
                                This <strong>{subscription.category}</strong> subscription renews in the next 7 days.
                              </p>
                            )}
                          </ExplanationToggle>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: '18px', fontWeight: '600', color: '#000' }}>
                            {formatAmount(subscription.amount, subscription.currency)}
                          </div>
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                            per {subscription.billingInterval === 'MONTHLY' ? 'month' : 'year'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Within 30 days */}
              {grouped.within30days.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    Next 30 days
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {grouped.within30days.map((subscription) => (
                      <div 
                        key={subscription.id}
                        style={{
                          padding: '16px',
                          backgroundColor: '#fff',
                          border: '1px solid #e8e8e8',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '16px',
                          transition: 'all 0.2s ease-out',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                              {subscription.name}
                            </h4>
                            {subscription.isTrial && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#fff3cd',
                                  color: '#856404',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Trial
                              </span>
                            )}
                            {subscription.status === 'paused' && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#e3f2fd',
                                  color: '#1565c0',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Paused
                              </span>
                            )}
                            {subscription.status === 'cancelled' && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#f5f5f5',
                                  color: '#999',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  textDecoration: 'line-through',
                                }}
                              >
                                Cancelled
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                            Renews {formatDate(subscription.nextBillingDate)}
                          </div>
                          {actionConfirmations[subscription.id] && (
                            <div style={{ fontSize: '12px', color: '#666', fontWeight: '500', marginBottom: '8px', padding: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                              {actionConfirmations[subscription.id]}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            {subscription.status === 'active' && (
                              <>
                                <button
                                  onClick={() => handlePauseSubscription(subscription.id)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    backgroundColor: '#e3f2fd',
                                    color: '#1565c0',
                                    border: '1px solid #1565c0',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-out',
                                    fontWeight: '500',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#1565c0';
                                    e.currentTarget.style.color = '#fff';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e3f2fd';
                                    e.currentTarget.style.color = '#1565c0';
                                  }}
                                  onFocus={(e) => {
                                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.outline = 'none';
                                  }}
                                >
                                  Pause
                                </button>
                                <button
                                  onClick={() => handleCancelSubscription(subscription.id)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    backgroundColor: 'transparent',
                                    color: '#999',
                                    border: '1px solid #e8e8e8',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-out',
                                    fontWeight: '500',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                                    e.currentTarget.style.borderColor = '#999';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.borderColor = '#e8e8e8';
                                  }}
                                  onFocus={(e) => {
                                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.outline = 'none';
                                  }}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {subscription.status === 'paused' && (
                              <button
                                onClick={() => handleResumeSubscription(subscription.id)}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  backgroundColor: '#e3f2fd',
                                  color: '#1565c0',
                                  border: '1px solid #1565c0',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease-out',
                                  fontWeight: '500',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#1565c0';
                                  e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#e3f2fd';
                                  e.currentTarget.style.color = '#1565c0';
                                }}
                                onFocus={(e) => {
                                  Object.assign(e.currentTarget.style, buttonFocusStyles);
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.outline = 'none';
                                }}
                              >
                                Resume
                              </button>
                            )}
                          </div>
                          <ExplanationToggle
                            id={subscription.id}
                            isExpanded={expandedExplanations[subscription.id] || false}
                            onToggle={toggleExplanation}
                          >
                            {subscription.id.startsWith('manual-') ? (
                              <p style={{ margin: 0 }}>
                                This renewal is coming up within the next month. You added it manually.
                              </p>
                            ) : (
                              <p style={{ margin: 0 }}>
                                This <strong>{subscription.category}</strong> subscription renews within 30 days.
                              </p>
                            )}
                          </ExplanationToggle>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: '18px', fontWeight: '600', color: '#000' }}>
                            {formatAmount(subscription.amount, subscription.currency)}
                          </div>
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                            per {subscription.billingInterval === 'MONTHLY' ? 'month' : 'year'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Later */}
              {grouped.later.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#999' }}>
                    Further ahead
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {grouped.later.map((subscription) => (
                      <div 
                        key={subscription.id}
                        style={{
                          padding: '16px',
                          backgroundColor: '#fff',
                          border: '1px solid #e8e8e8',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '16px',
                          opacity: 0.7,
                          transition: 'all 0.2s ease-out',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                              {subscription.name}
                            </h4>
                            {subscription.isTrial && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#fff3cd',
                                  color: '#856404',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Trial
                              </span>
                            )}
                            {subscription.status === 'paused' && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#e3f2fd',
                                  color: '#1565c0',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Paused
                              </span>
                            )}
                            {subscription.status === 'cancelled' && (
                              <span 
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: '#f5f5f5',
                                  color: '#999',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  borderRadius: '4px',
                                  textTransform: 'uppercase',
                                  textDecoration: 'line-through',
                                }}
                              >
                                Cancelled
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', color: '#999', marginBottom: '8px' }}>
                            Renews {formatDate(subscription.nextBillingDate)}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            {subscription.status === 'active' && (
                              <>
                                <button
                                  onClick={() => handlePauseSubscription(subscription.id)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    backgroundColor: '#e3f2fd',
                                    color: '#1565c0',
                                    border: '1px solid #1565c0',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-out',
                                    fontWeight: '500',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#1565c0';
                                    e.currentTarget.style.color = '#fff';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e3f2fd';
                                    e.currentTarget.style.color = '#1565c0';
                                  }}
                                  onFocus={(e) => {
                                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.outline = 'none';
                                  }}
                                >
                                  Pause
                                </button>
                                <button
                                  onClick={() => handleCancelSubscription(subscription.id)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    backgroundColor: 'transparent',
                                    color: '#999',
                                    border: '1px solid #e8e8e8',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-out',
                                    fontWeight: '500',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                                    e.currentTarget.style.borderColor = '#999';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.borderColor = '#e8e8e8';
                                  }}
                                  onFocus={(e) => {
                                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.outline = 'none';
                                  }}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {subscription.status === 'paused' && (
                              <button
                                onClick={() => handleResumeSubscription(subscription.id)}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  backgroundColor: '#e3f2fd',
                                  color: '#1565c0',
                                  border: '1px solid #1565c0',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease-out',
                                  fontWeight: '500',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#1565c0';
                                  e.currentTarget.style.color = '#fff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#e3f2fd';
                                  e.currentTarget.style.color = '#1565c0';
                                }}
                                onFocus={(e) => {
                                  Object.assign(e.currentTarget.style, buttonFocusStyles);
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.outline = 'none';
                                }}
                              >
                                Resume
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: '18px', fontWeight: '600', color: '#000' }}>
                            {formatAmount(subscription.amount, subscription.currency)}
                          </div>
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                            per {subscription.billingInterval === 'MONTHLY' ? 'month' : 'year'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!hasAny && (
                <div 
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    backgroundColor: '#fafafa',
                    border: '1px solid #e8e8e8',
                    borderRadius: '8px',
                  }}
                >
                  <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                    Nothing to do right now.
                  </p>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Add Subscription Modal */}
      {showAddModal && (
        <>
          {/* Modal backdrop */}
          <div
            onClick={handleCloseAddModal}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              zIndex: 999,
              animation: 'fadeIn 0.2s ease-out',
            }}
          />

          {/* Modal dialog */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#fff',
              border: '1px solid #e8e8e8',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '400px',
              width: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: 1000,
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
              animation: 'slideUp 0.2s ease-out',
            } as React.CSSProperties}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from { transform: translate(-50%, -40%); opacity: 0; }
                to { transform: translate(-50%, -50%); opacity: 1; }
              }
            `}</style>
            <h2 id="modal-title" style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '600' }}>
              Add subscription
            </h2>

            {addConfirmation && (
              <div 
                style={{
                  padding: '12px',
                  backgroundColor: '#d4edda',
                  color: '#155724',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '16px',
                  border: '1px solid #c3e6cb',
                }}
              >
                {addConfirmation}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveSubscription();
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              {/* Name */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#000' }}>
                  Name
                </span>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={addForm.name}
                  onChange={(e) => handleAddFormChange('name', e.target.value)}
                  placeholder="e.g., Netflix, Spotify, Adobe..."
                  style={{
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s ease-out',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#000';
                    e.currentTarget.style.outline = 'none';
                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#ddd';
                    e.currentTarget.style.outline = 'none';
                  }}
                />
              </label>

              {/* Amount */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#000' }}>
                  Amount (optional)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={addForm.amount}
                  onChange={(e) => handleAddFormChange('amount', e.target.value)}
                  placeholder="10.99"
                  style={{
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s ease-out',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#000';
                    e.currentTarget.style.outline = 'none';
                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#ddd';
                    e.currentTarget.style.outline = 'none';
                  }}
                />
              </label>

              {/* Billing Cycle */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#000' }}>
                  Billing cycle
                </span>
                <select
                  value={addForm.billingInterval}
                  onChange={(e) =>
                    handleAddFormChange('billingInterval', e.target.value as 'MONTHLY' | 'YEARLY' | 'TRIAL')
                  }
                  style={{
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-out',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#000';
                    e.currentTarget.style.outline = 'none';
                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#ddd';
                    e.currentTarget.style.outline = 'none';
                  }}
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                  <option value="TRIAL">Trial</option>
                </select>
              </label>

              {/* Next Renewal Date */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#000' }}>
                  Next renewal date (optional)
                </span>
                <input
                  type="date"
                  value={addForm.nextBillingDate}
                  onChange={(e) => handleAddFormChange('nextBillingDate', e.target.value)}
                  style={{
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontFamily: 'inherit',
                    transition: 'all 0.2s ease-out',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#000';
                    e.currentTarget.style.outline = 'none';
                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#ddd';
                    e.currentTarget.style.outline = 'none';
                  }}
                />
              </label>

              {/* Notes */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#000' }}>
                  Notes (optional)
                </span>
                <textarea
                  value={addForm.notes}
                  onChange={(e) => handleAddFormChange('notes', e.target.value)}
                  placeholder="e.g., Shared with family..."
                  rows={3}
                  style={{
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    transition: 'all 0.2s ease-out',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#000';
                    e.currentTarget.style.outline = 'none';
                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#ddd';
                    e.currentTarget.style.outline = 'none';
                  }}
                />
              </label>

              {/* Trust affordance */}
              <div style={{ fontSize: '12px', color: '#999', lineHeight: '1.5' }}>
                <p style={{ margin: '0 0 8px 0' }}>
                  <strong>Why am I seeing this?</strong> → You added it manually.
                </p>
                <p style={{ margin: 0 }}>
                  Nothing is connected. This is manual and private.
                </p>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    ...buttonBaseStyles,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#222';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#000';
                  }}
                  onFocus={(e) => {
                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = 'none';
                  }}
                >
                  Save (local)
                </button>
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: '500',
                    backgroundColor: '#f5f5f5',
                    color: '#000',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    ...buttonBaseStyles,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#efefef';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }}
                  onFocus={(e) => {
                    Object.assign(e.currentTarget.style, buttonFocusStyles);
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = 'none';
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Local storage trust message */}
      <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e8e8e8', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '12px', color: '#999', lineHeight: '1.5' }}>
          Saved locally on this device. Nothing is synced unless you choose to later.
        </p>
      </div>
    </div>
  );
}

export default SubscriptionsPage;
