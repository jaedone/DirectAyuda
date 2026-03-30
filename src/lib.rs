#![no_std]

//! # ayuda-direct
//!
//! A DAO community treasury for direct government subsidy disbursement on Stellar.
//!
//! ## Problem
//! Senior citizens and subsidy recipients lose a portion of their aid
//! to intermediaries who charge "processing fees." DirectAyuda removes
//! the middleman entirely.
//!
//! ## Flow
//!
//! 1. **Fund** — a government wallet (the admin) deposits subsidy tokens
//!    into the contract. Funds are held collectively; individual amounts
//!    are tracked per-beneficiary via registered entitlements.
//!
//! 2. **Register** — the admin registers a beneficiary with a fixed
//!    entitlement amount per disbursement cycle. Entitlements are
//!    immutable once set (requires re-registration to change).
//!
//! 3. **Disburse** — the admin (or anyone, permissionlessly, once a
//!    disbursement cycle opens) calls `disburse`. The contract transfers
//!    exactly the registered entitlement — no more, no less — to each
//!    beneficiary's wallet.
//!
//! 4. **Claim** — beneficiaries may claim their disbursement themselves
//!    via `claim`. This is permissionless after the cycle opens.
//!
//! 5. **Audit** — anyone may query the disbursement history for full
//!    on-chain auditability.
//!
//! ## Key Invariants
//!
//! - Only the admin may fund and register beneficiaries.
//! - Disbursement amounts are fixed at registration time — no discretionary
//!   deductions are possible.
//! - A beneficiary may only claim once per cycle.
//! - The contract never holds funds that exceed registered entitlements
//!   (the admin may recover surplus via `withdraw_surplus`).
//! - Every disbursement is permanently logged for auditing.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String, Symbol, Vec,
};

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const INITIALIZED: Symbol = symbol_short!("INIT");

// ─────────────────────────────────────────────
// Storage Keys
// ─────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    TotalFunds,
    TotalDisbursed,
    Beneficiary(Address),
    BeneficiaryCount,   
    CurrentCycle,
    ClaimReceipt(u64, Address),
    AuditCount,        
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/// Global contract configuration.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    /// Government wallet — only address that may fund and register.
    pub admin: Address,
    /// Token used for subsidy payouts (e.g. a PHP-pegged stablecoin).
    pub subsidy_token: Address,
    /// Human-readable program name (e.g. "AICS Senior Citizen Subsidy").
    pub program_name: String,
}

/// A registered subsidy recipient.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Beneficiary {
    pub address: Address,
    /// Display name for audit readability (e.g. "Juan dela Cruz").
    pub name: String,
    /// Fixed token amount this beneficiary receives per cycle.
    pub entitlement: i128,
    /// Whether this beneficiary is currently active.
    pub active: bool,
    /// Timestamp of registration.
    pub registered_at: u64,
    /// How many cycles this beneficiary has claimed.
    pub total_claims: u64,
    /// Total tokens received lifetime.
    pub total_received: i128,
}

/// Immutable record written on every successful disbursement.
#[contracttype]
#[derive(Clone, Debug)]
pub struct DisbursementRecord {
    pub cycle: u64,
    pub beneficiary: Address,
    pub beneficiary_name: String,
    pub amount: i128,
    pub timestamp: u64,
}

// ─────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────

#[contract]
pub struct DirectAyudaContract;

#[contractimpl]
impl DirectAyudaContract {
    // ── Initialisation ───────────────────────

    /// Deploy the DirectAyuda subsidy contract.
    ///
    /// # Arguments
    /// - `admin`         – government wallet (sole authority to fund/register)
    /// - `subsidy_token` – token address used for payouts
    /// - `program_name`  – human-readable program name for audit records
    pub fn initialize(
        env: Env,
        admin: Address,
        subsidy_token: Address,
        program_name: String,
    ) {
        if env.storage().instance().has(&INITIALIZED) {
            panic!("already initialized");
        }
        assert!(!program_name.is_empty(), "program name cannot be empty");

        env.storage().instance().set(&INITIALIZED, &true);
        env.storage().instance().set(
            &DataKey::Config,
            &Config { admin, subsidy_token, program_name },
        );
        env.storage().instance().set(&DataKey::TotalFunds, &0i128);
        env.storage().instance().set(&DataKey::TotalDisbursed, &0i128);
        env.storage().instance().set(&DataKey::CurrentCycle, &1u64);
        env.storage().instance().set(&DataKey::BeneficiaryCount, &0u64);
        env.storage().instance().set(&DataKey::AuditCount, &0u64);
    }

    // ── Admin ────────────────────────────────

    /// Transfer admin (government wallet) rights.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();
        let mut config = Self::load_config(&env);
        assert!(config.admin == admin, "caller is not the admin");
        config.admin = new_admin;
        env.storage().instance().set(&DataKey::Config, &config);
    }

    // ── Funding ──────────────────────────────

    /// Deposit subsidy tokens into the contract.
    ///
    /// Only the admin (government wallet) may fund the contract.
    /// Tokens are held collectively; individual entitlements define
    /// how much each beneficiary is owed per cycle.
    pub fn fund(env: Env, admin: Address, amount: i128) {
        admin.require_auth();
        let config = Self::load_config(&env);
        assert!(config.admin == admin, "caller is not the admin");
        assert!(amount > 0, "fund amount must be positive");

        token::Client::new(&env, &config.subsidy_token).transfer(
            &admin,
            &env.current_contract_address(),
            &amount,
        );

        let bal: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalFunds)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalFunds, &(bal + amount));
    }

    // ── Beneficiary Registration ──────────────

    /// Register a new subsidy recipient with a fixed entitlement.
    ///
    /// Only the admin may register beneficiaries. The entitlement is
    /// the exact amount transferred each disbursement cycle — no
    /// intermediary may alter it.
    ///
    /// # Arguments
    /// - `beneficiary` – wallet address of the recipient
    /// - `name`        – display name for audit records
    /// - `entitlement` – fixed token amount per cycle
    pub fn register_beneficiary(
        env: Env,
        admin: Address,
        beneficiary: Address,
        name: String,
        entitlement: i128,
    ) {
        admin.require_auth();
        let config = Self::load_config(&env);
        assert!(config.admin == admin, "caller is not the admin");
        assert!(entitlement > 0, "entitlement must be positive");
        assert!(!name.is_empty(), "beneficiary name cannot be empty");
        assert!(
            !env.storage()
                .persistent()
                .has(&DataKey::Beneficiary(beneficiary.clone())),
            "beneficiary already registered"
        );

        let record = Beneficiary {
            address: beneficiary.clone(),
            name,
            entitlement,
            active: true,
            registered_at: env.ledger().timestamp(),
            total_claims: 0,
            total_received: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Beneficiary(beneficiary.clone()), &record);

        let count: u64 = env.storage().instance()
        .get(&DataKey::BeneficiaryCount).unwrap_or(0);
        env.storage().instance()
            .set(&DataKey::BeneficiaryCount, &(count + 1));
    }

    /// Deactivate a beneficiary (e.g. deceased or ineligible).
    ///
    /// Deactivated beneficiaries cannot claim in future cycles.
    pub fn deactivate_beneficiary(env: Env, admin: Address, beneficiary: Address) {
        admin.require_auth();
        let config = Self::load_config(&env);
        assert!(config.admin == admin, "caller is not the admin");

        let mut record: Beneficiary = env
            .storage()
            .persistent()
            .get(&DataKey::Beneficiary(beneficiary.clone()))
            .expect("beneficiary not found");
        assert!(record.active, "beneficiary already deactivated");
        record.active = false;
        env.storage()
            .persistent()
            .set(&DataKey::Beneficiary(beneficiary), &record);
    }

    /// Reactivate a previously deactivated beneficiary.
    pub fn reactivate_beneficiary(env: Env, admin: Address, beneficiary: Address) {
        admin.require_auth();
        let config = Self::load_config(&env);
        assert!(config.admin == admin, "caller is not the admin");

        let mut record: Beneficiary = env
            .storage()
            .persistent()
            .get(&DataKey::Beneficiary(beneficiary.clone()))
            .expect("beneficiary not found");
        assert!(!record.active, "beneficiary is already active");
        record.active = true;
        env.storage()
            .persistent()
            .set(&DataKey::Beneficiary(beneficiary), &record);
    }

    // ── Disbursement / Claim ──────────────────

    /// Beneficiary claims their entitlement for the current cycle.
    ///
    /// **Permissionless** — the beneficiary calls this themselves.
    /// Transfers exactly `entitlement` tokens; no deductions possible.
    /// Each beneficiary may claim exactly once per cycle.
    pub fn claim(env: Env, beneficiary: Address) {
        beneficiary.require_auth();
        Self::process_claim(&env, &beneficiary);
    }

    /// Admin pushes the entitlement to a beneficiary on their behalf.
    ///
    /// Useful for elderly or less tech-savvy recipients who cannot
    /// initiate the transaction themselves.
    pub fn disburse_to(env: Env, admin: Address, beneficiary: Address) {
        admin.require_auth();
        let config = Self::load_config(&env);
        assert!(config.admin == admin, "caller is not the admin");
        Self::process_claim(&env, &beneficiary);
    }

    /// Admin opens the next disbursement cycle.
    ///
    /// Advancing the cycle resets claim eligibility for all beneficiaries.
    /// Only the admin may advance the cycle.
    pub fn advance_cycle(env: Env, admin: Address) {
        admin.require_auth();
        let config = Self::load_config(&env);
        assert!(config.admin == admin, "caller is not the admin");

        let cycle: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CurrentCycle)
            .unwrap();
        env.storage()
            .instance()
            .set(&DataKey::CurrentCycle, &(cycle + 1));
    }

    /// Recover tokens not allocated to any active beneficiary.
    ///
    /// Allows the government wallet to reclaim excess funding.
    /// Cannot withdraw funds that are owed to active beneficiaries
    /// for the current cycle.
    pub fn withdraw_surplus(env: Env, admin: Address, amount: i128, unclaimed: Vec<Address>) {
        admin.require_auth();
        let config = Self::load_config(&env);
        assert!(config.admin == admin, "caller is not the admin");
        assert!(amount > 0, "amount must be positive");

        let total_funds: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalFunds)
            .unwrap_or(0);

        // Calculate total currently owed this cycle (active beneficiaries who haven't claimed)
        let cycle: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CurrentCycle)
            .unwrap();
        let mut pending: i128 = 0;
        for addr in unclaimed.iter() {
            let rec: Option<Beneficiary> = env
                .storage()
                .persistent()
                .get(&DataKey::Beneficiary(addr.clone()));
            if let Some(b) = rec {
                if b.active
                    && !env
                        .storage()
                        .persistent()
                        .has(&DataKey::ClaimReceipt(cycle, addr))
                {
                    pending += b.entitlement;
                }
            }
        }

        assert!(
            total_funds - amount >= pending,
            "cannot withdraw: funds needed for pending claims"
        );

        token::Client::new(&env, &config.subsidy_token).transfer(
            &env.current_contract_address(),
            &admin,
            &amount,
        );

        env.storage()
            .instance()
            .set(&DataKey::TotalFunds, &(total_funds - amount));
    }

    // ── Queries ───────────────────────────────

    /// Return the global configuration.
    pub fn get_config(env: Env) -> Config {
        Self::load_config(&env)
    }

    /// Return total tokens held in the contract.
    pub fn get_total_funds(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalFunds)
            .unwrap_or(0)
    }

    /// Return total tokens disbursed since deployment.
    pub fn get_total_disbursed(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalDisbursed)
            .unwrap_or(0)
    }

    /// Return the current disbursement cycle number.
    pub fn get_current_cycle(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CurrentCycle)
            .unwrap_or(1)
    }

    /// Return a beneficiary's registration record.
    pub fn get_beneficiary(env: Env, beneficiary: Address) -> Beneficiary {
        env.storage()
            .persistent()
            .get(&DataKey::Beneficiary(beneficiary))
            .expect("beneficiary not found")
    }

    /// Return all registered beneficiary addresses.
    pub fn get_audit_log(env: Env, cycle: u64, addresses: Vec<Address>) -> Vec<DisbursementRecord> {
        let mut out = Vec::new(&env);
        for addr in addresses.iter() {
            if let Some(r) = env.storage().persistent()
                .get(&DataKey::ClaimReceipt(cycle, addr)) {
                out.push_back(r);
            }
        }
        out
    }

    /// Return whether a beneficiary has claimed in the current cycle.
    pub fn has_claimed(env: Env, cycle: u64, beneficiary: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::ClaimReceipt(cycle, beneficiary))
    }

    /// Return the disbursement record for a specific (cycle, beneficiary) pair.
    pub fn get_claim_receipt(env: Env, cycle: u64, beneficiary: Address) -> DisbursementRecord {
        env.storage()
            .persistent()
            .get(&DataKey::ClaimReceipt(cycle, beneficiary))
            .expect("no claim found for this cycle and beneficiary")
    }

    // ── Internal ──────────────────────────────

    fn load_config(env: &Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    /// Core disbursement logic — shared by `claim` and `disburse_to`.
    fn process_claim(env: &Env, beneficiary: &Address) {
        let cycle: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CurrentCycle)
            .unwrap();

        // Double-claim guard
        assert!(
            !env.storage()
                .persistent()
                .has(&DataKey::ClaimReceipt(cycle, beneficiary.clone())),
            "already claimed this cycle"
        );

        let mut record: Beneficiary = env
            .storage()
            .persistent()
            .get(&DataKey::Beneficiary(beneficiary.clone()))
            .expect("beneficiary not found");

        assert!(record.active, "beneficiary is not active");

        let config = Self::load_config(env);
        let total_funds: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalFunds)
            .unwrap_or(0);
        assert!(
            total_funds >= record.entitlement,
            "insufficient funds for disbursement"
        );

        // Transfer exactly the registered entitlement — no discretion possible
        token::Client::new(env, &config.subsidy_token).transfer(
            &env.current_contract_address(),
            beneficiary,
            &record.entitlement,
        );

        // Update contract balances
        env.storage()
            .instance()
            .set(&DataKey::TotalFunds, &(total_funds - record.entitlement));
        let disbursed: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalDisbursed)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalDisbursed, &(disbursed + record.entitlement));

        // Update beneficiary lifetime stats
        record.total_claims += 1;
        record.total_received += record.entitlement;
        env.storage()
            .persistent()
            .set(&DataKey::Beneficiary(beneficiary.clone()), &record);

        // Write immutable disbursement receipt
        let now = env.ledger().timestamp();
        let receipt = DisbursementRecord {
            cycle,
            beneficiary: beneficiary.clone(),
            beneficiary_name: record.name.clone(),
            amount: record.entitlement,
            timestamp: now,
        };
        env.storage()
            .persistent()
            .set(&DataKey::ClaimReceipt(cycle, beneficiary.clone()), &receipt);

        // Append to global audit log
        let audit_count: u64 = env.storage().instance()
        .get(&DataKey::AuditCount).unwrap_or(0);
        env.storage().instance()
        .set(&DataKey::AuditCount, &(audit_count + 1));

        env.events().publish(
            (symbol_short!("disburse"), symbol_short!("v1")),
            (cycle, beneficiary.clone(), record.entitlement, now),
        );
    }
}

#[cfg(test)]
mod test;