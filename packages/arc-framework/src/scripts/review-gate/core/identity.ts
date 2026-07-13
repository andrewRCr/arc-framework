/** Canonical identities for change sets and plain-data policy. */

import { hashContent } from "../../../lib/manifest/hash.js";

/** Inputs that define one reviewed change set. */
export interface ChangeSetIdentityInput {
  baseRef: string;
  diffBaseSha: string;
  headSha: string;
}

/** Policy identity input with explicitly excluded runtime observations. */
export interface PolicyVersionInput {
  policy: unknown;
  runtime?: unknown;
}

type PlainJson = null | boolean | number | string | PlainJson[] | { [key: string]: PlainJson };

function assertSha(value: string, name: string): void {
  if (!/^[a-f0-9]{40}$/u.test(value)) throw new Error(`${name}: expected a 40-character lowercase hexadecimal digest`);
}

function normalizePlainJson(value: unknown, path: string, ancestors: WeakSet<object>): PlainJson {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path}: non-finite numbers are not supported`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${path}: unsupported plain-data value`);
  if (ancestors.has(value)) throw new Error(`${path}: cyclic values are not supported`);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => normalizePlainJson(item, `${path}[${index}]`, ancestors));
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${path}: expected a plain object`);
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      throw new Error(`${path}: symbol keys are not supported`);
    }
    const record = value as Record<string, unknown>;
    const normalized: Record<string, PlainJson> = {};
    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
      normalized[key] = normalizePlainJson(record[key], `${path}.${key}`, ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

/** Serialize validated plain JSON with recursively sorted object keys. */
export function canonicalizePlainJson(value: unknown): string {
  const normalized = normalizePlainJson(value, "policy", new WeakSet());
  return JSON.stringify(normalized);
}

/** Compute the exact-change identity from NUL-delimited UTF-8 fields. */
export function computeChangeSetId(input: ChangeSetIdentityInput): string {
  if (input.baseRef.length === 0 || input.baseRef.includes("\0")) {
    throw new Error("baseRef: expected a non-empty NUL-free value");
  }
  assertSha(input.diffBaseSha, "diffBaseSha");
  assertSha(input.headSha, "headSha");
  return hashContent(`${input.baseRef}\0${input.diffBaseSha}\0${input.headSha}`);
}

/** Compute the policy digest while excluding runtime observations by construction. */
export function computePolicyVersion(input: PolicyVersionInput): string {
  return hashContent(canonicalizePlainJson(input.policy));
}
