use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke}, vec, IntoVal};

struct Fixture { e: Env, contract: Address, token: Address, client: Address, worker: Address, resolver: Address, id: BytesN<32>, mid: BytesN<32>, terms: BytesN<32>, evidence: BytesN<32> }
impl Fixture {
    fn new() -> Self {
        let mut e = Env::default(); e.set_config(soroban_sdk::testutils::EnvTestConfig { capture_snapshot_at_drop: false, ..Default::default() }); e.mock_all_auths();
        let client = Address::generate(&e); let worker = Address::generate(&e); let resolver = Address::generate(&e);
        let token = e.register_stellar_asset_contract_v2(Address::generate(&e)).address();
        token::StellarAssetClient::new(&e, &token).mint(&client, &100_000_000);
        let contract = e.register(Escrow, (&token,));
        let id = BytesN::from_array(&e, &[1; 32]); let mid = BytesN::from_array(&e, &[2; 32]);
        let terms = BytesN::from_array(&e, &[9; 32]); let evidence = BytesN::from_array(&e, &[7; 32]);
        let f = Self { e, contract, token, client, worker, resolver, id, mid, terms, evidence };
        f.api().create_agreement(&f.id, &f.client, &f.worker, &f.resolver, &f.terms, &vec![&f.e, MilestoneSpec { id: f.mid.clone(), amount: 10_000_000 }]);
        f
    }
    fn api(&self) -> EscrowClient<'_> { EscrowClient::new(&self.e, &self.contract) }
    fn m(&self) -> Milestone { self.api().get_milestone(&self.id, &self.mid) }
    fn accept(&self) { self.api().accept_agreement(&self.id, &self.terms); }
    fn fund(&self) { self.accept(); self.api().fund_milestone(&self.id, &self.mid); }
    fn submit(&self) { self.fund(); self.api().submit_work(&self.id, &self.mid, &self.evidence); }
    fn dispute(&self) { self.api().raise_dispute(&self.id, &self.mid, &self.client); }
    fn balance(&self, address: &Address) -> i128 { token::Client::new(&self.e, &self.token).balance(address) }
}

#[test] fn agreement_stores_fixed_participants_and_terms() { let f=Fixture::new(); let a=f.api().get_agreement(&f.id); assert_eq!(a.client,f.client); assert_eq!(a.freelancer,f.worker); assert_eq!(a.resolver,f.resolver); assert_eq!(a.terms_hash,f.terms); assert!(!a.accepted); }
#[test] fn freelancer_accepts_matching_terms() { let f=Fixture::new(); f.accept(); assert!(f.api().get_agreement(&f.id).accepted); }
#[test] fn wrong_terms_rejected() { let f=Fixture::new(); assert!(f.api().try_accept_agreement(&f.id,&f.evidence).is_err()); }
#[test] fn funding_requires_acceptance() { let f=Fixture::new(); assert!(f.api().try_fund_milestone(&f.id,&f.mid).is_err()); assert_eq!(f.balance(&f.client),100_000_000); }
#[test] fn funding_moves_exact_amount_to_contract() { let f=Fixture::new(); f.fund(); assert_eq!(f.m().funded,10_000_000); assert_eq!(f.balance(&f.contract),10_000_000); assert_eq!(f.balance(&f.client),90_000_000); }
#[test] fn double_funding_rejected() { let f=Fixture::new(); f.fund(); assert!(f.api().try_fund_milestone(&f.id,&f.mid).is_err()); assert_eq!(f.balance(&f.contract),10_000_000); }
#[test] fn submission_never_pays() { let f=Fixture::new(); f.submit(); assert_eq!(f.m().state,State::Submitted); assert_eq!(f.m().submission_hash,f.evidence); assert_eq!(f.balance(&f.worker),0); }
#[test] fn release_pays_fixed_worker() { let f=Fixture::new(); f.submit(); f.api().approve_and_release(&f.id,&f.mid,&f.evidence); assert_eq!(f.m().paid,10_000_000); assert_eq!(f.balance(&f.worker),10_000_000); assert_eq!(f.balance(&f.contract),0); }
#[test] fn double_release_rejected() { let f=Fixture::new(); f.submit(); f.api().approve_and_release(&f.id,&f.mid,&f.evidence); assert!(f.api().try_approve_and_release(&f.id,&f.mid,&f.evidence).is_err()); assert_eq!(f.balance(&f.worker),10_000_000); }
#[test] fn release_without_submission_rejected() { let f=Fixture::new(); f.fund(); assert!(f.api().try_approve_and_release(&f.id,&f.mid,&f.evidence).is_err()); }
#[test] fn changed_evidence_rejected() { let f=Fixture::new(); f.submit(); assert!(f.api().try_approve_and_release(&f.id,&f.mid,&f.terms).is_err()); }
#[test] fn dispute_blocks_ordinary_release() { let f=Fixture::new(); f.submit(); f.dispute(); assert_eq!(f.m().state,State::Disputed); assert!(f.api().try_approve_and_release(&f.id,&f.mid,&f.evidence).is_err()); assert_eq!(f.balance(&f.contract),10_000_000); }
#[test] fn resolver_can_release_dispute() { let f=Fixture::new(); f.submit(); f.dispute(); f.api().resolve_dispute(&f.id,&f.mid,&true); assert_eq!(f.m().state,State::Paid); assert_eq!(f.balance(&f.worker),10_000_000); }
#[test] fn resolver_can_refund_dispute() { let f=Fixture::new(); f.fund(); f.dispute(); f.api().refund_authorized(&f.id,&f.mid); assert_eq!(f.m().state,State::Refunded); assert_eq!(f.balance(&f.client),100_000_000); assert_eq!(f.balance(&f.contract),0); }
#[test] fn refund_requires_dispute() { let f=Fixture::new(); f.fund(); assert!(f.api().try_refund_authorized(&f.id,&f.mid).is_err()); }
#[test] fn resolver_release_requires_evidence() { let f=Fixture::new(); f.fund(); f.dispute(); assert!(f.api().try_resolve_dispute(&f.id,&f.mid,&true).is_err()); }
#[test] fn cannot_settle_twice() { let f=Fixture::new(); f.submit(); f.dispute(); f.api().resolve_dispute(&f.id,&f.mid,&false); assert!(f.api().try_resolve_dispute(&f.id,&f.mid,&true).is_err()); assert_eq!(f.m().paid+f.m().refunded,f.m().funded); }
#[test] fn unrelated_dispute_actor_rejected() { let f=Fixture::new(); f.fund(); assert!(f.api().try_raise_dispute(&f.id,&f.mid,&f.resolver).is_err()); }
#[test] fn freelancer_cannot_sign_client_release() {
    let f=Fixture::new(); f.submit();
    let args=(&f.id,&f.mid,&f.evidence).into_val(&f.e);
    assert!(f.api().mock_auths(&[MockAuth { address:&f.worker, invoke:&MockAuthInvoke { contract:&f.contract,fn_name:"approve_and_release",args,sub_invokes:&[] } }]).try_approve_and_release(&f.id,&f.mid,&f.evidence).is_err());
    assert_eq!(f.m().paid,0);
}
#[test] fn client_cannot_sign_resolver_settlement() {
    let f=Fixture::new(); f.submit(); f.dispute();
    let args=(&f.id,&f.mid,&true).into_val(&f.e);
    assert!(f.api().mock_auths(&[MockAuth { address:&f.client,invoke:&MockAuthInvoke { contract:&f.contract,fn_name:"resolve_dispute",args,sub_invokes:&[] } }]).try_resolve_dispute(&f.id,&f.mid,&true).is_err());
    assert_eq!(f.balance(&f.contract),10_000_000);
}
#[test] fn wrong_wallet_cannot_accept_or_fund() {
    let f=Fixture::new();
    assert!(f.api().mock_auths(&[MockAuth { address:&f.client,invoke:&MockAuthInvoke { contract:&f.contract,fn_name:"accept_agreement",args:(&f.id,&f.terms).into_val(&f.e),sub_invokes:&[] } }]).try_accept_agreement(&f.id,&f.terms).is_err());
    f.e.mock_all_auths(); f.accept();
    assert!(f.api().mock_auths(&[MockAuth { address:&f.worker,invoke:&MockAuthInvoke { contract:&f.contract,fn_name:"fund_milestone",args:(&f.id,&f.mid).into_val(&f.e),sub_invokes:&[] } }]).try_fund_milestone(&f.id,&f.mid).is_err());
    assert_eq!(f.m().funded,0);
}
#[test] fn client_cannot_forge_worker_submission() {
    let f=Fixture::new(); f.fund();
    assert!(f.api().mock_auths(&[MockAuth { address:&f.client,invoke:&MockAuthInvoke { contract:&f.contract,fn_name:"submit_work",args:(&f.id,&f.mid,&f.evidence).into_val(&f.e),sub_invokes:&[] } }]).try_submit_work(&f.id,&f.mid,&f.evidence).is_err());
    assert_eq!(f.m().state,State::Funded);
}
#[test] fn ledger_time_never_pays_or_refunds() { let f=Fixture::new(); f.submit(); f.e.ledger().with_mut(|l|l.timestamp+=1_000_000); assert_eq!(f.m().paid,0); assert_eq!(f.m().refunded,0); }
#[test] fn duplicate_agreement_cannot_redirect_wallets() { let f=Fixture::new(); let attacker=Address::generate(&f.e); assert!(f.api().try_create_agreement(&f.id,&f.client,&attacker,&f.resolver,&f.terms,&vec![&f.e,MilestoneSpec{id:f.mid.clone(),amount:1}]).is_err()); assert_eq!(f.api().get_agreement(&f.id).freelancer,f.worker); }
#[test] fn zero_and_negative_amounts_rejected() { let f=Fixture::new(); for amount in [0,-1] { assert!(f.api().try_create_agreement(&f.evidence,&f.client,&f.worker,&f.resolver,&f.terms,&vec![&f.e,MilestoneSpec{id:f.mid.clone(),amount}]).is_err()); } }
#[test] fn duplicate_milestones_rejected() { let f=Fixture::new(); let m=MilestoneSpec{id:f.mid.clone(),amount:1}; assert!(f.api().try_create_agreement(&f.evidence,&f.client,&f.worker,&f.resolver,&f.terms,&vec![&f.e,m.clone(),m]).is_err()); }
#[test] fn resolver_must_be_independent() { let f=Fixture::new(); assert!(f.api().try_create_agreement(&f.evidence,&f.client,&f.worker,&f.client,&f.terms,&vec![&f.e,MilestoneSpec{id:f.mid.clone(),amount:1}]).is_err()); }
#[test] fn multiple_milestones_and_replacement_are_separate() {
    let f=Fixture::new(); f.fund();
    let replacement=Address::generate(&f.e); let other=BytesN::from_array(&f.e,&[3;32]);
    f.api().create_agreement(&f.evidence,&f.client,&replacement,&f.resolver,&f.terms,&vec![&f.e,MilestoneSpec{id:f.mid.clone(),amount:2},MilestoneSpec{id:other.clone(),amount:3}]);
    f.api().accept_agreement(&f.evidence,&f.terms); f.api().fund_milestone(&f.evidence,&other);
    assert_eq!(f.m().funded,10_000_000); assert_eq!(f.api().get_milestone(&f.evidence,&f.mid).funded,0); assert_eq!(f.balance(&f.contract),10_000_003);
}
