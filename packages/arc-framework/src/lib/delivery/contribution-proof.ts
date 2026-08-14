/** Pure identity proof for one delivery member across a predecessor-changing rewrite. */

export interface DeliveryContributionCoordinate {
  readonly head: string;
  readonly tree: string;
}

export interface DeliveryContributionEndpoints {
  readonly before: {
    readonly predecessor: DeliveryContributionCoordinate;
    readonly member: DeliveryContributionCoordinate;
  };
  readonly after: {
    readonly predecessor: DeliveryContributionCoordinate;
    readonly member: DeliveryContributionCoordinate;
  };
}

export interface DeliveryContributionPatch {
  readonly objectFormat: "sha1" | "sha256";
  readonly payload: string;
}

export type DeliveryContributionProofResult =
  | { readonly status: "accepted"; readonly proof: "tree-equality" | "aggregate-patch" }
  | { readonly status: "refused"; readonly reason: "patch-evidence-invalid" | "contribution-mismatch" };

const PREFIX = new TextEncoder().encode("arc-delivery-contribution-patch-v1\0");
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

function findNul(bytes: Uint8Array, start: number): number {
  for (let index = start; index < bytes.length; index += 1) {
    if (bytes[index] === 0) return index;
  }
  return -1;
}

/** Encode exact Git patch bytes in the versioned delivery contribution protocol. */
export function encodeDeliveryContributionPatch(
  objectFormat: "sha1" | "sha256",
  payload: string | Uint8Array,
): Uint8Array {
  const payloadBytes = typeof payload === "string" ? encoder.encode(payload) : payload;
  const header = encoder.encode(`${objectFormat}\0${payloadBytes.length}\0`);
  const result = new Uint8Array(PREFIX.length + header.length + payloadBytes.length);
  result.set(PREFIX);
  result.set(header, PREFIX.length);
  result.set(payloadBytes, PREFIX.length + header.length);
  return result;
}

/** Strictly parse one canonical patch envelope without normalizing its payload bytes. */
export function parseDeliveryContributionPatch(input: Uint8Array): DeliveryContributionPatch | null {
  if (input.length <= PREFIX.length
    || !Buffer.from(input.subarray(0, PREFIX.length)).equals(Buffer.from(PREFIX))) return null;
  const formatEnd = findNul(input, PREFIX.length);
  if (formatEnd < 0) return null;
  const lengthEnd = findNul(input, formatEnd + 1);
  if (lengthEnd < 0) return null;
  try {
    const objectFormat = decoder.decode(input.subarray(PREFIX.length, formatEnd));
    if (objectFormat !== "sha1" && objectFormat !== "sha256") return null;
    const lengthText = decoder.decode(input.subarray(formatEnd + 1, lengthEnd));
    if (!/^(0|[1-9][0-9]*)$/u.test(lengthText)) return null;
    const payloadBytes = input.subarray(lengthEnd + 1);
    if (payloadBytes.length !== Number(lengthText)) return null;
    return { objectFormat, payload: decoder.decode(payloadBytes) };
  } catch {
    return null;
  }
}

/** Compare one pinned before/after contribution, preferring complete member-tree equality. */
export function compareDeliveryContribution(input: DeliveryContributionEndpoints & {
  readonly beforePatch?: Uint8Array;
  readonly afterPatch?: Uint8Array;
}): DeliveryContributionProofResult {
  if (input.before.member.tree === input.after.member.tree) {
    return { status: "accepted", proof: "tree-equality" };
  }
  if (input.beforePatch === undefined || input.afterPatch === undefined) {
    return { status: "refused", reason: "patch-evidence-invalid" };
  }
  const before = parseDeliveryContributionPatch(input.beforePatch);
  const after = parseDeliveryContributionPatch(input.afterPatch);
  if (before === null || after === null || before.objectFormat !== after.objectFormat) {
    return { status: "refused", reason: "patch-evidence-invalid" };
  }
  return Buffer.from(input.beforePatch).equals(Buffer.from(input.afterPatch))
    ? { status: "accepted", proof: "aggregate-patch" }
    : { status: "refused", reason: "contribution-mismatch" };
}
