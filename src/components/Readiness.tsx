'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { Bootstrap, Dispute, Audit } from './types';
import { formatXlm, parseXlm } from '@/lib/stellar/amounts';
const words = (s: string) =>
  s
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
const date = (s: string) => new Date(s).toLocaleString('en-IN');
const amount = (n: string, currency: string) =>
  currency === 'XLM'
    ? formatXlm(n)
    : `₹${(BigInt(n) / 100n).toLocaleString('en-IN')}.${(BigInt(n) % 100n).toString().padStart(2, '0')}`;
async function post(url: string, payload: unknown) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || 'Request failed');
  return body;
}
const failure = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');
export type ScopeAdvice = {
  source: string;
  deliverables: string[];
  missingRequirements: string[];
  ambiguities: string[];
  suggestedMilestones: { title: string; description: string }[];
};
export function ScopeAdvicePanel({
  advice,
  title,
  onUse,
}: {
  advice: ScopeAdvice;
  title: string;
  onUse: (value: string) => void;
}) {
  const [deliverables, setDeliverables] = useState(advice.deliverables.join('\n'));
  return (
    <section className="panel readiness-panel">
      <div className="panel-head">
        <div>
          <h2>Scope Doctor report · {title}</h2>
          <p>{advice.source}</p>
        </div>
      </div>
      <div className="panel-body form-stack">
        <label className="field">
          <span>Proposed deliverables — edit before using</span>
          <textarea
            value={deliverables}
            onChange={(e) => setDeliverables(e.target.value)}
            rows={3}
          />
        </label>
        <button type="button" className="btn secondary" onClick={() => onUse(deliverables)}>
          Append edited deliverables to project scope
        </button>
        <h4>Missing requirements to confirm</h4>
        <ul>
          {advice.missingRequirements.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <h4>Ambiguities to resolve</h4>
        <ul>
          {advice.ambiguities.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <h4>Suggested milestone outline</h4>
        <ul>
          {advice.suggestedMilestones.map((m, i) => (
            <li key={i}>
              <strong>{m.title}</strong> · {m.description}
            </li>
          ))}
        </ul>
        <small>
          Edit the actual milestone scope, budget and criteria below. These suggestions become
          binding only after both parties accept the agreement.
        </small>
      </div>
    </section>
  );
}
export function PaymentHistoryPanel({
  data,
  projectId,
  onChange,
}: {
  data: Bootstrap;
  projectId?: string;
  onChange: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const rows = (data.paymentHistory || []).filter((r) => !projectId || r.projectId === projectId);
  return (
    <section className="panel readiness-panel">
      <div className="panel-head">
        <div>
          <h2>Payment acknowledgements and timeline</h2>
          <p>
            Authorization, adapter confirmation and recipient acknowledgement are separate events.
          </p>
        </div>
      </div>
      <div className="panel-body form-stack">
        {!rows.length && <p>No payment requests recorded.</p>}
        {rows.map((r) => (
          <article className="snapshot form-stack" key={r.reference}>
            <strong>
              {words(r.kind)} · {amount(r.amountMinor, r.currency)} · {words(r.status)}
            </strong>
            <small>
              {data.projects.find((p) => p.id === r.projectId)?.title} /{' '}
              {data.milestones.find((m) => m.id === r.milestoneId)?.title}
            </small>
            <small>
              {r.mode === 'LOCAL_DEMO'
                ? 'DEMO MODE — NO REAL MONEY IS HELD OR TRANSFERRED.'
                : 'TESTNET ONLY — NO REAL MONEY · XLM'}
            </small>
            <ol>
              {r.events.map((e, i) => (
                <li key={i}>
                  {words(r.kind)} {words(e.phase)} ·{' '}
                  {e.createdAt ? date(e.createdAt) : 'Timestamp not recorded'}
                </li>
              ))}
            </ol>
            {!r.events.some((e) => e.phase === 'REQUESTED') && (
              <small>
                Historical request timestamp was not recorded; the stored confirmation is shown.
              </small>
            )}
            {r.acknowledgedAt ? (
              <p>Recipient acknowledgement recorded · {date(r.acknowledgedAt)}</p>
            ) : r.eligibleUserId === data.user.id &&
              ['CONFIRMED', 'SIMULATED_CONFIRMED'].includes(r.status) ? (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await post('/api/actions', {
                      type: 'acknowledgePayment',
                      reference: r.reference,
                    });
                    await onChange();
                    setMessage('Acknowledgement recorded. No new payment was initiated.');
                  } catch (e) {
                    setMessage(failure(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Acknowledge {r.kind.toLowerCase()}
              </button>
            ) : (
              <small>
                Recipient acknowledgement pending; this does not change the adapter&apos;s financial
                confirmation.
              </small>
            )}
            {r.txHash && (
              <a
                className="text-link"
                target="_blank"
                rel="noreferrer"
                href={`https://stellar.expert/explorer/testnet/tx/${r.txHash}`}
              >
                View Testnet confirmation
              </a>
            )}
          </article>
        ))}
        <p role="status">{message}</p>
      </div>
    </section>
  );
}
type Brief = {
  source: string;
  points: { point: string; referenceIds: string[] }[];
  missingEvidence: string[];
  questions: string[];
};
export function DisputeReviewPanel({
  data,
  dispute: d,
  onChange,
}: {
  data: Bootstrap;
  dispute: Dispute;
  onChange: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [reviewer, setReviewer] = useState(d.assignedReviewerId || ''),
    [useAi, setUseAi] = useState(false),
    [brief, setBrief] = useState<Brief | null>(null);
  const milestone = data.milestones.find((m) => m.id === d.milestoneId),
    submissions = data.submissions
      .filter((s) => s.milestoneId === d.milestoneId)
      .sort((a, b) => a.version - b.version);
  return (
    <details className="snapshot form-stack readiness-panel">
      <summary>Inspect criteria, submission versions and reviewer</summary>
      <p>
        <strong>Payment blocking:</strong>{' '}
        {d.status === 'OPEN'
          ? 'Open dispute; ordinary payout is blocked.'
          : 'Resolution recorded; inspect the financial confirmation separately.'}
      </p>
      <h4>Agreed criteria</h4>
      <ul>
        {milestone?.criteria.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      <h4>Submission versions</h4>
      {submissions.length ? (
        submissions.map((s) => (
          <div key={s.id}>
            <a className="text-link" href={`/api/files/${s.id}`} download>
              Version {s.version} · {s.fileName}
            </a>
            <p>{s.verification.checks.map((c) => `${c.name}: ${c.result}`).join(' · ')}</p>
            <small>SHA-256: {s.hash}</small>
          </div>
        ))
      ) : (
        <p>No deliverable evidence recorded.</p>
      )}
      <p>
        Assigned reviewer:{' '}
        {data.users.find((u) => u.id === d.assignedReviewerId)?.name || 'Unassigned'}
      </p>
      {d.resolvedAt && (
        <p>
          Resolved by {data.users.find((u) => u.id === d.resolvedBy)?.name || 'Authorized reviewer'}{' '}
          · {date(d.resolvedAt)}
        </p>
      )}
      {data.user.role === 'ADMIN' && d.status === 'OPEN' && (
        <div className="button-row wrap">
          <label className="field">
            <span>Dispute reviewer</span>
            <select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
              <option value="">Select reviewer</option>
              {data.users
                .filter((u) => u.role === 'ADMIN')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="btn secondary"
            disabled={busy || !reviewer}
            onClick={async () => {
              setBusy(true);
              try {
                await post('/api/actions', {
                  type: 'assignDispute',
                  disputeId: d.id,
                  reviewerId: reviewer,
                });
                await onChange();
                setMessage('Reviewer assignment recorded.');
              } catch (e) {
                setMessage(failure(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Assign reviewer
          </button>
        </div>
      )}
      <label className="check-label">
        <input
          type="checkbox"
          checked={useAi}
          disabled={data.ai?.mode === 'Rule-based assistance' || !data.ai}
          onChange={(e) => setUseAi(e.target.checked)}
        />
        Use optional AI for this brief
      </label>
      <small>
        AI receives authorized claims and evidence metadata only. It cannot decide liability or move
        money. Without credentials, the evidence brief uses rules.
      </small>
      <button
        className="btn secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setBrief(await post('/api/disputes', { disputeId: d.id, useAi }));
          } catch (e) {
            setMessage(failure(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Prepare evidence brief
      </button>
      {brief && (
        <div className="form-stack">
          <strong>{brief.source}</strong>
          <ul>
            {brief.points.map((p, i) => (
              <li key={i}>
                {p.point}
                <small>References: {p.referenceIds.join(', ')}</small>
              </li>
            ))}
          </ul>
          <h4>Missing evidence</h4>
          <ul>
            {brief.missingEvidence.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h4>Questions for human review</h4>
          <ul>
            {brief.questions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
export function RiskPolicyPanel({
  data,
  onChange,
}: {
  data: Bootstrap;
  onChange: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const policy = data.riskPolicy || {
    checkinHours: 48,
    attentionHours: 48,
    riskHours: 72,
    deadlineGraceHours: 48,
  };
  return (
    <section className="panel readiness-panel">
      <div className="panel-head">
        <div>
          <h2>Monitoring policy</h2>
          <p>Explainable rules; no fraud prediction or automatic payment.</p>
        </div>
      </div>
      <form
        className="panel-body form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const fd = new FormData(e.currentTarget);
          try {
            await post('/api/actions', {
              type: 'updateRiskPolicy',
              policy: Object.fromEntries(Object.keys(policy).map((k) => [k, Number(fd.get(k))])),
            });
            await onChange();
            setMessage('Monitoring policy saved and audited.');
          } catch (error) {
            setMessage(failure(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {(
          [
            ['checkinHours', 'Progress check-in interval (hours)'],
            ['attentionHours', 'Attention after inactivity (hours)'],
            ['riskHours', 'At-risk after inactivity (hours)'],
            ['deadlineGraceHours', 'Deadline escalation grace (hours)'],
          ] as const
        ).map(([key, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              type="number"
              name={key}
              required
              min={key === 'deadlineGraceHours' ? 0 : 1}
              max="720"
              defaultValue={policy[key]}
            />
          </label>
        ))}
        <p>
          Changing monitoring thresholds does not change signed deadlines. Extensions still need
          both parties&apos; agreement.
        </p>
        <button className="btn secondary" disabled={busy}>
          Save monitoring policy
        </button>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}
export function LegalOrdersPanel({
  data,
  onChange,
}: {
  data: Bootstrap;
  onChange: () => Promise<unknown>;
}) {
  const [projectId, setProjectId] = useState(data.projects[0]?.id || ''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const project = data.projects.find((p) => p.id === projectId),
    currency = project?.financialMode === 'STELLAR_TESTNET' ? 'XLM' : 'INR';
  const milestones = data.milestones.filter((m) => m.projectId === projectId);
  async function mutate(payload: unknown) {
    setBusy(true);
    try {
      await post('/api/legal-orders', payload);
      await onChange();
      setMessage('Administrative record saved. No financial action was initiated.');
    } catch (e) {
      setMessage(failure(e));
    } finally {
      setBusy(false);
    }
  }
  async function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      fd = new FormData(form),
      value = String(fd.get('amount'));
    let maximum: string;
    try {
      if (currency === 'XLM') maximum = parseXlm(value);
      else {
        if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))
          throw new Error('Enter INR with at most two decimal places');
        const [w, f = ''] = value.split('.');
        maximum = (BigInt(w) * 100n + BigInt(f.padEnd(2, '0'))).toString();
      }
    } catch (error) {
      setMessage(failure(error));
      return;
    }
    const outcomes =
      fd.get('outcomes') === 'BOTH' ? ['RELEASE', 'REFUND'] : [String(fd.get('outcomes'))];
    await mutate({
      ...Object.fromEntries(fd),
      type: 'record',
      projectId,
      milestoneIds: fd.getAll('milestoneIds'),
      maxAmountMinor: maximum,
      outcomes,
      fictional: fd.get('fictional') === 'on',
    });
  }
  return (
    <section className="panel readiness-panel">
      <div className="panel-head">
        <div>
          <h2>External legal-order register</h2>
          <p>
            Administrative recordkeeping. The platform is not a court, arbitrator or legal adviser.
          </p>
        </div>
      </div>
      <div className="panel-body form-stack">
        <p>
          Document claims grant no financial authority. A qualified reviewer must assess
          authenticity, jurisdiction and scope. Record an already confirmed, separately authorized
          transaction only after that review.
        </p>
        <details>
          <summary>Record an external order</summary>
          <form className="form-stack" onSubmit={record}>
            <label className="field">
              <span>Order project</span>
              <select required value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Choose project</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Order reference</span>
              <input name="reference" required maxLength={250} />
            </label>
            <label className="field">
              <span>Issuing authority</span>
              <input name="authority" required maxLength={250} />
            </label>
            <label className="field">
              <span>Private document or record location</span>
              <input name="documentReference" required maxLength={500} />
            </label>
            <label className="field">
              <span>Receipt date</span>
              <input
                name="receivedAt"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label className="field">
              <span>Claimed authorized scope</span>
              <textarea name="scope" required rows={3} maxLength={4000} />
            </label>
            <label className="field">
              <span>Affected milestones</span>
              <select
                key={projectId}
                name="milestoneIds"
                multiple
                required
                defaultValue={milestones[0] ? [milestones[0].id] : []}
              >
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Claimed permitted outcomes</span>
              <select name="outcomes">
                <option value="RELEASE">Release</option>
                <option value="REFUND">Refund</option>
                <option value="BOTH">Release and refund</option>
              </select>
            </label>
            <label className="field">
              <span>Maximum authorized amount ({currency})</span>
              <input name="amount" type="text" inputMode="decimal" required />
            </label>
            <label className="check-label">
              <input name="fictional" type="checkbox" defaultChecked />
              Fictional hackathon example
            </label>
            <button className="btn secondary" disabled={busy || !projectId}>
              Save unverified order
            </button>
          </form>
        </details>
        {(data.legalOrders || []).map((order) => (
          <article className="snapshot form-stack" key={order.id}>
            <strong>
              {order.reference} · {words(order.status)}
            </strong>
            <p>
              {order.authority} · Received {order.receivedAt}
              {order.fictional ? ' · FICTIONAL DEMO' : ''}
            </p>
            <p>{order.scope}</p>
            <p>
              Authentication: {words(order.authenticationStatus)}. Reviewed scope maximum:{' '}
              {amount(order.maxAmountMinor, order.currency)}.
            </p>
            {order.status === 'UNVERIFIED' && (
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  await mutate({
                    ...Object.fromEntries(fd),
                    type: 'review',
                    orderId: order.id,
                    attestation: fd.get('attestation') === 'on',
                  });
                }}
              >
                <label className="field">
                  <span>Qualified external reviewer name</span>
                  <input name="reviewerName" required maxLength={250} />
                </label>
                <label className="field">
                  <span>Authentication method and supporting evidence</span>
                  <textarea name="authenticationBasis" required maxLength={4000} />
                </label>
                <label className="field">
                  <span>Jurisdiction and authorized scope assessment</span>
                  <textarea name="jurisdictionAndScope" required maxLength={4000} />
                </label>
                <label className="field">
                  <span>External reviewer finding</span>
                  <select name="verdict">
                    <option value="REJECTED">Rejected / not authenticated</option>
                    <option value="VERIFIED">Verified by qualified external reviewer</option>
                  </select>
                </label>
                <label className="check-label">
                  <input name="attestation" type="checkbox" required />I am recording a qualified
                  reviewer&apos;s findings; this grants no payment authority.
                </label>
                <button className="btn secondary" disabled={busy}>
                  Record external review
                </button>
              </form>
            )}
            {order.review && (
              <p>
                External reviewer: {order.review.reviewerName} · Recorded{' '}
                {date(order.review.recordedAt)}. {order.review.authenticationBasis}{' '}
                {order.review.jurisdictionAndScope}
              </p>
            )}
            <h4>Recorded execution history</h4>
            {order.executions.length ? (
              order.executions.map((x) => (
                <p key={x.id}>
                  {x.outcome} · {amount(x.amountMinor, order.currency)} · {date(x.createdAt)} ·{' '}
                  {x.sourceRef}
                </p>
              ))
            ) : (
              <p>No confirmed execution linked. Recording this order did not move funds.</p>
            )}
            {order.status === 'REVIEW_RECORDED' && (
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await mutate({
                    type: 'recordExecution',
                    orderId: order.id,
                    reference: new FormData(e.currentTarget).get('reference'),
                  });
                }}
              >
                <label className="field">
                  <span>Existing confirmed settlement</span>
                  <select name="reference" required defaultValue="">
                    <option value="">Select a separately confirmed settlement</option>
                    {(data.paymentHistory || [])
                      .filter(
                        (r) =>
                          r.projectId === order.projectId &&
                          r.kind !== 'FUNDING' &&
                          order.milestoneIds.includes(r.milestoneId) &&
                          order.outcomes.includes(r.kind === 'PAYOUT' ? 'RELEASE' : 'REFUND') &&
                          ['CONFIRMED', 'SIMULATED_CONFIRMED'].includes(r.status),
                      )
                      .map((r) => (
                        <option value={r.reference} key={r.reference}>
                          {r.kind} · {amount(r.amountMinor, r.currency)} · {r.reference}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="btn secondary" disabled={busy}>
                  Link confirmed execution
                </button>
              </form>
            )}
          </article>
        ))}
        <p role="status">{message}</p>
      </div>
    </section>
  );
}
export function AuditHistory({
  data,
  projectId,
  limit = 30,
}: {
  data: Bootstrap;
  projectId?: string;
  limit?: number;
}) {
  const [rows, setRows] = useState<Audit[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const latest = data.audit[0]?.id || '',
    userId = data.user.id;
  const query = (next?: string) =>
    '/api/history?' +
    new URLSearchParams({
      limit: String(limit),
      ...(projectId ? { projectId } : {}),
      ...(next ? { cursor: next } : {}),
    });
  useEffect(() => {
    const controller = new AbortController();
    const url =
      '/api/history?' +
      new URLSearchParams({ limit: String(limit), ...(projectId ? { projectId } : {}) });
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw new Error(value.error || 'History unavailable');
        if (!controller.signal.aborted) {
          setRows(value.items);
          setCursor(value.nextCursor);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMessage(failure(e));
      });
    return () => controller.abort();
  }, [projectId, limit, latest, userId]);
  return (
    <div className="activity-list">
      {!rows.length && !message && <p>No recorded activity on this page.</p>}
      {rows.map((a) => (
        <div className="activity-row" key={a.id}>
          <div>
            <strong>{words(a.action)}</strong>
            <small>
              {data.users.find((u) => u.id === a.actorId)?.name || 'System'}
              {a.projectId
                ? ' · ' + (data.projects.find((p) => p.id === a.projectId)?.title || 'Project')
                : ''}
            </small>
            {a.detail != null && (
              <details>
                <summary>View recorded details</summary>
                <pre>
                  {typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail, null, 2)}
                </pre>
              </details>
            )}
          </div>
          <time>{date(a.createdAt)}</time>
        </div>
      ))}
      {cursor && (
        <button
          className="btn secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch(query(cursor)),
                body = await r.json();
              if (!r.ok) throw new Error(body.error);
              setRows((old) => [
                ...new Map([...old, ...body.items].map((r: Audit) => [r.id, r])).values(),
              ]);
              setCursor(body.nextCursor);
            } catch (e) {
              setMessage(failure(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Load older activity
        </button>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
