/** Real Git and filesystem hooks for the tracked store's shared contract suite. */
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { onTestFinished } from "vitest";
import { createStore, KIND_REGISTRY, RecordReferenceSchema, StateVersionSchema, type RecordReference } from "../../../src/lib/store/index.js";
import { withTrackedWriteLock, TRACKED_WRITE_LOCK_FILENAME } from "../../../src/lib/store/tracked-lock.js";
import { resolveCheckoutGitDir } from "../../../src/lib/git/exec.js";
import { acquireAdvisoryLock, releaseAdvisoryLock, type AdvisoryLockHandle } from "../../../src/lib/advisory-lock.js";
import { resolveArcPath } from "../../../src/lib/layout/index.js";
import { ArchiveSequenceSchema } from "../../../src/lib/kernel/index.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { serializeCandidateManagedRecord, createCandidateAttestation } from "../../../src/lib/work-unit/candidate-attestation.js";
import { serializeTransitionRecord } from "../../../src/lib/work-unit/transition-record.js";
import { parseIntegrationBoundaryLocus } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { makeMetaFixture } from "../meta-fixture.js";
import { candidateFixture, boundaryFixture } from "./tracked-write-fixture.js";
import { inRepoDeclarations } from "./in-repo-declarations.js";
import { produceInRepoRecovery } from "./in-repo-recovery.js";
import { transientContent, plantTransient, plantPersonal } from "./in-repo-substrates.js";
import { getNotesLockPath } from "../../../src/lib/user-sync/notes-lock.js";
import { inRepoRemote } from "./in-repo-remote.js";
import { success } from "./suite-tools.js";
import type { ConformanceFixture, ConformanceRegistration } from "./fixture-contract.js";

/** Exact valid bytes from the existing format producers.
 * @param reference - Logical role and owning slug.
 * @param variant - Content revision or deliberately invalid input.
 * @returns Whole-file persisted form.
 */
export function inRepoContent(reference: RecordReference, variant = "valid"): string {
  if (KIND_REGISTRY[reference.kind].inRepo.substrate === "transient-identity") return transientContent(reference, variant);
  if (variant === "invalid") return "invalid machine JSON";
  const name = reference.owner.name;
  const value = variant === "changed-again" ? 3 : variant === "changed" ? 2 : 1;
  if (reference.kind === "work-item/meta") return `${makeMetaFixture(name)}\nRevision ${value}\n`;
  if (reference.kind === "review/candidate") {
    const candidate = candidateFixture(name);
    candidate.attestation = createCandidateAttestation({ workUnit: name, subject: candidate.subject, baseRevision: "a".repeat(40), attestedBy: "andrew", attestedAt: `2026-08-12T14:00:0${value}.000Z`, verificationEvidenceRef: "tasks-example.md#verification" });
    return serializeCandidateManagedRecord(candidate);
  }
  if (reference.kind === "review/integration-boundary") {
    const boundary = boundaryFixture(name);
    boundary.nextAction.interactionText = `Run pre-publication review ${value}.`;
    return canonicalize(parseIntegrationBoundaryLocus(boundary));
  }
  if (reference.kind === "lineage/transition") return serializeTransitionRecord({ schemaVersion: 1, origin: name, kind: "abandon", successors: [], edges: [] });
  if (reference.kind === "project-inbox/inbox") return `# Inbox\n\n## Inbox\n\n### **First**\n\nLegacy content ${value}\n`;
  return `opening\n${value === 1 ? "base" : value === 2 ? "changed" : "another change"}\nclosing\n`;
}

/** Create an isolated real checkout with actual tracked locking and explicit capability limitations.
 * @returns Fresh public store and faithful filesystem/Git hooks.
 */
export async function createInRepoFixture(): Promise<ConformanceFixture> {
  const topology = await inRepoRemote();
  const h = topology.a;
  h.ports.locks.tracked = (operation) => withTrackedWriteLock({ exec: h.exec, checkoutRoot: h.root, options: { maxWaitMs: 100 } }, operation);
  const store = createStore(h.ports);
  let held: AdvisoryLockHandle | undefined;
  const denied = new Set<string>();
  const repairs = new Map<string, () => Promise<void>>();
  onTestFinished(async () => { if (held) await releaseAdvisoryLock(held); for (const path of denied) await chmod(path, 0o755); topology.restore(); });
  const pathFor = (reference: RecordReference) => {
    const role = KIND_REGISTRY[reference.kind].inRepo.address;
    if (reference.kind === "work-item/companion") return join(h.root, `.arc/active/${String(reference.key)}-${reference.owner.name}.md`);
    if (role?.kind === "work-unit-artifact") return join(h.root, resolveArcPath({ kind: "work-unit-artifact", artifact: role.artifact as "meta", slug: reference.owner.name, placement: { kind: "active", scope: { kind: "project" } } }));
    if (reference.kind === "cohort/document") return join(h.root, resolveArcPath({ kind: "cohort-document", cohort: [reference.owner.name], placement: { kind: "planned" } }));
    if (reference.kind === "project-inbox/inbox") return join(h.root, resolveArcPath({ kind: "inbox", scope: { kind: "project" } }));
    if (reference.kind === "lineage/transition") return join(h.root, resolveArcPath({ kind: "transition-record", origin: reference.owner.name }));
    return join(h.root, resolveArcPath({ kind: reference.kind === "review/candidate" ? "candidate-record" : "integration-boundary-record", slug: reference.owner.name }));
  };
  const fixture: ConformanceFixture = {
    store, declarations: inRepoDeclarations,
    reference(kind, suffix = "one") {
      const d = KIND_REGISTRY[kind];
      const owner = { type: d.owner, name: d.owner === "person" ? "andrew" : d.owner === "project" ? "project" : `${d.owner}-${suffix}` };
      const key = d.key === "pass" ? { activity: "review", number: suffix === "two" ? 2 : 1 } : d.key === "path" ? `scratch-${suffix}.md` : kind === "claims/groom" ? `groom-${suffix}` : suffix;
      return RecordReferenceSchema.parse({ owner, kind, ...(d.key === null ? {} : { key }) });
    },
    content: inRepoContent,
    async settle() {
      await h.exec("git", ["add", "-A"]);
      const dirty = await h.exec("git", ["diff", "--cached", "--name-only"]);
      if (dirty.stdout.trim()) await h.exec("git", ["commit", "-m", "Settle tracked conformance changes"]);
      return StateVersionSchema.parse((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim());
    },
    async materialize(reference, placement) {
      if (placement.kind !== "completed") throw new Error("Materialization is only for settled completed listing setup");
      const path = join(h.root, resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: reference.owner.name,
        placement: { ...placement, sequence: ArchiveSequenceSchema.parse("01") } }));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, inRepoContent(reference));
      return success(await store.read({ reference }));
    },
    reopen: () => createStore(h.ports),
    race: (left, right) => Promise.all([store.write(left), store.write(right)]),
    remote: topology.remote, identity: topology.identity, remoteState: topology.remoteState,
    async plant(reference, kind) {
      const substrate = KIND_REGISTRY[reference.kind].inRepo.substrate;
      if (substrate === "transient-identity") return plantTransient(h.ports, reference, kind);
      if (substrate === "personal") return plantPersonal(h.root, reference, kind, denied);
      const path = pathFor(reference);
      if (kind === "unreadable") { await chmod(path, 0); return; }
      if (kind === "malformed") { await writeFile(path, "invalid machine JSON"); return; }
      if (kind === "key-mismatch") { await writeFile(path, inRepoContent(RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: "wrong-owner" } }))); return; }
      throw new Error(`Unproducible tracked fault ${kind}`);
    },
    async hold(reference, holding) {
      if (!holding && held) { await releaseAdvisoryLock(held); held = undefined; }
      if (holding && !held) held = await acquireAdvisoryLock(KIND_REGISTRY[reference.kind].inRepo.substrate === "personal" ? await getNotesLockPath(h.exec, h.root, reference.owner.name) : join(await resolveCheckoutGitDir(h.exec, h.root), TRACKED_WRITE_LOCK_FILENAME));
    },
    produce: (caseId) => produceInRepoRecovery(fixture, h.exec, repairs, caseId),
    async repair(caseId) { const repair = repairs.get(caseId); if (!repair) throw new Error(`No produced repair ${caseId}`); await repair(); },
  };
  return fixture;
}

/** Public-factory registration for all tracked families. */
export const inRepoRegistration: ConformanceRegistration = { declarations: inRepoDeclarations, create: createInRepoFixture };
