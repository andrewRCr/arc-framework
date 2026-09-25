/**
 * Assert a result that is not yet what it should be, without losing the ability to notice either change.
 *
 * A test marked expected-to-fail passes on every non-pass state, so it cannot tell failing-in-the-known-way
 * from failing for a new reason, and it keeps passing after the behavior is fixed. This assertion takes both
 * shapes instead.
 *
 * @module
 */

/** A subset of a typed result, compared field by field against the whole rather than as a deep equal. */
export type ResultShape = { readonly [field: string]: ShapeValue };

/**
 * What a shape may name. A result carries its identity in discriminants, flags, and path lists; its counts
 * are a reading of the tree the run happened to have, so they are absent here deliberately — a shape naming
 * one would go red on the next base movement without the behavior having changed at all.
 */
export type ShapeValue = string | boolean | null | readonly string[] | ResultShape;

export interface PinnedObservation {
  /** One sentence naming the behavior under test, in its own terms. */
  readonly behavior: string;
  /** The result seen today, held until it changes. */
  readonly observed: ResultShape;
  /** The result the behavior should produce instead. */
  readonly target: ResultShape;
}

function isShape(value: ShapeValue): value is ResultShape {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when every field the shape names is present in `value` and equal to it. */
function matchesShape(value: unknown, shape: ResultShape): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.entries(shape).every(([field, expected]) => {
    if (!(field in record)) return false;
    const found = record[field];
    if (Array.isArray(expected)) {
      return (
        Array.isArray(found) &&
        found.length === expected.length &&
        expected.every((element, index) => found[index] === element)
      );
    }
    if (isShape(expected)) return matchesShape(found, expected);
    return found === expected;
  });
}

/**
 * Identifiers that organize the work rather than describe it. A sentence naming one puts it in the runner's
 * output and in the suite for as long as the call survives, where a reader has nothing to resolve it against.
 */
const ORGANIZING_CITATION =
  /\b(?:tasks?|phases?|rows?|cells?)\s+\d+(?:\.\w+)*|\b(?:meta|spec|draft|tasks|notes|cohort)-[\w-]+\.md\b/iu;

function requireBehaviorSentence(behavior: string): void {
  const cited = ORGANIZING_CITATION.exec(behavior);
  if (cited === null) return;
  throw new Error(
    `The sentence naming this behavior must describe what the code does. It cites ` +
      `${cited[0]}, which a reader of the failure has no way to resolve.`,
  );
}

/**
 * The one run-varying value the field types cannot keep out, since it arrives as an ordinary string. A shape
 * naming one stops describing the behavior and starts describing the tree it happened to run against.
 *
 * A value that is entirely an object id is refused whatever it spells. One that carries an object id inside a
 * longer sentence is refused when the run of hex holds a digit: at seven characters a real object id all but
 * always does, and the English words spelled from `a` to `f` alone do not.
 */
const OBJECT_ID = /^[0-9a-f]{7,40}$/u;
const HEX_RUN = /\b[0-9a-f]{7,40}\b/gu;

function namedObjectId(value: string): string | null {
  if (OBJECT_ID.test(value)) return value;
  for (const [run] of value.matchAll(HEX_RUN)) {
    if (/\d/u.test(run)) return run;
  }
  return null;
}

function requireIdentityValues(shape: ResultShape): void {
  for (const [field, value] of Object.entries(shape)) {
    if (isShape(value)) {
      requireIdentityValues(value);
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    for (const element of values) {
      if (typeof element !== "string") continue;
      const objectId = namedObjectId(element);
      if (objectId === null) continue;
      throw new Error(
        `A shape cannot name an object id: \`${field}\` holds ${objectId}, which changes whenever the ` +
          `base moves. Name the fields that carry the result's identity instead.`,
      );
    }
  }
}

/**
 * A shape naming no fields is satisfied by every object, so it would read as a hold while asserting nothing.
 *
 * @param shape - The shape to check, at every depth.
 * @param side - Which half of the pin is being checked, so the message names it.
 */
function requireDescribableShape(shape: ResultShape, side: string): void {
  if (Object.keys(shape).length === 0) {
    throw new Error(
      `The \`${side}\` shape names no fields, so every result satisfies it and this assertion holds ` +
        `nothing. Name the fields that carry the result's identity.`,
    );
  }
  for (const value of Object.values(shape)) {
    if (isShape(value)) requireDescribableShape(value, side);
  }
}

/** True when two shapes name the same fields with the same values, so neither can distinguish a result. */
function shapesAgree(left: ResultShape, right: ResultShape): boolean {
  const fields = Object.keys(left);
  if (fields.length !== Object.keys(right).length) return false;
  return fields.every((field) => {
    const a = left[field];
    const b = right[field];
    if (a === undefined || b === undefined) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((e, i) => b[i] === e);
    }
    if (isShape(a) || isShape(b)) return isShape(a) && isShape(b) && shapesAgree(a, b);
    return a === b;
  });
}

function render(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/**
 * Assert that `actual` is still the held result, and neither the awaited one nor anything else.
 *
 * When a design accepts `observed` and rejects `target`, replace this pin with a plain assertion
 * as soon as that decision settles, even while the pin passes. The helper cannot detect that
 * `target` is no longer awaited.
 *
 * @param actual - The typed result the test produced.
 * @param pin - The behavior under test, the result held today, and the result awaited.
 */
export function expectPinnedObservation(actual: unknown, pin: PinnedObservation): void {
  requireBehaviorSentence(pin.behavior);
  requireDescribableShape(pin.observed, "observed");
  requireDescribableShape(pin.target, "target");
  requireIdentityValues(pin.observed);
  requireIdentityValues(pin.target);
  if (shapesAgree(pin.observed, pin.target)) {
    throw new Error(
      `${pin.behavior}\n\n` +
        `This holds and awaits the same result, so no outcome can tell them apart. A hold that reached ` +
        `what it was waiting for belongs back in a plain assertion.`,
    );
  }
  // The awaited result is read first, so a result satisfying both shapes retires the hold rather than
  // renewing it. Reading it the other way would keep a landed fix invisible for as long as the two shapes
  // overlap, which is the decay this assertion exists to catch.
  if (matchesShape(actual, pin.target)) {
    throw new Error(
      `${pin.behavior}\n\n` +
        `This now produces the result it was waiting for, so the hold is spent: ` +
        `replace this call with a plain assertion on ${render(pin.target)}.`,
    );
  }
  if (matchesShape(actual, pin.observed)) return;
  throw new Error(
    `${pin.behavior}\n\n` +
      `The held result no longer describes what happens, and the awaited one has not arrived either.\n` +
      `  held:    ${render(pin.observed)}\n` +
      `  awaited: ${render(pin.target)}\n` +
      `  actual:  ${render(actual)}`,
  );
}
