/** Classic base-62 fractional indexing, adapted from rocicorp/fractional-indexing (CC0).
 * Algorithm: https://github.com/rocicorp/fractional-indexing/tree/v3.2.0
 * Original derivation: https://observablehq.com/@dgreensp/implementing-fractional-indexing
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MINIMUM_INTEGER = `A${"0".repeat(26)}`;

function integerLength(head: string): number {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - 95;
  if (head >= "A" && head <= "Z") return 92 - head.charCodeAt(0);
  throw new Error(`Invalid rank head: ${head}`);
}

function integerPart(key: string): string {
  const length = integerLength(key[0] ?? "");
  if (length > key.length) throw new Error(`Invalid rank: ${key}`);
  return key.slice(0, length);
}

function validateRank(key: string): void {
  const integer = integerPart(key);
  if (key === MINIMUM_INTEGER || !/^[0-9A-Za-z]+$/u.test(key.slice(1))) {
    throw new Error(`Invalid rank: ${key}`);
  }
  if (key.length > integer.length && key.endsWith("0")) throw new Error(`Invalid rank: ${key}`);
}

function midpoint(lower: string, upper: string | null): string {
  let common = 0;
  while (upper !== null && (lower[common] ?? "0") === upper[common]) common++;
  if (common > 0 && upper !== null) {
    return upper.slice(0, common) + midpoint(lower.slice(common), upper.slice(common));
  }
  const left = DIGITS.indexOf(lower[0] ?? "0");
  const right = upper === null ? 62 : DIGITS.indexOf(upper[0] ?? "");
  if (right - left > 1) return DIGITS[Math.round((left + right) / 2)] ?? "";
  if (upper !== null && upper.length > 1) return upper[0] ?? "";
  return (DIGITS[left] ?? "") + midpoint(lower.slice(1), null);
}

function advanceInteger(integer: string, direction: 1 | -1): string | null {
  const head = integer[0] ?? "";
  const digits = integer.slice(1).split("");
  for (let index = digits.length - 1; index >= 0; index--) {
    const next = DIGITS.indexOf(digits[index] ?? "") + direction;
    if (next >= 0 && next < 62) {
      digits[index] = DIGITS[next] ?? "";
      return head + digits.join("");
    }
    digits[index] = direction === 1 ? "0" : "z";
  }
  return overflowInteger(head, digits, direction);
}

function overflowInteger(head: string, digits: string[], direction: 1 | -1): string | null {
  if (direction === 1 && head === "Z") return "a0";
  if (direction === -1 && head === "a") return "Zz";
  if ((direction === 1 && head === "z") || (direction === -1 && head === "A")) return null;
  const nextHead = String.fromCharCode(head.charCodeAt(0) + direction);
  const grows = direction === 1 ? nextHead > "a" : nextHead < "Z";
  if (grows) digits.push(direction === 1 ? "0" : "z");
  else digits.pop();
  return nextHead + digits.join("");
}

function before(upper: string): string {
  const integer = integerPart(upper);
  if (integer === MINIMUM_INTEGER) return integer + midpoint("", upper.slice(integer.length));
  if (integer < upper) return integer;
  const prior = advanceInteger(integer, -1);
  if (prior === null) throw new Error("Rank beginning exhausted");
  return prior;
}

function after(lower: string): string {
  const integer = integerPart(lower);
  return advanceInteger(integer, 1) ?? integer + midpoint(lower.slice(integer.length), null);
}

/** Produce a classic key; equal ranks must be handled by the placement layer.
 * @param lower - Open or validated lower bound.
 * @param upper - Open or validated upper bound.
 * @returns A rank strictly within those bounds.
 */
export function generateRankBetween(lower: string | null, upper: string | null): string {
  if (lower !== null) validateRank(lower);
  if (upper !== null) validateRank(upper);
  if (lower !== null && upper !== null && lower >= upper) throw new Error("Rank bounds are out of order");
  if (lower === null) return upper === null ? "a0" : before(upper);
  if (upper === null) return after(lower);
  const left = integerPart(lower);
  const right = integerPart(upper);
  if (left === right) return left + midpoint(lower.slice(left.length), upper.slice(right.length));
  const next = advanceInteger(left, 1);
  if (next === null) throw new Error("Rank end exhausted");
  return next < upper ? next : left + midpoint(lower.slice(left.length), null);
}
