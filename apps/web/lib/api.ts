import { AIExplainTopic, AIExplainItem, AIStatus, AILog } from '@substream/shared';
import { AIProposal, AIProposalType, AIPatchSummary } from '@substream/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3333/api';

function authHeaders() {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...authHeaders(),
      ...(options?.headers || {})
    }
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Please log in');
    }
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export async function getAIStatus(): Promise<AIStatus> {
  return apiFetch<AIStatus>('/ai/status');
}

export async function explainAI(topic: AIExplainTopic, subscriptionIds?: string[]): Promise<AIExplainItem[]> {
  const body: any = { topic };
  if (subscriptionIds && subscriptionIds.length) body.subscriptionIds = subscriptionIds;
  const res = await apiFetch<{ items: AIExplainItem[] }>('/ai/explain', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return res.items;
}

export async function getAILogs(): Promise<AILog[]> {
  const res = await apiFetch<{ items: AILog[]; nextCursor?: string | null }>('/ai/logs');
  return res.items;
}

export async function proposeAI(type: AIProposalType, subscriptionIds?: string[]) {
  const res = await apiFetch<{ proposalId: string; proposal: AIProposal }>('/ai/propose', {
    method: 'POST',
    body: JSON.stringify({ type, subscriptionIds })
  });
  return res;
}

export async function listProposals(): Promise<AIProposal[]> {
  const res = await apiFetch<{ items: AIProposal[] }>('/ai/proposals');
  return res.items;
}

export async function getProposal(id: string): Promise<AIProposal> {
  return apiFetch<AIProposal>(`/ai/proposals/${id}`);
}

export async function dismissProposal(id: string): Promise<AIProposal> {
  return apiFetch<AIProposal>(`/ai/proposals/${id}/dismiss`, { method: 'POST' });
}

export async function applyProposal(id: string): Promise<{ patchId: string; updated: number }> {
  return apiFetch<{ patchId: string; updated: number }>(`/ai/proposals/${id}/apply`, {
    method: 'POST',
    body: JSON.stringify({ approved: true })
  });
}

export async function listPatches(): Promise<AIPatchSummary[]> {
  const res = await apiFetch<{ items: AIPatchSummary[] }>('/ai/patches');
  return res.items;
}

export async function rollbackPatch(id: string): Promise<{ rolledBack: number }> {
  return apiFetch<{ rolledBack: number }>(`/ai/patches/${id}/rollback`, { method: 'POST' });
}
