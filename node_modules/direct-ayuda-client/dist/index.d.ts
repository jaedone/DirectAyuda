import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions } from "@stellar/stellar-sdk/contract";
import type { u64, i128 } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CAU3JAGZIUK4Z4QRULBLJSB7N2XIH626BTXTHJFIR7FPBXIFXC7GEDZQ";
    };
};
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
export type DataKey = {
    tag: "Config";
    values: void;
} | {
    tag: "TotalFunds";
    values: void;
} | {
    tag: "TotalDisbursed";
    values: void;
} | {
    tag: "Beneficiary";
    values: readonly [string];
} | {
    tag: "BeneficiaryIndex";
    values: void;
} | {
    tag: "CurrentCycle";
    values: void;
} | {
    tag: "ClaimReceipt";
    values: readonly [u64, string];
} | {
    tag: "AuditLog";
    values: void;
};
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
    fund: ({ admin, amount }: {
        admin: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Beneficiary claims their entitlement for the current cycle.
     *
     * **Permissionless** — the beneficiary calls this themselves.
     * Transfers exactly `entitlement` tokens; no deductions possible.
     * Each beneficiary may claim exactly once per cycle.
     */
    claim: ({ beneficiary }: {
        beneficiary: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Return the global configuration.
     */
    get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>;
    /**
     * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Deploy the DirectAyuda subsidy contract.
     *
     * # Arguments
     * - `admin`         – government wallet (sole authority to fund/register)
     * - `subsidy_token` – token address used for payouts
     * - `program_name`  – human-readable program name for audit records
     */
    initialize: ({ admin, subsidy_token, program_name }: {
        admin: string;
        subsidy_token: string;
        program_name: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a disburse_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Admin pushes the entitlement to a beneficiary on their behalf.
     *
     * Useful for elderly or less tech-savvy recipients who cannot
     * initiate the transaction themselves.
     */
    disburse_to: ({ admin, beneficiary }: {
        admin: string;
        beneficiary: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a has_claimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Return whether a beneficiary has claimed in the current cycle.
     */
    has_claimed: ({ cycle, beneficiary }: {
        cycle: u64;
        beneficiary: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
    /**
     * Construct and simulate a advance_cycle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Admin opens the next disbursement cycle.
     *
     * Advancing the cycle resets claim eligibility for all beneficiaries.
     * Only the admin may advance the cycle.
     */
    advance_cycle: ({ admin }: {
        admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a get_audit_log transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Return all disbursement records (full audit log).
     */
    get_audit_log: (options?: MethodOptions) => Promise<AssembledTransaction<Array<DisbursementRecord>>>;
    /**
     * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Transfer admin (government wallet) rights.
     */
    transfer_admin: ({ admin, new_admin }: {
        admin: string;
        new_admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a get_beneficiary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Return a beneficiary's registration record.
     */
    get_beneficiary: ({ beneficiary }: {
        beneficiary: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Beneficiary>>;
    /**
     * Construct and simulate a get_total_funds transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Return total tokens held in the contract.
     */
    get_total_funds: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a withdraw_surplus transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Recover tokens not allocated to any active beneficiary.
     *
     * Allows the government wallet to reclaim excess funding.
     * Cannot withdraw funds that are owed to active beneficiaries
     * for the current cycle.
     */
    withdraw_surplus: ({ admin, amount }: {
        admin: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a get_claim_receipt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Return the disbursement record for a specific (cycle, beneficiary) pair.
     */
    get_claim_receipt: ({ cycle, beneficiary }: {
        cycle: u64;
        beneficiary: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<DisbursementRecord>>;
    /**
     * Construct and simulate a get_current_cycle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Return the current disbursement cycle number.
     */
    get_current_cycle: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>;
    /**
     * Construct and simulate a get_total_disbursed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Return total tokens disbursed since deployment.
     */
    get_total_disbursed: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
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
    register_beneficiary: ({ admin, beneficiary, name, entitlement }: {
        admin: string;
        beneficiary: string;
        name: string;
        entitlement: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a get_all_beneficiaries transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Return all registered beneficiary addresses.
     */
    get_all_beneficiaries: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>;
    /**
     * Construct and simulate a deactivate_beneficiary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Deactivate a beneficiary (e.g. deceased or ineligible).
     *
     * Deactivated beneficiaries cannot claim in future cycles.
     */
    deactivate_beneficiary: ({ admin, beneficiary }: {
        admin: string;
        beneficiary: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a reactivate_beneficiary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Reactivate a previously deactivated beneficiary.
     */
    reactivate_beneficiary: ({ admin, beneficiary }: {
        admin: string;
        beneficiary: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        fund: (json: string) => AssembledTransaction<null>;
        claim: (json: string) => AssembledTransaction<null>;
        get_config: (json: string) => AssembledTransaction<Config>;
        initialize: (json: string) => AssembledTransaction<null>;
        disburse_to: (json: string) => AssembledTransaction<null>;
        has_claimed: (json: string) => AssembledTransaction<boolean>;
        advance_cycle: (json: string) => AssembledTransaction<null>;
        get_audit_log: (json: string) => AssembledTransaction<DisbursementRecord[]>;
        transfer_admin: (json: string) => AssembledTransaction<null>;
        get_beneficiary: (json: string) => AssembledTransaction<Beneficiary>;
        get_total_funds: (json: string) => AssembledTransaction<bigint>;
        withdraw_surplus: (json: string) => AssembledTransaction<null>;
        get_claim_receipt: (json: string) => AssembledTransaction<DisbursementRecord>;
        get_current_cycle: (json: string) => AssembledTransaction<bigint>;
        get_total_disbursed: (json: string) => AssembledTransaction<bigint>;
        register_beneficiary: (json: string) => AssembledTransaction<null>;
        get_all_beneficiaries: (json: string) => AssembledTransaction<string[]>;
        deactivate_beneficiary: (json: string) => AssembledTransaction<null>;
        reactivate_beneficiary: (json: string) => AssembledTransaction<null>;
    };
}
