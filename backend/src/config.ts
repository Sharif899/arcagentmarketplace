// Arc Testnet chain definition and all contract addresses
// Single source of truth — update here if addresses change

export const arcTestnet = {
  id: 1657,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
} as const;

export const CONTRACTS = {
  IDENTITY_REGISTRY: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const,
  REPUTATION_REGISTRY: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const,
  VALIDATION_REGISTRY: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as const,
  AGENTIC_COMMERCE: "0x0747EEf0706327138c69792bF28Cd525089e4583" as const,
  USDC: "0x3600000000000000000000000000000000000000" as const,
} as const;

export const EXPLORER_URL = "https://testnet.arcscan.app";

// Job status enum matching ERC-8183 contract
export const JOB_STATUS: Record<number, string> = {
  0: "Open",
  1: "Funded",
  2: "Submitted",
  3: "Completed",
  4: "Rejected",
  5: "Expired",
};
