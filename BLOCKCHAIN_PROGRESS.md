# Stellar Testnet integration progress

## Completed

- Phase 1: clean baseline `aed1803` checkpointed as `codex/pre-stellar-20261014`.
- Phase 2: isolated Rust 1.93.0, Cargo 1.93.0, wasm32v1-none and Stellar CLI 28.1.0 installed and verified. Pinned Soroban SDK 28.0.0 manifest inspected (MSRV 1.91).
- Phases 3–4: minimal contract authored; 28/28 local Soroban security/lifecycle tests passed. Cargo.lock pinned.
- Working branch: `codex/stellar-testnet`.
- SQLite online backup, private uploads and configuration preserved in `data/backups/pre-blockchain-20261014T044216Z/` (ignored, private).
- Development storage separated from the original demonstration database and uploads.
- Phases 5–9: persistent asynchronous intents, session-bound signed wallet challenges, SQLite reconciliation, separate XLM accounting, recovery isolation and existing-page wallet/escrow controls implemented.
- Phase 10: optimized WASM built (9,378 bytes); contract deployed on Stellar Testnet at `CDQODC2CCYGKCUKTXXN24BQK4GMKJLUK4QQOWKJP2POD5W3B5NDC27ID`. Public deployment proof is in `deployments/stellar-testnet.json`.
- Phases 11–12: automated regression/integration checks, live Testnet lifecycle, production browser verification, README, verification record and demo instructions completed. Final production build starts successfully at localhost:3000.

## Remaining

- Actual Freighter installation, wallet setup and popup signing verification (external prerequisite).

## Actual tests

- `sh scripts/contract.sh test --locked -j 2`: 28 passed, 0 failed.
- TypeScript and ESLint passed; Vitest 56/56 passed.
- Original Playwright browser regression suite: 6/6 passed (45.3 seconds, development server).
- Original production browser suite: 6/6 passed (32.1 seconds).
- Real Testnet CLI smoke: 17 confirmed transactions, passed; payout, both dispute outcomes, ghosting/recovery and replacement isolation.
- Testnet browser suite: 1/1 development (2.3 minutes); 2/2 production (2.1 minutes), eight real confirmed transactions. Signing transport fixture explicitly documented; actual Freighter unverified.
- Final production build, TypeScript, ESLint and formatting passed. Startup/login/dashboard/wallet guidance/logout passed at localhost:3000 with zero browser errors.
- Same-wallet intents serialize their sequence stream. Stale agreements with pending amendments cannot create escrows. Confirmation validation and updates share one SQLite write lock.
- Disposable Testnet deployment identity removed after deployment; the application stores no signing keys.
- Original database and all 19 uploads verified unchanged by original SHA-256 manifest.
- Current npm audit: zero critical, five existing high development-tool findings, no runtime finding.
- Live Testnet RPC Protocol 29/passphrase checked; client, freelancer, resolver and replacement fixture wallets funded and cryptographically verified against Horizon.
- Existing baseline results are preserved in `docs/VERIFICATION.md`.

## Current blockers

- Chrome's installed extensions were inspected directly: Freighter is absent in the current profile. Real extension signing cannot yet be claimed. CLI fixture signing is explicitly distinguished from Freighter verification.

## Next exact action

Account owner installs/unlocks Freighter, selects Testnet, funds separate client/freelancer/resolver wallets and completes actual popup signing using `docs/BLOCKCHAIN.md`. Public proof is in `deployments/`; retained fixture databases are under ignored `data/testnet-smoke/` and `data/testnet-browser/`.
