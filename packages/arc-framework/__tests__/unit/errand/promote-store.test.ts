/** Ordinary composition retains the Errand generation while cutting a second work branch. */
import { expect, it } from "vitest";
import { createStorePromotionSteps } from "../../../src/lib/errand/promote-store.js";
import { promoteOrdinaryErrand } from "../../../src/lib/errand/promote.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { computeDefaultCaptureSet } from "../../../src/lib/git/default-capture-set.js";
import { makeGitProcessError, scriptGitExec, scriptRawGitExec } from "../../helpers/git-exec-fake.js";
import type { PromoteFloor, PromotionFrameReceipt } from "../../../src/lib/errand/promote.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
const sha = "1".repeat(40), claimId = "a".repeat(32);
async function fixture(floor: PromoteFloor = "derivation", failCut = false, inbox = false, sourceOwner: string | null = "test-user") {
  const harness = createLifecycleHarness(), owner = OwnerIdentitySchema.parse({ type: "work-item", name: "errand-source" });
  const identity = { version: 3, slug: "errand-source", claimId, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z",
    ...(sourceOwner === null ? {} : { owner: sourceOwner }),
    kind: "errand", purpose: "errand", intent: "Useful work", branch: "chore/errand-source", origin: inbox ? "inbox" : "description", originEntry: inbox ? "Retained capture" : null,
    ...(inbox ? { originEntrySourceDigest: `sha256:${"b".repeat(64)}` } : {}),
    state: "open", savedHead: null, changeRequest: null };
  const primary = await harness.seed(recordReferences["work-item/record"](owner), JSON.stringify(identity), { kind: "active" },
    { branches: [{ repository: "repo", ref: identity.branch, linkedAs: "created", excluded: [] }] });
  const description = await harness.seed(recordReferences["work-item/description"](primary.reference.owner), "## Entries\n\n- Useful work\n");
  const fake = scriptGitExec([
    { match: ["check-ref-format", "--branch", "feat/example"], responses: [{ stdout: "feat/example" }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/heads/feat/example^{commit}"], responses: [{ failure: { exitCode: 1 } }, ...(failCut ? [{ failure: { exitCode: 1 } }] : []), { stdout: sha }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "refs/heads/chore/errand-source^{commit}"], responses: [{ stdout: sha }] },
    { match: ["branch", "feat/example", sha], responses: failCut ? [{ failure: { exitCode: 128, stderr: "interrupted cut" } }, { stdout: "" }] : [{ stdout: "" }] },
    { match: ["switch", "feat/example"], responses: [{ stdout: "" }] },
  ]);
  const options = { slug: "errand-source", name: "example", floor, type: "feat", owner: "test-user", identity: "test-user", class: "Light", store: harness.store,
    exec: fake.exec, cwd: "/checkout", repository: "repo", checkout: async () => ({ kind: "ready" as const, checkoutPath: "/checkout", allocation: "primary" as const, parentCheckoutPath: null }) };
  const steps = createStorePromotionSteps(options);
  const run = () => promoteOrdinaryErrand({ ...options, protection: "full", dependencies: { ...steps,
    settleInbox: async (frame) => frame, settleOccupancy: async (frame) => frame } });
  return { ...harness, primary, description, fake, steps, run, options, source: identity };
}
async function disputePrimary(f: Awaited<ReturnType<typeof fixture>>) {
  const remote = createMemoryRemote(); f.store.context.publication.remote = remote;
  lifecycleSuccess(await f.store.sync());
  const other = new ReferenceBackend({ state: remote.state, registry: f.store.context.registry });
  for (const [store, digit] of [[f.store, "2"], [other, "3"]] as const) {
    const record = lifecycleSuccess(await store.read({ reference: f.primary.reference }));
    const links = { ...record.links, branches: record.links!.branches!.map((link) => ({ ...link,
      excluded: [...link.excluded, { repository: "repo", sha: digit.repeat(40) }] })) };
    lifecycleSuccess(await store.write({ action: "put", reference: record.reference, expected: record.version,
      content: record.content, placement: { kind: "active" }, links,
      provenance: { verb: "test", lifecycleAction: "update" } }));
  }
  lifecycleSuccess(await f.store.sync());
  const disputed = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0); return disputed;
}
async function resolvePrimary(f: Awaited<ReturnType<typeof fixture>>, disputed: StoreRecord) {
  lifecycleSuccess(await f.store.write({ action: "put", reference: disputed.reference, expected: disputed.version,
    content: disputed.content, placement: { kind: "active" }, links: disputed.links, resolves: disputed.conflicts,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
}
it.each([false, true])("withholds promotion authority from a disputed primary, interrupted=%s", async (interrupted) => {
  const f = await fixture("derivation", interrupted);
  if (interrupted) expect(await f.run()).toMatchObject({ outcome: "error" });
  const disputed = await disputePrimary(f), before = lifecycleSuccess(await f.store.version());
  const result = await f.run();
  expect(result).toMatchObject({ outcome: "refused", recommendedPromptText: expect.stringMatching(/resolve.*retry/isu) });
  for (const reference of disputed.conflicts) expect(JSON.stringify(result)).toContain(JSON.stringify(reference).replaceAll('"', '\\"'));
  expect(lifecycleSuccess(await f.store.version())).toBe(before);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference }))).toEqual(disputed);
  await resolvePrimary(f, disputed);
  expect(await f.run()).toMatchObject({ outcome: interrupted ? "idempotent" : "applied" });
  const history = lifecycleSuccess(await f.store.history({ reference: f.primary.reference }));
  expect(history.find((entry) => "verb" in entry.provenance && entry.provenance.verb === "errand-promote")?.provenance)
    .toMatchObject({ codeHead: sha });
});
it("withholds marker settlement when the promotion primary becomes disputed after the role write", async () => {
  const f = await fixture(), exec = f.options.exec;
  const state: { disputed?: StoreRecord; settled: boolean } = { settled: false };
  f.options.exec = async (command, args, options) => {
    const result = await exec(command, args, options);
    if (args[0] === "switch" && state.disputed === undefined) state.disputed = await disputePrimary(f);
    return result;
  };
  const run = () => promoteOrdinaryErrand({ ...f.options, protection: "full", dependencies: { ...f.steps,
    settleInbox: async (frame) => frame,
    settleOccupancy: async (frame) => { state.settled = true; return frame; } } });
  const result = await run();
  expect(result).toMatchObject({ outcome: "refused", recommendedPromptText: expect.stringMatching(/resolve.*retry/isu) });
  expect(state.settled).toBe(false);
  const disputed = state.disputed; if (disputed === undefined) throw new Error("Missing conflict");
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference }))).toEqual(disputed);
  await resolvePrimary(f, disputed);
  expect(await run()).toMatchObject({ outcome: "idempotent" });
  expect(state.settled).toBe(true);
});
it("requires the source owner while retaining a separately selected target owner", async () => {
  const f = await fixture(), before = lifecycleSuccess(await f.store.version());
  f.options.identity = "bob"; f.options.owner = "new-owner";
  expect(await f.run()).toMatchObject({ outcome: "refused", reason: "identity-conflict", recommendedPromptText: expect.stringContaining("owned by test-user") });
  expect(lifecycleSuccess(await f.store.version())).toBe(before);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference }))).toEqual(f.primary);
  expect(f.fake.calls).toEqual([]);
  f.options.identity = "test-user";
  expect(await f.run()).toMatchObject({ outcome: "applied" });
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).fields).toMatchObject({ owner: "new-owner" });
});
it("refuses a missing source owner before mutation and promotes after its explicit repair", async () => {
  const f = await fixture("derivation", false, false, null), before = lifecycleSuccess(await f.store.version());
  expect(await f.run()).toMatchObject({ outcome: "refused", reason: "identity-conflict", recommendedPromptText: expect.stringMatching(/owner is missing.*repair.*retry/isu) });
  expect(lifecycleSuccess(await f.store.version())).toBe(before);
  expect(f.fake.calls).toEqual([]);
  lifecycleSuccess(await f.store.write({ action: "put", reference: f.primary.reference, expected: f.primary.version,
    content: JSON.stringify({ ...f.source, owner: "test-user" }), placement: { kind: "active" }, links: f.primary.links,
    provenance: { verb: "repair-owner", lifecycleAction: "update" } }));
  expect(await f.run()).toMatchObject({ outcome: "applied" });
});
it("puts the Planning meta on the same UID, retains aliases/history/description, and cuts then switches a created work branch", async () => {
  const f = await fixture(); expect(await f.run()).toMatchObject({ outcome: "applied", subject: { slug: "errand-source", claimId } });
  const meta = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  if (f.primary.reference.owner.type === "person") throw new Error("Expected work item");
  expect(meta.reference).toMatchObject({ kind: "work-item/meta", owner: { name: "example", uid: f.primary.reference.owner.uid } });
  expect(meta.fields).toMatchObject({ state: "Planning", currentWorkflow: "draft-design", branch: null, lastCompleted: null });
  expect(meta.placement).toEqual(f.primary.placement);
  expect(meta.links?.branches).toEqual([...f.primary.links!.branches!, { repository: "repo", ref: "feat/example", linkedAs: "created", excluded: [] }]);
  expect(lifecycleSuccess(await f.store.read({ reference: f.description.reference })).content).toBe(f.description.content);
  expect(lifecycleSuccess(await f.store.history({ reference: meta.reference })).map((entry) => entry.reference.kind)).toEqual(["work-item/meta", "work-item/record"]);
  expect(lifecycleSuccess(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("errand-source") })).reference).toEqual(meta.reference);
  expect(lifecycleSuccess(await f.store.lookup({ kind: "ref", repository: "repo", ref: "feat/example" })).reference).toEqual(meta.reference);
  expect(f.fake.calls.slice(-2).map((call) => call.args)).toEqual([["branch", "feat/example", sha], ["switch", "feat/example"]]);
  expect(await f.steps.retire(JSON.parse(f.primary.content))).toEqual({ kind: "idempotent" });
  expect(await f.steps.readIdentity()).toEqual({ kind: "ready", record: null });
  expect(await f.steps.recoverPromoted()).toMatchObject({ kind: "idempotent", metaCommitted: true, branch: "feat/example" });
});
it("scale floor starts Active and retains all Errand commits in its default capture", async () => {
  const f = await fixture("scale"); expect(await f.run()).toMatchObject({ outcome: "applied" });
  const meta = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  expect(meta.fields).toMatchObject({ state: "Active", currentWorkflow: "process-task-loop" });
  expect(meta.links?.branches?.at(-1)).toMatchObject({ linkedAs: "created", excluded: [] });
});
it("refuses a stale expected-version put without cutting any branch", async () => {
  const f = await fixture(); const identity = await f.steps.readIdentity(); if (identity.kind !== "ready" || identity.record === null || identity.record.kind !== "errand" || identity.record.purpose !== "errand") throw new Error("Missing source");
  lifecycleSuccess(await f.store.write({ action: "put", reference: f.primary.reference, expected: f.primary.version,
    content: f.primary.content, placement: { kind: "active" }, provenance: { verb: "another-write", lifecycleAction: "update" } }));
  expect(await f.steps.replaceFrame(identity.record)).toMatchObject({ kind: "refused" });
  expect(f.fake.calls.some((call) => call.args[0] === "branch" || call.args[0] === "switch")).toBe(false);
});

it("recovers a landed role put after a failed branch cut without creating another record generation", async () => {
  const f = await fixture("derivation", true);
  expect(await f.run()).toMatchObject({ outcome: "error" });
  const meta = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  expect(meta.reference.kind).toBe("work-item/meta");
  expect(await f.run()).toMatchObject({ outcome: "idempotent", settlement: { state: "settled", identity: "retired" } });
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).version).toBe(meta.version);
  expect(lifecycleSuccess(await f.store.history({ reference: meta.reference }))).toHaveLength(2);
});

it("includes the scale-floor Errand tip in the linked work branch's default task capture", async () => {
  const f = await fixture("scale"); await f.run();
  const meta = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  const base = "2".repeat(40);
  const git = scriptGitExec([
    { match: ["remote"], responses: [{ stdout: "" }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/heads/main^{commit}"], responses: [{ stdout: base }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["--no-replace-objects", "rev-list", "--no-merges", "refs/heads/feat/example", "--not", base], responses: [{ stdout: sha }] },
  ]);
  const body = `tree ${"3".repeat(40)}\nparent ${base}\nauthor Test <test@example.com> 123 +0000\ncommitter Test <test@example.com> 123 +0000\n\nEmpty Errand commit\n`;
  const raw = scriptRawGitExec([
    { match: ["--no-replace-objects", "cat-file", "--batch"], responses: [{ stdout: Buffer.from(`${sha} commit ${Buffer.byteLength(body)}\n${body}\n`), stderr: Buffer.alloc(0) }] },
    { match: { prefix: ["--no-replace-objects", "-c"] }, responses: [{ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }] },
  ]);
  const work = meta.links?.branches?.at(-1); if (work === undefined) throw new Error("Missing promoted link");
  expect(await computeDefaultCaptureSet({ exec: git.exec, execRaw: raw.exec, cwd: "/checkout", baseBranch: "main", repository: "repo",
    tips: [`refs/heads/${work.ref}`], captures: Object.values(meta.links?.taskCaptures ?? {}).flat(), exclusions: work.excluded })).toMatchObject({ status: "available", commits: [{ sha }] });
});

it("settles a retained inbox capture after role-put recovery and retries an interrupted settlement", async () => {
  const f = await fixture("derivation", true, true);
  expect(await f.run()).toMatchObject({ outcome: "error" });
  const landed = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  const captures = new Set(["Retained capture"]); let offline = true, occupied = false;
  const dependencies = { ...f.steps,
    settleInbox: async (frame: PromotionFrameReceipt) => {
      if (offline) return { kind: "error" as const, message: "Inbox unavailable" };
      if (frame.originEntry !== null) captures.delete(frame.originEntry);
      return { ...frame, originEntry: null, originEntrySourceDigest: null };
    },
    settleOccupancy: async (frame: PromotionFrameReceipt) => {
      occupied = true; return frame;
    } };
  const run = () => promoteOrdinaryErrand({ ...f.options, protection: "full", dependencies });
  expect(await run()).toMatchObject({ outcome: "error", error: { message: "Inbox unavailable" } });
  expect(captures).toEqual(new Set(["Retained capture"])); expect(occupied).toBe(false);
  offline = false;
  expect(await run()).toMatchObject({ outcome: "idempotent", subject: { slug: "errand-source", claimId },
    settlement: { state: "settled", originEntry: null } });
  expect(captures.size).toBe(0); expect(occupied).toBe(true);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).version).toBe(landed.version);
  expect(lifecycleSuccess(await f.store.history({ reference: landed.reference }))).toHaveLength(2);
});

async function interruptedPromotion() {
  const f = await fixture();
  const branches = new Map([["chore/errand-source", sha]]);
  let failCut = true, currentBranch = "chore/errand-source", settled = false;
  const exec: typeof f.options.exec = async (command, args) => {
    const ok = (stdout = "") => ({ stdout, stderr: "" });
    if (args[0] === "check-ref-format") return ok("feat/example");
    if (args.includes("rev-parse")) {
      const branch = args.at(-1)!.replace(/^refs\/heads\//u, "").replace(/\^\{commit\}$/u, "");
      const tip = branches.get(branch);
      if (tip === undefined) throw makeGitProcessError({ command, args, exitCode: 1 });
      return ok(tip);
    }
    if (args[0] === "branch") {
      if (failCut) { failCut = false; throw makeGitProcessError({ command, args, exitCode: 128, stderr: "interrupted cut" }); }
      branches.set(args[1]!, args[2]!); return ok();
    }
    if (args[0] === "switch") { currentBranch = args[1]!; return ok(); }
    throw new Error(`Unexpected invocation: ${args.join(" ")}`);
  };
  const run = () => promoteOrdinaryErrand({ ...f.options, protection: "full", dependencies: {
    ...createStorePromotionSteps({ ...f.options, exec }), settleInbox: async (frame) => frame,
    settleOccupancy: async (frame) => { settled = true; return frame; },
  } });
  expect(await run()).toMatchObject({ outcome: "error" });
  return { ...f, branches, run, state: () => ({ currentBranch, settled }) };
}

it("refuses a foreign retry target without switching or settlement, then recovers after owner repair", async () => {
  const f = await interruptedPromotion(), foreign = "2".repeat(40);
  const meta = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  lifecycleSuccess(await f.store.write({ action: "put", reference: meta.reference, expected: meta.version,
    content: meta.content, placement: { kind: "active" }, provenance: { verb: "save", lifecycleAction: "update", codeHead: foreign } }));
  const updated = lifecycleSuccess(await f.store.read({ reference: meta.reference }));
  f.branches.set("feat/example", foreign);
  expect(await f.run()).toMatchObject({ outcome: "refused", recommendedPromptText: expect.stringMatching(/conflict.*repair.*retry/isu) });
  expect(f.state()).toEqual({ currentBranch: "chore/errand-source", settled: false });
  expect(f.branches.get("feat/example")).toBe(foreign);
  expect(lifecycleSuccess(await f.store.read({ reference: meta.reference })).version).toBe(updated.version);
  f.branches.delete("feat/example");
  expect(await f.run()).toMatchObject({ outcome: "idempotent", settlement: { state: "settled" } });
  expect(f.branches.get("feat/example")).toBe(sha);
  expect(f.state()).toEqual({ currentBranch: "feat/example", settled: true });
});

it("recovers the recorded promotion cut even when the retained Errand branch moves", async () => {
  const f = await interruptedPromotion();
  f.branches.set("chore/errand-source", "2".repeat(40));
  expect(await f.run()).toMatchObject({ outcome: "idempotent", settlement: { state: "settled" } });
  expect(f.branches.get("feat/example")).toBe(sha);
  const history = lifecycleSuccess(await f.store.history({ reference: f.primary.reference }));
  expect(history[0]?.provenance).toMatchObject({ verb: "errand-promote", lifecycleAction: "promote", codeHead: sha });
});

it("refuses missing promotion-cut evidence without guessing and continues when the exact history is restored", async () => {
  const f = await interruptedPromotion(), history = f.store.history.bind(f.store);
  let restored = false;
  f.store.history = async (input) => {
    const result = await history(input);
    if (restored || result.status !== "ok") return result;
    return { ...result, result: result.result.map((entry) => {
      if (!("verb" in entry.provenance) || entry.provenance.verb !== "errand-promote") return entry;
      const provenance = { ...entry.provenance }; delete provenance.codeHead;
      return { ...entry, provenance };
    }) };
  };
  const before = lifecycleSuccess(await f.store.read({ reference: f.primary.reference }));
  expect(await f.run()).toMatchObject({ outcome: "refused", recommendedPromptText: expect.stringMatching(/cut commit.*repair.*retry/isu) });
  expect(f.branches.has("feat/example")).toBe(false);
  expect(f.state()).toEqual({ currentBranch: "chore/errand-source", settled: false });
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference }))).toEqual(before);
  restored = true;
  expect(await f.run()).toMatchObject({ outcome: "idempotent", settlement: { state: "settled" } });
  expect(f.branches.get("feat/example")).toBe(sha);
});

it("refuses completed Errands without Git or role writes", async () => {
  const f = await fixture();
  lifecycleSuccess(await f.store.write({ action: "put", reference: f.primary.reference, expected: f.primary.version,
    content: f.primary.content, placement: { kind: "completed", quarter: "2026-q4" as never }, provenance: { verb: "close", lifecycleAction: "complete" } }));
  expect(await f.run()).toMatchObject({ outcome: "refused" });
  expect(f.fake.calls).toEqual([]);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).reference.kind).toBe("work-item/record");
});
it("runs the checkout callback before Git or writes and preserves its refusal", async () => {
  const f = await fixture();
  const callback = async () => ({ kind: "refused" as const, reason: "role-conflict" as const, message: "Exact checkout is unavailable" });
  const steps = createStorePromotionSteps({ ...f.options, checkout: callback });
  const read = await steps.readIdentity(); if (read.kind !== "ready" || read.record?.kind !== "errand" || read.record.purpose !== "errand") throw new Error("Missing Errand");
  expect(await steps.replaceFrame(read.record)).toEqual(await callback());
  expect(f.fake.calls).toEqual([]);
  expect(lifecycleSuccess(await f.store.read({ reference: f.primary.reference })).version).toBe(f.primary.version);
});

it("preserves a qualified inbox origin's null digest through role change and history recovery", async () => {
  const f = await fixture("derivation", false, true);
  const source = JSON.parse(f.primary.content) as Record<string, unknown>;
  lifecycleSuccess(await f.store.write({ action: "put", reference: f.primary.reference, expected: f.primary.version,
    content: JSON.stringify({ ...source, originEntry: "personal:abcd1234", originEntrySourceDigest: null }), placement: { kind: "active" },
    links: f.primary.links, provenance: { verb: "test", lifecycleAction: "origin" } }));
  const read = await f.steps.readIdentity();
  if (read.kind !== "ready" || read.record?.kind !== "errand" || read.record.purpose !== "errand") throw new Error("Expected source");
  expect(await f.steps.replaceFrame(read.record)).toMatchObject({ kind: "applied", originEntry: "personal:abcd1234", originEntrySourceDigest: null });
  expect(await f.steps.recoverPromoted()).toMatchObject({ kind: "idempotent", originEntry: "personal:abcd1234", originEntrySourceDigest: null });
});
