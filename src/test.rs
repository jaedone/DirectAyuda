#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, String,
};

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const T0: u64 = 1_000_000;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

fn set_time(env: &Env, ts: u64) {
    env.ledger().set(LedgerInfo {
        timestamp: ts,
        protocol_version: 22,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1000,
        min_persistent_entry_ttl: 1000,
        max_entry_ttl: 6_312_000,
    });
}

struct Ctx {
    env: Env,
    admin: Address,
    subsidy_token: Address,
    client: DirectAyudaContractClient<'static>,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    set_time(&env, T0);

    let token_admin = Address::generate(&env);
    let subsidy_token = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();

    let admin = Address::generate(&env);
    let contract_id = env.register(DirectAyudaContract, ());
    let client = DirectAyudaContractClient::new(&env, &contract_id);
    client.initialize(
        &admin,
        &subsidy_token,
        &mk(&env, "AICS Senior Citizen Subsidy"),
    );

    Ctx { env, admin, subsidy_token, client }
}

fn mk(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

fn mint(ctx: &Ctx, to: &Address, amount: i128) {
    StellarAssetClient::new(&ctx.env, &ctx.subsidy_token).mint(to, &amount);
}

fn bal(ctx: &Ctx, addr: &Address) -> i128 {
    TokenClient::new(&ctx.env, &ctx.subsidy_token).balance(addr)
}

/// Fund the contract with `amount` tokens from the admin wallet.
fn fund(ctx: &Ctx, amount: i128) {
    mint(ctx, &ctx.admin, amount);
    ctx.client.fund(&ctx.admin, &amount);
}

/// Register a fresh beneficiary with the given entitlement.
/// Returns the beneficiary's address.
fn register(ctx: &Ctx, entitlement: i128) -> Address {
    let addr = Address::generate(&ctx.env);
    ctx.client.register_beneficiary(
        &ctx.admin,
        &addr,
        &mk(&ctx.env, "Juan dela Cruz"),
        &entitlement,
    );
    addr
}

// ─────────────────────────────────────────────
// Initialization Tests
// ─────────────────────────────────────────────

#[test]
fn test_initialize_stores_config() {
    let ctx = setup();
    let cfg = ctx.client.get_config();
    assert_eq!(cfg.admin, ctx.admin);
    assert_eq!(cfg.subsidy_token, ctx.subsidy_token);
}

#[test]
fn test_initialize_balances_start_at_zero() {
    let ctx = setup();
    assert_eq!(ctx.client.get_total_funds(), 0);
    assert_eq!(ctx.client.get_total_disbursed(), 0);
}

#[test]
fn test_initialize_cycle_starts_at_one() {
    let ctx = setup();
    assert_eq!(ctx.client.get_current_cycle(), 1);
}

#[test]
fn test_initialize_beneficiary_list_empty() {
    let ctx = setup();
    assert_eq!(ctx.client.get_all_beneficiaries().len(), 0);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialize_panics() {
    let ctx = setup();
    ctx.client.initialize(
        &ctx.admin,
        &ctx.subsidy_token,
        &mk(&ctx.env, "Duplicate"),
    );
}

#[test]
#[should_panic(expected = "program name cannot be empty")]
fn test_initialize_empty_program_name_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let token_admin = Address::generate(&env);
    let subsidy_token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    let admin = Address::generate(&env);
    let contract_id = env.register(DirectAyudaContract, ());
    let client = DirectAyudaContractClient::new(&env, &contract_id);
    client.initialize(&admin, &subsidy_token, &mk(&env, ""));
}

// ─────────────────────────────────────────────
// Admin Tests
// ─────────────────────────────────────────────

#[test]
fn test_transfer_admin_updates_config() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);
    ctx.client.transfer_admin(&ctx.admin, &new_admin);
    assert_eq!(ctx.client.get_config().admin, new_admin);
}

#[test]
#[should_panic(expected = "caller is not the admin")]
fn test_non_admin_transfer_admin_panics() {
    let ctx = setup();
    let impostor = Address::generate(&ctx.env);
    let new_admin = Address::generate(&ctx.env);
    ctx.client.transfer_admin(&impostor, &new_admin);
}

// ─────────────────────────────────────────────
// Funding Tests
// ─────────────────────────────────────────────

#[test]
fn test_fund_increases_total_funds() {
    let ctx = setup();
    fund(&ctx, 50_000);
    assert_eq!(ctx.client.get_total_funds(), 50_000);
}

#[test]
fn test_multiple_funds_accumulate() {
    let ctx = setup();
    fund(&ctx, 30_000);
    fund(&ctx, 20_000);
    assert_eq!(ctx.client.get_total_funds(), 50_000);
}

#[test]
fn test_fund_transfers_tokens_from_admin() {
    let ctx = setup();
    mint(&ctx, &ctx.admin, 10_000);
    let before = bal(&ctx, &ctx.admin);
    ctx.client.fund(&ctx.admin, &10_000);
    assert_eq!(bal(&ctx, &ctx.admin), before - 10_000);
}

#[test]
#[should_panic(expected = "fund amount must be positive")]
fn test_fund_zero_panics() {
    let ctx = setup();
    ctx.client.fund(&ctx.admin, &0);
}

#[test]
#[should_panic(expected = "caller is not the admin")]
fn test_non_admin_cannot_fund() {
    let ctx = setup();
    let impostor = Address::generate(&ctx.env);
    mint(&ctx, &impostor, 10_000);
    ctx.client.fund(&impostor, &10_000);
}

// ─────────────────────────────────────────────
// Beneficiary Registration Tests
// ─────────────────────────────────────────────

#[test]
fn test_register_beneficiary_stores_record() {
    let ctx = setup();
    let addr = register(&ctx, 500);
    let b = ctx.client.get_beneficiary(&addr);
    assert_eq!(b.address, addr);
    assert_eq!(b.entitlement, 500);
    assert!(b.active);
    assert_eq!(b.total_claims, 0);
    assert_eq!(b.total_received, 0);
    assert_eq!(b.registered_at, T0);
}

#[test]
fn test_register_adds_to_index() {
    let ctx = setup();
    let addr = register(&ctx, 500);
    let list = ctx.client.get_all_beneficiaries();
    assert_eq!(list.len(), 1);
    assert_eq!(list.get(0).unwrap(), addr);
}

#[test]
fn test_register_multiple_beneficiaries() {
    let ctx = setup();
    register(&ctx, 500);
    register(&ctx, 750);
    register(&ctx, 1_000);
    assert_eq!(ctx.client.get_all_beneficiaries().len(), 3);
}

#[test]
#[should_panic(expected = "beneficiary already registered")]
fn test_double_register_panics() {
    let ctx = setup();
    let addr = Address::generate(&ctx.env);
    ctx.client.register_beneficiary(
        &ctx.admin, &addr, &mk(&ctx.env, "Maria"), &500,
    );
    ctx.client.register_beneficiary(
        &ctx.admin, &addr, &mk(&ctx.env, "Maria"), &500,
    );
}

#[test]
#[should_panic(expected = "entitlement must be positive")]
fn test_register_zero_entitlement_panics() {
    let ctx = setup();
    let addr = Address::generate(&ctx.env);
    ctx.client.register_beneficiary(
        &ctx.admin, &addr, &mk(&ctx.env, "Maria"), &0,
    );
}

#[test]
#[should_panic(expected = "beneficiary name cannot be empty")]
fn test_register_empty_name_panics() {
    let ctx = setup();
    let addr = Address::generate(&ctx.env);
    ctx.client.register_beneficiary(
        &ctx.admin, &addr, &mk(&ctx.env, ""), &500,
    );
}

#[test]
#[should_panic(expected = "caller is not the admin")]
fn test_non_admin_cannot_register() {
    let ctx = setup();
    let impostor = Address::generate(&ctx.env);
    let addr = Address::generate(&ctx.env);
    ctx.client.register_beneficiary(
        &impostor, &addr, &mk(&ctx.env, "Maria"), &500,
    );
}

// ─────────────────────────────────────────────
// Deactivation / Reactivation Tests
// ─────────────────────────────────────────────

#[test]
fn test_deactivate_beneficiary() {
    let ctx = setup();
    let addr = register(&ctx, 500);
    ctx.client.deactivate_beneficiary(&ctx.admin, &addr);
    assert!(!ctx.client.get_beneficiary(&addr).active);
}

#[test]
fn test_reactivate_beneficiary() {
    let ctx = setup();
    let addr = register(&ctx, 500);
    ctx.client.deactivate_beneficiary(&ctx.admin, &addr);
    ctx.client.reactivate_beneficiary(&ctx.admin, &addr);
    assert!(ctx.client.get_beneficiary(&addr).active);
}

#[test]
#[should_panic(expected = "beneficiary already deactivated")]
fn test_double_deactivate_panics() {
    let ctx = setup();
    let addr = register(&ctx, 500);
    ctx.client.deactivate_beneficiary(&ctx.admin, &addr);
    ctx.client.deactivate_beneficiary(&ctx.admin, &addr);
}

#[test]
#[should_panic(expected = "beneficiary is already active")]
fn test_reactivate_active_beneficiary_panics() {
    let ctx = setup();
    let addr = register(&ctx, 500);
    ctx.client.reactivate_beneficiary(&ctx.admin, &addr);
}

// ─────────────────────────────────────────────
// Claim Tests
// ─────────────────────────────────────────────

#[test]
fn test_claim_transfers_exact_entitlement() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.claim(&addr);
    assert_eq!(bal(&ctx, &addr), 500);
}

#[test]
fn test_claim_deducts_total_funds() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.claim(&addr);
    assert_eq!(ctx.client.get_total_funds(), 9_500);
}

#[test]
fn test_claim_increases_total_disbursed() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.claim(&addr);
    assert_eq!(ctx.client.get_total_disbursed(), 500);
}

#[test]
fn test_claim_marks_has_claimed() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    assert!(!ctx.client.has_claimed(&1, &addr));
    ctx.client.claim(&addr);
    assert!(ctx.client.has_claimed(&1, &addr));
}

#[test]
fn test_claim_updates_beneficiary_stats() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.claim(&addr);
    let b = ctx.client.get_beneficiary(&addr);
    assert_eq!(b.total_claims, 1);
    assert_eq!(b.total_received, 500);
}

#[test]
fn test_claim_writes_audit_receipt() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.claim(&addr);
    let receipt = ctx.client.get_claim_receipt(&1, &addr);
    assert_eq!(receipt.cycle, 1);
    assert_eq!(receipt.beneficiary, addr);
    assert_eq!(receipt.amount, 500);
    assert_eq!(receipt.timestamp, T0);
}

#[test]
fn test_claim_appends_to_audit_log() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let a1 = register(&ctx, 500);
    let a2 = register(&ctx, 750);
    ctx.client.claim(&a1);
    ctx.client.claim(&a2);
    assert_eq!(ctx.client.get_audit_log().len(), 2);
}

#[test]
#[should_panic(expected = "already claimed this cycle")]
fn test_double_claim_same_cycle_panics() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.claim(&addr);
    ctx.client.claim(&addr);
}

#[test]
#[should_panic(expected = "beneficiary is not active")]
fn test_inactive_beneficiary_cannot_claim() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.deactivate_beneficiary(&ctx.admin, &addr);
    ctx.client.claim(&addr);
}

#[test]
#[should_panic(expected = "insufficient funds for disbursement")]
fn test_claim_with_insufficient_funds_panics() {
    let ctx = setup();
    fund(&ctx, 100);
    let addr = register(&ctx, 500); // entitlement > funds
    ctx.client.claim(&addr);
}

#[test]
#[should_panic(expected = "beneficiary not found")]
fn test_unregistered_beneficiary_cannot_claim() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let stranger = Address::generate(&ctx.env);
    ctx.client.claim(&stranger);
}

// ─────────────────────────────────────────────
// Disburse-To (Admin Push) Tests
// ─────────────────────────────────────────────

#[test]
fn test_disburse_to_transfers_exact_entitlement() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 750);
    ctx.client.disburse_to(&ctx.admin, &addr);
    assert_eq!(bal(&ctx, &addr), 750);
}

#[test]
fn test_disburse_to_marks_has_claimed() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 750);
    ctx.client.disburse_to(&ctx.admin, &addr);
    assert!(ctx.client.has_claimed(&1, &addr));
}

#[test]
#[should_panic(expected = "already claimed this cycle")]
fn test_disburse_to_after_self_claim_panics() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 750);
    ctx.client.claim(&addr);
    ctx.client.disburse_to(&ctx.admin, &addr);
}

#[test]
#[should_panic(expected = "caller is not the admin")]
fn test_non_admin_cannot_disburse_to() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 750);
    let impostor = Address::generate(&ctx.env);
    ctx.client.disburse_to(&impostor, &addr);
}

// ─────────────────────────────────────────────
// Cycle Advancement Tests
// ─────────────────────────────────────────────

#[test]
fn test_advance_cycle_increments_counter() {
    let ctx = setup();
    ctx.client.advance_cycle(&ctx.admin);
    assert_eq!(ctx.client.get_current_cycle(), 2);
}

#[test]
fn test_beneficiary_can_claim_again_after_advance() {
    let ctx = setup();
    fund(&ctx, 20_000);
    let addr = register(&ctx, 500);

    // Cycle 1
    ctx.client.claim(&addr);
    assert!(ctx.client.has_claimed(&1, &addr));

    // Advance to cycle 2
    ctx.client.advance_cycle(&ctx.admin);
    assert_eq!(ctx.client.get_current_cycle(), 2);

    // Claim again in cycle 2
    ctx.client.claim(&addr);
    assert!(ctx.client.has_claimed(&2, &addr));
    assert_eq!(bal(&ctx, &addr), 1_000); // 500 × 2
    assert_eq!(ctx.client.get_beneficiary(&addr).total_claims, 2);
    assert_eq!(ctx.client.get_beneficiary(&addr).total_received, 1_000);
}

#[test]
fn test_cycle_1_claim_does_not_block_cycle_2() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.claim(&addr);

    ctx.client.advance_cycle(&ctx.admin);
    assert!(!ctx.client.has_claimed(&2, &addr));
}

#[test]
#[should_panic(expected = "already claimed this cycle")]
fn test_cannot_claim_twice_even_after_unrelated_advance() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.claim(&addr); // cycle 1
    ctx.client.claim(&addr); // still cycle 1 → panic
}

#[test]
#[should_panic(expected = "caller is not the admin")]
fn test_non_admin_cannot_advance_cycle() {
    let ctx = setup();
    let impostor = Address::generate(&ctx.env);
    ctx.client.advance_cycle(&impostor);
}

// ─────────────────────────────────────────────
// Withdraw Surplus Tests
// ─────────────────────────────────────────────

#[test]
fn test_withdraw_surplus_returns_tokens_to_admin() {
    let ctx = setup();
    fund(&ctx, 10_000);
    // No beneficiaries registered — all funds are surplus
    ctx.client.withdraw_surplus(&ctx.admin, &10_000);
    assert_eq!(ctx.client.get_total_funds(), 0);
    assert_eq!(bal(&ctx, &ctx.admin), 10_000);
}

#[test]
fn test_withdraw_surplus_respects_pending_entitlements() {
    let ctx = setup();
    fund(&ctx, 10_000);
    register(&ctx, 500); // 500 pending

    // Can withdraw everything except the 500 owed
    ctx.client.withdraw_surplus(&ctx.admin, &9_500);
    assert_eq!(ctx.client.get_total_funds(), 500);
}

#[test]
#[should_panic(expected = "cannot withdraw: funds needed for pending claims")]
fn test_withdraw_more_than_surplus_panics() {
    let ctx = setup();
    fund(&ctx, 10_000);
    register(&ctx, 500); // 500 pending

    // Trying to withdraw 10_000 leaves 0, but 500 is still owed
    ctx.client.withdraw_surplus(&ctx.admin, &10_000);
}

#[test]
fn test_withdraw_allowed_after_beneficiary_claims() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 500);
    ctx.client.claim(&addr); // now 0 pending this cycle

    // All remaining funds (9_500) are surplus
    ctx.client.withdraw_surplus(&ctx.admin, &9_500);
    assert_eq!(ctx.client.get_total_funds(), 0);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_withdraw_zero_panics() {
    let ctx = setup();
    fund(&ctx, 10_000);
    ctx.client.withdraw_surplus(&ctx.admin, &0);
}

#[test]
#[should_panic(expected = "caller is not the admin")]
fn test_non_admin_cannot_withdraw_surplus() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let impostor = Address::generate(&ctx.env);
    ctx.client.withdraw_surplus(&impostor, &1_000);
}

// ─────────────────────────────────────────────
// End-to-End Flow Tests
// ─────────────────────────────────────────────

#[test]
fn test_full_disbursement_cycle_three_recipients() {
    let ctx = setup();

    // Government funds the contract
    fund(&ctx, 30_000);
    assert_eq!(ctx.client.get_total_funds(), 30_000);

    // Three senior citizens registered
    let lola_nena = register(&ctx, 1_000);
    let lolo_pedro = register(&ctx, 1_000);
    let lola_caring = register(&ctx, 1_000);

    // All three claim their cycle-1 subsidy
    ctx.client.claim(&lola_nena);
    ctx.client.claim(&lolo_pedro);
    ctx.client.claim(&lola_caring);

    // Each received exactly their entitlement — no deductions
    assert_eq!(bal(&ctx, &lola_nena), 1_000);
    assert_eq!(bal(&ctx, &lolo_pedro), 1_000);
    assert_eq!(bal(&ctx, &lola_caring), 1_000);

    // Contract balances are correct
    assert_eq!(ctx.client.get_total_funds(), 27_000);
    assert_eq!(ctx.client.get_total_disbursed(), 3_000);

    // Audit log has 3 entries
    assert_eq!(ctx.client.get_audit_log().len(), 3);

    // All three are marked as claimed this cycle
    assert!(ctx.client.has_claimed(&1, &lola_nena));
    assert!(ctx.client.has_claimed(&1, &lolo_pedro));
    assert!(ctx.client.has_claimed(&1, &lola_caring));

    // Admin advances to cycle 2
    ctx.client.advance_cycle(&ctx.admin);

    // All three can claim again
    ctx.client.claim(&lola_nena);
    ctx.client.claim(&lolo_pedro);
    ctx.client.claim(&lola_caring);

    assert_eq!(ctx.client.get_total_disbursed(), 6_000);
    assert_eq!(ctx.client.get_audit_log().len(), 6);

    // Lifetime stats updated
    let b = ctx.client.get_beneficiary(&lola_nena);
    assert_eq!(b.total_claims, 2);
    assert_eq!(b.total_received, 2_000);
}

#[test]
fn test_mix_of_claim_and_disburse_to() {
    let ctx = setup();
    fund(&ctx, 10_000);

    let tech_savvy = register(&ctx, 500);   // will self-claim
    let lola_nena = register(&ctx, 500);    // admin pushes on their behalf

    ctx.client.claim(&tech_savvy);                  // self-claim
    ctx.client.disburse_to(&ctx.admin, &lola_nena); // admin push

    assert_eq!(bal(&ctx, &tech_savvy), 500);
    assert_eq!(bal(&ctx, &lola_nena), 500);
    assert_eq!(ctx.client.get_total_disbursed(), 1_000);
    assert_eq!(ctx.client.get_audit_log().len(), 2);
}

#[test]
fn test_inactive_beneficiary_skipped_surplus_still_withdrawable() {
    let ctx = setup();
    fund(&ctx, 10_000);

    let active = register(&ctx, 500);
    let inactive = register(&ctx, 500);
    ctx.client.deactivate_beneficiary(&ctx.admin, &inactive);

    // Only active beneficiary's 500 is "pending"
    // So 9_500 is withdrawable
    ctx.client.withdraw_surplus(&ctx.admin, &9_500);
    assert_eq!(ctx.client.get_total_funds(), 500);

    ctx.client.claim(&active);
    assert_eq!(bal(&ctx, &active), 500);
}

#[test]
fn test_audit_log_immutable_fixed_amounts() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let addr = register(&ctx, 750);

    ctx.client.claim(&addr);
    ctx.client.advance_cycle(&ctx.admin);
    ctx.client.claim(&addr);

    let log = ctx.client.get_audit_log();
    assert_eq!(log.len(), 2);

    // Both entries show exact fixed entitlement — no variation
    let r0 = log.get(0).unwrap();
    let r1 = log.get(1).unwrap();
    assert_eq!(r0.amount, 750);
    assert_eq!(r1.amount, 750);
    assert_eq!(r0.cycle, 1);
    assert_eq!(r1.cycle, 2);
}

#[test]
fn test_multiple_cycles_multi_beneficiary_audit() {
    let ctx = setup();
    fund(&ctx, 100_000);

    let a = register(&ctx, 1_000);
    let b_addr = register(&ctx, 2_000);

    // Cycle 1
    ctx.client.claim(&a);
    ctx.client.claim(&b_addr);

    // Cycle 2
    ctx.client.advance_cycle(&ctx.admin);
    ctx.client.claim(&a);
    // b_addr does not claim in cycle 2

    // Cycle 3
    ctx.client.advance_cycle(&ctx.admin);
    ctx.client.claim(&a);
    ctx.client.claim(&b_addr);

    // a: 3 claims × 1_000 = 3_000
    // b: 2 claims × 2_000 = 4_000
    assert_eq!(ctx.client.get_beneficiary(&a).total_received, 3_000);
    assert_eq!(ctx.client.get_beneficiary(&b_addr).total_received, 4_000);
    assert_eq!(ctx.client.get_total_disbursed(), 7_000);
    assert_eq!(ctx.client.get_audit_log().len(), 5);
}