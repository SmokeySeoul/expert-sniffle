import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

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
};

type CreateSubscriptionInput = {
  name: string;
  amount: string;
  currency: string;
  billingInterval: 'MONTHLY' | 'YEARLY';
  nextBillingDate: string;
  category: string;
};

const formatAmount = (value: number, currency: string) =>
  value.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 2 });

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

function SubscriptionsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateSubscriptionInput>({
    name: '',
    amount: '',
    currency: 'USD',
    billingInterval: 'MONTHLY',
    nextBillingDate: '',
    category: '',
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    if (!storedToken) {
      window.location.href = '/auth';
      return;
    }

    setToken(storedToken);
  }, []);

  const loadSubscriptions = useCallback(
    async (authToken: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setError(null);
      setLoading(true);

      try {
        const res = await fetch('/api/subscriptions', {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (res.status === 401) {
          window.location.href = '/auth';
          return;
        }

        if (!res.ok) {
          throw new Error('Unable to load subscriptions');
        }

        const body = await res.json();
        const list: Subscription[] = Array.isArray(body.subscriptions)
          ? body.subscriptions.map((item: Subscription) => ({
              ...item,
              amount: Number(item.amount ?? 0),
              currency: item.currency ?? 'USD',
            }))
          : [];

        setSubscriptions(list);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error(loadError);
        setError('Unable to load subscriptions right now. Please try again.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!token) return;
    void loadSubscriptions(token);
    return () => controllerRef.current?.abort();
  }, [token, loadSubscriptions]);

  const handleRetry = () => {
    if (!token) return;
    void loadSubscriptions(token);
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    const amountValue = Number(createForm.amount);
    if (!createForm.name.trim() || Number.isNaN(amountValue)) {
      setCreateError('Please provide a name and valid amount.');
      return;
    }

    setCreateError(null);
    setCreateSuccess(null);
    setCreateLoading(true);

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: createForm.name.trim(),
          amount: amountValue,
          currency: createForm.currency.trim() || 'USD',
          billingInterval: createForm.billingInterval,
          nextBillingDate: createForm.nextBillingDate || undefined,
          category: createForm.category.trim() || undefined,
        }),
      });

      if (res.status === 401) {
        window.location.href = '/auth';
        return;
      }

      if (!res.ok) {
        throw new Error('Unable to create subscription');
      }

      setCreateForm({
        name: '',
        amount: '',
        currency: 'USD',
        billingInterval: 'MONTHLY',
        nextBillingDate: '',
        category: '',
      });
      setCreateSuccess('Subscription created.');
      void loadSubscriptions(token);
    } catch (submitError) {
      console.error(submitError);
      setCreateError('Unable to create subscription right now. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleFormChange = (field: keyof CreateSubscriptionInput, value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCreateForm = () => {
    setShowCreateForm((prev) => !prev);
    setCreateError(null);
    setCreateSuccess(null);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Subscriptions</h2>
          <p className="muted" style={{ margin: 0 }}>Your saved recurring expenses.</p>
        </div>
        <div className="inline-actions">
          <button className="secondary" onClick={handleRetry} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button onClick={toggleCreateForm}>{showCreateForm ? 'Close form' : 'Create Subscription'}</button>
        </div>
      </div>

      {error && (
        <div className="error" style={{ marginTop: '12px' }}>
          <div>{error}</div>
          <div className="inline-actions" style={{ marginTop: '8px' }}>
            <button className="secondary" onClick={handleRetry} disabled={loading}>
              Retry
            </button>
          </div>
        </div>
      )}

      {showCreateForm && (
        <div style={{ marginTop: '12px' }}>
          <h3 style={{ margin: '0 0 8px' }}>New subscription</h3>
          <form onSubmit={handleCreateSubmit}>
            <label>
              <span>Name</span>
              <input
                required
                type="text"
                value={createForm.name}
                onChange={(event) => handleFormChange('name', event.target.value)}
                placeholder="Service name"
              />
            </label>
            <label>
              <span>Amount</span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={createForm.amount}
                onChange={(event) => handleFormChange('amount', event.target.value)}
                placeholder="0.00"
              />
            </label>
            <label>
              <span>Currency</span>
              <input
                type="text"
                value={createForm.currency}
                onChange={(event) => handleFormChange('currency', event.target.value)}
                placeholder="USD"
              />
            </label>
            <label>
              <span>Billing interval</span>
              <select
                value={createForm.billingInterval}
                onChange={(event) =>
                  handleFormChange('billingInterval', event.target.value as CreateSubscriptionInput['billingInterval'])
                }
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </label>
            <label>
              <span>Next billing date</span>
              <input
                type="date"
                value={createForm.nextBillingDate}
                onChange={(event) => handleFormChange('nextBillingDate', event.target.value)}
              />
            </label>
            <label>
              <span>Category (optional)</span>
              <input
                type="text"
                value={createForm.category}
                onChange={(event) => handleFormChange('category', event.target.value)}
                placeholder="Entertainment"
              />
            </label>

            {createError && (
              <div className="error" style={{ marginTop: '4px' }}>
                {createError}
              </div>
            )}

            {createSuccess && (
              <div className="success" style={{ marginTop: '4px' }}>
                {createSuccess}
              </div>
            )}

            <div className="inline-actions" style={{ marginTop: '4px' }}>
              <button type="submit" disabled={createLoading}>
                {createLoading ? 'Saving...' : 'Create'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setCreateForm({
                    name: '',
                    amount: '',
                    currency: 'USD',
                    billingInterval: 'MONTHLY',
                    nextBillingDate: '',
                    category: '',
                  });
                  setCreateError(null);
                  setCreateSuccess(null);
                }}
                disabled={createLoading}
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && !error && <p style={{ marginTop: '12px' }}>Loading subscriptions...</p>}

      {!loading && !error && (
        <>
          {subscriptions.length === 0 ? (
            <p>No subscriptions yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Amount</th>
                  <th>Billing interval</th>
                  <th>Next billing date</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td>{subscription.name}</td>
                    <td>{formatAmount(subscription.amount, subscription.currency)}</td>
                    <td>{subscription.billingInterval === 'MONTHLY' ? 'Monthly' : 'Yearly'}</td>
                    <td>{formatDate(subscription.nextBillingDate)}</td>
                    <td>{subscription.category || '—'}</td>
                    <td>{subscription.active ? (subscription.isTrial ? 'Trial' : 'Active') : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default SubscriptionsPage;
