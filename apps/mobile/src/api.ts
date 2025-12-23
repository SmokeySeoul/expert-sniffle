import { AIExplainTopic, AIExplainItem, AIStatus, AILog, AIProposal, AIProposalType } from '@substream/shared';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  // Android emulator specific default
  (typeof navigator !== 'undefined' && navigator.product === 'ReactNative' ? 'http://10.0.2.2:3333/api' : 'http://localhost:3333/api');

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options?.headers || {})
    }
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Please log in');
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export async function getAIStatus(token?: string): Promise<AIStatus> {
  return apiFetch<AIStatus>('/ai/status', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}

export async function explainAI(token: string, topic: AIExplainTopic, subscriptionIds?: string[]): Promise<AIExplainItem[]> {
  const body: any = { topic };
  if (subscriptionIds?.length) body.subscriptionIds = subscriptionIds;
  const res = await apiFetch<{ items: AIExplainItem[] }>('/ai/explain', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  return res.items;
}

export async function getAILogs(token: string): Promise<AILog[]> {
  const res = await apiFetch<{ items: AILog[]; nextCursor?: string | null }>('/ai/logs', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.items;
}

export async function proposeAI(token: string, type: AIProposalType, subscriptionIds?: string[]) {
  const res = await apiFetch<{ proposalId: string; proposal: AIProposal }>('/ai/propose', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, subscriptionIds })
  });
  return res;
}

export async function listProposals(token: string): Promise<AIProposal[]> {
  const res = await apiFetch<{ items: AIProposal[] }>('/ai/proposals', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.items;
}

export async function getProposal(token: string, id: string): Promise<AIProposal> {
  return apiFetch<AIProposal>(`/ai/proposals/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function dismissProposal(token: string, id: string): Promise<AIProposal> {
  return apiFetch<AIProposal>(`/ai/proposals/${id}/dismiss`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
}

export async function applyProposal(token: string, id: string): Promise<{ patchId: string; updated: number }> {
  return apiFetch<{ patchId: string; updated: number }>(`/ai/proposals/${id}/apply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ approved: true })
  });
}

export async function listPatches(token: string) {
  const res = await apiFetch<{ items: any[] }>('/ai/patches', { headers: { Authorization: `Bearer ${token}` } });
  return res.items;
}

export async function rollbackPatch(token: string, id: string) {
  return apiFetch<{ rolledBack: number }>(`/ai/patches/${id}/rollback`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
}
