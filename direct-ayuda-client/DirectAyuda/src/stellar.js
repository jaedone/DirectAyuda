import {
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { Client } from "direct-ayuda-client";

// ─────────────────────────────────────────────
// CONFIG — set these in your .env file:
//   VITE_CONTRACT_ID=C...
//   VITE_RPC_URL=https://soroban-testnet.stellar.org
//   VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
//   VITE_HORIZON_URL=https://horizon-testnet.stellar.org
// ─────────────────────────────────────────────
const CONTRACT_ID =
  import.meta.env.VITE_CONTRACT_ID ||
  "CA5XHXW5TV74L4OYXIM3MHEBDGR6ZKZACKBDHQ74CQ2BGNSVUAOKIVVA";

const NETWORK_PASSPHRASE =
  import.meta.env.VITE_NETWORK_PASSPHRASE ||
  "Test SDF Network ; September 2015";

const RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  "https://soroban-testnet.stellar.org";

const HORIZON_URL =
  import.meta.env.VITE_HORIZON_URL ||
  "https://horizon-testnet.stellar.org";

// ─────────────────────────────────────────────
// Build a signed contract client for a wallet
// ─────────────────────────────────────────────
function getClient(walletAddress) {
  return new Client({
    contractId: CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: walletAddress,
    signTransaction: async (tx) => {
      const result = await signTransaction(tx, {
        network: "TESTNET",
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      return result.signedTxXdr;
    },
  });
}

// ─────────────────────────────────────────────
// Read-only client (no signing needed)
// ─────────────────────────────────────────────
function getReadOnlyClient() {
  return new Client({
    contractId: CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    // A well-known funded testnet account used only for read-only simulation
    publicKey: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
  });
}

// ─────────────────────────────────────────────
// Connect Freighter wallet
// ─────────────────────────────────────────────
export async function connectWallet() {
  const connection = await isConnected();

  if (!connection.isConnected) {
    throw new Error(
      "Freighter wallet not found. Please install/unlock Freighter and set it to Testnet."
    );
  }

  const access = await requestAccess();

  if (access.error) {
    throw new Error(
      typeof access.error === "string"
        ? access.error
        : access.error.message || "Wallet access was denied."
    );
  }

  if (!access.address) {
    throw new Error("No address returned from Freighter.");
  }

  return access.address;
}

// ─────────────────────────────────────────────
// Claim subsidy for the connected wallet
// ─────────────────────────────────────────────
export async function claimSubsidy(walletAddress) {
  const client = getClient(walletAddress);
  const tx = await client.claim({ beneficiary: walletAddress });
  const result = await tx.signAndSend();

  if (result.sendTransactionResponse?.status === "ERROR") {
    const err = result.sendTransactionResponse.errorResult;
    throw new Error(`Transaction rejected: ${err ?? "unknown error"}`);
  }

  if (result.getTransactionResponse?.status === "FAILED") {
    throw new Error(
      "Transaction failed on-chain. You may have already claimed, or funds are insufficient."
    );
  }

  return result;
}

// ─────────────────────────────────────────────
// Check if a wallet has already claimed this cycle
// ─────────────────────────────────────────────
export async function checkHasClaimed(walletAddress, cycle) {
  const client = getReadOnlyClient();
  const result = await client.has_claimed({
    cycle: BigInt(cycle),
    beneficiary: walletAddress,
  });
  return result.result;
}

// ─────────────────────────────────────────────
// Contract read-only queries
// ─────────────────────────────────────────────
export async function getTotalFunds() {
  const client = getReadOnlyClient();
  const result = await client.get_total_funds();
  return result.result;
}

export async function getTotalDisbursed() {
  const client = getReadOnlyClient();
  const result = await client.get_total_disbursed();
  return result.result;
}

export async function getCurrentCycle() {
  const client = getReadOnlyClient();
  const result = await client.get_current_cycle();
  return result.result;
}

export async function getBeneficiary(walletAddress) {
  const client = getReadOnlyClient();
  const result = await client.get_beneficiary({
    beneficiary: walletAddress,
  });
  return result.result;
}

export async function getConfig() {
  const client = getReadOnlyClient();
  const result = await client.get_config();
  return result.result;
}

export async function fundContract(walletAddress, amount) {
  const client = getClient(walletAddress);
  const tx = await client.fund({
    admin: walletAddress,
    amount: BigInt(amount),
  });
  const result = await tx.signAndSend();
  if (result.getTransactionResponse?.status === "FAILED") {
    throw new Error("Fund transaction failed on-chain.");
  }
  return result;
}

export async function registerBeneficiary(walletAddress, beneficiary, name, entitlement) {
  const client = getClient(walletAddress);
  const tx = await client.register_beneficiary({
    admin: walletAddress,
    beneficiary,
    name,
    entitlement: BigInt(entitlement),
  });
  const result = await tx.signAndSend();
  if (result.getTransactionResponse?.status === "FAILED") {
    throw new Error("Registration failed on-chain.");
  }
  return result;
}

// ─────────────────────────────────────────────
// Audit log — fetched from Horizon contract events.
//
// The contract emits a ("disburse", "v1") event on every claim
// with data: (cycle, beneficiary, amount, timestamp).
// Horizon indexes these and makes them queryable without needing
// to know beneficiary addresses in advance.
// ─────────────────────────────────────────────
export async function getAuditLog() {
  const url =
    `${HORIZON_URL}/contracts/${CONTRACT_ID}/events` +
    `?order=desc&limit=100`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Horizon returned ${res.status}`);
  const json = await res.json();

  const records = [];

  for (const event of json._embedded?.records ?? []) {
    // Only process our disburse events: topic[0]="disburse", topic[1]="v1"
    const topics = event.topic ?? [];
    if (
      topics.length < 2 ||
      decodeScVal(topics[0]) !== "disburse" ||
      decodeScVal(topics[1]) !== "v1"
    ) {
      continue;
    }

    // Data is a Vec<ScVal>: [cycle, beneficiary, amount, timestamp]
    const vals = event.value?.value ?? [];
    if (vals.length < 4) continue;

    try {
      records.push({
        cycle: Number(decodeScVal(vals[0])),
        beneficiary: decodeScVal(vals[1]),
        beneficiary_name: "", // not in event payload; enrich via getBeneficiary if needed
        amount: Number(decodeScVal(vals[2])),
        timestamp: Number(decodeScVal(vals[3])),
        tx_hash: event.transaction_hash ?? "",
      });
    } catch {
      // skip malformed events
    }
  }

  return records;
}

// ─────────────────────────────────────────────
// Minimal ScVal decoder for Horizon JSON events.
// Horizon returns ScVal as a plain JS object with a "type" field.
// We only need to handle the types our contract actually emits.
// ─────────────────────────────────────────────
function decodeScVal(val) {
  if (!val) return null;
  const t = val.type;

  if (t === "symbol" || t === "string") return val.value;
  if (t === "address") return val.value; // G... or C... string
  if (t === "u64" || t === "i128" || t === "u128" || t === "i64")
    return BigInt(val.value ?? 0);
  if (t === "bool") return val.value === true;

  // Fallback — return raw value so the caller can decide
  return val.value ?? null;
}