#![cfg(test)]
//! Unit tests for the reputation ledger.

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

/// Deploy a reputation contract with a fresh admin and return the pieces.
fn setup() -> (Env, ReputationClient<'static>, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let id = env.register(Reputation, (admin.clone(),));
    (env.clone(), ReputationClient::new(&env, &id), admin)
}

#[test]
fn unknown_subject_scores_zero() {
    let (env, rep, _admin) = setup();
    let who = Address::generate(&env);
    let r = rep.score(&who);
    assert_eq!(r.completed, 0);
    assert_eq!(r.disputed, 0);
    assert_eq!(r.volume, 0);
}

#[test]
fn admin_can_add_and_remove_reporter() {
    let (env, rep, _admin) = setup();
    let reporter = Address::generate(&env);

    env.mock_all_auths();
    assert!(!rep.is_reporter(&reporter));
    rep.add_reporter(&reporter);
    assert!(rep.is_reporter(&reporter));
    rep.remove_reporter(&reporter);
    assert!(!rep.is_reporter(&reporter));
}

#[test]
fn authorized_reporter_records_success_and_dispute() {
    let (env, rep, _admin) = setup();
    let reporter = Address::generate(&env);
    let worker = Address::generate(&env);

    env.mock_all_auths();
    rep.add_reporter(&reporter);

    let r1 = rep.record(&reporter, &worker, &true, &1_000);
    assert_eq!(r1.completed, 1);
    assert_eq!(r1.volume, 1_000);

    let r2 = rep.record(&reporter, &worker, &true, &500);
    assert_eq!(r2.completed, 2);
    assert_eq!(r2.volume, 1_500);

    let r3 = rep.record(&reporter, &worker, &false, &0);
    assert_eq!(r3.completed, 2);
    assert_eq!(r3.disputed, 1);
    assert_eq!(r3.volume, 1_500); // failures don't add volume
}

#[test]
fn unregistered_reporter_is_rejected() {
    let (env, rep, _admin) = setup();
    let stranger = Address::generate(&env);
    let worker = Address::generate(&env);

    env.mock_all_auths();
    let res = rep.try_record(&stranger, &worker, &true, &1_000);
    assert_eq!(res, Err(Ok(Error::NotReporter)));
}
