'use client';
import { useEffect, useState } from 'react';
import type { Bootstrap, Project } from './types';
import { formatXlm } from '@/lib/stellar/amounts';
const NETWORK = 'Test SDF Network ; September 2015';
async function api(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The Testnet request failed');
  return result;
}
async function freighter() {
  const wallet = await import('@stellar/freighter-api');
  const available = await wallet.isConnected();
  if (!available.isConnected)
    throw new Error(
      'Install or unlock the Freighter browser extension, select Testnet, and try again.',
    );
  const network = await wallet.getNetworkDetails();
  if (network.networkPassphrase !== NETWORK)
    throw new Error('Switch Freighter to Stellar Testnet. Mainnet is never supported.');
  return wallet;
}
export function WalletControls({
  data,
  onChange,
}: {
  data: Bootstrap;
  onChange: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  if (!data.blockchain?.enabled) return null;
  const linked = data.blockchain.wallet;
  async function connect() {
    setBusy(true);
    setMessage('Awaiting wallet approval');
    try {
      const wallet = await freighter(),
        access = await wallet.requestAccess();
      if (access.error) throw new Error(access.error.message);
      const c = await api('/api/wallet', { type: 'challenge', address: access.address });
      const { WebAuth } = await import('@stellar/stellar-sdk');
      const proof = WebAuth.readChallengeTx(c.xdr, c.serverKey, NETWORK, c.domain, c.domain);
      if (proof.clientAccountID !== access.address)
        throw new Error('Wallet challenge address mismatch');
      const signed = await wallet.signTransaction(c.xdr, {
        networkPassphrase: NETWORK,
        address: access.address,
      });
      if (signed.error) throw new Error(signed.error.message);
      await api('/api/wallet', { type: 'verify', id: c.id, signedXdr: signed.signedTxXdr });
      await onChange();
      setMessage('Wallet ownership verified on Testnet');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet connection failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel panel-body wallet-controls">
      <strong>TESTNET ONLY — NO REAL MONEY</strong>
      <span>
        Stellar Testnet ·{' '}
        {linked ? (
          <code title={linked.address}>
            {linked.address.slice(0, 8)}…{linked.address.slice(-8)}
          </code>
        ) : (
          'Wallet not connected'
        )}
      </span>
      <button className="btn secondary" disabled={busy} onClick={connect}>
        {busy ? 'Awaiting Wallet Approval' : linked ? 'Reconnect Wallet' : 'Connect Wallet'}
      </button>
      {linked && (
        <button
          className="muted-link"
          disabled={busy}
          onClick={async () => {
            try {
              await api('/api/wallet', { type: 'disconnect' });
              await onChange();
              setMessage('Disconnected. Existing escrow beneficiaries remain fixed.');
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Disconnect failed');
            }
          }}
        >
          Disconnect Wallet
        </button>
      )}
      <small role="status">{message}</small>
      <small>Use a funded conventional Testnet account. Private keys stay in Freighter.</small>
    </div>
  );
}
export function StellarBalances({ data, projectId }: { data: Bootstrap; projectId?: string }) {
  const escrows =
    data.blockchain?.escrows.filter((e) => !projectId || e.projectId === projectId) || [];
  const ids = new Set(escrows.map((e) => e.id));
  const ms = data.blockchain?.milestones.filter((m) => ids.has(m.escrowRef)) || [];
  if (!escrows.length) return null;
  const sum = (key: 'funded' | 'paid' | 'refunded') => ms.reduce((s, m) => s + BigInt(m[key]), 0n);
  return (
    <div className="panel panel-body">
      <strong>TESTNET ONLY — NO REAL MONEY</strong>
      <p>Stellar Testnet XLM · Confirmed balances, separate from simulated INR</p>
      <div className="button-row wrap">
        <span>
          In escrow:{' '}
          <strong>{formatXlm((sum('funded') - sum('paid') - sum('refunded')).toString())}</strong>
        </span>
        <span>
          Released: <strong>{formatXlm(sum('paid').toString())}</strong>
        </span>
        <span>
          Refunded: <strong>{formatXlm(sum('refunded').toString())}</strong>
        </span>
      </div>
    </div>
  );
}
export function StellarEscrowPanel({
  data,
  project,
  onChange,
}: {
  data: Bootstrap;
  project: Project;
  onChange: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [reason, setReason] = useState(''),
    [outcome, setOutcome] = useState('RELEASE');
  const chain = data.blockchain;
  const escrows = chain?.escrows.filter((e) => e.projectId === project.id) || [];
  const latest = data.agreements
    .filter((a) => a.projectId === project.id)
    .sort((a, b) => b.version - a.version)[0];
  const attempts = chain?.transactions.filter((t) => t.projectId === project.id) || [];
  const pending = attempts.filter((t) => !['CONFIRMED', 'FAILED', 'EXPIRED'].includes(t.status));
  const pendingIds = pending.map((t) => t.id).join(',');
  useEffect(() => {
    if (!pendingIds) return;
    let running = false,
      active = true;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        for (const id of pendingIds.split(','))
          await api('/api/stellar', { type: 'reconcile', id });
        if (active) await onChange();
      } catch (error) {
        if (active)
          setMessage(
            error instanceof Error ? error.message : 'Confirmation unavailable. Use Reconcile.',
          );
      } finally {
        running = false;
      }
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pendingIds, onChange]);
  if (project.financialMode !== 'STELLAR_TESTNET') return null;
  async function authorize(input: Record<string, unknown>, resume = false) {
    setBusy(true);
    setMessage('Preparing Testnet transaction');
    try {
      if (!chain?.wallet) throw new Error('Connect and verify your Testnet wallet first.');
      const prepared = await api('/api/stellar', { ...input, type: resume ? 'resume' : 'prepare' });
      if (!prepared.xdr) {
        setMessage(
          `Transaction ${prepared.status.toLowerCase().replaceAll('_', ' ')}. Reconcile the existing intent before retrying.`,
        );
        await onChange();
        return;
      }
      const wallet = await freighter(),
        selected = await wallet.getAddress();
      if (selected.address !== chain.wallet.address)
        throw new Error(
          'Select your verified wallet in Freighter. Existing escrow participant addresses are fixed.',
        );
      setMessage('Awaiting Wallet Approval');
      const signed = await wallet.signTransaction(prepared.xdr, {
        networkPassphrase: NETWORK,
        address: chain.wallet.address,
      });
      if (signed.error) throw new Error(signed.error.message);
      const submitted = await api('/api/stellar', {
        type: 'submit',
        id: prepared.id,
        signedXdr: signed.signedTxXdr,
      });
      setMessage(
        submitted.status === 'PENDING'
          ? 'Transaction Pending'
          : submitted.status.replaceAll('_', ' '),
      );
      await onChange();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transaction failed');
      // A failed refresh must not turn a handled wallet/network error into an unhandled rejection.
      await onChange().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stellar-escrow" aria-label="Stellar Testnet escrow">
      <div className="panel-head">
        <div>
          <h2>On-Chain Escrow Status</h2>
          <p>TESTNET ONLY — NO REAL MONEY · XLM only</p>
        </div>
      </div>
      <div className="panel-body form-stack">
        {!chain?.configured && (
          <p role="alert">
            The Testnet escrow contract must be deployed and configured before wallet transactions
            can begin.
          </p>
        )}
        {latest?.status === 'ACTIVE' &&
          !escrows.some((e) => e.agreementId === latest.id) &&
          data.user.id === project.clientId && (
            <button
              className="btn primary"
              disabled={busy || !chain?.configured}
              onClick={() => authorize({ method: 'create_agreement', agreementId: latest.id })}
            >
              Create On-Chain Agreement
            </button>
          )}
        {latest?.status !== 'ACTIVE' && (
          <p>
            Both parties must accept the current application agreement in the Agreement tab first.
          </p>
        )}
        {escrows.map((e) => (
          <div className="snapshot form-stack" key={e.id}>
            <strong>
              Agreement {e.agreementId === latest?.id ? 'current' : 'prior engagement'} ·{' '}
              {e.state.replaceAll('_', ' ')}
            </strong>
            <small className="mono">
              Contract: {e.contractId}
              <br />
              Escrow: {e.escrowId}
              <br />
              Terms commitment: {e.termsHash}
            </small>
            <details>
              <summary>Fixed participant wallets and asset</summary>
              <p className="mono">
                Client: {e.clientAddress}
                <br />
                Freelancer: {e.freelancerAddress}
                <br />
                Resolver: {e.resolverAddress}
                <br />
                Testnet XLM SAC: {e.assetId}
              </p>
            </details>
            {e.state === 'CREATED' && data.user.id === project.clientId && (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  authorize({ method: 'create_agreement', agreementId: e.agreementId })
                }
              >
                Create On-Chain Agreement
              </button>
            )}
            {e.state === 'CREATED_ON_CHAIN' && chain?.wallet?.address === e.freelancerAddress && (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => authorize({ method: 'accept_agreement', escrowRef: e.id })}
              >
                Accept On-Chain Agreement
              </button>
            )}
            {chain?.milestones
              .filter((m) => m.escrowRef === e.id)
              .map((m) => {
                const local = data.milestones.find((v) => v.id === m.milestoneId);
                if (!local) return null;
                const file = data.submissions.some((s) => s.milestoneId === m.milestoneId);
                const client = chain.wallet?.address === e.clientAddress,
                  worker = chain.wallet?.address === e.freelancerAddress;
                const invoke = (method: string, extra: Record<string, unknown> = {}) =>
                  authorize({ method, escrowRef: e.id, milestoneId: m.milestoneId, ...extra });
                return (
                  <div className="form-stack" key={m.milestoneId}>
                    <strong>
                      {local.title} · {formatXlm(m.amount)} · {m.state}
                    </strong>
                    <small>
                      Confirmed deposit {formatXlm(m.funded)} · Paid {formatXlm(m.paid)} · Refunded{' '}
                      {formatXlm(m.refunded)}
                    </small>
                    {m.submissionHash && m.submissionHash !== '0'.repeat(64) && (
                      <small className="mono">Submission commitment: {m.submissionHash}</small>
                    )}
                    <div className="button-row wrap">
                      {client &&
                        e.state === 'ACTIVE' &&
                        m.state === 'AwaitingFunding' &&
                        !local.archived && (
                          <button
                            className="btn primary"
                            disabled={busy}
                            onClick={() => invoke('fund_milestone')}
                          >
                            Fund Milestone On-Chain
                          </button>
                        )}
                      {worker &&
                        file &&
                        ['Funded', 'Submitted'].includes(m.state) &&
                        !local.archived && (
                          <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() => invoke('submit_work')}
                          >
                            Record Submission Commitment
                          </button>
                        )}
                      {client &&
                        local.status === 'ACCEPTED' &&
                        m.state === 'Submitted' &&
                        !local.archived && (
                          <button
                            className="btn primary"
                            disabled={busy}
                            onClick={() => invoke('approve_and_release')}
                          >
                            Approve and Release Testnet XLM
                          </button>
                        )}
                      {(client || worker) && ['Funded', 'Submitted'].includes(m.state) && (
                        <button
                          className="btn secondary"
                          disabled={busy || reason.trim().length < 10}
                          onClick={() => invoke('raise_dispute', { reason })}
                        >
                          Raise On-Chain Dispute
                        </button>
                      )}
                      {data.user.role === 'ADMIN' &&
                        chain.wallet?.address === e.resolverAddress &&
                        m.state === 'Disputed' && (
                          <button
                            className="btn primary"
                            disabled={busy || reason.trim().length < 10}
                            onClick={() =>
                              invoke(
                                outcome === 'REFUND' ? 'refund_authorized' : 'resolve_dispute',
                                { release: outcome === 'RELEASE', rationale: reason },
                              )
                            }
                          >
                            Authorize Testnet Settlement
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
          </div>
        ))}
        <label className="field">
          <span>Dispute reason or resolver rationale</span>
          <textarea
            rows={2}
            maxLength={3000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="At least 10 characters. This text stays off-chain."
          />
        </label>
        {data.user.role === 'ADMIN' && (
          <label className="field">
            <span>On-chain settlement outcome</span>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="RELEASE">Release to original freelancer</option>
              <option value="REFUND">Refund to original client</option>
            </select>
          </label>
        )}
        <p role="status">{message}</p>
        <h3>Blockchain Transaction History</h3>
        {attempts.length === 0 ? (
          <p>No blockchain transactions yet.</p>
        ) : (
          attempts.map((t) => (
            <div className="activity-row" key={t.id}>
              <div>
                <strong>{t.method.replaceAll('_', ' ')}</strong>
                <p>
                  {t.status === 'CONFIRMED'
                    ? 'Transaction Confirmed'
                    : t.status === 'FAILED'
                      ? 'Transaction Failed'
                      : t.status.replaceAll('_', ' ')}
                </p>
                {t.error && <small>{t.error}</small>}
                {t.txHash && (
                  <a
                    className="text-link mono"
                    href={`https://stellar.expert/explorer/testnet/tx/${t.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Stellar Explorer · {t.txHash.slice(0, 12)}…
                  </a>
                )}
              </div>
              <div className="button-row">
                {t.status === 'AWAITING_SIGNATURE' && t.userId === data.user.id && (
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => authorize({ id: t.id }, true)}
                  >
                    Resume Wallet Approval
                  </button>
                )}
                {!['CONFIRMED', 'FAILED', 'EXPIRED'].includes(t.status) && (
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const r = await api('/api/stellar', { type: 'reconcile', id: t.id });
                        setMessage(r.status.replaceAll('_', ' '));
                        await onChange();
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : 'Reconciliation failed');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Reconcile
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <small>
          Only verified network confirmations update balances. Wallet disconnect, recovery and the
          local demo clock cannot redirect or reset escrow funds.
        </small>
      </div>
    </section>
  );
}
