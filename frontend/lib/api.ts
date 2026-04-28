// Typed API client — all calls go through here

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return data as T;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentMetadata {
  name: string;
  description: string;
  agentType: string;
  capabilities: string[];
  version: string;
}

export interface Agent {
  agentId: string;
  ownerAddress: string;
  validatorAddress: string;
  metadataURI: string;
  metadata: AgentMetadata;
  txHash: string;
  explorerUrl: string;
}

export interface Job {
  jobId: string;
  agentId: string;
  description: string;
  budgetUsdc: string;
  budgetRaw: string;
  status: string;
  statusCode: number;
  clientAddress: string;
  providerAddress: string;
  deliverableHash?: string;
  txHashes: Record<string, string>;
  explorerLinks: Record<string, string>;
  createdAt: string;
  completedAt?: string;
}

export interface WalletInfo {
  owner: { address: string; usdcBalance: string };
  validator: { address: string };
  explorerUrl: string;
}

// ── API Methods ──────────────────────────────────────────────────────────────

export const api = {
  // Wallet
  getWallet: () => request<WalletInfo>("/wallet"),

  // Agents
  getAgents: () => request<Agent[]>("/agents"),
  getAgent: (id: string) => request<Agent>(`/agents/${id}`),
  registerAgent: (payload: AgentMetadata) =>
    request<Agent>("/agents/register", { method: "POST", body: JSON.stringify(payload) }),
  recordReputation: (agentId: string, score: number, tag: string) =>
    request<{ txHash: string; explorerUrl: string }>(`/agents/${agentId}/reputation`, {
      method: "POST",
      body: JSON.stringify({ score, tag }),
    }),
  validateAgent: (agentId: string) =>
    request<{ requestHash: string; txHash: string; explorerUrl: string }>(
      `/agents/${agentId}/validate`,
      { method: "POST" }
    ),

  // Jobs
  getJobs: () => request<Job[]>("/jobs"),
  createJob: (agentId: string, description: string, budgetUsdc: string) =>
    request<Job>("/jobs", {
      method: "POST",
      body: JSON.stringify({ agentId, description, budgetUsdc }),
    }),
  submitDeliverable: (jobId: string, deliverable: string) =>
    request<Job>(`/jobs/${jobId}/submit`, {
      method: "POST",
      body: JSON.stringify({ deliverable }),
    }),
  completeJob: (jobId: string) =>
    request<Job>(`/jobs/${jobId}/complete`, { method: "POST" }),
};
