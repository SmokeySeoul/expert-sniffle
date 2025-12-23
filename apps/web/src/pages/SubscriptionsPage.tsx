import { FormEvent, useEffect, useMemo, useState } from 'react';

type BillingInterval = 'MONTHLY' | 'YEARLY' | 'VARIABLE';

type Subscription = {
  id: string;
  name: string;
  amount: number | string;
  currency: string;
  billingInterval: 'MONTHLY' | 'YEARLY';
  nextBillingDate: string;
  category?: string | null;
  active: boolean;
  isTrial?: boolean | null;
  notes?: string | null;
};

type FormState = {
  name: string;
  amount: string;
  currency: string;
  billingInterval: BillingInterval;
  nextBillingDate: string;
  category: string;
  isTrial: boolean;
  notes: string;
};

const emptyForm: FormState = {
  name: '',
  amount: '',
  currency: 'NZD',
  billingInterval: 'MONTHLY',
  nextBillingDate: '',
  category: '',
  isTrial: false,
  notes: '',
};

function formatDateDisplay(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function dateInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

function computeTotals(list: Subscription[]) {
  const monthly = list
    .filter((sub) => sub.active && sub.billingInterval === 'MONTHLY')
    .reduce((sum, sub) => sum + Number(sub.amount ?? 0), 0);

  const yearly = list
    .filter((sub) => sub.active && sub.billingInterval === 'YEARLY')
    .reduce((sum, sub) => sum + Number(sub.amount ?? 0), 0);

  return { monthly, yearly };
}

function SubscriptionsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [totals, setTotals] = useState<{ monthly: number; yearly: number }>({ monthly: 0, yearly: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('accessToken');
    if (!stored) {
      setAuthError('Please login to manage your subscriptions.');
      window.location.href = '/auth';
      return;
    }

    setToken(stored);
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadSubscriptions(token);
  }, [token]);

  const intervalOptions: { label: string; value: BillingInterval }[] = useMemo(
    () => [
      { label: 'Monthly', value: 'MONTHLY' },
      { label: 'Yearly', value: 'YEARLY' },
      { label: 'Variable (client-only)', value: 'VARIABLE' },
    ],
    [],
  );

  async function fetchTotalsWithFallback(authToken: string, list: Subscription[]) {
    try {
      const res = await fetch('/api/insights/totals', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.status === 401) {
        setAuthError('Please login to manage your subscriptions.');
        return;
      }

      if (res.ok) {
        const body = await res.json();
        setTotals({ monthly: Number(body.monthlyTotal ?? 0), yearly: Number(body.yearlyTotal ?? 0) });
        return;
      }
    } catch (insightsError) {
      console.warn('Insights unavailable, falling back to client totals', insightsError);
    }

    setTotals(computeTotals(list));
  }

  async function loadSubscriptions(authToken: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/subscriptions', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.status === 401) {
        setAuthError('Please login to manage your subscriptions.');
        return;
      }

      if (!res.ok) {
        throw new Error('Unable to load subscriptions');
      }

      const body = await res.json();
      const list: Subscription[] = (body.subscriptions ?? []).map((sub: Subscription) => ({
        ...sub,
        amount: Number(sub.amount ?? 0),
      }));

      setSubscriptions(list);
      await fetchTotalsWithFallback(authToken, list);
    } catch (loadError) {
      console.error(loadError);
      setError('Unable to load subscriptions right now. Please try again.');
      setTotals(computeTotals(subscriptions));
    } finally {
      setLoading(false);
    }
  }

  const handleFieldChange = (field: keyof FormState, value: string | boolean, target?: 'create' | 'edit') => {
    if (target === 'edit' && editForm) {
      setEditForm({ ...editForm, [field]: value } as FormState);
      return;
    }

    if (!target || target === 'create') {
      setFormState({ ...formState, [field]: value } as FormState);
    }
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) return;

    if (formState.billingInterval === 'VARIABLE') {
      setError('Variable billing intervals are not yet supported by the API. Please choose monthly or yearly.');
      return;
    }

    if (!formState.nextBillingDate) {
      setError('Next billing date is required.');
      return;
    }

    const payload = {
      name: formState.name.trim(),
      amount: Number(formState.amount || 0),
      currency: formState.currency.trim() || 'NZD',
      billingInterval: formState.billingInterval as 'MONTHLY' | 'YEARLY',
      nextBillingDate: new Date(formState.nextBillingDate).toISOString(),
      category: formState.category || undefined,
      isTrial: formState.isTrial,
      ...(formState.notes ? { notes: formState.notes } : {}),
    };

    try {
      setSaving(true);
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        setAuthError('Please login to manage your subscriptions.');
        return;
      }

      if (!res.ok) {
        throw new Error('Unable to save subscription');
      }

      setMessage('Subscription added.');
      setFormState(emptyForm);
      await loadSubscriptions(token);
    } catch (submitError) {
      console.error(submitError);
      setError('Unable to add the subscription. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(sub: Subscription) {
    setEditingId(sub.id);
    setEditForm({
      name: sub.name ?? '',
      amount: String(sub.amount ?? ''),
      currency: sub.currency ?? 'NZD',
      billingInterval: sub.billingInterval,
      nextBillingDate: dateInputValue(sub.nextBillingDate),
      category: sub.category ?? '',
      isTrial: Boolean(sub.isTrial),
      notes: sub.notes ?? '',
    });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!token || !editingId || !editForm) return;

    setError(null);
    setMessage(null);

    if (editForm.billingInterval === 'VARIABLE') {
      setError('Variable billing intervals are not yet supported by the API. Please choose monthly or yearly.');
      return;
    }

    if (!editForm.nextBillingDate) {
      setError('Next billing date is required.');
      return;
    }

    const payload = {
      name: editForm.name.trim(),
      amount: Number(editForm.amount || 0),
      currency: editForm.currency.trim() || 'NZD',
      billingInterval: editForm.billingInterval as 'MONTHLY' | 'YEARLY',
      nextBillingDate: new Date(editForm.nextBillingDate).toISOString(),
      category: editForm.category || undefined,
      isTrial: editForm.isTrial,
      ...(editForm.notes ? { notes: editForm.notes } : {}),
    };

    try {
      const res = await fetch(`/api/subscriptions/${editingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        setAuthError('Please login to manage your subscriptions.');
        return;
      }

      if (!res.ok) {
        throw new Error('Unable to update subscription');
      }

      setMessage('Subscription updated.');
      setEditingId(null);
      setEditForm(null);
      await loadSubscriptions(token);
    } catch (editError) {
      console.error(editError);
      setError('Unable to update the subscription. Please try again.');
    }
  }

  async function toggleActive(sub: Subscription) {
    if (!token) return;

    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !sub.active }),
      });

      if (res.status === 401) {
        setAuthError('Please login to manage your subscriptions.');
        return;
      }

      if (!res.ok) {
        throw new Error('Unable to toggle subscription');
      }

      setMessage(`Subscription ${sub.active ? 'deactivated' : 'activated'}.`);
      await loadSubscriptions(token);
    } catch (toggleError) {
      console.error(toggleError);
      setError('Unable to update the subscription status.');
    }
  }

  return (
    <div className="card">
      <h2>Subscriptions</h2>

      {authError && (
        <div className="error">
          {authError}{' '}
          <a href="/auth">Go to login</a>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <div className="card" style={{ background: '#f8fafc' }}>
        <h3>Totals</h3>
        <p>
          Monthly: <strong>{totals.monthly.toFixed(2)}</strong>
        </p>
        <p>
          Yearly: <strong>{totals.yearly.toFixed(2)}</strong>
        </p>
        <small className="muted">Pulled from /api/insights/totals when available.</small>
      </div>

      <div className="card">
        <h3>Add subscription</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input
              required
              value={formState.name}
              onChange={(event) => handleFieldChange('name', event.target.value)}
              placeholder="Tool or service name"
            />
          </label>
          <label>
            Amount
            <input
              required
              type="number"
              step="0.01"
              value={formState.amount}
              onChange={(event) => handleFieldChange('amount', event.target.value)}
            />
          </label>
          <label>
            Currency
            <input
              value={formState.currency}
              onChange={(event) => handleFieldChange('currency', event.target.value)}
            />
          </label>
          <label>
            Billing interval
            <select
              value={formState.billingInterval}
              onChange={(event) => handleFieldChange('billingInterval', event.target.value as BillingInterval)}
            >
              {intervalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {formState.billingInterval === 'VARIABLE' && (
              <small className="muted">Variable is displayed here but not yet supported by the API.</small>
            )}
          </label>
          <label>
            Next billing date
            <input
              required
              type="date"
              value={formState.nextBillingDate}
              onChange={(event) => handleFieldChange('nextBillingDate', event.target.value)}
            />
          </label>
          <label>
            Category
            <input
              value={formState.category}
              onChange={(event) => handleFieldChange('category', event.target.value)}
              placeholder="Productivity, Storage, etc."
            />
          </label>
          <label>
            Trial?
            <select
              value={formState.isTrial ? 'true' : 'false'}
              onChange={(event) => handleFieldChange('isTrial', event.target.value === 'true')}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </label>
          <label>
            Notes
            <textarea
              rows={3}
              value={formState.notes}
              onChange={(event) => handleFieldChange('notes', event.target.value)}
              placeholder="Any context or renewal details"
            />
          </label>
          <div className="inline-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Add subscription'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Current subscriptions</h3>
        {loading ? (
          <p>Loading subscriptions...</p>
        ) : subscriptions.length === 0 ? (
          <p>No subscriptions yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Amount</th>
                <th>Currency</th>
                <th>Interval</th>
                <th>Next billing</th>
                <th>Category</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td>
                    <strong>{sub.name}</strong>
                    {sub.isTrial ? <div><small className="muted">Trial</small></div> : null}
                  </td>
                  <td>{Number(sub.amount ?? 0).toFixed(2)}</td>
                  <td>{sub.currency}</td>
                  <td>{sub.billingInterval}</td>
                  <td>{formatDateDisplay(sub.nextBillingDate)}</td>
                  <td>{sub.category ?? '—'}</td>
                  <td>{sub.active ? 'Yes' : 'No'}</td>
                  <td>
                    <div className="inline-actions">
                      <button className="secondary" onClick={() => startEdit(sub)}>
                        Edit
                      </button>
                      <button className="secondary" onClick={() => toggleActive(sub)}>
                        {sub.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingId && editForm && (
        <div className="card">
          <h3>Edit subscription</h3>
          <form onSubmit={saveEdit}>
            <label>
              Name
              <input
                required
                value={editForm.name}
                onChange={(event) => handleFieldChange('name', event.target.value, 'edit')}
              />
            </label>
            <label>
              Amount
              <input
                required
                type="number"
                step="0.01"
                value={editForm.amount}
                onChange={(event) => handleFieldChange('amount', event.target.value, 'edit')}
              />
            </label>
            <label>
              Currency
              <input
                value={editForm.currency}
                onChange={(event) => handleFieldChange('currency', event.target.value, 'edit')}
              />
            </label>
            <label>
              Billing interval
              <select
                value={editForm.billingInterval}
                onChange={(event) =>
                  handleFieldChange('billingInterval', event.target.value as BillingInterval, 'edit')
                }
              >
                {intervalOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {editForm.billingInterval === 'VARIABLE' && (
                <small className="muted">Variable is displayed here but not yet supported by the API.</small>
              )}
            </label>
            <label>
              Next billing date
              <input
                required
                type="date"
                value={editForm.nextBillingDate}
                onChange={(event) => handleFieldChange('nextBillingDate', event.target.value, 'edit')}
              />
            </label>
            <label>
              Category
              <input
                value={editForm.category}
                onChange={(event) => handleFieldChange('category', event.target.value, 'edit')}
              />
            </label>
            <label>
              Trial?
              <select
                value={editForm.isTrial ? 'true' : 'false'}
                onChange={(event) => handleFieldChange('isTrial', event.target.value === 'true', 'edit')}
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </label>
            <label>
              Notes
              <textarea
                rows={3}
                value={editForm.notes}
                onChange={(event) => handleFieldChange('notes', event.target.value, 'edit')}
              />
            </label>
            <div className="inline-actions">
              <button type="submit">Save changes</button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditingId(null);
                  setEditForm(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default SubscriptionsPage;
