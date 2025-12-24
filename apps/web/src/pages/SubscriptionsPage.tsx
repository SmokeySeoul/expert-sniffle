import { useRef, useState, useEffect } from 'react';

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
  },
];

type Subscription = typeof SAMPLE_SUBSCRIPTIONS[0];

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
  const firstInputRef = useRef<HTMLInputElement>(null);

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

      {/* Upcoming Section */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Upcoming</h2>

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
                Nothing needs attention today.
              </p>
              <p style={{ margin: 0, color: '#999', fontSize: '14px', lineHeight: '1.5' }}>
                No renewals coming up. You're all set.
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
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {allSubscriptions.map((subscription) => (
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
                  opacity: subscription.id.startsWith('manual-') ? 0.9 : 1,
                  transition: 'all 0.2s ease-out',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                      {subscription.name}
                    </h3>
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
                    {!subscription.isTrial && (
                      <span 
                        style={{
                          padding: '2px 8px',
                          backgroundColor: '#d4edda',
                          color: '#155724',
                          fontSize: '11px',
                          fontWeight: '600',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {subscription.billingInterval === 'MONTHLY' ? 'Monthly' : 'Yearly'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                    Renews {formatDate(subscription.nextBillingDate)}
                  </div>
                  <button
                    onClick={() => toggleExplanation(subscription.id)}
                    style={{
                      padding: 0,
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#0066cc',
                      fontSize: '13px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      ...buttonBaseStyles,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#004499';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#0066cc';
                    }}
                    onFocus={(e) => {
                      Object.assign(e.currentTarget.style, { ...buttonFocusStyles, outlineOffset: '1px' });
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.outline = 'none';
                    }}
                  >
                    Why am I seeing this?
                  </button>
                  {expandedExplanations[subscription.id] && (
                    <div 
                      style={{
                        marginTop: '8px',
                        padding: '8px 0',
                        borderTop: '1px solid #e8e8e8',
                        paddingTop: '8px',
                        fontSize: '13px',
                        color: '#666',
                        lineHeight: '1.5',
                      }}
                    >
                      {subscription.id.startsWith('manual-') ? (
                        <p style={{ margin: 0 }}>You added it manually.</p>
                      ) : (
                        <p style={{ margin: 0 }}>
                          This <strong>{subscription.category}</strong> subscription is active and will renew on the scheduled date.
                        </p>
                      )}
                    </div>
                  )}
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
        )}
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
    </div>
  );
}

export default SubscriptionsPage;
