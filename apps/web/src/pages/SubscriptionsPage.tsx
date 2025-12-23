import { useEffect, useState } from 'react';

type Subscription = {
  id: string;
  name: string;
  amount: number;
  billingCycle: 'monthly' | 'yearly';
  category: string;
};

const formatAmount = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    if (!storedToken) {
      window.location.href = '/auth';
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setError(null);
      setLoading(true);

      try {
        const res = await fetch('/api/subscriptions', {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${storedToken}`,
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
        setSubscriptions(Array.isArray(body.subscriptions) ? body.subscriptions : []);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error(loadError);
        setError('Unable to load subscriptions right now. Please try again.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => controller.abort();
  }, []);

  return (
    <div className="card">
      <h2>Subscriptions</h2>

      {loading && <p>Loading subscriptions...</p>}

      {error && <div className="error">{error}</div>}

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
                  <th>Billing cycle</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td>{subscription.name}</td>
                    <td>{formatAmount(Number(subscription.amount ?? 0))}</td>
                    <td>{subscription.billingCycle === 'monthly' ? 'Monthly' : 'Yearly'}</td>
                    <td>{subscription.category || '—'}</td>
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
