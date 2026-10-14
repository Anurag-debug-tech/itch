#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, token, Address, BytesN, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone)]
enum Key { Token, Agreement(BytesN<32>), Milestone(BytesN<32>, BytesN<32>) }

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum State { AwaitingFunding, Funded, Submitted, Disputed, Paid, Refunded }

#[contracttype]
#[derive(Clone, Debug)]
pub struct MilestoneSpec { pub id: BytesN<32>, pub amount: i128 }

#[contracttype]
#[derive(Clone, Debug)]
pub struct Agreement {
    pub client: Address,
    pub freelancer: Address,
    pub resolver: Address,
    pub token: Address,
    pub terms_hash: BytesN<32>,
    pub accepted: bool,
    pub milestones: Vec<BytesN<32>>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Milestone {
    pub amount: i128,
    pub funded: i128,
    pub paid: i128,
    pub refunded: i128,
    pub state: State,
    pub submission_hash: BytesN<32>,
}

#[contractevent(topics = ["escrow"])]
pub struct Transition {
    #[topic] pub agreement: BytesN<32>,
    #[topic] pub milestone: BytesN<32>,
    pub action: Symbol,
    pub funded: i128,
    pub paid: i128,
    pub refunded: i128,
}

#[contract]
pub struct Escrow;

fn agreement(e: &Env, id: &BytesN<32>) -> Agreement {
    e.storage().persistent().get(&Key::Agreement(id.clone())).expect("agreement missing")
}
fn milestone(e: &Env, id: &BytesN<32>, mid: &BytesN<32>) -> Milestone {
    e.storage().persistent().get(&Key::Milestone(id.clone(), mid.clone())).expect("milestone missing")
}
fn save(e: &Env, key: &Key, value: &impl soroban_sdk::IntoVal<Env, soroban_sdk::Val>) {
    e.storage().persistent().set(key, value);
    e.storage().persistent().extend_ttl(key, 10_000, 100_000);
    e.storage().instance().extend_ttl(10_000, 100_000);
}
fn event(e: &Env, id: &BytesN<32>, mid: &BytesN<32>, action: &str, m: &Milestone) {
    Transition { agreement: id.clone(), milestone: mid.clone(), action: Symbol::new(e, action), funded: m.funded, paid: m.paid, refunded: m.refunded }.publish(e);
}
fn settle(e: &Env, id: &BytesN<32>, mid: &BytesN<32>, release: bool) {
    let a = agreement(e, id);
    a.resolver.require_auth();
    let mut m = milestone(e, id, mid);
    assert!(m.state == State::Disputed, "dispute required");
    assert!(m.funded == m.amount && m.paid == 0 && m.refunded == 0, "already settled");
    let beneficiary = if release { &a.freelancer } else { &a.client };
    token::Client::new(e, &a.token).transfer(&e.current_contract_address(), beneficiary, &m.amount);
    if release { m.paid = m.amount; m.state = State::Paid; } else { m.refunded = m.amount; m.state = State::Refunded; }
    save(e, &Key::Milestone(id.clone(), mid.clone()), &m);
    event(e, id, mid, if release { "resolved_pay" } else { "resolved_refund" }, &m);
}

#[contractimpl]
impl Escrow {
    /// This instance supports exactly one asset, pinned at deployment to Testnet native XLM SAC.
    pub fn __constructor(e: Env, token: Address) {
        assert!(token::Client::new(&e, &token).decimals() == 7, "seven-decimal asset required");
        e.storage().instance().set(&Key::Token, &token);
    }

    pub fn create_agreement(e: Env, id: BytesN<32>, client: Address, freelancer: Address, resolver: Address, terms_hash: BytesN<32>, milestones: Vec<MilestoneSpec>) {
        client.require_auth();
        assert!(client != freelancer && client != resolver && freelancer != resolver, "independent participants required");
        assert!(!e.storage().persistent().has(&Key::Agreement(id.clone())), "agreement exists");
        assert!(milestones.len() > 0 && milestones.len() <= 30, "one to thirty milestones");
        assert!(terms_hash != BytesN::from_array(&e, &[0; 32]), "terms commitment required");
        let mut ids = Vec::new(&e);
        for spec in milestones {
            assert!(spec.amount > 0 && spec.amount <= 1_000_000_000_000_000_000, "invalid amount");
            assert!(!ids.contains(&spec.id), "duplicate milestone");
            ids.push_back(spec.id.clone());
            let m = Milestone { amount: spec.amount, funded: 0, paid: 0, refunded: 0, state: State::AwaitingFunding, submission_hash: BytesN::from_array(&e, &[0; 32]) };
            save(&e, &Key::Milestone(id.clone(), spec.id.clone()), &m);
            event(&e, &id, &spec.id, "created", &m);
        }
        let token = e.storage().instance().get(&Key::Token).unwrap();
        save(&e, &Key::Agreement(id), &Agreement { client, freelancer, resolver, token, terms_hash, accepted: false, milestones: ids });
    }

    pub fn accept_agreement(e: Env, id: BytesN<32>, terms_hash: BytesN<32>) {
        let mut a = agreement(&e, &id);
        a.freelancer.require_auth();
        assert!(a.terms_hash == terms_hash, "terms mismatch");
        assert!(!a.accepted, "already accepted");
        a.accepted = true;
        save(&e, &Key::Agreement(id.clone()), &a);
        let first = a.milestones.get(0).unwrap();
        event(&e, &id, &first, "accepted", &milestone(&e, &id, &first));
    }

    pub fn fund_milestone(e: Env, id: BytesN<32>, mid: BytesN<32>) {
        let a = agreement(&e, &id);
        a.client.require_auth();
        assert!(a.accepted, "freelancer acceptance required");
        let mut m = milestone(&e, &id, &mid);
        assert!(m.state == State::AwaitingFunding && m.funded == 0, "already funded");
        token::Client::new(&e, &a.token).transfer(&a.client, &e.current_contract_address(), &m.amount);
        m.funded = m.amount; m.state = State::Funded;
        save(&e, &Key::Milestone(id.clone(), mid.clone()), &m);
        event(&e, &id, &mid, "funded", &m);
    }

    pub fn submit_work(e: Env, id: BytesN<32>, mid: BytesN<32>, submission_hash: BytesN<32>) {
        let a = agreement(&e, &id);
        a.freelancer.require_auth();
        let mut m = milestone(&e, &id, &mid);
        assert!(m.state == State::Funded || m.state == State::Submitted, "funded work required");
        assert!(submission_hash != BytesN::from_array(&e, &[0; 32]), "evidence commitment required");
        m.submission_hash = submission_hash; m.state = State::Submitted;
        save(&e, &Key::Milestone(id.clone(), mid.clone()), &m);
        event(&e, &id, &mid, "submitted", &m);
    }

    pub fn approve_and_release(e: Env, id: BytesN<32>, mid: BytesN<32>, submission_hash: BytesN<32>) {
        let a = agreement(&e, &id);
        a.client.require_auth();
        let mut m = milestone(&e, &id, &mid);
        assert!(m.state == State::Submitted && m.paid == 0 && m.refunded == 0, "submitted undisputed work required");
        assert!(m.submission_hash == submission_hash, "evidence changed");
        token::Client::new(&e, &a.token).transfer(&e.current_contract_address(), &a.freelancer, &m.amount);
        m.paid = m.amount; m.state = State::Paid;
        save(&e, &Key::Milestone(id.clone(), mid.clone()), &m);
        event(&e, &id, &mid, "released", &m);
    }

    pub fn raise_dispute(e: Env, id: BytesN<32>, mid: BytesN<32>, actor: Address) {
        let a = agreement(&e, &id);
        assert!(actor == a.client || actor == a.freelancer, "party required");
        actor.require_auth();
        let mut m = milestone(&e, &id, &mid);
        assert!(m.state == State::Funded || m.state == State::Submitted, "unsettled milestone required");
        m.state = State::Disputed;
        save(&e, &Key::Milestone(id.clone(), mid.clone()), &m);
        event(&e, &id, &mid, "disputed", &m);
    }

    pub fn resolve_dispute(e: Env, id: BytesN<32>, mid: BytesN<32>, release: bool) {
        let m = milestone(&e, &id, &mid);
        assert!(!release || m.submission_hash != BytesN::from_array(&e, &[0; 32]), "evidence required for release");
        settle(&e, &id, &mid, release);
    }

    pub fn refund_authorized(e: Env, id: BytesN<32>, mid: BytesN<32>) { settle(&e, &id, &mid, false); }
    pub fn get_agreement(e: Env, id: BytesN<32>) -> Agreement { agreement(&e, &id) }
    pub fn get_milestone(e: Env, id: BytesN<32>, mid: BytesN<32>) -> Milestone { milestone(&e, &id, &mid) }
}

#[cfg(test)]
mod test;
