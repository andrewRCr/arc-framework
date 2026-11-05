/** UID-selected Errand exits retain their exact owner over real refs and registered commands. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { recordReferences, OwnerIdentitySchema } from "../../src/lib/store/identity.js";
import { writeRoutingReceipt } from "../../src/lib/store/kinds/routing-receipt.js";
import { entry } from "../helpers/inbox-harness.js";
import { listInbox } from "../../src/lib/inbox/listing.js";
import { TransientIdentityRecordV3Schema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
const uidA = "abcdef01-2345-4678-9abc-def012345678", uidB = "abcdef02-2345-4678-9abc-def012345678";
async function fixture(protection = "full") {
  const f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS)), exec = makeGitExec(f.root);
  await exec("git", ["config", "arc.identity", "test-user"]);
  await mkdir(join(f.root, ".arc/system"), { recursive: true });
  await writeFile(join(f.root, ".arc/system/arc-config.yml"), `branch.base: main\nbranch.protection: ${protection}\nsession.remote_sync: disabled\n`);
  await writeFile(join(f.root, ".gitignore"), ".arc-checkouts/\n.arc/system/.internal/\n.arc/user/\n");
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "Configure Errand fixture"]);
  await exec("git", ["push", "-u", "origin", "main"]);
  const ref = f.reference("project-registry/identity"), content = f.content(ref);
  const project = success(await f.store.write({ action: "put", reference: ref, expected: null, content, provenance: { verb: "seed", lifecycleAction: "create" } }));
  const repository = project.reference.owner.type === "project" ? project.reference.owner.uid : undefined;
  if (repository === undefined) throw new Error("Expected project UID");
  return { ...f, exec, repository };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function invoke(f: Fixture, cwd: string, args: readonly string[]) {
  const previous = process.cwd(), exit = process.exitCode;
  let stdout = "", stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { stderr += String(chunk); return true; });
  try {
    binding.store = f.store; process.chdir(cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...args]);
    return { stdout, stderr, exitCode: process.exitCode, result: stdout.trim().startsWith("{") ? JSON.parse(stdout) as unknown : null };
  } finally { binding.store = null; out.mockRestore(); err.mockRestore(); process.chdir(previous); process.exitCode = exit; }
}
async function errand(f: Fixture, uid: string, prefix = "chore", checkout = true) {
  const claimId = (uid === uidA ? "a" : "b").repeat(32), slug = "shared", branch = `${prefix}/${slug}`;
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug, claimId,
    intent: "Retain the exact owner", owner: "test-user", branch, createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z",
    origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null });
  const reference = await plantRefPrimary(f, { kind: "work-item/record", uid, name: slug, content: serializeTransientIdentityRecord(record) });
  const registry = f.ports.registry;
  if (registry === undefined) throw new Error("Expected registry");
  const home = expandStoredPath(reference, { registry });
  const entries = await capturedEntries(f, home.ref);
  const metadata = entries.find(entry => entry.path === `metadata-${uid}.json`);
  if (metadata === undefined) throw new Error("Expected metadata");
  const parsed = JSON.parse((await f.exec("git", ["show", `${home.ref}:${metadata.path}`])).stdout) as { primary: { links?: unknown } };
  parsed.primary.links = { branches: [{ repository: f.repository, ref: branch, linkedAs: "created", excluded: [] }] };
  await plantRef(f.root, home.ref, entries.map(entry => entry === metadata ? { path: entry.path, content: JSON.stringify(parsed) } : entry));
  const holder = join(f.root, ".arc-checkouts", uid);
  if (checkout) {
    await f.exec("git", ["worktree", "add", "-b", branch, holder, "main"]);
    await writeWorktreeMarker(holder, { spawnedByArc: true, spawningIdentity: "test-user", createdAt: record.createdAt,
      parentCheckoutPath: f.root, createdFor: { kind: "errand", slug, claimId }, provisioning: "ready" });
  }
  return { reference, holder, record, claimId, branch };
}

it.each(["close", "abandon"])("refuses a partial Errand UID before runtime dispatch for %s", async verb => {
  const f = await fixture("partial");
  const result = await invoke(f, f.root, ["errand", verb, uidA, "--json"]);
  expect(result, JSON.stringify(result)).toMatchObject({ exitCode: 1, result: { outcome: "refused", reason: "identity-conflict",
    recommendedPromptText: expect.stringContaining(uidA) } });
  expect(JSON.stringify(result.result)).toMatch(/pull/iu);
}, 60_000);

it("closes only the UID-selected Errand and leaves the remaining slug resolvable", async () => {
  const f = await fixture(), selected = await errand(f, uidA, "fix"), other = await errand(f, uidB);
  const before = success(await f.store.read({ reference: other.reference }));
  const frame = await runDerivedLocusStateProbe({ cwd: selected.holder, store: f.store, exec: makeGitExec(selected.holder), identity: "test-user", baseBranch: "main" });
  expect(frame.entering, JSON.stringify(frame)).toMatchObject({ kind: "selected", row: { kind: "transient" } });
  expect(frame.roster.flatMap(row => row.kind === "transient" && row.subject?.kind === "errand" ? [row.subject.claimId] : []).sort())
    .toEqual([selected.claimId, other.claimId]);
  expect(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
  const result = await invoke(f, selected.holder, ["errand", "close", uidA.toUpperCase(), "--json"]);
  expect(result, JSON.stringify(result)).toMatchObject({ result: { outcome: "applied" } });
  expect(success(await f.store.read({ reference: selected.reference })).placement?.kind).toBe("completed");
  expect(success(await f.store.read({ reference: other.reference }))).toEqual(before);
  expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(other.reference);
}, 60_000);

it("refuses a clashed branch on the machine holding only the other Errand checkout", async () => {
  const f = await fixture(), selected = await errand(f, uidA, "chore", false), other = await errand(f, uidB);
  const before = success(await f.store.version());
  const result = await invoke(f, f.root, ["errand", "close", uidA, "--json"]);
  expect(result, JSON.stringify(result)).toMatchObject({ exitCode: 1, result: { outcome: "refused", reason: "identity-conflict",
    recommendedPromptText: expect.stringMatching(/machine.*holding.*checkout/iu) } });
  expect(success(await f.store.version())).toBe(before);
  expect((await f.exec("git", ["show-ref", "--verify", `refs/heads/${other.branch}`])).stdout).not.toBe("");
  expect(success(await f.store.read({ reference: selected.reference })).placement?.kind).toBe("active");
  await f.exec("git", ["worktree", "remove", other.holder]);
  await f.exec("git", ["worktree", "add", selected.holder, selected.branch]);
  await writeWorktreeMarker(selected.holder, { spawnedByArc: true, spawningIdentity: "test-user", createdAt: selected.record.createdAt,
    parentCheckoutPath: f.root, createdFor: { kind: "errand", slug: "shared", claimId: selected.claimId }, provisioning: "ready" });
  const repaired = await invoke(f, selected.holder, ["errand", "close", uidA, "--json"]);
  expect(repaired, JSON.stringify(repaired)).toMatchObject({ result: { outcome: "applied" } });
  expect(success(await f.store.read({ reference: other.reference })).placement?.kind).toBe("active");
}, 60_000);

it("abandons only its UID owner and returns its own entries while retaining the other same-slug holder's capture", async () => {
  const f = await fixture(), selected = await errand(f, uidA, "fix"), other = await errand(f, uidB);
  const person = OwnerIdentitySchema.parse({ type: "person", name: "test-user" });
  const description = (owner: typeof selected.reference.owner) => recordReferences["work-item/description"](owner);
  const seed = async (reference: ReturnType<typeof description>, content: string, verb = "errand-open") =>
    success(await f.store.write({ action: "put", reference, content, expected: null, provenance: { verb, lifecycleAction: "open" } }));
  await seed(description(selected.reference.owner), `## Description\n\n${entry("11111111", "Selected entry")}\n\n${entry("33333333", "Held capture")}\n`);
  await seed(description(other.reference.owner), `## Description\n\n${entry("22222222", "Other entry")}\n\n${entry("33333333", "Held capture")}\n`);
  await seed(recordReferences["personal/inbox"](person), "## Errand\n");
  for (const [index, uid] of [uidA, uidB].entries()) await seed(recordReferences["personal/routing-receipt"](person, `move-${index}`),
    writeRoutingReceipt({ entryId: "33333333", source: { list: "personal", identity: "test-user", section: "Errand" },
      destination: { list: uid, section: "Description" }, time: `2026-10-${17 + index}T00:00:00Z` }), "errand-abandon");
  const original = success(await f.store.read({ reference: other.reference }));
  const otherDescription = success(await f.store.read({ reference: description(other.reference.owner) }));
  const result = await invoke(f, selected.holder, ["errand", "abandon", uidA, "--json"]);
  expect(result, JSON.stringify(result)).toMatchObject({ result: { outcome: "applied" } });
  expect(success(await f.store.read({ reference: selected.reference })).placement?.kind).toBe("completed");
  expect(success(await f.store.read({ reference: other.reference }))).toEqual(original);
  expect(success(await f.store.read({ reference: description(other.reference.owner) }))).toEqual(otherDescription);
  expect(await listInbox({ list: "personal" }, { store: f.store, identity: "test-user", now: () => new Date() }))
    .toMatchObject({ entries: [{ id: "11111111" }] });
  expect(success(await f.store.read({ reference: description(selected.reference.owner) })).content).toContain("33333333");
  expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") })).reference).toEqual(other.reference);
}, 60_000);

it.each(["close", "abandon"])("renders a partial UID's not-found repair as text for %s", async verb => {
  const f = await fixture("partial"), result = await invoke(f, f.root, ["errand", verb, uidA]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain(uidA);
  expect(result.stdout + result.stderr).toMatch(/pull/iu);
}, 60_000);

it.each(["close", "abandon"])("reports a thrown listing boundary under the %s identity-read stage", async verb => {
  const f = await fixture("partial");
  f.store = createRefStore({ ...f.ports, rawExec: async () => { throw new Error("Injected raw Git failure"); } });
  const result = await invoke(f, f.root, ["errand", verb, uidA, "--json"]);
  expect(result, JSON.stringify(result)).toMatchObject({ exitCode: 1, result: { outcome: "error",
    error: { code: `locus.errand-${verb}.identity-read`, message: expect.stringContaining("Injected raw Git failure") } } });
}, 60_000);

it("closes an unambiguous slug without a local checkout through foreign confirmation", async () => {
  const f = await fixture(), selected = await errand(f, uidA);
  await f.exec("git", ["worktree", "remove", selected.holder]);
  const first = await invoke(f, f.root, ["errand", "close", "shared", "--json"]);
  expect(first, JSON.stringify(first)).toMatchObject({ result: { outcome: "confirmation-required",
    recommendedPromptText: `Retry with: arc errand close shared --confirm-foreign-generation errand-v1/shared/${selected.claimId}` } });
  const next = await invoke(f, f.root, ["errand", "close", "shared", "--confirm-foreign-generation", `errand-v1/shared/${selected.claimId}`, "--json"]);
  expect(next, JSON.stringify(next)).toMatchObject({ result: { outcome: "applied" } });
}, 60_000);
