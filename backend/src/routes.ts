import { Router, Request, Response } from "express";
import {
  registerAgent,
  getAllAgents,
  getAgent,
  recordReputation,
  validateAgent,
  AgentMetadata,
} from "./agentService.js";
import {
  createAndFundJob,
  submitDeliverable,
  completeJob,
  getJobOnchain,
  getAllJobs,
  getJob,
} from "./jobService.js";
import { publicClient } from "./client.js";
import { CONTRACTS, EXPLORER_URL } from "./config.js";
import { erc20Abi } from "./abis.js";
import { formatUnits } from "viem";

export const router = Router();

// ─── Health ───────────────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Wallet Info ──────────────────────────────────────────────────────────────

router.get("/wallet", async (_req: Request, res: Response) => {
  try {
    const { getOwnerAccount, getValidatorAccount } = await import("./client.js");
    const owner = getOwnerAccount();
    const validator = getValidatorAccount();

    const ownerBalance = await publicClient.readContract({
      address: CONTRACTS.USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner.address],
    });

    res.json({
      owner: { address: owner.address, usdcBalance: formatUnits(ownerBalance, 6) },
      validator: { address: validator.address },
      explorerUrl: EXPLORER_URL,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Agents ───────────────────────────────────────────────────────────────────

// GET all agents
router.get("/agents", (_req: Request, res: Response) => {
  res.json(getAllAgents());
});

// GET single agent
router.get("/agents/:agentId", (req: Request, res: Response) => {
  const agent = getAgent(req.params.agentId);
  if (!agent) {
    res.status(404).json({ error: `Agent ${req.params.agentId} not found` });
    return;
  }
  res.json(agent);
});

// POST register a new agent
router.post("/agents/register", async (req: Request, res: Response) => {
  try {
    const { name, description, agentType, capabilities, version } = req.body as AgentMetadata & Record<string, unknown>;

    if (!name || !description) {
      res.status(400).json({ error: "name and description are required" });
      return;
    }

    const agent = await registerAgent({
      name: String(name),
      description: String(description),
      agentType: String(agentType || "general"),
      capabilities: Array.isArray(capabilities) ? capabilities.map(String) : [],
      version: String(version || "1.0.0"),
    });

    res.json(agent);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Register agent error:", msg);
    res.status(500).json({ error: msg });
  }
});

// POST record reputation for an agent
router.post("/agents/:agentId/reputation", async (req: Request, res: Response) => {
  try {
    const { score, tag } = req.body as { score: number; tag: string };
    if (!score || !tag) {
      res.status(400).json({ error: "score and tag are required" });
      return;
    }
    const txHash = await recordReputation(req.params.agentId, Number(score), String(tag));
    res.json({ txHash, explorerUrl: `${EXPLORER_URL}/tx/${txHash}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST validate an agent (KYC flow)
router.post("/agents/:agentId/validate", async (req: Request, res: Response) => {
  try {
    const result = await validateAgent(req.params.agentId);
    res.json({ ...result, explorerUrl: `${EXPLORER_URL}/tx/${result.txHash}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Jobs ─────────────────────────────────────────────────────────────────────

// GET all jobs
router.get("/jobs", (_req: Request, res: Response) => {
  res.json(getAllJobs());
});

// GET single job (local + onchain state)
router.get("/jobs/:jobId", async (req: Request, res: Response) => {
  try {
    const local = getJob(req.params.jobId);
    const onchain = await getJobOnchain(req.params.jobId);
    res.json({ local, onchain });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST create + fund a job for an agent
router.post("/jobs", async (req: Request, res: Response) => {
  try {
    const { agentId, description, budgetUsdc } = req.body as {
      agentId: string;
      description: string;
      budgetUsdc: string;
    };

    if (!agentId || !description || !budgetUsdc) {
      res.status(400).json({ error: "agentId, description, and budgetUsdc are required" });
      return;
    }

    const job = await createAndFundJob(String(agentId), String(description), String(budgetUsdc));
    res.json(job);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Create job error:", msg);
    res.status(500).json({ error: msg });
  }
});

// POST submit deliverable for a job
router.post("/jobs/:jobId/submit", async (req: Request, res: Response) => {
  try {
    const { deliverable } = req.body as { deliverable: string };
    if (!deliverable) {
      res.status(400).json({ error: "deliverable content is required" });
      return;
    }
    const job = await submitDeliverable(req.params.jobId, String(deliverable));
    res.json(job);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST complete a job and release USDC
router.post("/jobs/:jobId/complete", async (req: Request, res: Response) => {
  try {
    const job = await completeJob(req.params.jobId);
    res.json(job);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
