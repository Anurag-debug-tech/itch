import { assert } from '../errors';
export const NETWORK = 'STELLAR_TESTNET';
export const PASSPHRASE = 'Test SDF Network ; September 2015';
export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const enabled = () => process.env.STELLAR_TESTNET_ENABLED === 'true';
export function chainConfig() {
  assert(enabled(), 'Stellar Testnet integration is disabled', 503);
  const contractId = process.env.STELLAR_ESCROW_CONTRACT_ID || '';
  assert(
    /^C[A-Z2-7]{55}$/.test(contractId),
    'Deploy/configure the Testnet escrow contract first',
    503,
  );
  // Network endpoints are deliberately fixed. No mainnet or arbitrary RPC/SSRF option exists.
  return { network: NETWORK, passphrase: PASSPHRASE, rpcUrl: RPC_URL, contractId };
}
export function explorer(hash: string) {
  assert(/^[a-f0-9]{64}$/.test(hash), 'Invalid transaction hash');
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
