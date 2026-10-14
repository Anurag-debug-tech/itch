import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { assert } from '../errors';
import { chainConfig, PASSPHRASE } from './config';
import type { Row } from '../db';

export const nativeAsset = () => Asset.native().contractId(PASSPHRASE);
export const bytes = (hex: string) => {
  assert(/^[a-f0-9]{64}$/.test(hex), 'Invalid commitment');
  return xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));
};
export function wire(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return Buffer.from(value).toString('hex');
  if (Array.isArray(value)) return value.map(wire);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wire(v)]));
  return value;
}
export function contractArgs(method: string, e: Row, expected: Row): xdr.ScVal[] {
  const id = bytes(e.escrowId),
    mid = expected.chainId ? bytes(expected.chainId) : undefined;
  if (method === 'create_agreement')
    return [
      id,
      new Address(e.clientAddress).toScVal(),
      new Address(e.freelancerAddress).toScVal(),
      new Address(e.resolverAddress).toScVal(),
      bytes(e.termsHash),
      xdr.ScVal.scvVec(
        expected.milestones.map((m: Row) =>
          xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
              key: xdr.ScVal.scvSymbol('amount'),
              val: nativeToScVal(BigInt(m.amount), { type: 'i128' }),
            }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('id'), val: bytes(m.chainId) }),
          ]),
        ),
      ),
    ];
  if (method === 'accept_agreement') return [id, bytes(e.termsHash)];
  assert(mid, 'Milestone identifier required');
  if (method === 'submit_work' || method === 'approve_and_release')
    return [id, mid, bytes(expected.submissionHash)];
  if (method === 'raise_dispute') return [id, mid, new Address(expected.actor).toScVal()];
  if (method === 'resolve_dispute') return [id, mid, xdr.ScVal.scvBool(expected.release)];
  assert(['fund_milestone', 'refund_authorized'].includes(method), 'Unsupported contract method');
  return [id, mid];
}
export type Receipt = {
  status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND';
  hash: string;
  ledger?: number;
  envelopeHash?: string;
  events?: { topics: unknown; data: unknown }[];
  latestLedgerCloseTime?: number;
  oldestLedgerCloseTime?: number;
  error?: string;
};
export class StellarRpc {
  readonly config = chainConfig();
  readonly server = new rpc.Server(this.config.rpcUrl, { timeout: 20_000 });
  async network() {
    const network = await this.server.getNetwork();
    assert(network.passphrase === PASSPHRASE, 'RPC is not Stellar Testnet', 503);
  }
  async prepare(address: string, method: string, e: Row, expected: Row) {
    await this.network();
    const account = await this.server.getAccount(address);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(new Contract(e.contractId).call(method, ...contractArgs(method, e, expected)))
      .setTimeout(180)
      .build();
    const prepared = await this.server.prepareTransaction(tx);
    assert(BigInt(prepared.fee) <= 10_000_000n, 'Estimated fee exceeds the one-XLM demo limit');
    return {
      xdr: prepared.toXDR(),
      hash: Buffer.from(prepared.hash()).toString('hex'),
      expiresAt: Number(prepared.timeBounds!.maxTime) * 1000,
    };
  }
  async send(signedXdr: string) {
    await this.network();
    const tx = TransactionBuilder.fromXDR(signedXdr, PASSPHRASE);
    assert(tx instanceof Transaction, 'Fee bump envelopes are not supported');
    const result = await this.server.sendTransaction(tx);
    return { status: result.status, hash: result.hash };
  }
  async receipt(hash: string): Promise<Receipt> {
    await this.network();
    const tx = await this.server.getTransaction(hash);
    if (tx.status !== 'SUCCESS')
      return {
        status: tx.status,
        hash: tx.txHash,
        latestLedgerCloseTime: tx.latestLedgerCloseTime,
        oldestLedgerCloseTime: tx.oldestLedgerCloseTime,
        error: tx.status === 'FAILED' ? 'Stellar execution failed' : undefined,
      };
    const envelope = TransactionBuilder.fromXDR(tx.envelopeXdr, PASSPHRASE);
    const contractBytes = new Address(this.config.contractId).toBuffer();
    const events = tx.events.contractEventsXdr
      .flat()
      .filter(
        (event) =>
          event.contractId &&
          Buffer.from(event.contractId.toBytes()).equals(Buffer.from(contractBytes)),
      )
      .map((event) => ({
        topics: wire(event.body.v0.topics.map(scValToNative)),
        data: wire(scValToNative(event.body.v0.data)),
      }));
    return {
      status: 'SUCCESS',
      hash: tx.txHash,
      ledger: tx.ledger,
      envelopeHash: Buffer.from(envelope.hash()).toString('hex'),
      events,
      latestLedgerCloseTime: tx.latestLedgerCloseTime,
    };
  }
  async read(e: Row, method: 'get_agreement' | 'get_milestone', chainId?: string): Promise<Row> {
    const account = await this.server.getAccount(e.clientAddress);
    const args = [bytes(e.escrowId), ...(chainId ? [bytes(chainId)] : [])];
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(new Contract(e.contractId).call(method, ...args))
      .setTimeout(60)
      .build();
    const result = await this.server.simulateTransaction(tx);
    assert(
      rpc.Api.isSimulationSuccess(result) && result.result,
      'Contract state could not be reconciled',
      503,
    );
    return wire(scValToNative(result.result.retval));
  }
}
