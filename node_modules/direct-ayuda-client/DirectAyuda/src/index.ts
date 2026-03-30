import { Buffer } from "buffer";

import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CAU3JAGZIUK4Z4QRULBLJSB7N2XIH626BTXTHJFIR7FPBXIFXC7GEDZQ",
  }
} as const


/**
 * Global contract configuration.
 */
export interface Config {
  /**
 * Government wallet — only address that may fund and register.
 */
admin: string;
  /**
 * Human-readable program name (e.g. "AICS Senior Citizen Subsidy").
 */
program_name: string;
  /**
 * Token used for subsidy payouts (e.g. a PHP-pegged stablecoin).
 */
subsidy_token: string;
}

export type DataKey = {tag: "Config", values: void} | {tag: "TotalFunds", values: void} | {tag: "TotalDisbursed", values: void} | {tag: "Beneficiary", values: readonly [string]} | {tag: "BeneficiaryIndex", values: void} | {tag: "CurrentCycle", values: void} | {tag: "ClaimReceipt", values: readonly [u64, string]} | {tag: "AuditLog", values: void};


/**
 * A registered subsidy recipient.
 */
export interface Beneficiary {
  /**
 * Whether this beneficiary is currently active.
 */
active: boolean;
  address: string;
  /**
 * Fixed token amount this beneficiary receives per cycle.
 */
entitlement: i128;
  /**
 * Display name for audit readability (e.g. "Juan dela Cruz").
 */
name: string;
  /**
 * Timestamp of registration.
 */
registered_at: u64;
  /**
 * How many cycles this beneficiary has claimed.
 */
total_claims: u64;
  /**
 * Total tokens received lifetime.
 */
total_received: i128;
}


/**
 * Immutable record written on every successful disbursement.
 */
export interface DisbursementRecord {
  amount: i128;
  beneficiary: string;
  beneficiary_name: string;
  cycle: u64;
  timestamp: u64;
}

export interface Client {
  /**
   * Construct and simulate a fund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposit subsidy tokens into the contract.
   * 
   * Only the admin (government wallet) may fund the contract.
   * Tokens are held collectively; individual entitlements define
   * how much each beneficiary is owed per cycle.
   */
  fund: ({admin, amount}: {admin: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Beneficiary claims their entitlement for the current cycle.
   * 
   * **Permissionless** — the beneficiary calls this themselves.
   * Transfers exactly `entitlement` tokens; no deductions possible.
   * Each beneficiary may claim exactly once per cycle.
   */
  claim: ({beneficiary}: {beneficiary: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the global configuration.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deploy the DirectAyuda subsidy contract.
   * 
   * # Arguments
   * - `admin`         – government wallet (sole authority to fund/register)
   * - `subsidy_token` – token address used for payouts
   * - `program_name`  – human-readable program name for audit records
   */
  initialize: ({admin, subsidy_token, program_name}: {admin: string, subsidy_token: string, program_name: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a disburse_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin pushes the entitlement to a beneficiary on their behalf.
   * 
   * Useful for elderly or less tech-savvy recipients who cannot
   * initiate the transaction themselves.
   */
  disburse_to: ({admin, beneficiary}: {admin: string, beneficiary: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a has_claimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return whether a beneficiary has claimed in the current cycle.
   */
  has_claimed: ({cycle, beneficiary}: {cycle: u64, beneficiary: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a advance_cycle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin opens the next disbursement cycle.
   * 
   * Advancing the cycle resets claim eligibility for all beneficiaries.
   * Only the admin may advance the cycle.
   */
  advance_cycle: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_audit_log transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return all disbursement records (full audit log).
   */
  get_audit_log: (options?: MethodOptions) => Promise<AssembledTransaction<Array<DisbursementRecord>>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfer admin (government wallet) rights.
   */
  transfer_admin: ({admin, new_admin}: {admin: string, new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_beneficiary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return a beneficiary's registration record.
   */
  get_beneficiary: ({beneficiary}: {beneficiary: string}, options?: MethodOptions) => Promise<AssembledTransaction<Beneficiary>>

  /**
   * Construct and simulate a get_total_funds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return total tokens held in the contract.
   */
  get_total_funds: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a withdraw_surplus transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Recover tokens not allocated to any active beneficiary.
   * 
   * Allows the government wallet to reclaim excess funding.
   * Cannot withdraw funds that are owed to active beneficiaries
   * for the current cycle.
   */
  withdraw_surplus: ({admin, amount}: {admin: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_claim_receipt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the disbursement record for a specific (cycle, beneficiary) pair.
   */
  get_claim_receipt: ({cycle, beneficiary}: {cycle: u64, beneficiary: string}, options?: MethodOptions) => Promise<AssembledTransaction<DisbursementRecord>>

  /**
   * Construct and simulate a get_current_cycle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the current disbursement cycle number.
   */
  get_current_cycle: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_total_disbursed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return total tokens disbursed since deployment.
   */
  get_total_disbursed: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a register_beneficiary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a new subsidy recipient with a fixed entitlement.
   * 
   * Only the admin may register beneficiaries. The entitlement is
   * the exact amount transferred each disbursement cycle — no
   * intermediary may alter it.
   * 
   * # Arguments
   * - `beneficiary` – wallet address of the recipient
   * - `name`        – display name for audit records
   * - `entitlement` – fixed token amount per cycle
   */
  register_beneficiary: ({admin, beneficiary, name, entitlement}: {admin: string, beneficiary: string, name: string, entitlement: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_all_beneficiaries transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return all registered beneficiary addresses.
   */
  get_all_beneficiaries: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a deactivate_beneficiary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deactivate a beneficiary (e.g. deceased or ineligible).
   * 
   * Deactivated beneficiaries cannot claim in future cycles.
   */
  deactivate_beneficiary: ({admin, beneficiary}: {admin: string, beneficiary: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a reactivate_beneficiary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reactivate a previously deactivated beneficiary.
   */
  reactivate_beneficiary: ({admin, beneficiary}: {admin: string, beneficiary: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAM5EZXBvc2l0IHN1YnNpZHkgdG9rZW5zIGludG8gdGhlIGNvbnRyYWN0LgoKT25seSB0aGUgYWRtaW4gKGdvdmVybm1lbnQgd2FsbGV0KSBtYXkgZnVuZCB0aGUgY29udHJhY3QuClRva2VucyBhcmUgaGVsZCBjb2xsZWN0aXZlbHk7IGluZGl2aWR1YWwgZW50aXRsZW1lbnRzIGRlZmluZQpob3cgbXVjaCBlYWNoIGJlbmVmaWNpYXJ5IGlzIG93ZWQgcGVyIGN5Y2xlLgAAAAAABGZ1bmQAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAO1CZW5lZmljaWFyeSBjbGFpbXMgdGhlaXIgZW50aXRsZW1lbnQgZm9yIHRoZSBjdXJyZW50IGN5Y2xlLgoKKipQZXJtaXNzaW9ubGVzcyoqIOKAlCB0aGUgYmVuZWZpY2lhcnkgY2FsbHMgdGhpcyB0aGVtc2VsdmVzLgpUcmFuc2ZlcnMgZXhhY3RseSBgZW50aXRsZW1lbnRgIHRva2Vuczsgbm8gZGVkdWN0aW9ucyBwb3NzaWJsZS4KRWFjaCBiZW5lZmljaWFyeSBtYXkgY2xhaW0gZXhhY3RseSBvbmNlIHBlciBjeWNsZS4AAAAAAAAFY2xhaW0AAAAAAAABAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAA==",
        "AAAAAQAAAB5HbG9iYWwgY29udHJhY3QgY29uZmlndXJhdGlvbi4AAAAAAAAAAAAGQ29uZmlnAAAAAAADAAAAPkdvdmVybm1lbnQgd2FsbGV0IOKAlCBvbmx5IGFkZHJlc3MgdGhhdCBtYXkgZnVuZCBhbmQgcmVnaXN0ZXIuAAAAAAAFYWRtaW4AAAAAAAATAAAAQUh1bWFuLXJlYWRhYmxlIHByb2dyYW0gbmFtZSAoZS5nLiAiQUlDUyBTZW5pb3IgQ2l0aXplbiBTdWJzaWR5IikuAAAAAAAADHByb2dyYW1fbmFtZQAAABAAAAA+VG9rZW4gdXNlZCBmb3Igc3Vic2lkeSBwYXlvdXRzIChlLmcuIGEgUEhQLXBlZ2dlZCBzdGFibGVjb2luKS4AAAAAAA1zdWJzaWR5X3Rva2VuAAAAAAAAEw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACAAAAAAAAAAVR2xvYmFsIGNvbmZpZ3VyYXRpb24uAAAAAAAABkNvbmZpZwAAAAAAAAAAADpUb3RhbCB0b2tlbnMgZGVwb3NpdGVkIGFuZCBjdXJyZW50bHkgaGVsZCBpbiB0aGUgY29udHJhY3QuAAAAAAAKVG90YWxGdW5kcwAAAAAAAAAAAClUb3RhbCB0b2tlbnMgYWxyZWFkeSBjbGFpbWVkIC8gZGlzYnVyc2VkLgAAAAAAAA5Ub3RhbERpc2J1cnNlZAAAAAAAAQAAAC9SZWdpc3RlcmVkIGJlbmVmaWNpYXJ5IHJlY29yZCBrZXllZCBieSBhZGRyZXNzLgAAAAALQmVuZWZpY2lhcnkAAAAAAQAAABMAAAAAAAAAJUFsbCByZWdpc3RlcmVkIGJlbmVmaWNpYXJ5IGFkZHJlc3Nlcy4AAAAAAAAQQmVuZWZpY2lhcnlJbmRleAAAAAAAAAA0TW9ub3RvbmljYWxseS1pbmNyZWFzaW5nIGRpc2J1cnNlbWVudCBjeWNsZSBjb3VudGVyLgAAAAxDdXJyZW50Q3ljbGUAAAABAAAAO0NsYWltIHJlY2VpcHQ6IChjeWNsZSwgYmVuZWZpY2lhcnkpIOKGkiBEaXNidXJzZW1lbnRSZWNvcmQuAAAAAAxDbGFpbVJlY2VpcHQAAAACAAAABgAAABMAAAAAAAAAL0FsbCBkaXNidXJzZW1lbnQgcmVjb3JkcyBmb3IgYXVkaXQgKGZsYXQgbGlzdCkuAAAAAAhBdWRpdExvZw==",
        "AAAAAAAAACBSZXR1cm4gdGhlIGdsb2JhbCBjb25maWd1cmF0aW9uLgAAAApnZXRfY29uZmlnAAAAAAAAAAAAAQAAB9AAAAAGQ29uZmlnAAA=",
        "AAAAAAAAAPhEZXBsb3kgdGhlIERpcmVjdEF5dWRhIHN1YnNpZHkgY29udHJhY3QuCgojIEFyZ3VtZW50cwotIGBhZG1pbmAgICAgICAgICDigJMgZ292ZXJubWVudCB3YWxsZXQgKHNvbGUgYXV0aG9yaXR5IHRvIGZ1bmQvcmVnaXN0ZXIpCi0gYHN1YnNpZHlfdG9rZW5gIOKAkyB0b2tlbiBhZGRyZXNzIHVzZWQgZm9yIHBheW91dHMKLSBgcHJvZ3JhbV9uYW1lYCAg4oCTIGh1bWFuLXJlYWRhYmxlIHByb2dyYW0gbmFtZSBmb3IgYXVkaXQgcmVjb3JkcwAAAAppbml0aWFsaXplAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAADXN1YnNpZHlfdG9rZW4AAAAAAAATAAAAAAAAAAxwcm9ncmFtX25hbWUAAAAQAAAAAA==",
        "AAAAAAAAAKBBZG1pbiBwdXNoZXMgdGhlIGVudGl0bGVtZW50IHRvIGEgYmVuZWZpY2lhcnkgb24gdGhlaXIgYmVoYWxmLgoKVXNlZnVsIGZvciBlbGRlcmx5IG9yIGxlc3MgdGVjaC1zYXZ2eSByZWNpcGllbnRzIHdobyBjYW5ub3QKaW5pdGlhdGUgdGhlIHRyYW5zYWN0aW9uIHRoZW1zZWx2ZXMuAAAAC2Rpc2J1cnNlX3RvAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAALYmVuZWZpY2lhcnkAAAAAEwAAAAA=",
        "AAAAAAAAAD5SZXR1cm4gd2hldGhlciBhIGJlbmVmaWNpYXJ5IGhhcyBjbGFpbWVkIGluIHRoZSBjdXJyZW50IGN5Y2xlLgAAAAAAC2hhc19jbGFpbWVkAAAAAAIAAAAAAAAABWN5Y2xlAAAAAAAABgAAAAAAAAALYmVuZWZpY2lhcnkAAAAAEwAAAAEAAAAB",
        "AAAAAAAAAJNBZG1pbiBvcGVucyB0aGUgbmV4dCBkaXNidXJzZW1lbnQgY3ljbGUuCgpBZHZhbmNpbmcgdGhlIGN5Y2xlIHJlc2V0cyBjbGFpbSBlbGlnaWJpbGl0eSBmb3IgYWxsIGJlbmVmaWNpYXJpZXMuCk9ubHkgdGhlIGFkbWluIG1heSBhZHZhbmNlIHRoZSBjeWNsZS4AAAAADWFkdmFuY2VfY3ljbGUAAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAADFSZXR1cm4gYWxsIGRpc2J1cnNlbWVudCByZWNvcmRzIChmdWxsIGF1ZGl0IGxvZykuAAAAAAAADWdldF9hdWRpdF9sb2cAAAAAAAAAAAAAAQAAA+oAAAfQAAAAEkRpc2J1cnNlbWVudFJlY29yZAAA",
        "AAAAAQAAAB9BIHJlZ2lzdGVyZWQgc3Vic2lkeSByZWNpcGllbnQuAAAAAAAAAAALQmVuZWZpY2lhcnkAAAAABwAAAC1XaGV0aGVyIHRoaXMgYmVuZWZpY2lhcnkgaXMgY3VycmVudGx5IGFjdGl2ZS4AAAAAAAAGYWN0aXZlAAAAAAABAAAAAAAAAAdhZGRyZXNzAAAAABMAAAA3Rml4ZWQgdG9rZW4gYW1vdW50IHRoaXMgYmVuZWZpY2lhcnkgcmVjZWl2ZXMgcGVyIGN5Y2xlLgAAAAALZW50aXRsZW1lbnQAAAAACwAAADtEaXNwbGF5IG5hbWUgZm9yIGF1ZGl0IHJlYWRhYmlsaXR5IChlLmcuICJKdWFuIGRlbGEgQ3J1eiIpLgAAAAAEbmFtZQAAABAAAAAaVGltZXN0YW1wIG9mIHJlZ2lzdHJhdGlvbi4AAAAAAA1yZWdpc3RlcmVkX2F0AAAAAAAABgAAAC1Ib3cgbWFueSBjeWNsZXMgdGhpcyBiZW5lZmljaWFyeSBoYXMgY2xhaW1lZC4AAAAAAAAMdG90YWxfY2xhaW1zAAAABgAAAB9Ub3RhbCB0b2tlbnMgcmVjZWl2ZWQgbGlmZXRpbWUuAAAAAA50b3RhbF9yZWNlaXZlZAAAAAAACw==",
        "AAAAAAAAACpUcmFuc2ZlciBhZG1pbiAoZ292ZXJubWVudCB3YWxsZXQpIHJpZ2h0cy4AAAAAAA50cmFuc2Zlcl9hZG1pbgAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAACtSZXR1cm4gYSBiZW5lZmljaWFyeSdzIHJlZ2lzdHJhdGlvbiByZWNvcmQuAAAAAA9nZXRfYmVuZWZpY2lhcnkAAAAAAQAAAAAAAAALYmVuZWZpY2lhcnkAAAAAEwAAAAEAAAfQAAAAC0JlbmVmaWNpYXJ5AA==",
        "AAAAAAAAAClSZXR1cm4gdG90YWwgdG9rZW5zIGhlbGQgaW4gdGhlIGNvbnRyYWN0LgAAAAAAAA9nZXRfdG90YWxfZnVuZHMAAAAAAAAAAAEAAAAL",
        "AAAAAAAAAMNSZWNvdmVyIHRva2VucyBub3QgYWxsb2NhdGVkIHRvIGFueSBhY3RpdmUgYmVuZWZpY2lhcnkuCgpBbGxvd3MgdGhlIGdvdmVybm1lbnQgd2FsbGV0IHRvIHJlY2xhaW0gZXhjZXNzIGZ1bmRpbmcuCkNhbm5vdCB3aXRoZHJhdyBmdW5kcyB0aGF0IGFyZSBvd2VkIHRvIGFjdGl2ZSBiZW5lZmljaWFyaWVzCmZvciB0aGUgY3VycmVudCBjeWNsZS4AAAAAEHdpdGhkcmF3X3N1cnBsdXMAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAEhSZXR1cm4gdGhlIGRpc2J1cnNlbWVudCByZWNvcmQgZm9yIGEgc3BlY2lmaWMgKGN5Y2xlLCBiZW5lZmljaWFyeSkgcGFpci4AAAARZ2V0X2NsYWltX3JlY2VpcHQAAAAAAAACAAAAAAAAAAVjeWNsZQAAAAAAAAYAAAAAAAAAC2JlbmVmaWNpYXJ5AAAAABMAAAABAAAH0AAAABJEaXNidXJzZW1lbnRSZWNvcmQAAA==",
        "AAAAAAAAAC1SZXR1cm4gdGhlIGN1cnJlbnQgZGlzYnVyc2VtZW50IGN5Y2xlIG51bWJlci4AAAAAAAARZ2V0X2N1cnJlbnRfY3ljbGUAAAAAAAAAAAAAAQAAAAY=",
        "AAAAAAAAAC9SZXR1cm4gdG90YWwgdG9rZW5zIGRpc2J1cnNlZCBzaW5jZSBkZXBsb3ltZW50LgAAAAATZ2V0X3RvdGFsX2Rpc2J1cnNlZAAAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAXVSZWdpc3RlciBhIG5ldyBzdWJzaWR5IHJlY2lwaWVudCB3aXRoIGEgZml4ZWQgZW50aXRsZW1lbnQuCgpPbmx5IHRoZSBhZG1pbiBtYXkgcmVnaXN0ZXIgYmVuZWZpY2lhcmllcy4gVGhlIGVudGl0bGVtZW50IGlzCnRoZSBleGFjdCBhbW91bnQgdHJhbnNmZXJyZWQgZWFjaCBkaXNidXJzZW1lbnQgY3ljbGUg4oCUIG5vCmludGVybWVkaWFyeSBtYXkgYWx0ZXIgaXQuCgojIEFyZ3VtZW50cwotIGBiZW5lZmljaWFyeWAg4oCTIHdhbGxldCBhZGRyZXNzIG9mIHRoZSByZWNpcGllbnQKLSBgbmFtZWAgICAgICAgIOKAkyBkaXNwbGF5IG5hbWUgZm9yIGF1ZGl0IHJlY29yZHMKLSBgZW50aXRsZW1lbnRgIOKAkyBmaXhlZCB0b2tlbiBhbW91bnQgcGVyIGN5Y2xlAAAAAAAAFHJlZ2lzdGVyX2JlbmVmaWNpYXJ5AAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAAAAAARuYW1lAAAAEAAAAAAAAAALZW50aXRsZW1lbnQAAAAACwAAAAA=",
        "AAAAAQAAADpJbW11dGFibGUgcmVjb3JkIHdyaXR0ZW4gb24gZXZlcnkgc3VjY2Vzc2Z1bCBkaXNidXJzZW1lbnQuAAAAAAAAAAAAEkRpc2J1cnNlbWVudFJlY29yZAAAAAAABQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAAAAABBiZW5lZmljaWFyeV9uYW1lAAAAEAAAAAAAAAAFY3ljbGUAAAAAAAAGAAAAAAAAAAl0aW1lc3RhbXAAAAAAAAAG",
        "AAAAAAAAACxSZXR1cm4gYWxsIHJlZ2lzdGVyZWQgYmVuZWZpY2lhcnkgYWRkcmVzc2VzLgAAABVnZXRfYWxsX2JlbmVmaWNpYXJpZXMAAAAAAAAAAAAAAQAAA+oAAAAT",
        "AAAAAAAAAHFEZWFjdGl2YXRlIGEgYmVuZWZpY2lhcnkgKGUuZy4gZGVjZWFzZWQgb3IgaW5lbGlnaWJsZSkuCgpEZWFjdGl2YXRlZCBiZW5lZmljaWFyaWVzIGNhbm5vdCBjbGFpbSBpbiBmdXR1cmUgY3ljbGVzLgAAAAAAABZkZWFjdGl2YXRlX2JlbmVmaWNpYXJ5AAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAC2JlbmVmaWNpYXJ5AAAAABMAAAAA",
        "AAAAAAAAADBSZWFjdGl2YXRlIGEgcHJldmlvdXNseSBkZWFjdGl2YXRlZCBiZW5lZmljaWFyeS4AAAAWcmVhY3RpdmF0ZV9iZW5lZmljaWFyeQAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtiZW5lZmljaWFyeQAAAAATAAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    fund: this.txFromJSON<null>,
        claim: this.txFromJSON<null>,
        get_config: this.txFromJSON<Config>,
        initialize: this.txFromJSON<null>,
        disburse_to: this.txFromJSON<null>,
        has_claimed: this.txFromJSON<boolean>,
        advance_cycle: this.txFromJSON<null>,
        get_audit_log: this.txFromJSON<Array<DisbursementRecord>>,
        transfer_admin: this.txFromJSON<null>,
        get_beneficiary: this.txFromJSON<Beneficiary>,
        get_total_funds: this.txFromJSON<i128>,
        withdraw_surplus: this.txFromJSON<null>,
        get_claim_receipt: this.txFromJSON<DisbursementRecord>,
        get_current_cycle: this.txFromJSON<u64>,
        get_total_disbursed: this.txFromJSON<i128>,
        register_beneficiary: this.txFromJSON<null>,
        get_all_beneficiaries: this.txFromJSON<Array<string>>,
        deactivate_beneficiary: this.txFromJSON<null>,
        reactivate_beneficiary: this.txFromJSON<null>
  }
}