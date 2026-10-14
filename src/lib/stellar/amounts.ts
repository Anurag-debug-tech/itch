/** XLM values cross JSON boundaries as decimal strings, never JS numbers. */
import { AppError } from '../errors';
export const XLM_DECIMALS = 7;
export const MAX_ATOMIC = 1_000_000_000_000_000_000n;
export function atomic(value: unknown, allowZero = false): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(value))
    throw new AppError('Use exact XLM atomic units');
  const n = BigInt(value);
  if (n > MAX_ATOMIC || (allowZero ? n < 0n : n <= 0n))
    throw new AppError('XLM amount outside supported limits');
  return n.toString();
}
export function parseXlm(value: string): string {
  if (!/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(value))
    throw new AppError('Enter XLM with at most seven decimal places');
  const [whole, fraction = ''] = value.split('.');
  return atomic((BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'))).toString());
}
export function formatXlm(value: string = '0'): string {
  // Aggregate balances may exceed the limit for any single configured deposit.
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value))
    throw new AppError('Use exact nonnegative XLM atomic units');
  const n = BigInt(value);
  const fraction = (n % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${n / 10_000_000n}${fraction ? '.' + fraction : ''} XLM`;
}
export function xlmInput(value: string): string {
  return formatXlm(value).replace(' XLM', '');
}
