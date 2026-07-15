import Decimal from 'break_infinity.js';

/** Shorthand constructor. All game values (currencies, speed, costs) are Decimals — never native numbers. */
export function D(value: number | string | Decimal): Decimal {
  return new Decimal(value);
}

export const ZERO = D(0);
export const ONE = D(1);

export { Decimal };
