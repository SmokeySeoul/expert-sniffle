'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAIStatus, getAILogs, explainAI, proposeAI, listProposals, getProposal, dismissProposal, applyProposal, listPatches, rollbackPatch } from '../lib/api';
import { AIExplainTopic, AIExplainItem, AILog, AIProposal, AIProposalType, RecategorizeProposalItem, SavingsProposalItem, AIPatchSummary } from '@substream/shared';

const topics: { value: AIExplainTopic; label: string }[] = [
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'yearly_vs_monthly', label: 'Yearly vs Monthly' },
  { value: 'category_rationale', label: 'Category rationale' }
];

export function InsightsPage() {
  const queryClient = useQueryClient();
  const [selectedTopic, setSelectedTopic] = useState<AIExplainTopic>('duplicate');
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [subscriptions, setSubscriptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['ai-status'],
    queryFn: getAIStatus
  });

  const logsQuery = useQuery({
    queryKey: ['ai-logs'],
    queryFn: () => getAILogs(),
    enabled: statusQuery.data?.enabled === true
  });

  const proposalsQuery = useQuery({
    queryKey: ['ai-proposals'],
    queryFn: () => listProposals(),
    enabled: statusQuery.data?.enabled === true
  });

  const proposalDetailQuery = useQuery({
    queryKey: ['ai-proposal', selectedProposalId],
    queryFn: () => getProposal(selectedProposalId!),
    enabled: !!selectedProposalId
  });

  const explainMutation = useMutation({
    mutationFn: () => explainAI(selectedTopic, selectedSubs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-logs'] });
    }
  });

  const proposeMutation = useMutation({
    mutationFn: ({ type }: { type: AIProposalType }) => proposeAI(type, selectedSubs),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ai-logs'] });
      queryClient.invalidateQueries({ queryKey: ['ai-proposals'] });
      setSelectedProposalId(result.proposalId);
    }
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissProposal(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ai-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['ai-proposal', result.id] });
    }
  });
  const applyMutation = useMutation({
    mutationFn: (id: string) => applyProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['ai-patches'] });
      if (selectedProposalId) {
        queryClient.invalidateQueries({ queryKey: ['ai-proposal', selectedProposalId] });
      }
    }
  });
  const rollbackMutation = useMutation({
    mutationFn: (id: string) => rollbackPatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-patches'] });
    }
  });

  useEffect(() => {
    // Placeholder subscription list; in a real app, fetch from API/store.
    setSubscriptions([
      { id: 'sub-1', name: 'Netflix' },
      { id: 'sub-2', name: 'Spotify' }
    ]);
  }, []);

  const items = useMemo<AIExplainItem[]>(() => explainMutation.data || [], [explainMutation.data]);
  const logs = (logsQuery.data || []) as AILog[];
  const proposals = (proposalsQuery.data || []) as AIProposal[];
  const selectedProposal = proposalDetailQuery.data || null;
  const patches = (useQuery({ queryKey: ['ai-patches'], queryFn: listPatches, enabled: statusQuery.data?.enabled === true }).data || []) as AIPatchSummary[];

  if (statusQuery.isLoading) {
    return <div className="p-6">Loading status...</div>;
  }

  if (!statusQuery.data?.enabled) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-gray-700">AI is off by default. Enable it in Trust Center.</p>
        <a className="text-blue-600 underline" href="/trust-center">
          Go to Trust Center
        </a>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Insights</h1>
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-400"
          onClick={() => explainMutation.mutate()}
          disabled={explainMutation.isLoading}
        >
          {explainMutation.isLoading ? 'Generating...' : 'Generate explanations'}
        </button>
      </div>

      <div className="flex gap-3">
        <button
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:bg-gray-400"
          onClick={() => proposeMutation.mutate({ type: 'RECATEGORIZE' })}
          disabled={proposeMutation.isLoading}
        >
          {proposeMutation.isLoading ? 'Generating...' : 'Generate recategorize proposal'}
        </button>
        <button
          className="px-4 py-2 rounded bg-indigo-600 text-white disabled:bg-gray-400"
          onClick={() => proposeMutation.mutate({ type: 'SAVINGS_LIST' })}
          disabled={proposeMutation.isLoading}
        >
          {proposeMutation.isLoading ? 'Generating...' : 'Generate savings list proposal'}
        </button>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium">Topic</label>
        <select
          className="border rounded px-3 py-2"
          value={selectedTopic}
          onChange={(e) => setSelectedTopic(e.target.value as AIExplainTopic)}
        >
          {topics.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Subscriptions (optional)</p>
        <div className="space-y-2">
          {subscriptions.map((sub) => (
            <label key={sub.id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedSubs.includes(sub.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedSubs((prev) => [...prev, sub.id]);
                  } else {
                    setSelectedSubs((prev) => prev.filter((id) => id !== sub.id));
                  }
                }}
              />
              <span>{sub.name}</span>
            </label>
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Results</h2>
        {items.length === 0 && <p className="text-gray-600">No results yet.</p>}
        <div className="grid gap-3">
          {items.map((item, idx) => (
            <div key={idx} className="rounded border bg-white p-4 shadow-sm">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">{item.title}</h3>
                <div className="text-sm text-gray-600">
                  Confidence: {Math.round(item.confidence * 100)}%
                  <div className="mt-1 h-2 w-32 bg-gray-200 rounded">
                    <div
                      className="h-2 bg-blue-500 rounded"
                      style={{ width: `${Math.min(100, Math.max(0, item.confidence * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-700 mt-2">{item.whyItMatters}</p>
              <p className="text-sm text-gray-800 mt-2">{item.explanation}</p>
              <p className="text-xs text-gray-500 mt-2">Inputs: {item.inputsUsed.join(', ')}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">AI Logs</h2>
        {logs.length === 0 && <p className="text-gray-600">No logs yet.</p>}
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded border bg-white p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{new Date(log.createdAt).toLocaleString()}</p>
                <p className="text-xs text-gray-600">
                  {log.topic} · {log.provider}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className={log.success ? 'text-green-600' : 'text-red-600'}>{log.success ? 'Success' : 'Fail'}</p>
                <p className="text-gray-600">{log.latencyMs} ms</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">AI Proposals</h2>
        {proposals.length === 0 && <p className="text-gray-600">No proposals yet.</p>}
        <div className="space-y-2">
          {proposals.map((proposal) => (
            <div key={proposal.id} className="rounded border bg-white p-3 flex items-center justify-between">
              <div>
                <p className="font-semibold">{proposal.title}</p>
                <p className="text-sm text-gray-600">
                  {proposal.type} · {proposal.status} · {new Date(proposal.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                className="text-blue-600 underline"
                onClick={() => setSelectedProposalId(proposal.id)}
              >
                View
              </button>
            </div>
          ))}
        </div>

        {selectedProposal && (
          <div className="rounded border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{selectedProposal.title}</p>
                <p className="text-sm text-gray-600">
                  {selectedProposal.type} · {selectedProposal.status} · Expires {new Date(selectedProposal.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="space-x-2">
                <button
                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded"
                  disabled
                  title="Apply comes next"
                >
                  Apply (coming soon)
                </button>
                {selectedProposal.type === 'RECATEGORIZE' && selectedProposal.status === 'ACTIVE' && (
                  <button
                    className="px-3 py-1 bg-green-600 text-white rounded"
                    onClick={() => {
                      if (window.confirm('This will update subscriptions. You can undo later. Proceed?')) {
                        applyMutation.mutate(selectedProposal.id);
                      }
                    }}
                    disabled={applyMutation.isLoading}
                  >
                    {applyMutation.isLoading ? 'Applying...' : 'Apply changes'}
                  </button>
                )}
                {selectedProposal.status === 'ACTIVE' && (
                  <button
                    className="px-3 py-1 bg-red-600 text-white rounded"
                    onClick={() => dismissMutation.mutate(selectedProposal.id)}
                    disabled={dismissMutation.isLoading}
                  >
                    {dismissMutation.isLoading ? 'Dismissing...' : 'Dismiss'}
                  </button>
                )}
              </div>
            </div>

            {selectedProposal.type === 'RECATEGORIZE' && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 font-semibold text-sm">
                  <span>Subscription</span>
                  <span>From</span>
                  <span>To</span>
                  <span>Confidence</span>
                </div>
                {((selectedProposal.payload?.items || []) as RecategorizeProposalItem[]).map((item) => (
                  <div key={item.subscriptionId} className="grid grid-cols-4 text-sm border-t py-1">
                    <span>{item.subscriptionId}</span>
                    <span>{item.fromCategory || 'Unassigned'}</span>
                    <span>{item.toCategory}</span>
                    <span>{Math.round(item.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            )}

            {selectedProposal.type === 'SAVINGS_LIST' && (
              <div className="space-y-2">
                <div className="grid grid-cols-4 font-semibold text-sm">
                  <span>Subscription</span>
                  <span>Annual Delta</span>
                  <span>Explanation</span>
                  <span>Confidence</span>
                </div>
                {((selectedProposal.payload?.items || []) as SavingsProposalItem[]).map((item) => (
                  <div key={item.subscriptionId} className="grid grid-cols-4 text-sm border-t py-1">
                    <span>{item.subscriptionId}</span>
                    <span>${item.potentialAnnualDelta.toFixed(2)}</span>
                    <span>{item.explanation}</span>
                    <span>{Math.round(item.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">AI Changes (applied patches)</h2>
        {patches.length === 0 && <p className="text-gray-600">No applied changes.</p>}
        <div className="space-y-2">
          {patches.map((patch) => (
            <div key={patch.id} className="rounded border bg-white p-3 flex items-center justify-between">
              <div>
                <p className="font-semibold">{patch.type} · {patch.status}</p>
                <p className="text-sm text-gray-600">
                  Applied {new Date(patch.appliedAt).toLocaleString()} · Changes: {patch.changeCount}
                </p>
              </div>
              {patch.status === 'APPLIED' && (
                <button
                  className="px-3 py-1 bg-yellow-600 text-white rounded"
                  onClick={() => {
                    if (window.confirm('Rollback will restore previous categories. Continue?')) {
                      rollbackMutation.mutate(patch.id);
                    }
                  }}
                  disabled={rollbackMutation.isLoading}
                >
                  {rollbackMutation.isLoading ? 'Rolling back...' : 'Rollback'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
