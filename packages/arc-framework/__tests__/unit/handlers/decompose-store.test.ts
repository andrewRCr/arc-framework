/** Actual handler composition over checked operational records and scripted physical boundaries. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDecomposeOriginFixture } from "../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../fixtures/decompose-v4.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { CutMapMachineSchema } from "../../../src/lib/decompose/cut-map-machine.js";
import { readWorkUnit } from "../../../src/lib/store/lifecycle-write.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { writeWorktreeMarker, resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { LocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { DecomposeAdditiveReportSchema } from "../../../src/lib/decompose/additive-report.js";
const state = vi.hoisted(() => ({ root: "", exec: undefined as GitExec | undefined }));
vi.mock("../../../src/lib/paths.js", async original => ({
  ...await original<typeof import("../../../src/lib/paths.js")>(), resolveArcRoot: () => state.root,
}));
vi.mock("../../../src/lib/io-context.js", async original => {
  const actual = await original<typeof import("../../../src/lib/io-context.js")>();
  return { ...actual, createUserIOContext: () => ({ ...actual.createUserIOContext(), exec: state.exec,
    execInput: async () => { throw new Error("Unexpected Git stdin transaction."); } }) };
});
import { handleDecompose, type DecomposeOptions } from "../../../src/handlers/decompose.js";

let previousExitCode: typeof process.exitCode;
beforeEach(async () => {
  vi.resetAllMocks();
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
  state.root = await mkdtemp(join(tmpdir(), "arc-decompose-handler-"));
  await mkdir(join(state.root, ".arc/system"), { recursive: true });
  await mkdir(join(state.root, ".git"));
  await writeFile(join(state.root, ".arc/system/arc-config.yml"), "branch:\n  base: main\n  protection: full\nteam:\n  mode: false\n");
  state.exec = scriptGitExec([{ match: ["config", "--null", "--get", "arc.identity"], responses: [{ stdout: "test-user\0", stderr: "" }] }]).exec;
});
afterEach(async () => { vi.restoreAllMocks(); process.exitCode = previousExitCode; await rm(state.root, { recursive: true, force: true }); });

async function invoke(store: Store, options: DecomposeOptions, locusPorts: LocusPorts = {
  ...createDefaultLocusPorts(), findHoldingCheckout: async () => null,
}) {
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  process.exitCode = undefined;
  await handleDecompose("origin", options, undefined, { store, locusPorts });
  const text = stdout.mock.calls.map(call => String(call[0])).join("");
  expect(text.startsWith("{")).toBe(true);
  const result = JSON.parse(text);
  expect(text).toBe(`${canonicalize(result)}\n`);
  const diagnostics = stderr.mock.calls.map(call => String(call[0])).join("");
  if (result.status === "refused") {
    expect(process.exitCode).toBe(1);
    expect(diagnostics).toContain(`${result.reason}\n${result.remedy.text}\n`);
  } else { expect(process.exitCode).toBeUndefined(); expect(diagnostics).toBe(""); }
  stdout.mockRestore(); stderr.mockRestore();
  return result;
}

it.each([false, true])("runs a retirement through handler-built store and cleanup contexts, held=%s", async held => {
  const h = await createDecomposeOriginFixture(held);
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "example" })), "{}");
  const marker = resolveWorktreeMarkerPath(state.root);
  await writeFile(join(state.root, "personal.txt"), "Retained personal content.");
  if (held) await writeWorktreeMarker(state.root, { spawnedByArc: false, wuName: "origin",
    createdFor: { kind: "work-unit", name: "origin" }, spawningIdentity: "test-user", createdAt: "2026-10-14T00:00:00.000Z" });
  const base = "a".repeat(40);
  const git = scriptGitExec([
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ stdout: "test-user\0", stderr: "" }] },
    { match: ["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"], responses: [{ stdout: "", stderr: "" }] },
    { match: ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"], responses: [{ stdout: base, stderr: "" }] },
    { match: ["worktree", "list", "--porcelain", "-z"], responses: [{ stdout: `worktree ${state.root}\0HEAD ${base}\0detached\0\0`, stderr: "" }] },
    { match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: join(state.root, ".git"), stderr: "" }] },
  ]);
  state.exec = git.exec;
  const locus = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => held && await readFile(marker).then(() => true, () => false) ? state.root : null };
  const starter = await invoke(h.store, { preflight: true }, locus);
  expect(starter).toHaveProperty("machine");
  const map = completeCutMapFixture(CutMapMachineSchema.parse(starter.machine));
  await writeFile(join(state.root, "cut.json"), JSON.stringify(map));
  const additive = await invoke(h.store, { execute: "cut.json" }, locus);
  expect(DecomposeAdditiveReportSchema.parse(additive)).toMatchObject({ origin: "origin", members: [{ slug: "member-a" }, { slug: "member-b" }] });
  const authored = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](additive.members[0]!.meta.owner) }));
  await h.handEdit(authored, `${authored.content}\nAuthored destination detail.\n`);
  const preview = await invoke(h.store, { finish: true }, locus);
  expect(preview).toMatchObject({ kind: "preview", mode: "retirement-finish" });
  const applied = await invoke(h.store, { finish: true, apply: preview.applyAuthority }, locus);
  expect(applied).toMatchObject({ kind: "applied" });
  expect(applied.continuation).toBeUndefined();
  expect(await readWorkUnit(h.store, "origin")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: recordReferences["lineage/transition"](h.primary.reference.owner) })).fields)
    .toMatchObject({ kind: "decompose", retiredBranches: [] });
  if (held) {
    expect(await readFile(marker).then(() => true, () => false)).toBe(false);
    expect(applied.notices).toContain(`Released checkout ${state.root}; its files were retained.`);
  }
  expect(await readFile(join(state.root, "personal.txt"), "utf8")).toBe("Retained personal content.");
});

it("routes both revision forms and discard through approved previews without changing origin content", async () => {
  const h = await createDecomposeOriginFixture();
  const starter = await invoke(h.store, { preflight: true });
  const map = completeCutMapFixture(CutMapMachineSchema.parse(starter.machine));
  await writeFile(join(state.root, "cut.json"), JSON.stringify(map));
  const additive = DecomposeAdditiveReportSchema.parse(await invoke(h.store, { execute: "cut.json" }));
  const carried = await invoke(h.store, { revise: true });
  expect(carried).toMatchObject({ status: "carried", map });
  const changed = carried.map.authoring.destinations[1];
  changed.slug = "member-c";
  carried.map.authoring.internalEdges = [{ from: "member-a", to: "member-c" }];
  await writeFile(join(state.root, "revised.json"), JSON.stringify(carried.map));
  const revision = await invoke(h.store, { revise: "revised.json" });
  expect(revision).toMatchObject({ kind: "preview", mode: "revise", members: ["member-a", "member-c"] });
  expect(await readWorkUnit(h.store, "member-b")).toMatchObject({ status: "ok" });
  expect(await invoke(h.store, { revise: "revised.json", apply: revision.applyAuthority })).toMatchObject({ kind: "revised" });
  expect(await readWorkUnit(h.store, "member-b")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readWorkUnit(h.store, "member-c")).toMatchObject({ status: "ok" });
  const discard = await invoke(h.store, { discard: true });
  expect(discard).toMatchObject({ kind: "preview", mode: "discard" });
  expect(await invoke(h.store, { discard: true, apply: discard.applyAuthority })).toMatchObject({ kind: "discarded" });
  for (const name of ["member-a", "member-c"]) expect(await readWorkUnit(h.store, name)).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await h.store.read({ reference: additive.storedMap })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.draft.reference })).content).toBe(h.draft.content);
});

it("routes extraction and finish while retaining the origin", async () => {
  const h = await createDecomposeOriginFixture(true);
  const starter = await invoke(h.store, { preflight: true });
  const map = completeCutMapFixture(CutMapMachineSchema.parse(starter.machine), true);
  await writeFile(join(state.root, "extract.json"), JSON.stringify(map));
  expect(DecomposeAdditiveReportSchema.parse(await invoke(h.store, { extract: "extract.json" })).members).toHaveLength(1);
  const preview = await invoke(h.store, { finish: true });
  expect(preview).toMatchObject({ kind: "preview", mode: "extraction-finish" });
  expect(await invoke(h.store, { finish: true, apply: preview.applyAuthority })).toMatchObject({ kind: "applied" });
  expect(await readWorkUnit(h.store, "origin")).toMatchObject({ status: "ok" });
  expect(await h.store.lookup({ kind: "lineage", origin: "origin" })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it.each([{ advanceBase: "absent.json" }, { finish: "absent.json" }])("refuses obsolete store forms with a typed finish action: %o", async options => {
  const h = await createDecomposeOriginFixture();
  const before = lifecycleSuccess(await h.store.version());
  expect(await invoke(h.store, options)).toMatchObject({ status: "refused", reason: options.advanceBase ? "unsupported" : "finish-map-operand",
    remedy: { argv: ["arc", "decompose", "origin", "--finish"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("refuses a missing identity through the canonical emitter and admits the same read after configuration", async () => {
  const h = await createDecomposeOriginFixture();
  const configured = state.exec;
  state.exec = scriptGitExec([
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["config", "--get", "user.name"], responses: [{ failure: { exitCode: 1 } }] },
  ]).exec;
  const before = lifecycleSuccess(await h.store.version());
  expect(await invoke(h.store, { preflight: true })).toMatchObject({ status: "refused", reason: "identity-required", remedy: { argv: ["arc", "init"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  state.exec = configured;
  expect(await invoke(h.store, { preflight: true })).toHaveProperty("machine");
});

it("preserves native terminal store refusals and admits a read after the boundary recovers", async () => {
  const h = await createDecomposeOriginFixture();
  const native = { code: "refused" as const, class: "terminal" as const, condition: "State is unavailable.", message: "State is unavailable.",
    remedy: { text: "Restore the state source before retrying." } };
  const store = new Proxy(h.store, { get(target, property) {
    if (property === "read") return async () => ({ status: "refused", refusal: native });
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await invoke(store, { preflight: true })).toMatchObject({ status: "refused", reason: "store", class: "terminal", remedy: native.remedy, storeRefusal: native });
  expect(await invoke(h.store, { preflight: true })).toHaveProperty("machine");
});

it("reports an unreadable map operand and completes after restoring the same path", async () => {
  const h = await createDecomposeOriginFixture();
  expect(await invoke(h.store, { execute: "absent.json" })).toMatchObject({ status: "refused", reason: "invalid-structure", locus: "absent.json" });
  const starter = await invoke(h.store, { preflight: true });
  await writeFile(join(state.root, "absent.json"), JSON.stringify(completeCutMapFixture(CutMapMachineSchema.parse(starter.machine))));
  expect(DecomposeAdditiveReportSchema.parse(await invoke(h.store, { execute: "absent.json" })).members).toHaveLength(2);
});
