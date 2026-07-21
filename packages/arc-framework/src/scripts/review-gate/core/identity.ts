/** Canonical identities for change sets and plain-data policy. */

import { hashContent } from "../../../lib/manifest/hash.js";
import { canonicalize } from "../../../lib/kernel/index.js";

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

function assertSha(value: string, name: string): void {
  if (!/^[a-f0-9]{40}$/u.test(value)) throw new Error(`${name}: expected a 40-character lowercase hexadecimal digest`);
}

/** Serialize plain JSON through the kernel canonicalization authority. */
export function canonicalizePlainJson(value: unknown): string {
  return canonicalize(value);
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
