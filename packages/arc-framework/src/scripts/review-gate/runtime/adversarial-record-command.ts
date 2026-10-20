/** Publish one caller-approved adversarial pass on its named work-unit generation. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { readWorkUnit } from "../../../lib/store/lifecycle-write.js";
import { recordReferences, sameOwner, type OwnerIdentity, type RecordVersion } from "../../../lib/store/identity.js";
import type { Store } from "../../../lib/store/contract.js";
import type { StoreResult } from "../../../lib/store/refusal.js";
import { ReviewAdversarialPassSchema } from "../../../lib/store/kinds/review/adversarial-pass/schema.js";
import { ReviewAdversarialRecordEnvelopeSchema } from "../core/adversarial-record-schema.js";
import type { ReviewAdversarialRecordRequest, ReviewAdversarialRecordEnvelope } from "../core/adversarial-record-schema.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { resolveReviewInvocation } from "./invocation.js";

/** Recoverable input or storage failure at the adversarial recording boundary. */
export class AdversarialRecordError extends Error {
  constructor(readonly code: "unsupported" | "invalid-input" | "corrupt-state", message: string,
    readonly remedy?: { text: string }) { super(message); this.name = "AdversarialRecordError"; }
}

/** Derive immutable recording coordinates from the store and publish one pass. */
export async function recordApprovedAdversarialPass(request: ReviewAdversarialRecordRequest, options: ReviewInvocationInput): Promise<ReviewAdversarialRecordEnvelope> {
  const input = resolveReviewInvocation(options);
  if (!input.store.capabilities.stateOffBranch) {
    const location = request.activity === "verification" || request.activity === "criteria"
      ? `the criteria report for work unit \`${request.workUnit}\``
      : `work unit \`${request.workUnit}\`'s ADVERSARIAL-PASSES.md`;
    throw new AdversarialRecordError("unsupported", "Adversarial pass records require off-branch state.",
      { text: `Keep this approved pass in ${location} until off-branch state is enabled.` });
  }
  const primary = requireResult(await readWorkUnit(input.store, request.workUnit), `Work unit \`${request.workUnit}\`: `);
  if (primary.conflicts.length > 0) throw new AdversarialRecordError("corrupt-state", "Resolve the work unit's metadata conflicts, then retry.");
  const owner = primary.reference.owner;
  if (input.workItem !== undefined && !sameOwner(input.workItem, owner)) {
    throw new AdversarialRecordError("invalid-input", "The requested slug and selected work-item generation differ. Select the matching work unit, then retry.");
  }
  const key = { activity: request.activity, number: await nextPassNumber(input.store, owner, request.activity) };
  const artifacts = await readArtifactVersions(input.store, owner, request.activity);
  const code = request.activity === "verification" || request.activity === "criteria";
  const codeHead = code ? (await options.exec("git", ["rev-parse", "HEAD"], { cwd: options.cwd })).stdout.trim() : undefined;
  const { workUnit, ...header } = request;
  void workUnit;
  const content = canonicalize(ReviewAdversarialPassSchema.parse({ ...header, artifacts,
    ...(codeHead === undefined ? {} : { codeHead }) }));
  const written = requireResult(await input.store.write({ action: "put", reference: recordReferences["review/adversarial-pass"](owner, key),
    expected: null, content, provenance: { verb: "review-adversarial-record", lifecycleAction: "create",
      ...(codeHead === undefined ? {} : { codeHead }) } }));
  return ReviewAdversarialRecordEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-adversarial-record", diagnostics: [],
    state: "recorded", nextAction: "none", payload: { key, version: written.version } });
}

function requireResult<T>(result: StoreResult<T>, context = ""): T {
  if (result.status === "ok") return result.result;
  throw new AdversarialRecordError("invalid-input", `${context}${result.refusal.condition} ${result.refusal.remedy.text}`);
}

async function artifactVersion(store: Store, owner: OwnerIdentity, artifact: "draft" | "spec" | "task-list",
  optional = false): Promise<RecordVersion | undefined> {
  const read = await store.read({ reference: recordReferences[`work-item/${artifact}`](owner) });
  if (optional && read.status === "refused" && read.refusal.code === "not-found") return undefined;
  const record = requireResult(read);
  if (record.conflicts.length > 0) throw new AdversarialRecordError("corrupt-state", `Resolve the ${artifact} conflicts, then retry.`);
  return record.version;
}

async function readArtifactVersions(store: Store, owner: OwnerIdentity, activity: ReviewAdversarialRecordRequest["activity"]) {
  if (activity === "draft-readiness") return { draft: await artifactVersion(store, owner, "draft") };
  const spec = await artifactVersion(store, owner, "spec");
  if (activity === "spec-finalization") {
    const draft = await artifactVersion(store, owner, "draft", true);
    return { spec, ...(draft === undefined ? {} : { draft }) };
  }
  return { spec, taskList: await artifactVersion(store, owner, "task-list") };
}

async function nextPassNumber(store: Store, owner: OwnerIdentity, activity: ReviewAdversarialRecordRequest["activity"]): Promise<number> {
  const listing = requireResult(await store.list({ family: "review", kind: "review/adversarial-pass", owner }));
  if (listing.status === "absent") return 1;
  if (listing.status === "unreadable") throw new AdversarialRecordError("corrupt-state", `${listing.condition} ${listing.remedy.text}`);
  if (listing.missed || listing.diagnostics.length > 0) {
    const details = listing.diagnostics.map(entry => `${entry.condition} ${entry.remedy.text}`).join(" ");
    throw new AdversarialRecordError("corrupt-state", `Adversarial pass listing is incomplete. ${details} Restore a complete listing, then retry.`);
  }
  let highest = 0;
  for (const record of listing.records) {
    const value = ReviewAdversarialPassSchema.safeParse(JSON.parse(record.content)), key = record.reference.key;
    if (record.conflicts.length > 0 || !value.success || key === undefined || typeof key === "string"
      || key.activity !== value.data.activity) {
      throw new AdversarialRecordError("corrupt-state", "Repair the conflicting or malformed adversarial pass records, then retry.");
    }
    if (key.activity === activity) highest = Math.max(highest, key.number);
  }
  if (highest >= Number.MAX_SAFE_INTEGER) throw new AdversarialRecordError("corrupt-state", "The adversarial pass number is exhausted. Repair the pass history before retrying.");
  return highest + 1;
}
