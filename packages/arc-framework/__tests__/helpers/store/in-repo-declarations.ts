/** Named coverage boundaries of the repository fixture across all current substrates. */
import { KIND_REGISTRY, FAMILY_IDS, type KindId, type FamilyId } from "../../../src/lib/store/index.js";
import type { FixtureDeclarations, FamilyExclusions } from "./fixture-contract.js";

const raw = "This tracked format preserves legacy whole-file bytes without rejecting their prose or field content.";
const historical = "Tracked Git history preserves commit provenance; caller write provenance and batch IDs are not persisted.";
const unhomed = "This kind has no home in the current substrates; its public dispatch and backend-selection remedy are tested separately.";
const allKindNames = ["round-trip", "current-removal", "keyed-independence", "duplicate-creation", "stale-writer", "stale-removal", "create-only-update", "reopen-read", "batch-stale-all-or-nothing", "unrelated-write-keeps-record-bound", "unrelated-write-keeps-scoped-changes", "saved-state-reads-and-changes", "saved-state-changes-write-provenance", "earlier-state-keeps-prior-bytes", "history-newest-first-versions", "history-caller-and-owner-provenance", "unreadable-family", "diagnostic-unreadable", "diagnostic-oversized", "diagnostic-malformed", "diagnostic-key-mismatch", "diagnostic-unknown-format-version", "disjoint-entry-insertions", "same-entry-current-and-stored-labelled-conflict", "observed-remove-edit-first", "observed-remove-remove-first", "first-persist-stamps-handwritten-entry", "disjoint-prose-lines", "conflicting-prose-keeps-current-hunk"];

function selected(name: string, kind: KindId): boolean {
  const d = KIND_REGISTRY[kind];
  const mutable = !["create-only", "write-once"].includes(d.writerRule);
  if (name === "current-removal") return !kind.endsWith("/conflict-record");
  if (name === "keyed-independence") return d.key !== null;
  if (name === "stale-writer" || name === "batch-stale-all-or-nothing") return mutable && d.merge === "single-writer";
  if (name === "stale-removal" || name === "earlier-state-keeps-prior-bytes") return mutable;
  if (name === "create-only-update") return d.writerRule === "create-only";
  if (name.includes("entry") || name.startsWith("observed-remove") || name.startsWith("first-persist")) return d.merge === "entry";
  if (name.includes("prose")) return d.merge === "line";
  return true;
}
const families = FAMILY_IDS.filter((family) => Object.values(KIND_REGISTRY).some((kind) => kind.family === family && kind.inRepo.substrate !== "none"));
const outside = "This substrate sits outside the branch state version; use its own record version instead.";
const personalRaw = "Personal files accept arbitrary whole-file bytes, have no size cap or embedded key, and do not validate content.";
const syncNames = ["publish-and-noop-family-coverage", "remote-movement-reconciles-by-mechanism", "concurrent-sync-merges-and-preserves-both-side-labels", "single-writer-sync-keeps-remote-and-stores-local-conflict"];
const familyExclusions: Partial<Record<FamilyId, FamilyExclusions>> = {};
for (const family of families) {
  const assertions: Record<string, string> = {};
  for (const kind of Object.keys(KIND_REGISTRY) as KindId[]) {
    const d = KIND_REGISTRY[kind];
    if (d.family !== family) continue;
    for (const name of allKindNames) {
      if (!selected(name, kind)) continue;
      if (d.inRepo.substrate === "none") assertions[`${name}:${kind}`] = unhomed;
      else if (d.inRepo.substrate !== "tracked" && ["unrelated-write-keeps-scoped-changes", "saved-state-reads-and-changes", "saved-state-changes-write-provenance", "earlier-state-keeps-prior-bytes"].includes(name)) assertions[`${name}:${kind}`] = outside;
      else if (d.inRepo.substrate === "personal" && name.startsWith("history-")) assertions[`${name}:${kind}`] = "Personal files have no history before the ref backend.";
      else if (d.inRepo.substrate === "personal" && ["diagnostic-malformed", "diagnostic-oversized", "diagnostic-key-mismatch", "diagnostic-unknown-format-version"].includes(name)) assertions[`${name}:${kind}`] = personalRaw;
      else if (d.inRepo.substrate === "transient-identity" && name === "diagnostic-unknown-format-version") assertions[`${name}:${kind}`] = "Transient format remains 1; unknown content versions instead list as malformed.";
      else if (d.inRepo.substrate === "transient-identity" && name === "history-caller-and-owner-provenance") assertions[`${name}:${kind}`] = "Transient history returns ref commit messages without individual writer provenance or batch IDs.";
      else if (d.inRepo.substrate !== "tracked" && name !== "first-persist-stamps-handwritten-entry") continue;
      else if (name === "unreadable-family" && kind === "project-inbox/inbox") assertions[`${name}:${kind}`] = "The legacy project inbox is one fixed file, not an enumerated namespace; denied file access is an unreadable-entry diagnostic.";
      else if (name.includes("write-provenance") || name.includes("owner-provenance")) assertions[`${name}:${kind}`] = historical;
      else if (name === "first-persist-stamps-handwritten-entry") assertions[`${name}:${kind}`] = "Interim whole-file writers preserve legacy bytes and do not stamp _Id_ fields on first persistence.";
      else if (["diagnostic-oversized", "diagnostic-unknown-format-version"].includes(name)) assertions[`${name}:${kind}`] = "Tracked legacy files have neither fixture size limits nor format-version envelopes.";
      else if (["diagnostic-malformed", "diagnostic-key-mismatch"].includes(name) && !["review/candidate", "review/integration-boundary", "lineage/transition", "work-item/record", "claims/groom", "claims/housekeep"].includes(kind)) assertions[`${name}:${kind}`] = raw;
    }
  }
  for (const kind of Object.keys(KIND_REGISTRY) as KindId[]) {
    const d = KIND_REGISTRY[kind];
    if (d.family !== family || ["personal", "transient-identity"].includes(d.inRepo.substrate)) continue;
    for (const name of syncNames) {
      if (name === "remote-movement-reconciles-by-mechanism" && ["create-only", "write-once"].includes(d.writerRule)) continue;
      if (name === "concurrent-sync-merges-and-preserves-both-side-labels" && d.merge === "single-writer") continue;
      if (name === "single-writer-sync-keeps-remote-and-stores-local-conflict" && (d.merge !== "single-writer" || ["create-only", "write-once"].includes(d.writerRule))) continue;
      assertions[`${name}:${kind}`] = d.inRepo.substrate === "none" ? unhomed : "Tracked files ride the branch push; contract sync publishes identity refs only.";
    }
  }
  for (const kind of Object.keys(KIND_REGISTRY) as KindId[]) {
    const d = KIND_REGISTRY[kind];
    if (d.family !== family || !["personal", "transient-identity"].includes(d.inRepo.substrate)) continue;
    assertions[`publish-and-noop-family-coverage:${kind}`] = "Existing notes save and Errand push report pushed again for existing refs, even with unchanged record bytes.";
    assertions[`remote-movement-reconciles-by-mechanism:${kind}`] = d.inRepo.substrate === "personal"
      ? "Notes reconciliation updates and publishes the notes ref without loading personal working files."
      : "The existing two-way Errand merge reports unequal same-key entries as conflict; distinct entries reconcile.";
  }
  familyExclusions[family] = { items: { 10: "Interim substrates have no newer-format envelope." }, assertions };
}
Object.assign(familyExclusions["work-item"]?.assertions ?? {}, {
  "created-work-item-UID": "Tracked work-item identity remains its slug without a persisted UID.",
  "UID-rename-and-generations": "Tracked writes neither mint UIDs nor rename work units.",
  "former-slug-after-rename": "Tracked writes do not perform rename; real transition alias lookup is covered separately.",
  "held-here-unsupported-remedy": "Tracked listings derive held-here from live checkout state and do not emit this unsupported case.",
  "commit-exact-SHA-before-patch-ID-and-all-task-captures": "Tracked lookup derives final Context footers rather than persisted links; real Git lookup tests cover it.",
  "batch-shared-ID-in-changes-and-history": historical,
});
for (const kind of ["work-item/meta", "work-item/record"]) for (const name of ["primary-links-create-retain-replace-clear", "primary-placement-move-to-completed", "primary-create-at-completed"]) {
  const assertions = familyExclusions["work-item"]?.assertions;
  if (assertions) assertions[`${name}:${kind}`] = "Interim writes do not create links, move placement, or create completed work units; recovery chooses a capable backend.";
}
if (familyExclusions.personal?.items) familyExclusions.personal.items[12] = "Lookup resolves work items and checkout claims, never personal files.";
if (familyExclusions.personal?.assertions) Object.assign(familyExclusions.personal.assertions, {
  "all-readable-records-and-one-diagnostic-per-bad-entry": personalRaw,
  "no-identity-holds-every-identity-family-while-project-publishes": "Every interim publish is keyed by the identity; no project publish can proceed beside no-identity.",
});
if (familyExclusions.lineage?.assertions) familyExclusions.lineage.assertions["terminal-origin-UID-lookup"] = "Tracked transition origins use slugs without persisted UIDs.";

/** Static substrate coverage and explicit limitations registered with every fresh fixture. */
export const inRepoDeclarations: FixtureDeclarations = {
  families, mergesConcurrentWrites: false, substrates: ["tracked", "personal", "transient-identity"], stateOffBranch: false,
  liveListingStateVersion: false, syncFamilies: ["personal", "work-item", "claims"], identitySyncFamilies: ["personal", "work-item", "claims"], entryShapes: {}, familyExclusions,
  syncRetryCount: 4, syncWaitedMs: 30,
  rejectingContentUnavailable: Object.fromEntries((Object.keys(KIND_REGISTRY) as KindId[]).filter((kind) => families.includes(KIND_REGISTRY[kind].family) && !["review/candidate", "review/integration-boundary", "lineage/transition", "work-item/record", "claims/groom", "claims/housekeep"].includes(kind)).map((kind) => [kind, KIND_REGISTRY[kind].inRepo.substrate === "personal" ? personalRaw : KIND_REGISTRY[kind].inRepo.substrate === "tracked" ? raw : unhomed])),
  refusalExclusions: {
    "namespace-corrupt": "Tracked and personal files have no shared namespace index; unreadable transient ref structure throws an operation error instead of this typed refusal.",
    "unsupported:held-here": "Tracked listing supports checkout held-here selection.",
  },
};
