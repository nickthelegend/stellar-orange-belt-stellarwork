#![no_std]
//! Escrow — the money side of StellarWork.
//!
//! A **client** funds a job for a **worker**. The tokens sit in this contract
//! until one of two things happens:
//!   - the client is satisfied and calls [`Escrow::release`] -> worker is paid
//!     and gains reputation, or
//!   - the deadline passes with no release and the client calls
//!     [`Escrow::refund`] -> the client is repaid and the worker is marked as
//!     having a dispute.
//!
//! On every terminal transition the escrow makes a **cross-contract call** into
//! the [`reputation`] ledger. That call is the heart of this level: two
//! independent contracts, one composing the other, with authorization flowing
//! correctly across the boundary.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, vec, Address, Env,
    IntoVal, Symbol, Vec,
};

/// Mirror of the reputation ledger's `Rep` struct. It is redefined here (rather
/// than imported) so the escrow wasm stays decoupled from the reputation crate;
/// the field names match, so it deserializes cleanly from the cross-contract
/// call's return value.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rep {
    pub completed: u32,
    pub disputed: u32,
    pub volume: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,       // Address that configured the escrow
    Token,       // Token (SAC) used to fund jobs
    Reputation,  // Address of the reputation ledger contract
    JobCount,    // Monotonic job id counter
    Job(u32),    // A single job record
}

/// Lifecycle of a job. Encoded as a small enum so the frontend can switch on it.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    Funded,   // money escrowed, work in progress
    Released, // worker paid
    Refunded, // client repaid after deadline
}

/// A funded job. One `get_job` call gives the frontend everything it needs.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Job {
    pub id: u32,
    pub client: Address,
    pub worker: Address,
    pub amount: i128,
    pub deadline: u64,
    pub status: Status,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,   // amount <= 0
    BadDeadline = 2,     // deadline not in the future
    SelfDeal = 3,        // client == worker
    NotFound = 4,        // no job with that id
    NotFunded = 5,       // job already released or refunded
    TooEarly = 6,        // refund attempted before the deadline
    Overflow = 7,        // arithmetic overflow
}

const BUMP_THRESHOLD: u32 = 100;
const BUMP_TO: u32 = 518_400;

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// Deploy-time wiring. Records the token used for funding and the address of
    /// the reputation ledger this escrow will report to.
    pub fn __constructor(env: Env, admin: Address, token: Address, reputation: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Reputation, &reputation);
        s.set(&DataKey::JobCount, &0u32);
    }

    /// Create and fund a job. Pulls `amount` from the client into the escrow and
    /// returns the new job id. The client must sign (for auth + the transfer).
    pub fn create_job(
        env: Env,
        client: Address,
        worker: Address,
        amount: i128,
        deadline: u64,
    ) -> Result<u32, Error> {
        client.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::BadDeadline);
        }
        if client == worker {
            return Err(Error::SelfDeal);
        }

        // Escrow the funds.
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token_addr).transfer(
            &client,
            &env.current_contract_address(),
            &amount,
        );

        let s = env.storage().instance();
        let id: u32 = s.get(&DataKey::JobCount).unwrap_or(0);
        let next = id.checked_add(1).ok_or(Error::Overflow)?;

        let job = Job {
            id,
            client: client.clone(),
            worker: worker.clone(),
            amount,
            deadline,
            status: Status::Funded,
        };
        s.set(&DataKey::Job(id), &job);
        s.set(&DataKey::JobCount, &next);
        s.extend_ttl(BUMP_THRESHOLD, BUMP_TO);

        // topics: ("created", job_id)  data: (client, worker, amount)
        let topic: Symbol = symbol_short!("created");
        env.events()
            .publish((topic, id), (client, worker, amount));

        Ok(id)
    }

    /// Release escrowed funds to the worker. Only the funding client may do
    /// this. Reports a success to the reputation ledger.
    pub fn release(env: Env, job_id: u32) -> Result<Rep, Error> {
        let mut job = Self::load(&env, job_id)?;
        job.client.require_auth();

        if job.status != Status::Funded {
            return Err(Error::NotFunded);
        }

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &job.worker,
            &job.amount,
        );

        job.status = Status::Released;
        env.storage().instance().set(&DataKey::Job(job_id), &job);

        // Cross-contract call: tell the reputation ledger this worker delivered.
        let rep = Self::report(&env, &job.worker, true, job.amount);

        env.events().publish(
            (symbol_short!("released"), job_id),
            (job.worker.clone(), job.amount),
        );

        Ok(rep)
    }

    /// Refund the client after the deadline has passed without a release. Marks
    /// a dispute against the worker in the reputation ledger.
    pub fn refund(env: Env, job_id: u32) -> Result<Rep, Error> {
        let mut job = Self::load(&env, job_id)?;
        job.client.require_auth();

        if job.status != Status::Funded {
            return Err(Error::NotFunded);
        }
        if env.ledger().timestamp() <= job.deadline {
            return Err(Error::TooEarly);
        }

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &job.client,
            &job.amount,
        );

        job.status = Status::Refunded;
        env.storage().instance().set(&DataKey::Job(job_id), &job);

        // Cross-contract call: a refund is a dispute against the worker.
        let rep = Self::report(&env, &job.worker, false, job.amount);

        env.events().publish(
            (symbol_short!("refunded"), job_id),
            (job.client.clone(), job.amount),
        );

        Ok(rep)
    }

    /// Fetch a single job.
    pub fn get_job(env: Env, job_id: u32) -> Result<Job, Error> {
        Self::load(&env, job_id)
    }

    /// Number of jobs ever created (also the id of the next job).
    pub fn job_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::JobCount).unwrap_or(0)
    }

    /// Return every job, newest first. Convenient for the dashboard; fine for a
    /// demo-scale dataset.
    pub fn list_jobs(env: Env) -> Vec<Job> {
        let s = env.storage().instance();
        let count: u32 = s.get(&DataKey::JobCount).unwrap_or(0);
        let mut out = Vec::new(&env);
        let mut i = count;
        while i > 0 {
            i -= 1;
            if let Some(job) = s.get::<_, Job>(&DataKey::Job(i)) {
                out.push_back(job);
            }
        }
        out
    }

    /// The reputation ledger this escrow reports to.
    pub fn reputation(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Reputation).unwrap()
    }

    // --- internal helpers ---------------------------------------------------

    fn load(env: &Env, job_id: u32) -> Result<Job, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Job(job_id))
            .ok_or(Error::NotFound)
    }

    /// Cross-contract call into the reputation ledger. The escrow passes its own
    /// address as the reporter; because a contract authorizes calls it makes
    /// directly, `reporter.require_auth()` inside `record` succeeds. We use
    /// `invoke_contract` so the escrow wasm never links the reputation crate.
    fn report(env: &Env, subject: &Address, success: bool, amount: i128) -> Rep {
        let rep_addr: Address = env.storage().instance().get(&DataKey::Reputation).unwrap();
        let args: Vec<soroban_sdk::Val> = vec![
            env,
            env.current_contract_address().into_val(env),
            subject.into_val(env),
            success.into_val(env),
            amount.into_val(env),
        ];
        env.invoke_contract(&rep_addr, &symbol_short!("record"), args)
    }
}

mod test;
