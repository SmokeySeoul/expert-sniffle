import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Button, FlatList, TouchableOpacity } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AIExplainTopic, AIProposal, AIProposalType, RecategorizeProposalItem, SavingsProposalItem } from '@substream/shared';
import { explainAI, getAILogs, getAIStatus, proposeAI, listProposals, getProposal, dismissProposal, applyProposal, listPatches, rollbackPatch } from './api';

const topics: { value: AIExplainTopic; label: string }[] = [
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'yearly_vs_monthly', label: 'Yearly vs Monthly' },
  { value: 'category_rationale', label: 'Category rationale' }
];

export function InsightsScreen({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [selectedTopic, setSelectedTopic] = useState<AIExplainTopic>('duplicate');
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [subscriptions, setSubscriptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => getAIStatus(token)
  });

  const logsQuery = useQuery({
    queryKey: ['ai-logs'],
    enabled: statusQuery.data?.enabled === true,
    queryFn: () => getAILogs(token)
  });

  const proposalsQuery = useQuery({
    queryKey: ['ai-proposals'],
    enabled: statusQuery.data?.enabled === true,
    queryFn: () => listProposals(token)
  });

  const patchesQuery = useQuery({
    queryKey: ['ai-patches'],
    enabled: statusQuery.data?.enabled === true,
    queryFn: () => listPatches(token)
  });

  const proposalDetailQuery = useQuery({
    queryKey: ['ai-proposal', selectedProposalId],
    enabled: !!selectedProposalId,
    queryFn: () => getProposal(token, selectedProposalId!)
  });

  const explainMutation = useMutation({
    mutationFn: () => explainAI(token, selectedTopic, selectedSubs),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-logs'] })
  });

  const proposeMutation = useMutation({
    mutationFn: (type: AIProposalType) => proposeAI(token, type, selectedSubs),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ai-proposals'] });
      setSelectedProposalId(result.proposalId);
    }
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissProposal(token, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-proposals'] })
  });
  const applyMutation = useMutation({
    mutationFn: (id: string) => applyProposal(token, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['ai-patches'] });
      if (selectedProposalId) queryClient.invalidateQueries({ queryKey: ['ai-proposal', selectedProposalId] });
    }
  });
  const rollbackMutation = useMutation({
    mutationFn: (id: string) => rollbackPatch(token, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-patches'] })
  });

  useEffect(() => {
    setSubscriptions([
      { id: 'sub-1', name: 'Netflix' },
      { id: 'sub-2', name: 'Spotify' }
    ]);
  }, []);

  const items = useMemo(() => explainMutation.data || [], [explainMutation.data]);
  const logs = logsQuery.data || [];
  const proposals = (proposalsQuery.data || []) as AIProposal[];
  const selectedProposal = proposalDetailQuery.data || null;
  const patches = patchesQuery.data || [];

  if (statusQuery.isLoading) {
    return (
      <View style={{ padding: 16 }}>
        <Text>Loading status...</Text>
      </View>
    );
  }

  if (!statusQuery.data?.enabled) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ marginBottom: 8 }}>AI is off by default. Enable it in Trust Center.</Text>
        <Button title="Open Trust Center" onPress={() => {}} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '600', marginBottom: 12 }}>Insights</Text>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ marginBottom: 4 }}>Topic</Text>
        <FlatList
          data={topics}
          horizontal
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedTopic(item.value)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginRight: 8,
                borderRadius: 8,
                backgroundColor: selectedTopic === item.value ? '#2563eb' : '#e5e7eb'
              }}
            >
              <Text style={{ color: selectedTopic === item.value ? '#fff' : '#111' }}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ marginBottom: 4 }}>Subscriptions (optional)</Text>
        {subscriptions.map((sub) => (
          <TouchableOpacity
            key={sub.id}
            onPress={() =>
              setSelectedSubs((prev) => (prev.includes(sub.id) ? prev.filter((id) => id !== sub.id) : [...prev, sub.id]))
            }
            style={{
              padding: 10,
              marginBottom: 6,
              borderWidth: 1,
              borderColor: '#d1d5db',
              borderRadius: 8,
              backgroundColor: selectedSubs.includes(sub.id) ? '#e0f2fe' : '#fff'
            }}
          >
            <Text>{sub.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button title={explainMutation.isLoading ? 'Generating...' : 'Generate explanations'} onPress={() => explainMutation.mutate()} />

      <View style={{ marginVertical: 12 }}>
        <Button title="Generate recategorize proposal" onPress={() => proposeMutation.mutate('RECATEGORIZE')} />
        <View style={{ height: 8 }} />
        <Button title="Generate savings list proposal" onPress={() => proposeMutation.mutate('SAVINGS_LIST')} />
      </View>

      <View style={{ marginVertical: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Results</Text>
        {items.length === 0 ? (
          <Text>No results yet.</Text>
        ) : (
          items.map((item, idx) => (
            <View key={idx} style={{ padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginBottom: 8 }}>
              <Text style={{ fontWeight: '600' }}>{item.title}</Text>
              <Text>{item.whyItMatters}</Text>
              <Text>{item.explanation}</Text>
              <Text>Confidence: {Math.round(item.confidence * 100)}%</Text>
              <Text>Inputs: {item.inputsUsed.join(', ')}</Text>
            </View>
          ))
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>AI Logs</Text>
        {logs.length === 0 ? (
          <Text>No logs yet.</Text>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(log) => log.id}
            renderItem={({ item }) => (
              <View style={{ padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginBottom: 8 }}>
                <Text style={{ fontWeight: '600' }}>{new Date(item.createdAt).toLocaleString()}</Text>
                <Text>
                  {item.topic} · {item.provider}
                </Text>
                <Text style={{ color: item.success ? 'green' : 'red' }}>{item.success ? 'Success' : 'Fail'}</Text>
                <Text>{item.latencyMs} ms</Text>
              </View>
            )}
          />
        )}
      </View>

      <View style={{ flex: 1, marginTop: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>AI Proposals</Text>
        {proposals.length === 0 ? (
          <Text>No proposals yet.</Text>
        ) : (
          <FlatList
            data={proposals}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setSelectedProposalId(item.id)}
                style={{ padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginBottom: 8 }}
              >
                <Text style={{ fontWeight: '600' }}>{item.title}</Text>
                <Text>
                  {item.type} · {item.status} · {new Date(item.createdAt).toLocaleString()}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}

        {selectedProposal && (
          <View style={{ padding: 12, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8 }}>
            <Text style={{ fontWeight: '700', marginBottom: 4 }}>{selectedProposal.title}</Text>
            <Text style={{ marginBottom: 8 }}>
              {selectedProposal.type} · {selectedProposal.status} · Expires {new Date(selectedProposal.expiresAt).toLocaleDateString()}
            </Text>
            {selectedProposal.type === 'RECATEGORIZE' && (
              <View>
                {(selectedProposal.payload?.items as RecategorizeProposalItem[] | undefined)?.map((item) => (
                  <View key={item.subscriptionId} style={{ marginBottom: 6 }}>
                    <Text>{item.subscriptionId}</Text>
                    <Text>
                      {item.fromCategory || 'Unassigned'} → {item.toCategory} ({Math.round(item.confidence * 100)}%)
                    </Text>
                    <Text>{item.rationale}</Text>
                  </View>
                ))}
              </View>
            )}
            {selectedProposal.type === 'SAVINGS_LIST' && (
              <View>
                {(selectedProposal.payload?.items as SavingsProposalItem[] | undefined)?.map((item) => (
                  <View key={item.subscriptionId} style={{ marginBottom: 6 }}>
                    <Text>{item.subscriptionId}</Text>
                    <Text>Annual delta: ${item.potentialAnnualDelta.toFixed(2)}</Text>
                    <Text>{item.explanation}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', marginTop: 8, alignItems: 'center' }}>
              {selectedProposal.type === 'RECATEGORIZE' && selectedProposal.status === 'ACTIVE' ? (
                <Button
                  title={applyMutation.isLoading ? 'Applying...' : 'Apply changes'}
                  onPress={() => applyMutation.mutate(selectedProposal.id)}
                />
              ) : (
                <Button title="Apply (coming soon)" disabled onPress={() => {}} />
              )}
              <View style={{ width: 8 }} />
              {selectedProposal.status === 'ACTIVE' && (
                <Button title={dismissMutation.isLoading ? 'Dismissing...' : 'Dismiss'} onPress={() => dismissMutation.mutate(selectedProposal.id)} />
              )}
            </View>
          </View>
        )}
      </View>

      <View style={{ flex: 1, marginTop: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>AI Changes</Text>
        {(!patches || patches.length === 0) ? (
          <Text>No applied changes.</Text>
        ) : (
          <FlatList
            data={patches}
            keyExtractor={(p: any) => p.id}
            renderItem={({ item }) => (
              <View style={{ padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginBottom: 8 }}>
                <Text style={{ fontWeight: '600' }}>{item.type} · {item.status}</Text>
                <Text>Applied {new Date(item.appliedAt).toLocaleString()} · Changes: {item.changeCount}</Text>
                {item.status === 'APPLIED' && (
                  <Button title={rollbackMutation.isLoading ? 'Rolling back...' : 'Rollback'} onPress={() => rollbackMutation.mutate(item.id)} />
                )}
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}
