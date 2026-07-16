/**
 * Canonical JSON serialization and content-address digest primitives.
 *
 * The trust core every retirement receipt, snapshot, and stamp hashes against.
 * Structured values serialize to one byte-exact UTF-8 form — object keys in
 * recursively Unicode-codepoint order, strings NFC-normalized, no insignificant
 * whitespace, no trailing newline — and hash to a `sha256:`+64-hex digest that is
 * stable across platforms, Node versions, and checkout settings.
 *
 * Pure and dependency-minimal by design: filesystem, git, and storage reads are
 * injected at the adapter boundary, never reached from here.
 */

import { createHash } from "node:crypto";

/** A content-address digest: `sha256:` followed by exactly 64 lowercase hex characters. */
export type CanonicalDigest = `sha256:${string}`;

const CANONICAL_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

/**
 * Compare two strings by their UTF-8 byte sequence.
 *
 * UTF-8 byte order equals Unicode codepoint order, so this is deliberately not
 * `localeCompare` (locale/ICU-sensitive) and not the default `<`/`>` operators
 * (UTF-16 code-unit order, which mis-sorts astral-plane codepoints).
 */
function compareByCanonicalBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/** Validate and NFC-normalize a value into the canonical plain-data domain. */
function normalize(value: unknown, path: string, ancestors: WeakSet<object>): CanonicalJson {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path}: non-finite numbers are not supported`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`${path}: unsupported value of type ${typeof value}`);
  if (ancestors.has(value)) throw new Error(`${path}: cyclic references are not supported`);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => normalize(item, `${path}[${index}]`, ancestors));
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path}: expected a plain object`);
    }
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      throw new Error(`${path}: symbol keys are not supported`);
    }
    const source = value as Record<string, unknown>;
    const normalized: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(source)) {
      const normalizedKey = key.normalize("NFC");
      if (Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) {
        throw new Error(`${path}: keys collide under NFC normalization at "${normalizedKey}"`);
      }
      normalized[normalizedKey] = normalize(source[key], `${path}.${key}`, ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Serialize a normalized value with recursively codepoint-sorted object keys.
 *
 * Keys are ordered here rather than via `JSON.stringify`, whose object-key
 * iteration reorders integer-like keys ahead of insertion order and would break
 * codepoint ordering.
 */
function serialize(value: CanonicalJson): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(",")}]`;
  }
  const record = value as { readonly [key: string]: CanonicalJson };
  const members = Object.entries(record)
    .sort(([leftKey], [rightKey]) => compareByCanonicalBytes(leftKey, rightKey))
    .map(([key, member]) => `${JSON.stringify(key)}:${serialize(member)}`);
  return `{${members.join(",")}}`;
}

/**
 * Serialize a structured value to its byte-exact canonical UTF-8 JSON form.
 *
 * @param value - Any plain-data value (null, boolean, finite number, string,
 *   array, or plain object of the same)
 * @returns The canonical serialization — codepoint-sorted keys, NFC strings, no
 *   insignificant whitespace, no trailing newline
 * @throws If the value contains a non-finite number, symbol key, cyclic
 *   reference, non-plain object, or any other non-plain-data value
 */
export function canonicalize(value: unknown): string {
  return serialize(normalize(value, "$", new WeakSet()));
}

/**
 * Compute the canonical content-address digest of a structured value.
 *
 * @param value - Any plain-data value accepted by {@link canonicalize}
 * @returns `sha256:` followed by the 64-hex SHA-256 of the canonical bytes
 */
export function canonicalDigest(value: unknown): CanonicalDigest {
  const hex = createHash("sha256").update(canonicalize(value), "utf-8").digest("hex");
  return `sha256:${hex}`;
}

/** Narrow an unknown value to a well-formed {@link CanonicalDigest}. */
export function isCanonicalDigest(value: unknown): value is CanonicalDigest {
  return typeof value === "string" && CANONICAL_DIGEST_PATTERN.test(value);
}

/**
 * Assert that a value is a well-formed {@link CanonicalDigest}.
 *
 * @throws If the value is not `sha256:` plus exactly 64 lowercase hex characters
 */
export function assertCanonicalDigest(value: unknown): asserts value is CanonicalDigest {
  if (!isCanonicalDigest(value)) {
    throw new Error(`expected a sha256:<64 lowercase hex> canonical digest, received ${JSON.stringify(value)}`);
  }
}

/**
 * Order a set-valued array by canonical member bytes.
 *
 * Callers preparing a set (order not semantically meaningful) run this before
 * canonicalizing so equal sets digest identically regardless of input order.
 * Arrays whose order is semantically meaningful are left untouched — the
 * serializer preserves array order.
 *
 * @param members - The set members, each a value accepted by {@link canonicalize}
 * @returns A new array ordered by each member's canonical serialization
 */
export function sortByCanonicalBytes<T>(members: readonly T[]): T[] {
  return members
    .map((member) => ({ member, bytes: canonicalize(member) }))
    .sort((left, right) => compareByCanonicalBytes(left.bytes, right.bytes))
    .map((entry) => entry.member);
}
