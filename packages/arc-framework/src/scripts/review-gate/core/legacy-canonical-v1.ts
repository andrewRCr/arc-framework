/** Frozen serializer for durable review-gate version-1 identity bytes. */

type PlainJson = null | boolean | number | string | PlainJson[] | { [key: string]: PlainJson };

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

/** Serialize using the exact durable review-gate version-1 byte contract. */
export function canonicalizeReviewGateV1(value: unknown): string {
  const normalized = normalizePlainJson(value, "policy", new WeakSet());
  return JSON.stringify(normalized);
}
