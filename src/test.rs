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
const VOTE_WINDOW: u64 = 86_400;       // 1 day
const VETO_PERIOD: u64 = 43_200;       // 12 hours
const QUORUM_BPS: u32 = 5_100;         // 51%

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
    treasury_token: Address,
    gov_token: Address,
    client: CommunityTreasuryContractClient<'static>,
}

fn setup() -> Ctx {
    setup_params(QUORUM_BPS, VOTE_WINDOW, VETO_PERIOD, 0)
}

fn setup_params(quorum_bps: u32, vote_window: u64, veto_period: u64, cap: i128) -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    set_time(&env, T0);

    let token_admin = Address::generate(&env);
    let treasury_token = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let gov_token = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();

    let admin = Address::generate(&env);
    let contract_id = env.register(CommunityTreasuryContract, ());
    let client = CommunityTreasuryContractClient::new(&env, &contract_id);
    client.initialize(
        &admin, &treasury_token, &gov_token,
        &quorum_bps, &vote_window, &veto_period, &cap,
    );

    Ctx { env, admin, treasury_token, gov_token, client }
}

fn mk(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

fn mint_treasury(ctx: &Ctx, to: &Address, amount: i128) {
    StellarAssetClient::new(&ctx.env, &ctx.treasury_token).mint(to, &amount);
}

fn mint_gov(ctx: &Ctx, to: &Address, amount: i128) {
    StellarAssetClient::new(&ctx.env, &ctx.gov_token).mint(to, &amount);
}

fn bal_treasury(ctx: &Ctx, addr: &Address) -> i128 {
    TokenClient::new(&ctx.env, &ctx.treasury_token).balance(addr)
}

/// Fund the treasury with `amount` tokens from a fresh depositor.
fn fund(ctx: &Ctx, amount: i128) -> Address {
    let depositor = Address::generate(&ctx.env);
    mint_treasury(ctx, &depositor, amount);
    ctx.client.deposit(&depositor, &amount);
    depositor
}

/// Create a governance token holder with `weight` tokens and submit
/// a proposal for `amount` treasury tokens.  Returns (proposer, proposal_id).
fn propose(ctx: &Ctx, amount: i128) -> (Address, u64) {
    let proposer = Address::generate(&ctx.env);
    mint_gov(ctx, &proposer, 100); // enough to propose
    let id = ctx.client.submit_proposal(
        &proposer,
        &mk(&ctx.env, "Community Grant"),
        &mk(&ctx.env, "Fund community development"),
        &proposer,
        &amount,
    );
    (proposer, id)
}

/// Full path: fund → propose → vote For → queue → wait veto → execute.
/// Returns (proposal_id, proposer).
fn full_pass(ctx: &Ctx, amount: i128, voters: &[(Address, i128)]) -> (u64, Address) {
    fund(ctx, amount * 2);

    let proposer = Address::generate(&ctx.env);
    mint_gov(ctx, &proposer, 1);
    let id = ctx.client.submit_proposal(
        &proposer,
        &mk(&ctx.env, "Grant"),
        &mk(&ctx.env, "Description"),
        &proposer,
        &amount,
    );

    // Advance 1 second so voters who join now are "after" proposal submit
    // (no such restriction here — that's study-stake logic; just vote)
    for (voter, weight) in voters {
        mint_gov(ctx, voter, *weight);
        ctx.client.vote(voter, &id, &VoteDirection::For);
    }

    // Close voting window
    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);

    // Wait veto period
    set_time(&ctx.env, T0 + VOTE_WINDOW + VETO_PERIOD + 2);
    ctx.client.execute_proposal(&id);

    (id, proposer)
}

// ─────────────────────────────────────────────
// Initialization Tests
// ─────────────────────────────────────────────

#[test]
fn test_initialize_stores_config() {
    let ctx = setup();
    let cfg = ctx.client.get_config();
    assert_eq!(cfg.admin, ctx.admin);
    assert_eq!(cfg.treasury_token, ctx.treasury_token);
    assert_eq!(cfg.governance_token, ctx.gov_token);
    assert_eq!(cfg.quorum_bps, QUORUM_BPS);
    assert_eq!(cfg.voting_window, VOTE_WINDOW);
    assert_eq!(cfg.veto_period, VETO_PERIOD);
    assert_eq!(cfg.spending_cap, 0);
}

#[test]
fn test_initialize_balances_start_at_zero() {
    let ctx = setup();
    assert_eq!(ctx.client.get_treasury_balance(), 0);
    assert_eq!(ctx.client.get_reserved_balance(), 0);
    assert_eq!(ctx.client.get_available_balance(), 0);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialize_panics() {
    let ctx = setup();
    let other = Address::generate(&ctx.env);
    ctx.client.initialize(
        &other, &ctx.treasury_token, &ctx.gov_token,
        &QUORUM_BPS, &VOTE_WINDOW, &VETO_PERIOD, &0,
    );
}

#[test]
#[should_panic(expected = "quorum_bps must be 1-10000")]
fn test_initialize_zero_quorum_panics() {
    setup_params(0, VOTE_WINDOW, VETO_PERIOD, 0);
}

#[test]
#[should_panic(expected = "quorum_bps must be 1-10000")]
fn test_initialize_quorum_above_10000_panics() {
    setup_params(10_001, VOTE_WINDOW, VETO_PERIOD, 0);
}

#[test]
#[should_panic(expected = "voting window must be positive")]
fn test_initialize_zero_voting_window_panics() {
    setup_params(QUORUM_BPS, 0, VETO_PERIOD, 0);
}

#[test]
#[should_panic(expected = "veto period must be positive")]
fn test_initialize_zero_veto_period_panics() {
    setup_params(QUORUM_BPS, VOTE_WINDOW, 0, 0);
}

// ─────────────────────────────────────────────
// Admin Config Tests
// ─────────────────────────────────────────────

#[test]
fn test_update_config_changes_params() {
    let ctx = setup();
    ctx.client.update_config(&ctx.admin, &6_000, &3600, &7200, &5_000);
    let cfg = ctx.client.get_config();
    assert_eq!(cfg.quorum_bps, 6_000);
    assert_eq!(cfg.voting_window, 3600);
    assert_eq!(cfg.veto_period, 7200);
    assert_eq!(cfg.spending_cap, 5_000);
}

#[test]
fn test_transfer_admin_updates_config() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);
    ctx.client.transfer_admin(&ctx.admin, &new_admin);
    assert_eq!(ctx.client.get_config().admin, new_admin);
}

#[test]
#[should_panic(expected = "caller is not the admin")]
fn test_non_admin_cannot_update_config() {
    let ctx = setup();
    let impostor = Address::generate(&ctx.env);
    ctx.client.update_config(&impostor, &5_100, &VOTE_WINDOW, &VETO_PERIOD, &0);
}

// ─────────────────────────────────────────────
// Deposit Tests
// ─────────────────────────────────────────────

#[test]
fn test_deposit_increases_treasury_balance() {
    let ctx = setup();
    fund(&ctx, 10_000);
    assert_eq!(ctx.client.get_treasury_balance(), 10_000);
}

#[test]
fn test_multiple_deposits_accumulate() {
    let ctx = setup();
    fund(&ctx, 3_000);
    fund(&ctx, 7_000);
    assert_eq!(ctx.client.get_treasury_balance(), 10_000);
}

#[test]
fn test_deposit_transfers_tokens_to_contract() {
    let ctx = setup();
    let depositor = Address::generate(&ctx.env);
    mint_treasury(&ctx, &depositor, 5_000);
    ctx.client.deposit(&depositor, &5_000);
    assert_eq!(bal_treasury(&ctx, &depositor), 0);
}

#[test]
#[should_panic(expected = "deposit amount must be positive")]
fn test_deposit_zero_panics() {
    let ctx = setup();
    let depositor = Address::generate(&ctx.env);
    ctx.client.deposit(&depositor, &0);
}

// ─────────────────────────────────────────────
// Proposal Submission Tests
// ─────────────────────────────────────────────

#[test]
fn test_submit_proposal_stores_record() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (proposer, id) = propose(&ctx, 1_000);

    let p = ctx.client.get_proposal(&id);
    assert_eq!(p.id, id);
    assert_eq!(p.proposer, proposer);
    assert_eq!(p.amount, 1_000);
    assert_eq!(p.status, ProposalStatus::Active);
    assert_eq!(p.for_votes, 0);
    assert_eq!(p.against_votes, 0);
    assert_eq!(p.voting_deadline, T0 + VOTE_WINDOW);
    assert_eq!(p.executable_at, 0);
}

#[test]
fn test_proposal_ids_increment_sequentially() {
    let ctx = setup();
    fund(&ctx, 10_000);
    let (_, id1) = propose(&ctx, 1_000);
    let (_, id2) = propose(&ctx, 1_000);
    assert_eq!(id2, id1 + 1);
}

#[test]
fn test_proposal_appears_in_global_index() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let index = ctx.client.get_all_proposals();
    assert_eq!(index.len(), 1);
    assert_eq!(index.get(0).unwrap(), id);
}

#[test]
fn test_proposal_appears_in_proposer_index() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (proposer, id) = propose(&ctx, 1_000);
    let list = ctx.client.get_proposer_proposals(&proposer);
    assert_eq!(list.len(), 1);
    assert_eq!(list.get(0).unwrap(), id);
}

#[test]
#[should_panic(expected = "proposer must hold governance tokens")]
fn test_no_gov_tokens_cannot_propose() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let proposer = Address::generate(&ctx.env);
    // No gov tokens minted
    ctx.client.submit_proposal(
        &proposer,
        &mk(&ctx.env, "Proposal"),
        &mk(&ctx.env, "desc"),
        &proposer,
        &1_000,
    );
}

#[test]
#[should_panic(expected = "insufficient available treasury funds")]
fn test_propose_more_than_available_panics() {
    let ctx = setup();
    fund(&ctx, 500);
    propose(&ctx, 501); // more than treasury
}

#[test]
#[should_panic(expected = "amount exceeds spending cap")]
fn test_propose_above_spending_cap_panics() {
    let ctx = setup_params(QUORUM_BPS, VOTE_WINDOW, VETO_PERIOD, 1_000);
    fund(&ctx, 10_000);
    propose(&ctx, 1_001); // cap = 1_000
}

#[test]
#[should_panic(expected = "title cannot be empty")]
fn test_empty_title_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let proposer = Address::generate(&ctx.env);
    mint_gov(&ctx, &proposer, 100);
    ctx.client.submit_proposal(
        &proposer,
        &mk(&ctx.env, ""),
        &mk(&ctx.env, "desc"),
        &proposer,
        &100,
    );
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_zero_amount_proposal_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let proposer = Address::generate(&ctx.env);
    mint_gov(&ctx, &proposer, 100);
    ctx.client.submit_proposal(
        &proposer,
        &mk(&ctx.env, "Title"),
        &mk(&ctx.env, "desc"),
        &proposer,
        &0,
    );
}

// ─────────────────────────────────────────────
// Voting Tests
// ─────────────────────────────────────────────

#[test]
fn test_vote_for_increments_for_votes() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 500);
    ctx.client.vote(&voter, &id, &VoteDirection::For);
    assert_eq!(ctx.client.get_proposal(&id).for_votes, 500);
}

#[test]
fn test_vote_against_increments_against_votes() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 300);
    ctx.client.vote(&voter, &id, &VoteDirection::Against);
    assert_eq!(ctx.client.get_proposal(&id).against_votes, 300);
}

#[test]
fn test_vote_abstain_increments_abstain_votes() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 200);
    ctx.client.vote(&voter, &id, &VoteDirection::Abstain);
    assert_eq!(ctx.client.get_proposal(&id).abstain_votes, 200);
}

#[test]
fn test_vote_weight_proportional_to_token_balance() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);

    let whale = Address::generate(&ctx.env);
    let minnow = Address::generate(&ctx.env);
    mint_gov(&ctx, &whale, 10_000);
    mint_gov(&ctx, &minnow, 1);
    ctx.client.vote(&whale, &id, &VoteDirection::For);
    ctx.client.vote(&minnow, &id, &VoteDirection::Against);

    let p = ctx.client.get_proposal(&id);
    assert_eq!(p.for_votes, 10_000);
    assert_eq!(p.against_votes, 1);
}

#[test]
fn test_has_voted_tracked() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 100);

    assert!(!ctx.client.has_voted(&id, &voter));
    ctx.client.vote(&voter, &id, &VoteDirection::For);
    assert!(ctx.client.has_voted(&id, &voter));
}

#[test]
fn test_get_vote_returns_direction() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 100);
    ctx.client.vote(&voter, &id, &VoteDirection::Against);

    let v = ctx.client.get_vote(&id, &voter);
    assert_eq!(v, Some(VoteDirection::Against));
}

#[test]
#[should_panic(expected = "already voted on this proposal")]
fn test_double_vote_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 100);
    ctx.client.vote(&voter, &id, &VoteDirection::For);
    ctx.client.vote(&voter, &id, &VoteDirection::For);
}

#[test]
#[should_panic(expected = "voter must hold governance tokens")]
fn test_voter_without_gov_tokens_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    // no gov tokens
    ctx.client.vote(&voter, &id, &VoteDirection::For);
}

#[test]
#[should_panic(expected = "voting window has closed")]
fn test_vote_after_window_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 100);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.vote(&voter, &id, &VoteDirection::For);
}

#[test]
#[should_panic(expected = "proposal is not active")]
fn test_vote_on_cancelled_proposal_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (proposer, id) = propose(&ctx, 1_000);
    ctx.client.cancel_proposal(&proposer, &id);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 100);
    ctx.client.vote(&voter, &id, &VoteDirection::For);
}

// ─────────────────────────────────────────────
// Queue / Defeat Tests
// ─────────────────────────────────────────────

#[test]
fn test_queue_proposal_transitions_to_queued() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 1_000);
    ctx.client.vote(&voter, &id, &VoteDirection::For);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);

    let p = ctx.client.get_proposal(&id);
    assert_eq!(p.status, ProposalStatus::Queued);
    assert_eq!(p.executable_at, T0 + VOTE_WINDOW + 1 + VETO_PERIOD);
}

#[test]
fn test_queue_proposal_reserves_amount() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 1_000);
    ctx.client.vote(&voter, &id, &VoteDirection::For);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);

    assert_eq!(ctx.client.get_reserved_balance(), 1_000);
    assert_eq!(ctx.client.get_available_balance(), 4_000);
}

#[test]
fn test_defeated_proposal_when_quorum_not_met() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    // 1 for, 1 against = 50% < 51%
    let v1 = Address::generate(&ctx.env);
    let v2 = Address::generate(&ctx.env);
    mint_gov(&ctx, &v1, 1);
    mint_gov(&ctx, &v2, 1);
    ctx.client.vote(&v1, &id, &VoteDirection::For);
    ctx.client.vote(&v2, &id, &VoteDirection::Against);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);

    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Defeated);
}

#[test]
fn test_defeated_when_against_wins() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let v1 = Address::generate(&ctx.env);
    let v2 = Address::generate(&ctx.env);
    mint_gov(&ctx, &v1, 400);
    mint_gov(&ctx, &v2, 600);
    ctx.client.vote(&v1, &id, &VoteDirection::For);
    ctx.client.vote(&v2, &id, &VoteDirection::Against);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);

    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Defeated);
    assert_eq!(ctx.client.get_reserved_balance(), 0); // nothing reserved
}

#[test]
fn test_defeated_proposal_no_reserve() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);

    // No votes cast
    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);

    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Defeated);
    assert_eq!(ctx.client.get_reserved_balance(), 0);
    assert_eq!(ctx.client.get_available_balance(), 5_000);
}

#[test]
fn test_queue_is_permissionless() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 1_000);
    ctx.client.vote(&voter, &id, &VoteDirection::For);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    // anyone can queue
    ctx.client.queue_proposal(&id);
    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Queued);
}

#[test]
#[should_panic(expected = "voting window has not closed")]
fn test_queue_before_window_closes_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    ctx.client.queue_proposal(&id); // still active
}

// ─────────────────────────────────────────────
// Execute Tests
// ─────────────────────────────────────────────

#[test]
fn test_execute_transfers_funds_to_recipient() {
    let ctx = setup();
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 10_000);
    let (_, proposer) = full_pass(&ctx, 500, &[(voter, 10_000_i128)]);

    assert_eq!(bal_treasury(&ctx, &proposer), 500);
}

#[test]
fn test_execute_deducts_treasury_balance() {
    let ctx = setup();
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 10_000);
    full_pass(&ctx, 500, &[(voter, 10_000)]);

    // Treasury had 1_000 deposited; 500 executed
    assert_eq!(ctx.client.get_treasury_balance(), 500);
}

#[test]
fn test_execute_clears_reserved_balance() {
    let ctx = setup();
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 10_000);
    full_pass(&ctx, 500, &[(voter, 10_000)]);

    assert_eq!(ctx.client.get_reserved_balance(), 0);
}

#[test]
fn test_execute_sets_executed_status_and_timestamp() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 1_000);
    ctx.client.vote(&voter, &id, &VoteDirection::For);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);

    let exec_time = T0 + VOTE_WINDOW + VETO_PERIOD + 2;
    set_time(&ctx.env, exec_time);
    ctx.client.execute_proposal(&id);

    let p = ctx.client.get_proposal(&id);
    assert_eq!(p.status, ProposalStatus::Executed);
    assert_eq!(p.executed_at, exec_time);
}

#[test]
fn test_execute_is_permissionless() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 1_000);
    ctx.client.vote(&voter, &id, &VoteDirection::For);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);
    set_time(&ctx.env, T0 + VOTE_WINDOW + VETO_PERIOD + 2);
    // anyone can execute
    ctx.client.execute_proposal(&id);
    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Executed);
}

#[test]
#[should_panic(expected = "veto period has not expired")]
fn test_execute_during_veto_period_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 1_000);
    ctx.client.vote(&voter, &id, &VoteDirection::For);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);

    // Still inside veto window
    set_time(&ctx.env, T0 + VOTE_WINDOW + VETO_PERIOD - 1);
    ctx.client.execute_proposal(&id);
}

#[test]
#[should_panic(expected = "proposal is not queued")]
fn test_execute_active_proposal_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    ctx.client.execute_proposal(&id);
}

#[test]
#[should_panic(expected = "proposal is not queued")]
fn test_execute_defeated_proposal_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id); // defeated (no votes)
    set_time(&ctx.env, T0 + VOTE_WINDOW + VETO_PERIOD + 2);
    ctx.client.execute_proposal(&id);
}

// ─────────────────────────────────────────────
// Cancel / Veto Tests
// ─────────────────────────────────────────────

#[test]
fn test_proposer_can_cancel_active_proposal() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (proposer, id) = propose(&ctx, 1_000);
    ctx.client.cancel_proposal(&proposer, &id);
    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Cancelled);
}

#[test]
fn test_admin_can_cancel_active_proposal() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    ctx.client.cancel_proposal(&ctx.admin, &id);
    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Cancelled);
}

#[test]
fn test_admin_veto_queued_proposal_releases_reserve() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 1_000);
    ctx.client.vote(&voter, &id, &VoteDirection::For);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);
    assert_eq!(ctx.client.get_reserved_balance(), 1_000);

    // Admin vetoes during veto period
    ctx.client.cancel_proposal(&ctx.admin, &id);

    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Cancelled);
    assert_eq!(ctx.client.get_reserved_balance(), 0);
    assert_eq!(ctx.client.get_available_balance(), 5_000);
}

#[test]
fn test_admin_can_cancel_defeated_proposal() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id); // defeated
    ctx.client.cancel_proposal(&ctx.admin, &id);
    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Cancelled);
}

#[test]
#[should_panic(expected = "proposer may only cancel active proposals")]
fn test_proposer_cannot_cancel_queued_proposal() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (proposer, id) = propose(&ctx, 1_000);
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 1_000);
    ctx.client.vote(&voter, &id, &VoteDirection::For);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);
    ctx.client.cancel_proposal(&proposer, &id); // queued, not active
}

#[test]
#[should_panic(expected = "only admin or proposer may cancel")]
fn test_third_party_cannot_cancel() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    let outsider = Address::generate(&ctx.env);
    ctx.client.cancel_proposal(&outsider, &id);
}

#[test]
#[should_panic(expected = "cannot cancel an executed proposal")]
fn test_cancel_executed_proposal_panics() {
    let ctx = setup();
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 10_000);
    let (id, _) = full_pass(&ctx, 500, &[(voter, 10_000)]);
    ctx.client.cancel_proposal(&ctx.admin, &id);
}

#[test]
#[should_panic(expected = "proposal is already cancelled")]
fn test_double_cancel_panics() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);
    ctx.client.cancel_proposal(&ctx.admin, &id);
    ctx.client.cancel_proposal(&ctx.admin, &id);
}

#[test]
#[should_panic(expected = "voting window has closed; only admin may cancel")]
fn test_proposer_cannot_cancel_after_window() {
    let ctx = setup();
    fund(&ctx, 5_000);
    let (proposer, id) = propose(&ctx, 1_000);
    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.cancel_proposal(&proposer, &id);
}

// ─────────────────────────────────────────────
// Available Balance / Reservation Tests
// ─────────────────────────────────────────────

#[test]
fn test_two_queued_proposals_both_reserved() {
    let ctx = setup();
    fund(&ctx, 5_000);

    let (_, id1) = propose(&ctx, 1_000);
    let (_, id2) = propose(&ctx, 2_000);

    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 10_000);
    ctx.client.vote(&voter, &id1, &VoteDirection::For);
    ctx.client.vote(&voter, &id2, &VoteDirection::For);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id1);
    ctx.client.queue_proposal(&id2);

    assert_eq!(ctx.client.get_reserved_balance(), 3_000);
    assert_eq!(ctx.client.get_available_balance(), 2_000);
}

#[test]
fn test_cannot_over_commit_treasury_with_proposals() {
    let ctx = setup();
    fund(&ctx, 1_000);
    let (_, id1) = propose(&ctx, 1_000);

    // Vote to pass proposal 1.
    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 10_000);
    ctx.client.vote(&voter, &id1, &VoteDirection::For);

    // Queue proposal 1 so amount becomes reserved.
    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id1);
    assert_eq!(ctx.client.get_reserved_balance(), 1_000);
    assert_eq!(ctx.client.get_available_balance(), 0);

    // Now even a 1-token proposal should fail.
    set_time(&ctx.env, T0 + VOTE_WINDOW + 2);
    let proposer2 = Address::generate(&ctx.env);
    mint_gov(&ctx, &proposer2, 100);
    let result = ctx.client.try_submit_proposal(
        &proposer2,
        &mk(&ctx.env, "P2"),
        &mk(&ctx.env, "desc"),
        &proposer2,
        &1,
    );
    assert!(result.is_err());
}

// ─────────────────────────────────────────────
// End-to-End Flow Tests
// ─────────────────────────────────────────────

#[test]
fn test_full_proposal_lifecycle_pass() {
    let ctx = setup();

    // 1. Fund treasury
    fund(&ctx, 10_000);
    assert_eq!(ctx.client.get_treasury_balance(), 10_000);

    // 2. Submit proposal for 3_000
    let proposer = Address::generate(&ctx.env);
    let recipient = Address::generate(&ctx.env);
    mint_gov(&ctx, &proposer, 1);
    let id = ctx.client.submit_proposal(
        &proposer,
        &mk(&ctx.env, "Community Grant"),
        &mk(&ctx.env, "Fund local developers"),
        &recipient,
        &3_000,
    );
    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Active);

    // 3. Three voters, For wins
    let v1 = Address::generate(&ctx.env);
    let v2 = Address::generate(&ctx.env);
    let v3 = Address::generate(&ctx.env);
    mint_gov(&ctx, &v1, 600);
    mint_gov(&ctx, &v2, 300);
    mint_gov(&ctx, &v3, 100);
    ctx.client.vote(&v1, &id, &VoteDirection::For);
    ctx.client.vote(&v2, &id, &VoteDirection::For);
    ctx.client.vote(&v3, &id, &VoteDirection::Against);
    // for=900, against=100, total=1000 → 90% > 51%

    // 4. Queue after window
    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);
    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Queued);
    assert_eq!(ctx.client.get_reserved_balance(), 3_000);
    assert_eq!(ctx.client.get_available_balance(), 7_000);

    // 5. Execute after veto period
    set_time(&ctx.env, T0 + VOTE_WINDOW + VETO_PERIOD + 2);
    ctx.client.execute_proposal(&id);

    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Executed);
    assert_eq!(bal_treasury(&ctx, &recipient), 3_000);
    assert_eq!(ctx.client.get_treasury_balance(), 7_000);
    assert_eq!(ctx.client.get_reserved_balance(), 0);
}

#[test]
fn test_full_proposal_lifecycle_veto() {
    let ctx = setup();
    fund(&ctx, 5_000);

    let proposer = Address::generate(&ctx.env);
    mint_gov(&ctx, &proposer, 1);
    let id = ctx.client.submit_proposal(
        &proposer,
        &mk(&ctx.env, "Controversial spend"),
        &mk(&ctx.env, "Risky project"),
        &proposer,
        &2_000,
    );

    let voter = Address::generate(&ctx.env);
    mint_gov(&ctx, &voter, 1_000);
    ctx.client.vote(&voter, &id, &VoteDirection::For);

    // Queue
    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);
    assert_eq!(ctx.client.get_reserved_balance(), 2_000);

    // Admin vetoes during veto window
    set_time(&ctx.env, T0 + VOTE_WINDOW + VETO_PERIOD / 2);
    ctx.client.cancel_proposal(&ctx.admin, &id);

    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Cancelled);
    assert_eq!(ctx.client.get_reserved_balance(), 0);
    assert_eq!(ctx.client.get_available_balance(), 5_000);
    // Recipient gets nothing
    assert_eq!(bal_treasury(&ctx, &proposer), 0);
}

#[test]
fn test_two_proposals_one_passes_one_fails() {
    let ctx = setup();
    fund(&ctx, 10_000);

    // Proposal 1: will pass
    let (proposer1, id1) = propose(&ctx, 2_000);
    // Proposal 2: will fail (against wins)
    let (_, id2) = propose(&ctx, 1_000);

    let whale = Address::generate(&ctx.env);
    mint_gov(&ctx, &whale, 10_000);
    ctx.client.vote(&whale, &id1, &VoteDirection::For);
    ctx.client.vote(&whale, &id2, &VoteDirection::Against);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id1);
    ctx.client.queue_proposal(&id2);

    assert_eq!(ctx.client.get_proposal(&id1).status, ProposalStatus::Queued);
    assert_eq!(ctx.client.get_proposal(&id2).status, ProposalStatus::Defeated);
    assert_eq!(ctx.client.get_reserved_balance(), 2_000);
    assert_eq!(ctx.client.get_available_balance(), 8_000);

    set_time(&ctx.env, T0 + VOTE_WINDOW + VETO_PERIOD + 2);
    ctx.client.execute_proposal(&id1);

    assert_eq!(bal_treasury(&ctx, &proposer1), 2_000);
    assert_eq!(ctx.client.get_treasury_balance(), 8_000);
}

#[test]
fn test_abstain_counts_toward_quorum_denominator() {
    // 51 for, 0 against, 100 abstain → for/(51+0+100) = 51/151 = 33.7% < 51%
    // → Defeated (quorum not met)
    let ctx = setup();
    fund(&ctx, 5_000);
    let (_, id) = propose(&ctx, 1_000);

    let v_for = Address::generate(&ctx.env);
    let v_abs = Address::generate(&ctx.env);
    mint_gov(&ctx, &v_for, 51);
    mint_gov(&ctx, &v_abs, 100);
    ctx.client.vote(&v_for, &id, &VoteDirection::For);
    ctx.client.vote(&v_abs, &id, &VoteDirection::Abstain);

    set_time(&ctx.env, T0 + VOTE_WINDOW + 1);
    ctx.client.queue_proposal(&id);

    assert_eq!(ctx.client.get_proposal(&id).status, ProposalStatus::Defeated);
}