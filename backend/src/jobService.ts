// Job service: ERC-8183 full job lifecycle
// Open → Funded → Submitted → Completed → USDC settled

import { decodeEventLog, formatUnits, keccak256, parseUnits, toHex } from "viem";
import { CONTRACTS, EXPLORER_URL, JOB_STATUS } from "./config.js";
import { agenticCommerceAbi, erc20Abi } from "./abis.js";
import {
  publicClient,
  getOwnerAccount,
  getOwnerWalletClient,
  waitForTx,
} from "./client.js";

export interface Job {
  jobId: string;
  agentId: string;
  description: string;
  budgetUsdc: string;        // human readable e.g. "5.00"
  budgetRaw: string;         // raw 6-decimal units
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

// In-memory job store (use a DB in production)
const jobs: Map<string, Job> = new Map();

export async function createAndFundJob(
  agentId: string,
  description: string,
  budgetUsdc: string
): Promise<Job> {
  console.log(`\n💼 Creating job for agent ${agentId}: "${description}" @ $${budgetUsdc} USDC`);

  const ownerAccount = getOwnerAccount();
  const ownerWallet = getOwnerWalletClient();

  // Budget in 6-decimal USDC units (ERC-20 interface)
  const budgetRaw = parseUnits(budgetUsdc, 6);

  // Get current block for expiry (1 hour from now)
  const block = await publicClient.getBlock();
  const expiredAt = block.timestamp + 3600n;

  // ── Step 1: Create the job ──
  const createHash = await ownerWallet.writeContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: agenticCommerceAbi,
    functionName: "createJob",
    args: [
      ownerAccount.address, // provider (same wallet in demo)
      ownerAccount.address, // evaluator (same wallet in demo)
      expiredAt,
      description,
      "0x0000000000000000000000000000000000000000", // no hook
    ],
    account: ownerAccount,
  });

  const createReceipt = await waitForTx(createHash, "Create job");

  // Parse job ID from JobCreated event
  let jobId: bigint | undefined;
  for (const log of createReceipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: agenticCommerceAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "JobCreated") {
        jobId = decoded.args.jobId;
        break;
      }
    } catch {
      continue; // skip logs from other contracts
    }
  }

  if (jobId == null) {
    throw new Error("Could not parse JobCreated event. Transaction succeeded but job ID extraction failed.");
  }

  console.log(`  📋 Job ID: ${jobId}`);

  // ── Step 2: Provider sets budget ──
  const setBudgetHash = await ownerWallet.writeContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: agenticCommerceAbi,
    functionName: "setBudget",
    args: [jobId, budgetRaw, "0x"],
    account: ownerAccount,
  });
  await waitForTx(setBudgetHash, "Set budget");

  // ── Step 3: Approve USDC spend ──
  const approveHash = await ownerWallet.writeContract({
    address: CONTRACTS.USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [CONTRACTS.AGENTIC_COMMERCE, budgetRaw],
    account: ownerAccount,
  });
  await waitForTx(approveHash, "Approve USDC");

  // ── Step 4: Fund escrow ──
  const fundHash = await ownerWallet.writeContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: agenticCommerceAbi,
    functionName: "fund",
    args: [jobId, "0x"],
    account: ownerAccount,
  });
  await waitForTx(fundHash, "Fund escrow");

  const job: Job = {
    jobId: jobId.toString(),
    agentId,
    description,
    budgetUsdc,
    budgetRaw: budgetRaw.toString(),
    status: "Funded",
    statusCode: 1,
    clientAddress: ownerAccount.address,
    providerAddress: ownerAccount.address,
    txHashes: {
      create: createHash,
      setBudget: setBudgetHash,
      approve: approveHash,
      fund: fundHash,
    },
    explorerLinks: {
      create: `${EXPLORER_URL}/tx/${createHash}`,
      fund: `${EXPLORER_URL}/tx/${fundHash}`,
    },
    createdAt: new Date().toISOString(),
  };

  jobs.set(jobId.toString(), job);
  return job;
}

export async function submitDeliverable(jobId: string, deliverableContent: string): Promise<Job> {
  console.log(`\n📦 Submitting deliverable for job ${jobId}`);

  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found in local store`);

  const ownerAccount = getOwnerAccount();
  const ownerWallet = getOwnerWalletClient();

  const deliverableHash = keccak256(toHex(deliverableContent));

  const submitHash = await ownerWallet.writeContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: agenticCommerceAbi,
    functionName: "submit",
    args: [BigInt(jobId), deliverableHash, "0x"],
    account: ownerAccount,
  });

  await waitForTx(submitHash, "Submit deliverable");

  job.status = "Submitted";
  job.statusCode = 2;
  job.deliverableHash = deliverableHash;
  job.txHashes.submit = submitHash;
  job.explorerLinks.submit = `${EXPLORER_URL}/tx/${submitHash}`;

  return job;
}

export async function completeJob(jobId: string): Promise<Job> {
  console.log(`\n🎉 Completing job ${jobId} — releasing USDC to provider`);

  const job = jobs.get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found in local store`);

  const ownerAccount = getOwnerAccount();
  const ownerWallet = getOwnerWalletClient();

  const reasonHash = keccak256(toHex("deliverable-approved"));

  const completeHash = await ownerWallet.writeContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: agenticCommerceAbi,
    functionName: "complete",
    args: [BigInt(jobId), reasonHash, "0x"],
    account: ownerAccount,
  });

  await waitForTx(completeHash, "Complete job + release USDC");

  // Read final onchain state to confirm
  const onchainJob = await publicClient.readContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: agenticCommerceAbi,
    functionName: "getJob",
    args: [BigInt(jobId)],
  });

  job.status = JOB_STATUS[Number(onchainJob.status)] ?? "Unknown";
  job.statusCode = Number(onchainJob.status);
  job.txHashes.complete = completeHash;
  job.explorerLinks.complete = `${EXPLORER_URL}/tx/${completeHash}`;
  job.completedAt = new Date().toISOString();

  return job;
}

export async function getJobOnchain(jobId: string) {
  const onchainJob = await publicClient.readContract({
    address: CONTRACTS.AGENTIC_COMMERCE,
    abi: agenticCommerceAbi,
    functionName: "getJob",
    args: [BigInt(jobId)],
  });
  return {
    id: onchainJob.id.toString(),
    status: JOB_STATUS[Number(onchainJob.status)] ?? "Unknown",
    statusCode: Number(onchainJob.status),
    budget: formatUnits(onchainJob.budget, 6),
    client: onchainJob.client,
    provider: onchainJob.provider,
    description: onchainJob.description,
  };
}

export function getAllJobs(): Job[] {
  return Array.from(jobs.values());
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}
