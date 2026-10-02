/** Named coverage boundaries of the tracked-filesystem fixture. */
import { KIND_REGISTRY, FAMILY_IDS, type KindId, type FamilyId } from "../../../src/lib/store/index.js";
import type { FixtureDeclarations, FamilyExclusions } from "./fixture-contract.js";

const raw = "This tracked format preserves legacy whole-file bytes without rejecting their prose or field content.";
const historical = "Tracked Git history preserves commit provenance; caller write provenance and batch IDs are not persisted.";
const unhomed = "This kind has no tracked home; its public dispatch and backend-selection remedy are tested separately.";
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
const families = FAMILY_IDS.filter((family) => Object.values(KIND_REGISTRY).some((kind) => kind.family === family && kind.inRepo.substrate === "tracked"));
const familyExclusions: Partial<Record<FamilyId, FamilyExclusions>> = {};
for (const family of families) {
  const assertions: Record<string, string> = {};
  for (const kind of Object.keys(KIND_REGISTRY) as KindId[]) {
    const d = KIND_REGISTRY[kind];
    if (d.family !== family) continue;
    for (const name of allKindNames) {
      if (!selected(name, kind)) continue;
      if (d.inRepo.substrate !== "tracked") assertions[`${name}:${kind}`] = unhomed;
      else if (name === "unreadable-family") assertions[`${name}:${kind}`] = "The lifecycle walk treats inaccessible directories as empty rather than unreadable families.";
      else if (name.includes("write-provenance") || name.includes("owner-provenance")) assertions[`${name}:${kind}`] = historical;
      else if (name === "first-persist-stamps-handwritten-entry") assertions[`${name}:${kind}`] = "Tracked entry lists preserve legacy bytes and do not stamp _Id_ fields on first persistence.";
      else if (["diagnostic-oversized", "diagnostic-unknown-format-version"].includes(name)) assertions[`${name}:${kind}`] = "Tracked legacy files have neither fixture size limits nor format-version envelopes.";
      else if (["diagnostic-malformed", "diagnostic-key-mismatch"].includes(name) && !["review/candidate", "review/integration-boundary", "lineage/transition"].includes(kind)) assertions[`${name}:${kind}`] = raw;
    }
  }
  familyExclusions[family] = { items: { 10: "Tracked legacy files have no newer-format envelope.", 16: "Tracked families are not published by store sync." }, assertions };
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
  if (assertions) assertions[`${name}:${kind}`] = "Tracked writes do not create links, move placement, or create completed work units; recovery chooses a capable backend.";
}
for (const name of ["primary-active-placement:work-item/record", "checkout-claim:work-item/record"]) {
  const assertions = familyExclusions["work-item"]?.assertions;
  if (assertions) assertions[name] = unhomed;
}
if (familyExclusions.lineage?.assertions) familyExclusions.lineage.assertions["terminal-origin-UID-lookup"] = "Tracked transition origins use slugs without persisted UIDs.";

/** Static tracked-family coverage and explicit limitations registered with every fresh fixture. */
export const inRepoDeclarations: FixtureDeclarations = {
  families, mergesConcurrentWrites: false, substrates: ["tracked", "personal"], stateOffBranch: false,
  liveListingStateVersion: false, syncFamilies: families, identitySyncFamilies: [], entryShapes: {}, familyExclusions,
  rejectingContentUnavailable: Object.fromEntries((Object.keys(KIND_REGISTRY) as KindId[]).filter((kind) => families.includes(KIND_REGISTRY[kind].family) && !["review/candidate", "review/integration-boundary", "lineage/transition"].includes(kind)).map((kind) => [kind, KIND_REGISTRY[kind].inRepo.substrate === "tracked" ? raw : unhomed])),
  refusalExclusions: {
    "not-found:identity": "Tracked operations do not require configured identity.",
    "namespace-corrupt": "Tracked files do not have a shared persisted namespace index.",
    "unsupported:held-here": "Tracked listing supports checkout held-here selection.",
    ...Object.fromEntries(["unreachable", "refused", "retries-exhausted", "transient-write:unreachable", "transient-write:refused", "transient-write:retries-exhausted", "transient-write:version-conflict", "transient-write:record-malformed"].map((id) => [id, "Tracked writes and sync do not publish transient identity refs."])),
  },
};
