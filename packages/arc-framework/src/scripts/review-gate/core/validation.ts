/** Runtime validation helpers for normalized review records. */

/** Error raised when an untrusted review record violates its schema. */
export class ReviewRecordValidationError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ReviewRecordValidationError";
  }
}

/** Narrow an unknown value to a plain object. */
export function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReviewRecordValidationError(path, "expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ReviewRecordValidationError(path, "expected a plain object");
  }
  return value as Record<string, unknown>;
}

/** Reject fields outside a record's closed schema. */
export function exactKeys(record: Record<string, unknown>, keys: readonly string[], path: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown !== undefined) throw new ReviewRecordValidationError(`${path}.${unknown}`, "unknown field");
}

/** Read a non-empty string. */
export function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ReviewRecordValidationError(path, "expected a non-empty string");
  }
  return value;
}

/** Read a lowercase hexadecimal digest of a fixed length. */
export function digestAt(value: unknown, path: string, length = 64): string {
  const text = stringAt(value, path);
  if (!new RegExp(`^[a-f0-9]{${length}}$`, "u").test(text)) {
    throw new ReviewRecordValidationError(path, `expected ${length} lowercase hexadecimal characters`);
  }
  return text;
}

/** Read an integer within an inclusive range. */
export function integerAt(value: unknown, path: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new ReviewRecordValidationError(path, `expected an integer >= ${minimum}`);
  }
  return value as number;
}

/** Read a member of a closed string set. */
export function enumAt<const T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new ReviewRecordValidationError(path, `expected one of: ${values.join(", ")}`);
  }
  return value as T;
}

/** Read an array and parse every item. */
export function arrayAt<T>(value: unknown, path: string, parse: (item: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) throw new ReviewRecordValidationError(path, "expected an array");
  return value.map((item, index) => parse(item, `${path}[${index}]`));
}

/** Read an optional field through its parser. */
export function optionalAt<T>(value: unknown, path: string, parse: (item: unknown, path: string) => T): T | undefined {
  return value === undefined ? undefined : parse(value, path);
}

/** Require schema version one. */
export function schemaOneAt(value: unknown, path: string): 1 {
  if (value !== 1) throw new ReviewRecordValidationError(path, "expected schema version 1");
  return 1;
}
