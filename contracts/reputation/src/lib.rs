#![no_std]
//! Reputation — an on-chain reputation ledger for the StellarWork escrow system.
//!
//! Reputation is deliberately a *separate* contract from the escrow. The escrow
//! holds money; the reputation ledger holds trust. Keeping them apart means:
//!   - the ledger can be reused by many escrow (or other) contracts, and
//!   - a future escrow upgrade never has to migrate reputation data.
//!
//! Only an **authorized reporter contract** may mutate a score. The escrow
//! contract calls [`Reputation::record`] over a cross-contract call; because a
//! contract implicitly authorizes its own outgoing calls, `reporter.require_auth()`
//! passes for the escrow but can never be forged by an end user.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

/// Storage keys. A typed enum keeps keys collision-free and self-documenting.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,               // Address allowed to add/remove reporters
    Reporter(Address),   // Marker: this address is an authorized reporter contract
    Score(Address),      // The `Rep` record for a subject
}

/// A subject's reputation. Cheap to read in one call from the frontend.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rep {
    pub completed: u32, // successfully released jobs
    pub disputed: u32,  // refunded / failed jobs
    pub volume: i128,   // total value (stroops) successfully settled
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotReporter = 1,  // caller is not a registered reporter contract
    Overflow = 2,     // score/volume arithmetic overflowed
}

// Keep instance + persistent state alive for ~30 days between touches.
const BUMP_THRESHOLD: u32 = 100;
const BUMP_TO: u32 = 518_400;

#[contract]
pub struct Reputation;

#[contractimpl]
impl Reputation {
    /// Deploy-time setup. Records the admin who may manage reporters.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Authorize a reporter contract (e.g. the escrow) to write scores.
    /// Admin-only.
    pub fn add_reporter(env: Env, reporter: Address) {
        Self::admin(&env).require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Reporter(reporter.clone()), &true);
        env.events()
            .publish((symbol_short!("reporter"), symbol_short!("add")), reporter);
    }

    /// Revoke a reporter. Admin-only.
    pub fn remove_reporter(env: Env, reporter: Address) {
        Self::admin(&env).require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::Reporter(reporter.clone()));
        env.events()
            .publish((symbol_short!("reporter"), symbol_short!("remove")), reporter);
    }

    /// Record an outcome for `subject`. Callable **only** by an authorized
    /// reporter contract; `reporter` must be the calling contract's own address.
    ///
    /// `success == true`  -> a completed job (+1 completed, + volume)
    /// `success == false` -> a dispute/refund (+1 disputed)
    ///
    /// Returns the subject's updated reputation.
    pub fn record(
        env: Env,
        reporter: Address,
        subject: Address,
        success: bool,
        amount: i128,
    ) -> Result<Rep, Error> {
        // A contract authorizes calls it makes directly, so this succeeds for
        // the escrow and is unforgeable by anyone else.
        reporter.require_auth();

        if !Self::is_reporter_internal(&env, &reporter) {
            return Err(Error::NotReporter);
        }

        let mut rep = Self::score(env.clone(), subject.clone());
        if success {
            rep.completed = rep.completed.checked_add(1).ok_or(Error::Overflow)?;
            rep.volume = rep.volume.checked_add(amount).ok_or(Error::Overflow)?;
        } else {
            rep.disputed = rep.disputed.checked_add(1).ok_or(Error::Overflow)?;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Score(subject.clone()), &rep);
        env.storage().persistent().extend_ttl(
            &DataKey::Score(subject.clone()),
            BUMP_THRESHOLD,
            BUMP_TO,
        );
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);

        // topics: ("record", subject)  data: (success, completed, disputed)
        let topic: Symbol = symbol_short!("record");
        env.events().publish(
            (topic, subject),
            (success, rep.completed, rep.disputed),
        );

        Ok(rep)
    }

    /// Read a subject's reputation. Returns a zeroed `Rep` for unknown subjects.
    pub fn score(env: Env, subject: Address) -> Rep {
        env.storage()
            .persistent()
            .get(&DataKey::Score(subject))
            .unwrap_or(Rep {
                completed: 0,
                disputed: 0,
                volume: 0,
            })
    }

    /// Whether `who` is currently an authorized reporter. Public read for the UI.
    pub fn is_reporter(env: Env, who: Address) -> bool {
        Self::is_reporter_internal(&env, &who)
    }

    // --- internal helpers (not exported to the contract ABI) ----------------

    fn is_reporter_internal(env: &Env, who: &Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Reporter(who.clone()))
            .unwrap_or(false)
    }

    fn admin(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }
}

mod test;
