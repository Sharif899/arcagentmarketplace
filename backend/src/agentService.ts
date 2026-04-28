// Agent service: ERC-8004 identity registration, reputation, and validation

import { keccak256, parseAbiItem, toHex } from "viem";
import { CONTRACTS, EXPLORER_URL } from "./config.js";
import {
  identityRegistryAbi,
  reputationRegistryAbi,
  validationRegistryAbi,
} from "./abis.js";
import {
  publicClient,
  getOwnerAccount,
  getValidatorAccount,
  getOwnerWalletClient,
  getValidatorWalletClient,
  waitForTx,
} from "./client.js";

export interface AgentMetadata {
  name: string;
  description: string;
  agentType: string;
  capabilities: string[];
  version: string;
}

export interface RegisteredAgent {
  agentId: string;
  ownerAddress: string;
  validatorAddress: string;
  metadataURI: string;
  metadata: AgentMetadata;
  txHash: string;
  explorerUrl: string;
}

// Store registered agents in memory for the demo
// In production, use a database
const registeredAgents: Map<string, RegisteredAgent> = new Map();

export async function registerAgent(metadata: AgentMetadata): Promise<RegisteredAgent> {
  console.log(`\n🤖 Registering agent: ${metadata.name}`);

  const ownerAccount = getOwnerAccount();
  const validatorAccount = getValidatorAccount();
  const ownerWallet = getOwnerWalletClient();

  // Encode metadata as a data URI (in production, upload to IPFS)
  const metadataJSON = JSON.stringify({
    name: metadata.name,
    description: metadata.description,
    agent_type: metadata.agentType,
    capabilities: metadata.capabilities,
    version: metadata.version,
    created_at: new Date().toISOString(),
  });
  const metadataURI = `data:application/json;base64,${Buffer.from(metadataJSON).toString("base64")}`;

  // Step 1: Register agent identity via ERC-8004
  const registerHash = await ownerWallet.writeContract({
    address: CONTRACTS.IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [metadataURI],
    account: ownerAccount,
  });

  const receipt = await waitForTx(registerHash, "Register agent identity");

  // Step 2: Get the minted agent token ID from Transfer event
  const latestBlock = await publicClient.getBlockNumber();
  const fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n;

  const transferLogs = await publicClient.getLogs({
    address: CONTRACTS.IDENTITY_REGISTRY,
    event: parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
    ),
    args: { to: ownerAccount.address },
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });

  if (transferLogs.length === 0) {
    // Fallback: search wider block range
    const fallbackLogs = await publicClient.getLogs({
      address: CONTRACTS.IDENTITY_REGISTRY,
      event: parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
      ),
      args: { to: ownerAccount.address },
      fromBlock,
      toBlock: latestBlock,
    });
    if (fallbackLogs.length === 0) {
      throw new Error("Could not find Transfer event after registration. The transaction may have succeeded but event retrieval failed — check the explorer.");
    }
    const agentId = fallbackLogs[fallbackLogs.length - 1].args.tokenId!.toString();
    return buildAndStoreAgent(agentId, ownerAccount.address, validatorAccount.address, metadataURI, metadata, registerHash);
  }

  const agentId = transferLogs[transferLogs.length - 1].args.tokenId!.toString();
  return buildAndStoreAgent(agentId, ownerAccount.address, validatorAccount.address, metadataURI, metadata, registerHash);
}

function buildAndStoreAgent(
  agentId: string,
  ownerAddress: string,
  validatorAddress: string,
  metadataURI: string,
  metadata: AgentMetadata,
  txHash: string
): RegisteredAgent {
  const agent: RegisteredAgent = {
    agentId,
    ownerAddress,
    validatorAddress,
    metadataURI,
    metadata,
    txHash,
    explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
  };
  registeredAgents.set(agentId, agent);
  console.log(`  ✅ Agent registered with ID: ${agentId}`);
  return agent;
}

export async function recordReputation(agentId: string, score: number, tag: string): Promise<string> {
  console.log(`\n⭐ Recording reputation for agent ${agentId}: score=${score}`);

  const validatorAccount = getValidatorAccount();
  const validatorWallet = getValidatorWalletClient();

  const feedbackHash = keccak256(toHex(`${tag}_${agentId}_${Date.now()}`));

  const hash = await validatorWallet.writeContract({
    address: CONTRACTS.REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [
      BigInt(agentId),
      BigInt(score),
      0, // feedbackType: 0 = general
      tag,
      "",
      "",
      `Score: ${score} for ${tag}`,
      feedbackHash,
    ],
    account: validatorAccount,
  });

  await waitForTx(hash, "Record reputation");
  return hash;
}

export async function validateAgent(agentId: string): Promise<{ requestHash: string; txHash: string }> {
  console.log(`\n✅ Validating agent ${agentId}`);

  const ownerAccount = getOwnerAccount();
  const validatorAccount = getValidatorAccount();
  const ownerWallet = getOwnerWalletClient();
  const validatorWallet = getValidatorWalletClient();

  const requestHash = keccak256(toHex(`kyc_verification_agent_${agentId}_${Date.now()}`));
  const requestURI = `data:text/plain,validation_request_agent_${agentId}`;

  // Owner requests validation
  const reqHash = await ownerWallet.writeContract({
    address: CONTRACTS.VALIDATION_REGISTRY,
    abi: validationRegistryAbi,
    functionName: "validationRequest",
    args: [validatorAccount.address, BigInt(agentId), requestURI, requestHash],
    account: ownerAccount,
  });
  await waitForTx(reqHash, "Submit validation request");

  // Validator responds (100 = passed)
  const resHash = await validatorWallet.writeContract({
    address: CONTRACTS.VALIDATION_REGISTRY,
    abi: validationRegistryAbi,
    functionName: "validationResponse",
    args: [requestHash, 100, "", `0x${"0".repeat(64)}` as `0x${string}`, "kyc_verified"],
    account: validatorAccount,
  });
  await waitForTx(resHash, "Submit validation response");

  return { requestHash: requestHash, txHash: resHash };
}

export function getAllAgents(): RegisteredAgent[] {
  return Array.from(registeredAgents.values());
}

export function getAgent(agentId: string): RegisteredAgent | undefined {
  return registeredAgents.get(agentId);
}
