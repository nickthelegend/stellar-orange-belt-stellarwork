#![cfg(test)]
//! Integration tests for the escrow contract, including the live cross-contract
//! call into a *real* reputation contract instance and a *real* Stellar Asset
//! Contract token. These tests exercise the whole two-contract system end to end.

use super::*;
use reputation::{Reputation, ReputationClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Env,
};

struct World<'a> {
    env: Env,
    escrow: EscrowClient<'a>,
    reputation: ReputationClient<'a>,
    token: token::Client<'a>,
    token_admin: token::StellarAssetClient<'a>,
    client: Address,
    worker: Address,
}

/// Stand up the full system: a SAC token, a reputation ledger, and an escrow
/// wired to both, with the escrow authorized as a reporter.
fn world() -> World<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let client = Address::generate(&env);
    let worker = Address::generate(&env);

    // A real Stellar Asset Contract token.
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = token::Client::new(&env, &sac.address());
    let token_admin = token::StellarAssetClient::new(&env, &sac.address());

    // Reputation ledger, admin-owned.
    let rep_id = env.register(Reputation, (admin.clone(),));
    let reputation = ReputationClient::new(&env, &rep_id);

    // Escrow wired to the token + reputation ledger.
    let escrow_id = env.register(Escrow, (admin.clone(), sac.address(), rep_id.clone()));
    let escrow = EscrowClient::new(&env, &escrow_id);

    // Authorize the escrow to write reputation scores.
    reputation.add_reporter(&escrow_id);

    // Fund the client so they can escrow jobs.
    token_admin.mint(&client, &1_000_000);

    World {
        env,
        escrow,
        reputation,
        token,
        token_admin,
        client,
        worker,
    }
}

#[test]
fn create_job_escrows_funds() {
    let w = world();
    let id = w.escrow.create_job(&w.client, &w.worker, &100_000, &1_000);
    assert_eq!(id, 0);

    // Money moved out of the client and into the escrow contract.
    assert_eq!(w.token.balance(&w.client), 900_000);
    assert_eq!(w.token.balance(&w.escrow.address), 100_000);

    let job = w.escrow.get_job(&id);
    assert_eq!(job.status, Status::Funded);
    assert_eq!(job.amount, 100_000);
    assert_eq!(w.escrow.job_count(), 1);
}

#[test]
fn release_pays_worker_and_boosts_reputation() {
    let w = world();
    let id = w.escrow.create_job(&w.client, &w.worker, &100_000, &1_000);

    let rep = w.escrow.release(&id);

    // Worker got paid; escrow is empty.
    assert_eq!(w.token.balance(&w.worker), 100_000);
    assert_eq!(w.token.balance(&w.escrow.address), 0);

    // Job is terminal.
    assert_eq!(w.escrow.get_job(&id).status, Status::Released);

    // The cross-contract call updated the reputation ledger.
    assert_eq!(rep.completed, 1);
    assert_eq!(rep.volume, 100_000);
    let onchain = w.reputation.score(&w.worker);
    assert_eq!(onchain.completed, rep.completed);
    assert_eq!(onchain.disputed, rep.disputed);
    assert_eq!(onchain.volume, rep.volume);
}

#[test]
fn refund_after_deadline_returns_funds_and_marks_dispute() {
    let w = world();
    let id = w.escrow.create_job(&w.client, &w.worker, &100_000, &1_000);

    // Move the ledger clock past the deadline.
    w.env.ledger().with_mut(|li| li.timestamp = 2_000);

    let rep = w.escrow.refund(&id);

    // Client made whole; escrow empty; worker never paid.
    assert_eq!(w.token.balance(&w.client), 1_000_000);
    assert_eq!(w.token.balance(&w.worker), 0);
    assert_eq!(w.escrow.get_job(&id).status, Status::Refunded);

    // Dispute recorded against the worker.
    assert_eq!(rep.disputed, 1);
    assert_eq!(rep.completed, 0);
}

#[test]
fn refund_before_deadline_is_rejected() {
    let w = world();
    let id = w.escrow.create_job(&w.client, &w.worker, &100_000, &1_000);
    let res = w.escrow.try_refund(&id);
    assert_eq!(res, Err(Ok(Error::TooEarly)));
}

#[test]
fn cannot_release_twice() {
    let w = world();
    let id = w.escrow.create_job(&w.client, &w.worker, &100_000, &1_000);
    w.escrow.release(&id);
    let res = w.escrow.try_release(&id);
    assert_eq!(res, Err(Ok(Error::NotFunded)));
}

#[test]
fn rejects_zero_amount() {
    let w = world();
    let res = w.escrow.try_create_job(&w.client, &w.worker, &0, &1_000);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn rejects_self_dealing() {
    let w = world();
    let res = w.escrow.try_create_job(&w.client, &w.client, &100_000, &1_000);
    assert_eq!(res, Err(Ok(Error::SelfDeal)));
}

#[test]
fn rejects_past_deadline() {
    let w = world();
    w.env.ledger().with_mut(|li| li.timestamp = 5_000);
    let res = w.escrow.try_create_job(&w.client, &w.worker, &100_000, &1_000);
    assert_eq!(res, Err(Ok(Error::BadDeadline)));
}

#[test]
fn two_completed_jobs_accumulate_reputation() {
    let w = world();
    let a = w.escrow.create_job(&w.client, &w.worker, &10_000, &1_000);
    let b = w.escrow.create_job(&w.client, &w.worker, &20_000, &1_000);
    w.escrow.release(&a);
    let rep = w.escrow.release(&b);
    assert_eq!(rep.completed, 2);
    assert_eq!(rep.volume, 30_000);
    // list_jobs returns newest first.
    let jobs = w.escrow.list_jobs();
    assert_eq!(jobs.len(), 2);
    assert_eq!(jobs.get(0).unwrap().id, b);
    assert_eq!(jobs.get(1).unwrap().id, a);
    // silence unused warnings for fields only used in other tests
    let _ = &w.token_admin;
}
