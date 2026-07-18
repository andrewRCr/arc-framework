/**
 * Proof-bounded integration-event analysis over first-parent base movement.
 *
 * @module
 */

import type { GitExec } from "./exec.js";
import type {
  BaseDriftCommitInput,
  IntegrationEvidence,
  IntegrationEvidenceLimitation,
  IntegrationEvidenceResolver,
  IntegrationEvent,
  ResolverEvent,
} from "./base-drift-types.js";

export const DEFAULT_BASE_DRIFT_SCAN_LIMIT = 256;

const MERGE_PR_RE = /^Merge pull request #([1-9]\d*) from (.+)$/u;
const SQUASH_PR_RE = / \(#([1-9]\d*)\)$/u;
const OID_RE = /^[0-9a-f]{40,64}$/u;

export interface AnalyzeIntegrationEvidenceOptions {
  exec: GitExec;
  baseOid: string;
  resolver?: IntegrationEvidenceResolver;
  scanLimit?: number;
}

export async function analyzeIntegrationEvidence(
  options: AnalyzeIntegrationEvidenceOptions,
): Promise<IntegrationEvidence> {
  const limit = options.scanLimit ?? DEFAULT_BASE_DRIFT_SCAN_LIMIT;
  let inputs: BaseDriftCommitInput[];
  try {
    const { stdout } = await options.exec("git", [
      "log",
      "--first-parent",
      "--reverse",
      "-z",
      `--max-count=${limit + 1}`,
      "--format=%H%x00%P%x00%s",
      `HEAD..${options.baseOid}`,
    ]);
    inputs = parseScan(stdout);
  } catch {
    return { coverage: "unavailable", reason: "history-scan-failed" };
  }

  const truncated = inputs.length > limit;
  if (truncated) inputs = inputs.slice(0, limit);
  const topologyOids = new Set<string>();
  const events: IntegrationEvent[] = [];
  const limitations = new Set<IntegrationEvidenceLimitation>();

  for (const input of inputs) {
    if (input.parents.length < 2) continue;
    topologyOids.add(input.oid);
    const event: IntegrationEvent = {
      commits: [input.oid],
      proof: "topology",
      ...(input.acceptedPrNumber === undefined ? {} : { prNumber: input.acceptedPrNumber }),
    };
    if (options.resolver !== undefined) {
      try {
        const enriched = await options.resolver.enrichTopologyEvent(event, input);
        if (enriched.status === "unavailable") {
          limitations.add("resolver-unavailable");
        } else {
          if (enriched.status === "partial") limitations.add("resolver-unavailable");
          if (enriched.value !== null) Object.assign(event, enriched.value);
        }
      } catch {
        limitations.add("resolver-unavailable");
      }
    }
    events.push(event);
  }

  const singleParent = inputs.filter((input) => !topologyOids.has(input.oid));
  const acceptedResolverOids = new Set<string>();
  if (singleParent.length > 0) {
    if (options.resolver === undefined) {
      limitations.add("resolver-unavailable");
    } else {
      try {
        const proven = await options.resolver.proveSingleParentEvents(singleParent);
        if (proven.status === "unavailable") {
          limitations.add("resolver-unavailable");
        } else if (!validateResolverEvents(proven.value, singleParent, topologyOids)) {
          limitations.add("resolver-invalid");
        } else {
          if (proven.status === "partial") limitations.add("resolver-unavailable");
          for (const candidate of proven.value) {
            candidate.commits.forEach((oid) => acceptedResolverOids.add(oid));
            events.push({ ...candidate, commits: [...candidate.commits], proof: "resolver" });
          }
        }
      } catch {
        limitations.add("resolver-unavailable");
      }
    }
  }

  const unclassifiedCommitCount = singleParent.filter(
    (input) => !acceptedResolverOids.has(input.oid),
  ).length;
  if (unclassifiedCommitCount > 0) limitations.add("unclassified-commits");
  if (truncated) limitations.add("scan-truncated");

  const order = new Map(inputs.map((input, index) => [input.oid, index]));
  events.sort((a, b) => (order.get(a.commits[0] ?? "") ?? 0) - (order.get(b.commits[0] ?? "") ?? 0));
  return {
    coverage: limitations.size === 0 ? "complete" : "partial",
    scannedCommitCount: inputs.length,
    events,
    unclassifiedCommitCount,
    truncated,
    limitations: [...limitations],
  };
}

function parseScan(stdout: string): BaseDriftCommitInput[] {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0")) {
    throw new Error("Malformed base-drift history framing.");
  }
  const fields = stdout.slice(0, -1).split("\0");
  if (fields.length % 3 !== 0) throw new Error("Malformed base-drift history record.");
  const inputs: BaseDriftCommitInput[] = [];
  for (let index = 0; index < fields.length; index += 3) {
    const oid = fields[index];
    const parentsField = fields[index + 1];
    const subject = fields[index + 2];
    if (oid === undefined || parentsField === undefined || subject === undefined || !OID_RE.test(oid)) {
      throw new Error("Malformed base-drift history record.");
    }
    const parents = parentsField === "" ? [] : parentsField.split(" ");
    if (parents.some((parent) => !OID_RE.test(parent))) {
      throw new Error("Malformed base-drift parent OID.");
    }
    const mergePr = MERGE_PR_RE.exec(subject);
    const squashPr = SQUASH_PR_RE.exec(subject);
    const acceptedPrNumber = Number(mergePr?.[1] ?? squashPr?.[1]);
    inputs.push({
      oid,
      parents,
      subject,
      ...(Number.isSafeInteger(acceptedPrNumber) && acceptedPrNumber > 0
        ? { acceptedPrNumber }
        : {}),
    });
  }
  return inputs;
}

function validateResolverEvents(
  events: ResolverEvent[],
  inputs: BaseDriftCommitInput[],
  topologyOids: ReadonlySet<string>,
): boolean {
  const allowed = new Set(inputs.map((input) => input.oid));
  const consumed = new Set<string>();
  for (const event of events) {
    if (event.commits.length === 0) return false;
    for (const oid of event.commits) {
      if (!allowed.has(oid) || topologyOids.has(oid) || consumed.has(oid)) return false;
      consumed.add(oid);
    }
  }
  return true;
}
