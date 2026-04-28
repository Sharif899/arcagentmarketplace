import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./config.js";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `Missing env variable: ${key}\nPlease copy .env.example to .env and fill in your private keys.`
    );
  }
  return val;
}

// Public client for reading blockchain state
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

// Owner account: registers agents, creates/funds/completes jobs
export function getOwnerAccount() {
  const key = requireEnv("OWNER_PRIVATE_KEY");
  return privateKeyToAccount(key as `0x${string}`);
}

// Validator account: records reputation, validates agents
export function getValidatorAccount() {
  const key = requireEnv("VALIDATOR_PRIVATE_KEY");
  return privateKeyToAccount(key as `0x${string}`);
}

export function getOwnerWalletClient() {
  const account = getOwnerAccount();
  return createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(),
  });
}

export function getValidatorWalletClient() {
  const account = getValidatorAccount();
  return createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(),
  });
}

// Helper: wait for tx and return receipt with error details
export async function waitForTx(hash: `0x${string}`, label: string) {
  console.log(`  ⏳ ${label}: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    throw new Error(`Transaction reverted: ${label} (hash: ${hash})`);
  }
  console.log(`  ✅ ${label} confirmed in block ${receipt.blockNumber}`);
  return receipt;
}
