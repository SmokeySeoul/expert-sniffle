import { useCallback, useEffect, useState } from 'react';
import { ExplanationToggle } from '../components/ExplanationToggle';

type Totals = {
  monthlyTotal: number;
  yearlyTotal: number;
};

const formatAmount = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function InsightsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  const toggleExplanation = (id: string) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect(() => {
    const stored = localStorage.getItem('accessToken');
    if (!stored) {
      window.location.href = '/auth';
      return;
    }

    setToken(stored);
  }, []);

  const fetchTotals = useCallback(
    async (authToken: string, isRefresh = false) => {
      setError(null);
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const res = await fetch('/api/insights/totals', {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (res.status === 401) {
          window.location.href = '/auth';
          return;
        }

        if (!res.ok) {
          throw new Error('Unable to load totals');
        }

        const body = await res.json();
        setTotals({
          monthlyTotal: Number(body.monthlyTotal ?? 0),
          yearlyTotal: Number(body.yearlyTotal ?? 0),
        });
      } catch (totalsError) {
        console.error(totalsError);
        setError('Unable to load insights right now. Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!token) return;
    void fetchTotals(token);
  }, [token, fetchTotals]);

  const handleRefresh = () => {
    if (!token) return;
    void fetchTotals(token, true);
  };

  return (
    <div className="card">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Insights</h2>
          <p className="muted" style={{ margin: 0 }}>Subscription totals at a glance.</p>
        </div>
        <button className="secondary" onClick={handleRefresh} disabled={refreshing || loading}>
          {refreshing || loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="error" style={{ marginTop: '12px' }}>
          <div>{error}</div>
          <div className="inline-actions" style={{ marginTop: '8px' }}>
            <button className="secondary" onClick={handleRefresh} disabled={loading}>
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ background: '#f8fafc', marginTop: '12px' }}>
        <h3>Totals</h3>
        {loading ? (
          <p>Loading insights...</p>
        ) : totals ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                <div className="muted">Monthly total</div>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>{formatAmount(totals.monthlyTotal)}</div>
              <ExplanationToggle
                id="monthly-total"
                isExpanded={expandedExplanations['monthly-total'] || false}
                onToggle={toggleExplanation}
              >
                <p style={{ margin: 0 }}>
                  This is the sum of all your subscriptions that renew monthly. It shows what you're spending on a recurring basis each month.
                </p>
              </ExplanationToggle>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                <div className="muted">Yearly total</div>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>{formatAmount(totals.yearlyTotal)}</div>
              <ExplanationToggle
                id="yearly-total"
                isExpanded={expandedExplanations['yearly-total'] || false}
                onToggle={toggleExplanation}
              >
                <p style={{ margin: 0 }}>
                  This includes both your monthly subscriptions (multiplied by 12) and your yearly subscriptions. It's your total annual spending if everything stays the same.
                </p>
              </ExplanationToggle>
            </div>
          </div>
        ) : (
          <p>No totals available.</p>
        )}
      </div>
    </div>
  );
}

export default InsightsPage;
