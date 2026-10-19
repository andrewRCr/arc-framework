/** Store migration behavior through production store and runtime boundaries. */
import { SlugSchema, ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { expect, it, vi } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { readStoreErrand, transitionStoreErrand, transformStoreErrand } from "../../../src/lib/errand/store-runtime.js";
import { ordinaryErrandTransform } from "../../../src/lib/errand/identity-transitions.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { createStoreSyncPort } from "../../../src/lib/store/operational-sync.js";
import { authorizeOrdinaryErrandResume } from "../../../src/lib/errand/open-runtime.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { linkOrdinaryErrandAtRuntime } from "../../../src/lib/errand/link-runtime.js";
const timestamp = "2026-10-14T00:00:00Z";
function record() {
  const parsed = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "fix-it", claimId: "a".repeat(32),
    intent: "Fix it", branch: "chore/fix-it", createdAt: timestamp, updatedAt: timestamp, origin: "description", originEntry: null,
    state: "open", savedHead: null, changeRequest: null });
  if (parsed.kind !== "errand" || parsed.purpose !== "errand") throw new Error("Expected ordinary Errand");
  return parsed;
}
it("refuses idempotent late-link settlement when a genuine stale-write reread retains an unresolved primary conflict", async () => {
  const h = createLifecycleHarness(), options = { store: h.store, identity: "alice", projectId: async () => "repo" };
  const opened = await transitionStoreErrand(options, { kind: "create", record: record() });
  if (opened.kind !== "applied" || opened.value === null) throw new Error("Expected an ordinary Errand");
  const previous = opened.value, remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.push());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const batch = h.store.batch.bind(h.store);
  const observed: { refusal?: string } = {};
  h.store.batch = async (input) => {
    const target = input.writes[0]; if (target?.action !== "put") throw new Error("Expected an identity put");
    const local = lifecycleSuccess(await h.store.read({ reference: target.reference }));
    const other = lifecycleSuccess(await writer.read({ reference: target.reference }));
    lifecycleSuccess(await h.store.write({ action: "put", reference: local.reference, expected: local.version,
      content: JSON.stringify({ ...previous, intent: "Competing concern" }), placement: { kind: "active" }, links: local.links,
      provenance: { verb: "save", lifecycleAction: "update" } }));
    lifecycleSuccess(await writer.write({ action: "put", reference: other.reference, expected: other.version,
      content: target.content, placement: target.placement, links: target.links, provenance: { verb: "errand-link", lifecycleAction: "update" } }));
    lifecycleSuccess(await h.store.push());
    const result = await batch(input);
    if (result.status === "refused") observed.refusal = result.refusal.code;
    return result;
  };
  const perform = () => linkOrdinaryErrandAtRuntime({ ...options, slug: previous.slug,
    inbox: { title: "personal:12345678", sourceDigest: `sha256:${"b".repeat(64)}`, executeBound: false }, updatedAt: "2026-10-15T00:00:00Z",
    exec: async () => { throw new Error("Unexpected Git"); }, execInput: async () => { throw new Error("Unexpected input"); } });
  const result = await perform();
  expect(observed.refusal).toBe("version-conflict");
  const found = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse(previous.slug) }));
  const disputed = lifecycleSuccess(await h.store.read({ reference: found.reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  expect(result).toMatchObject({ outcome: "refused", recommendedPromptText: expect.stringMatching(/resolve.*retry/isu) });
  for (const reference of disputed.conflicts) expect(result.recommendedPromptText).toContain(JSON.stringify(reference));
  lifecycleSuccess(await h.store.write({ action: "put", reference: disputed.reference, expected: disputed.version,
    content: disputed.content, placement: { kind: "active" }, links: disputed.links, resolves: disputed.conflicts,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await perform()).toMatchObject({ outcome: "idempotent" });
});

it.each(["read", "transition", "transform"] as const)("withholds %s authority for a conflicted Errand and continues after resolution", async operation => {
  const h = createLifecycleHarness(), options = { store: h.store, identity: "alice", projectId: async () => "project-id" };
  const opened = await transitionStoreErrand(options, { kind: "create", record: record() });
  if (opened.kind !== "applied" || opened.value === null) throw new Error("Expected an ordinary Errand");
  const previous = opened.value;
  const found = lifecycleSuccess(await h.store.lookup({ kind: "claim", claim: { kind: "errand", slug: previous.slug, claimId: previous.claimId } }));
  const initial = lifecycleSuccess(await h.store.read({ reference: found.reference }));
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  lifecycleSuccess(await writer.write({ action: "put", reference: initial.reference, expected: null, placement: { kind: "active" },
    content: JSON.stringify({ ...previous, intent: "Concurrent intent" }), links: initial.links,
    provenance: { verb: "errand-open", lifecycleAction: "create" } }));
  lifecycleSuccess(await h.store.push());
  const disputed = lifecycleSuccess(await h.store.read({ reference: initial.reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  const selected = TransientIdentityRecordV3Schema.parse(JSON.parse(disputed.content));
  if (selected.kind !== "errand" || selected.purpose !== "errand") throw new Error("Expected an ordinary retained Errand side");
  const request = { kind: "link" as const, previous: selected, originEntry: "personal:12345678",
    originEntrySourceDigest: `sha256:${"b".repeat(64)}` as const, updatedAt: "2026-10-15T00:00:00Z" };
  const perform = () => operation === "read" ? readStoreErrand(options, previous.slug, previous.claimId)
    : operation === "transition" ? transitionStoreErrand(options, request)
      : transformStoreErrand(options, selected, ordinaryErrandTransform(request));
  const version = lifecycleSuccess(await h.store.version()), refused = await perform();
  expect(refused).toMatchObject({ kind: "refused" });
  if (refused.kind !== "refused") throw new Error("Expected conflicted Errand refusal");
  for (const conflict of disputed.conflicts) expect(refused.reason).toContain(JSON.stringify(conflict));
  expect(refused.reason).toMatch(/resolve.*retry/iu);
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  expect(lifecycleSuccess(await h.store.read({ reference: disputed.reference }))).toEqual(disputed);
  lifecycleSuccess(await h.store.write({ action: "put", reference: disputed.reference, expected: disputed.version,
    content: disputed.content, placement: { kind: "active" }, links: disputed.links, resolves: disputed.conflicts,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await perform()).toMatchObject({ kind: operation === "read" ? "ready" : "applied" });
});
it("creates an owned active Errand with its repository-qualified branch and companion in one batch", async () => {
  const h = createLifecycleHarness(), batch = vi.spyOn(h.store, "batch");
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" });
  const companion = { action: "put" as const, reference: recordReferences["work-item/description"](owner), expected: null, content: "Fix it" };
  const result = await transitionStoreErrand({ store: h.store, identity: "alice", projectId: async () => "project-id", companionWrites: [companion] },
    { kind: "create", record: record() });
  expect(result).toMatchObject({ kind: "applied", value: { owner: "alice" } });
  expect(batch).toHaveBeenCalledOnce(); expect(batch.mock.calls[0]![0].writes).toHaveLength(2);
  const found = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("fix-it") }));
  expect(lifecycleSuccess(await h.store.read({ reference: found.reference }))).toMatchObject({ placement: { kind: "active" },
    links: { branches: [{ repository: "project-id", ref: "chore/fix-it", linkedAs: "created", excluded: [] }] } });
});
it("pulls before reading, refuses foreign and missing owners, and excludes completed Errands", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })),
    JSON.stringify({ ...record(), owner: "bob" }), { kind: "active" });
  const order: string[] = [];
  const original = h.store.lookup.bind(h.store); vi.spyOn(h.store, "lookup").mockImplementation(async (input) => { order.push("lookup"); return original(input); });
  const sync = createStoreSyncPort({ pull: async () => { order.push("pull"); return { status: "pulled" }; } });
  expect(await readStoreErrand({ store: h.store, identity: "alice", sync }, "fix-it")).toMatchObject({ kind: "refused", reason: expect.stringContaining("bob") });
  expect(order.slice(0, 2)).toEqual(["pull", "lookup"]);
  const changed = lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version,
    content: JSON.stringify(record()), placement: { kind: "active" }, provenance: { verb: "test", lifecycleAction: "update" } }));
  expect(await readStoreErrand({ store: h.store, identity: "alice" }, "fix-it")).toMatchObject({ kind: "refused", reason: expect.stringContaining("owner") });
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: changed.version!, content: JSON.stringify({ ...record(), owner: "alice" }),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "test", lifecycleAction: "complete" } }));
  expect(await readStoreErrand({ store: h.store, identity: "alice" }, "fix-it")).toEqual({ kind: "ready", record: null });
});
it("retires by exact claim at completed with its timestamp, and a rerun is idempotent", async () => {
  const h = createLifecycleHarness();
  const opened = await transitionStoreErrand({ store: h.store, identity: "alice", projectId: async () => "project-id" }, { kind: "create", record: record() });
  if (opened.kind !== "applied" || opened.value === null) throw new Error("Expected open");
  const now = "2026-10-15T01:02:03Z";
  const options = { store: h.store, identity: "alice", now: () => now };
  const request = { kind: "retire" as const, previous: opened.value, reason: "abandon" as const, authorization: "local" as const };
  expect(await transitionStoreErrand(options, request)).toMatchObject({ kind: "applied", value: null });
  const found = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("fix-it") }));
  const saved = lifecycleSuccess(await h.store.read({ reference: found.reference }));
  expect(saved.placement).toEqual({ kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  expect(JSON.parse(saved.content)).toMatchObject({ updatedAt: now, owner: "alice" });
  expect(await transitionStoreErrand(options, request)).toMatchObject({ kind: "idempotent", value: null });
});
it("refuses an invalid transition without writing", async () => {
  const h = createLifecycleHarness(), batch = vi.spyOn(h.store, "batch");
  const opened = await transitionStoreErrand({ store: h.store, identity: "alice", projectId: async () => "project-id" }, { kind: "create", record: record() });
  if (opened.kind !== "applied" || opened.value === null) throw new Error("Expected open");
  batch.mockClear();
  expect(await transitionStoreErrand({ store: h.store, identity: "alice" }, { kind: "retire", previous: opened.value,
    reason: "abandon", lifecycle: { kind: "open" } as never })).toMatchObject({ kind: "refused" });
  expect(batch).not.toHaveBeenCalled();
});

it("treats a stale write already equal to its computed result as idempotent, and never recomputes a differing stale write", async () => {
  const h = createLifecycleHarness();
  const opened = await transitionStoreErrand({ store: h.store, identity: "alice", projectId: async () => "project-id" }, { kind: "create", record: record() });
  if (opened.kind !== "applied" || opened.value === null) throw new Error("Expected open");
  const previous = opened.value;
  const batch = h.store.batch.bind(h.store);
  let attempts = 0;
  vi.spyOn(h.store, "batch").mockImplementation(async (input) => {
    attempts += 1;
    await batch(input);
    return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [input.writes[0]!.reference],
      condition: "Version moved", remedy: { text: "Read again" } } };
  });
  const request = { kind: "link" as const, previous, originEntry: "Captured entry", originEntrySourceDigest: `sha256:${"a".repeat(64)}` as const, updatedAt: "2026-10-15T00:00:00Z" };
  expect(await transitionStoreErrand({ store: h.store, identity: "alice" }, request)).toMatchObject({ kind: "idempotent" });
  expect(attempts).toBe(1);
  vi.restoreAllMocks();
  const changed = await readStoreErrand({ store: h.store, identity: "alice" }, "fix-it");
  if (changed.kind !== "ready" || changed.record?.kind !== "errand" || changed.record.purpose !== "errand") throw new Error("Expected linked Errand");
  vi.spyOn(h.store, "batch").mockImplementation(async (input) => ({ status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [input.writes[0]!.reference],
    condition: "Version moved", remedy: { text: "Read again" } } }));
  const retired = await transitionStoreErrand({ store: h.store, identity: "alice", now: () => "2026-10-16T00:00:00Z" },
    { kind: "retire", previous: changed.record, reason: "abandon", authorization: "local" });
  expect(retired).toMatchObject({ kind: "refused", reason: expect.stringContaining("changed") });
});

it("keeps create-only description companions out of the actual awaiting-merge resume transition", async () => {
  const h = createLifecycleHarness(), head = "b".repeat(40);
  const previous = { ...record(), owner: SlugSchema.parse("alice"), state: "awaiting-merge" as const, savedHead: null,
    changeRequest: { repositoryRef: "owner/repo", hostRef: "github.com", baseRef: "main", headRef: "chore/fix-it", headSha: head } };
  const primary = await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })), JSON.stringify(previous), { kind: "active" });
  const description = await h.seed(recordReferences["work-item/description"](primary.reference.owner), "## Description\n\n### **Original concern**\n- _Id:_ `12345678`\n");
  const companion = { action: "put" as const, reference: description.reference, expected: description.version,
    content: description.content + "\n### **Prematurely minted concern**\n- _Id:_ `87654321`\n" };
  const exec = scriptGitExec([
    { match: ["config", "--get", "remote.origin.url"], responses: [{ stdout: "git@github.com:owner/repo.git\n" }] },
    { command: "gh", match: { prefix: ["pr", "list"] }, responses: [{ stdout: JSON.stringify([{ number: 7, state: "OPEN", baseRefName: "main", headRefName: "chore/fix-it", headRefOid: head, reviewDecision: "CHANGES_REQUESTED" }]) }] },
  ]).exec;
  const authorization = await authorizeOrdinaryErrandResume(exec, "main", previous);
  if (authorization.kind !== "authorized") throw new Error(JSON.stringify(authorization));
  expect(await transitionStoreErrand({ store: h.store, identity: "alice", companionWrites: [companion] },
    { kind: "resume", previous, authorization: authorization.authorization, updatedAt: "2026-10-17T00:00:00Z" })).toMatchObject({ kind: "applied", value: { state: "open", claimId: previous.claimId } });
  expect(lifecycleSuccess(await h.store.read({ reference: description.reference }))).toEqual(description);
});
