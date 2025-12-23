import { useCallback, useEffect, useRef, useState } from 'react';

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

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Subscriptions</h2>
          <p className="muted" style={{ margin: 0 }}>Your saved recurring expenses.</p>
        </div>
        <button className="secondary" onClick={handleRetry} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
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
