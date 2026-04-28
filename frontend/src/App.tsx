import { useState, useEffect, useCallback } from "react";
import { api, Agent, Job, WalletInfo } from "./lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    Open: "#a3e635",
    Funded: "#38bdf8",
    Submitted: "#fb923c",
    Completed: "#4ade80",
    Rejected: "#f87171",
    Expired: "#6b7280",
  };
  return map[status] ?? "#a1a1aa";
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TxLink({ hash, url, label }: { hash: string; url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "#a3e635", fontSize: "11px", fontFamily: "Space Mono, monospace" }}
    >
      ↗ {label}: {hash.slice(0, 10)}…
    </a>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        border: `1px solid ${statusColor(status)}`,
        color: statusColor(status),
        borderRadius: "3px",
        fontSize: "11px",
        fontFamily: "Space Mono, monospace",
        letterSpacing: "0.05em",
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: "14px",
        height: "14px",
        border: "2px solid #a3e635",
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        verticalAlign: "middle",
        marginRight: "8px",
      }}
    />
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #2a2a2a",
        borderRadius: "8px",
        padding: "24px",
        background: "#111",
        marginBottom: "24px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          color: "#a3e635",
          letterSpacing: "0.15em",
          fontFamily: "Space Mono, monospace",
          marginBottom: "16px",
          textTransform: "uppercase",
          borderBottom: "1px solid #1f1f1f",
          paddingBottom: "12px",
        }}
      >
        ◈ {title}
      </div>
      {children}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px", fontFamily: "Space Mono, monospace" }}>
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "#0a0a0a",
          border: "1px solid #2a2a2a",
          borderRadius: "4px",
          padding: "8px 12px",
          color: "#e5e5e5",
          fontFamily: "Space Mono, monospace",
          fontSize: "13px",
          outline: "none",
          boxSizing: "border-box",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#a3e635")}
        onBlur={(e) => (e.target.style.borderColor = "#2a2a2a")}
      />
    </div>
  );
}

function Btn({
  onClick,
  loading,
  children,
  disabled,
  variant = "primary",
}: {
  onClick: () => void;
  loading?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const colors = {
    primary: { bg: "#a3e635", color: "#0a0a0a" },
    secondary: { bg: "transparent", color: "#a3e635", border: "1px solid #a3e635" },
    danger: { bg: "transparent", color: "#f87171", border: "1px solid #f87171" },
  };
  const c = colors[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background: c.bg,
        color: c.color,
        border: (c as { border?: string }).border ?? "none",
        borderRadius: "4px",
        padding: "8px 16px",
        fontFamily: "Space Mono, monospace",
        fontSize: "12px",
        fontWeight: "700",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled || loading ? 0.6 : 1,
        letterSpacing: "0.05em",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        background: "#1a0a0a",
        border: "1px solid #7f1d1d",
        borderRadius: "4px",
        padding: "12px",
        color: "#f87171",
        fontFamily: "Space Mono, monospace",
        fontSize: "12px",
        marginTop: "12px",
        wordBreak: "break-all",
      }}
    >
      ✗ {message}
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: "#0a1a0a",
        border: "1px solid #4ade80",
        borderRadius: "6px",
        padding: "14px 20px",
        color: "#4ade80",
        fontFamily: "Space Mono, monospace",
        fontSize: "13px",
        zIndex: 9999,
        maxWidth: "400px",
        boxShadow: "0 4px 24px rgba(74,222,128,0.15)",
      }}
    >
      ✓ {message}
    </div>
  );
}

// ── Register Agent Panel ─────────────────────────────────────────────────────

function RegisterAgentPanel({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState("general");
  const [capabilities, setCapabilities] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name || !description) { setError("Name and description required"); return; }
    setLoading(true); setError("");
    try {
      await api.registerAgent({
        name,
        description,
        agentType,
        capabilities: capabilities.split(",").map((s) => s.trim()).filter(Boolean),
        version: "1.0.0",
      });
      setName(""); setDescription(""); setCapabilities("");
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="Register New Agent (ERC-8004)">
      <Input label="Agent Name" value={name} onChange={setName} placeholder="DeFi Arbitrage Bot v1" />
      <Input label="Description" value={description} onChange={setDescription} placeholder="Autonomous trading agent for Arc" />
      <Input label="Agent Type" value={agentType} onChange={setAgentType} placeholder="trading / data / compute / general" />
      <Input label="Capabilities (comma separated)" value={capabilities} onChange={setCapabilities} placeholder="arbitrage_detection, liquidity_monitoring" />
      <Btn onClick={submit} loading={loading}>Register Onchain →</Btn>
      {error && <ErrorBox message={error} />}
    </Panel>
  );
}

// ── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  onHire,
  onReputation,
  onValidate,
}: {
  agent: Agent;
  onHire: (a: Agent) => void;
  onReputation: (a: Agent) => void;
  onValidate: (a: Agent) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid #1f1f1f",
        borderRadius: "6px",
        padding: "16px",
        marginBottom: "12px",
        background: "#0d0d0d",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#2a2a2a")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "#1f1f1f")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div>
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "15px", color: "#e5e5e5" }}>
            {agent.metadata.name}
          </span>
          <span style={{ marginLeft: "10px", fontSize: "11px", color: "#6b7280", fontFamily: "Space Mono, monospace" }}>
            #{agent.agentId}
          </span>
        </div>
        <span
          style={{
            fontSize: "10px",
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            padding: "2px 8px",
            borderRadius: "3px",
            color: "#a3e635",
            fontFamily: "Space Mono, monospace",
          }}
        >
          {agent.metadata.agentType}
        </span>
      </div>

      <p style={{ color: "#9ca3af", fontSize: "13px", margin: "0 0 10px", lineHeight: 1.5 }}>
        {agent.metadata.description}
      </p>

      {agent.metadata.capabilities.length > 0 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
          {agent.metadata.capabilities.map((cap) => (
            <span
              key={cap}
              style={{
                fontSize: "10px",
                padding: "2px 8px",
                background: "#1a2a1a",
                border: "1px solid #2a3a2a",
                borderRadius: "12px",
                color: "#86efac",
                fontFamily: "Space Mono, monospace",
              }}
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: "11px", color: "#4b5563", fontFamily: "Space Mono, monospace", marginBottom: "12px" }}>
        owner: {short(agent.ownerAddress)}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <Btn onClick={() => onHire(agent)} variant="primary">Hire Agent</Btn>
        <Btn onClick={() => onReputation(agent)} variant="secondary">+ Reputation</Btn>
        <Btn onClick={() => onValidate(agent)} variant="secondary">Validate KYC</Btn>
        <a
          href={agent.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#4b5563", fontSize: "11px", fontFamily: "Space Mono, monospace", alignSelf: "center" }}
        >
          ↗ Explorer
        </a>
      </div>
    </div>
  );
}

// ── Post Job Modal ───────────────────────────────────────────────────────────

function PostJobModal({
  agent,
  onClose,
  onSuccess,
}: {
  agent: Agent;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("1.00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!description || !budget) { setError("All fields required"); return; }
    setLoading(true); setError("");
    try {
      await api.createJob(agent.agentId, description, budget);
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "28px", width: "460px", maxWidth: "95vw" }}>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "18px", marginBottom: "6px", color: "#e5e5e5" }}>
          Hire Agent
        </div>
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "12px", color: "#6b7280", marginBottom: "20px" }}>
          {agent.metadata.name} · ID #{agent.agentId}
        </div>
        <Input label="Job Description" value={description} onChange={setDescription} placeholder="Write a smart contract for..." />
        <Input label="Budget (USDC)" value={budget} onChange={setBudget} placeholder="1.00" type="number" />
        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          <Btn onClick={submit} loading={loading}>Fund Escrow & Post Job</Btn>
          <Btn onClick={onClose} variant="secondary" disabled={loading}>Cancel</Btn>
        </div>
        {error && <ErrorBox message={error} />}
      </div>
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({ job, onSubmit, onComplete, onRefresh }: {
  job: Job;
  onSubmit: (j: Job) => void;
  onComplete: (j: Job) => void;
  onRefresh: () => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${statusColor(job.status)}22`,
        borderLeft: `3px solid ${statusColor(job.status)}`,
        borderRadius: "6px",
        padding: "16px",
        marginBottom: "12px",
        background: "#0d0d0d",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div>
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "14px", color: "#e5e5e5" }}>
            {job.description}
          </span>
          <span style={{ marginLeft: "10px", fontSize: "11px", color: "#6b7280", fontFamily: "Space Mono, monospace" }}>
            Job #{job.jobId}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontFamily: "Space Mono, monospace", fontSize: "14px", fontWeight: 700, color: "#4ade80" }}>
            ${job.budgetUsdc}
          </span>
          <StatusBadge status={job.status} />
        </div>
      </div>

      <div style={{ fontSize: "11px", color: "#4b5563", fontFamily: "Space Mono, monospace", marginBottom: "10px" }}>
        agent #{job.agentId} · created {new Date(job.createdAt).toLocaleTimeString()}
        {job.completedAt && ` · completed ${new Date(job.completedAt).toLocaleTimeString()}`}
      </div>

      {job.deliverableHash && (
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "11px", color: "#78716c", marginBottom: "10px" }}>
          deliverable: {job.deliverableHash.slice(0, 20)}…
        </div>
      )}

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
        {Object.entries(job.explorerLinks).map(([k, url]) => (
          <TxLink key={k} hash={job.txHashes[k] ?? ""} url={url} label={k} />
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {job.statusCode === 1 && (
          <Btn onClick={() => onSubmit(job)} variant="secondary">Submit Deliverable</Btn>
        )}
        {job.statusCode === 2 && (
          <Btn onClick={() => onComplete(job)} variant="primary">✓ Complete & Pay Agent</Btn>
        )}
        {job.statusCode === 3 && (
          <span style={{ fontFamily: "Space Mono, monospace", fontSize: "12px", color: "#4ade80" }}>
            ✓ USDC Released
          </span>
        )}
        <Btn onClick={onRefresh} variant="secondary">↻ Refresh</Btn>
      </div>
    </div>
  );
}

// ── Submit Deliverable Modal ─────────────────────────────────────────────────

function SubmitModal({ job, onClose, onSuccess }: { job: Job; onClose: () => void; onSuccess: () => void }) {
  const [deliverable, setDeliverable] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!deliverable) { setError("Deliverable content required"); return; }
    setLoading(true); setError("");
    try {
      await api.submitDeliverable(job.jobId, deliverable);
      onSuccess(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "28px", width: "460px", maxWidth: "95vw" }}>
        <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "18px", marginBottom: "6px", color: "#e5e5e5" }}>
          Submit Deliverable
        </div>
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: "12px", color: "#6b7280", marginBottom: "20px" }}>
          Job #{job.jobId} · ${job.budgetUsdc} USDC
        </div>
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px", fontFamily: "Space Mono, monospace" }}>
            Deliverable Content (will be hashed onchain)
          </div>
          <textarea
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            placeholder="Paste deliverable content, URL, or description..."
            rows={4}
            style={{
              width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a",
              borderRadius: "4px", padding: "8px 12px", color: "#e5e5e5",
              fontFamily: "Space Mono, monospace", fontSize: "12px", outline: "none",
              resize: "vertical", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Btn onClick={submit} loading={loading}>Submit Hash Onchain</Btn>
          <Btn onClick={onClose} variant="secondary" disabled={loading}>Cancel</Btn>
        </div>
        {error && <ErrorBox message={error} />}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<"agents" | "jobs">("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [hireAgent, setHireAgent] = useState<Agent | null>(null);
  const [submitJob, setSubmitJob] = useState<Job | null>(null);
  const [toast, setToast] = useState("");
  const [loadingComplete, setLoadingComplete] = useState<string>("");
  const [walletError, setWalletError] = useState(false);

  const notify = (msg: string) => setToast(msg);

  const loadData = useCallback(async () => {
    try {
      const [a, j, w] = await Promise.all([api.getAgents(), api.getJobs(), api.getWallet()]);
      setAgents(a);
      setJobs(j);
      setWallet(w);
      setWalletError(false);
    } catch {
      setWalletError(true);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleComplete = async (job: Job) => {
    setLoadingComplete(job.jobId);
    try {
      await api.completeJob(job.jobId);
      notify(`Job #${job.jobId} completed! $${job.budgetUsdc} USDC released to agent.`);
      loadData();
    } catch (e: unknown) {
      notify(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingComplete("");
    }
  };

  const handleValidate = async (agent: Agent) => {
    try {
      await api.validateAgent(agent.agentId);
      notify(`Agent ${agent.metadata.name} KYC validated onchain!`);
    } catch (e: unknown) {
      notify(`Validation error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleReputation = async (agent: Agent) => {
    try {
      await api.recordReputation(agent.agentId, 95, "successful_job");
      notify(`Reputation score recorded for ${agent.metadata.name}`);
    } catch (e: unknown) {
      notify(`Reputation error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080808",
        color: "#e5e5e5",
        fontFamily: "Syne, sans-serif",
      }}
    >
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        input::placeholder, textarea::placeholder { color: #3a3a3a; }
        input:focus, textarea:focus { border-color: #a3e635 !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid #1a1a1a",
          padding: "0 32px",
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#0a0a0a",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "28px", height: "28px",
              background: "#a3e635",
              borderRadius: "6px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span style={{ color: "#0a0a0a", fontWeight: 900, fontSize: "14px" }}>A</span>
          </div>
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "16px", letterSpacing: "-0.02em" }}>
            Arc Agent Marketplace
          </span>
          <span
            style={{
              fontFamily: "Space Mono, monospace",
              fontSize: "10px",
              padding: "2px 8px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "3px",
              color: "#6b7280",
            }}
          >
            TESTNET
          </span>
        </div>

        {wallet && (
          <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "#6b7280", fontFamily: "Space Mono, monospace" }}>WALLET</div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "12px", color: "#a3e635" }}>
                {short(wallet.owner.address)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "#6b7280", fontFamily: "Space Mono, monospace" }}>BALANCE</div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: "14px", fontWeight: 700, color: "#4ade80" }}>
                ${wallet.owner.usdcBalance} <span style={{ fontSize: "11px", color: "#6b7280" }}>USDC</span>
              </div>
            </div>
          </div>
        )}
      </header>

      {walletError && (
        <div style={{
          background: "#1a0a0a", borderBottom: "1px solid #7f1d1d",
          padding: "12px 32px", fontFamily: "Space Mono, monospace", fontSize: "12px", color: "#f87171",
        }}>
          ⚠ Cannot connect to backend. Make sure the backend server is running on port 3001.
          Check that OWNER_PRIVATE_KEY and VALIDATOR_PRIVATE_KEY are set in backend/.env
        </div>
      )}

      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>

        {/* Stats bar */}
        {wallet && (
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1px", background: "#1a1a1a",
              border: "1px solid #1a1a1a", borderRadius: "8px",
              overflow: "hidden", marginBottom: "32px",
              animation: "fadeIn 0.4s ease",
            }}
          >
            {[
              { label: "Registered Agents", value: agents.length },
              { label: "Total Jobs", value: jobs.length },
              { label: "Completed Jobs", value: jobs.filter((j) => j.statusCode === 3).length },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "#0d0d0d", padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "28px", color: "#e5e5e5" }}>
                  {stat.value}
                </div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab nav */}
        <div style={{ display: "flex", gap: "0", marginBottom: "28px", borderBottom: "1px solid #1a1a1a" }}>
          {(["agents", "jobs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "10px 20px",
                fontFamily: "Space Mono, monospace", fontSize: "12px", letterSpacing: "0.1em",
                color: tab === t ? "#a3e635" : "#4b5563",
                borderBottom: tab === t ? "2px solid #a3e635" : "2px solid transparent",
                marginBottom: "-1px", textTransform: "uppercase",
              }}
            >
              {t === "agents" ? `Agents (${agents.length})` : `Jobs (${jobs.length})`}
            </button>
          ))}
          <div style={{ marginLeft: "auto", paddingBottom: "8px" }}>
            <Btn onClick={loadData} variant="secondary">↻ Refresh</Btn>
          </div>
        </div>

        {/* Agents tab */}
        {tab === "agents" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <RegisterAgentPanel onSuccess={() => { loadData(); notify("Agent registered onchain!"); }} />

            {agents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#4b5563", fontFamily: "Space Mono, monospace", fontSize: "13px" }}>
                No agents registered yet. Register one above.
              </div>
            ) : (
              <Panel title={`Active Agents (${agents.length})`}>
                {agents.map((a) => (
                  <AgentCard
                    key={a.agentId}
                    agent={a}
                    onHire={setHireAgent}
                    onReputation={handleReputation}
                    onValidate={handleValidate}
                  />
                ))}
              </Panel>
            )}
          </div>
        )}

        {/* Jobs tab */}
        {tab === "jobs" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {jobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px", color: "#4b5563", fontFamily: "Space Mono, monospace", fontSize: "13px" }}>
                No jobs yet. Go to Agents and hire one.
              </div>
            ) : (
              <Panel title={`Job Lifecycle (ERC-8183)`}>
                {[...jobs].reverse().map((job) => (
                  <JobCard
                    key={job.jobId}
                    job={job.jobId === loadingComplete ? { ...job, status: "Completing…" } : job}
                    onSubmit={setSubmitJob}
                    onComplete={handleComplete}
                    onRefresh={loadData}
                  />
                ))}
              </Panel>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {hireAgent && (
        <PostJobModal
          agent={hireAgent}
          onClose={() => setHireAgent(null)}
          onSuccess={() => { loadData(); setTab("jobs"); notify(`Job posted for ${hireAgent.metadata.name}!`); }}
        />
      )}
      {submitJob && (
        <SubmitModal
          job={submitJob}
          onClose={() => setSubmitJob(null)}
          onSuccess={() => { loadData(); notify("Deliverable submitted onchain!"); }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
