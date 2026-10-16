/** Registered leave and rematerialize preserve Store identity and real Git-backed code. */
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { deserializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { ErrandOperationResultSchema } from "../../src/lib/errand/operation-result.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
const exists = (path: string) => access(path).then(() => true, () => false);
async function fixture() {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd), h = createLifecycleHarness();
  await exec("git", ["config", "arc.identity", "test-user"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), ["branch.base: main", "branch.protection: full",
    "session.remote_sync: disabled", `worktree.location_template: ${join(cwd, ".arc-checkouts", "{name}")}`, ""].join("\n"));
  await writeFile(join(cwd, ".gitignore"), ".arc-checkouts/\n");
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "Initialize preservation fixture"]);
  const remote = join(cwd, ".git/code-origin.git");
  await exec("git", ["init", "--bare", remote]);
  await exec("git", ["remote", "add", "origin", remote]);
  await exec("git", ["push", "-u", "origin", "main"]);
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "preservation-project", uid: randomUUID() })), "{}");
  return { ...h, cwd, exec };
}
async function invoke(h: Awaited<ReturnType<typeof fixture>>, cwd: string, args: readonly string[]) {
  const oldCwd = process.cwd(), oldExit = process.exitCode;
  let stdout = "", stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { stderr += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...args]);
    return { exitCode: process.exitCode, stdout, stderr, result: stdout.trim().startsWith("{") ? JSON.parse(stdout) as unknown : null };
  } finally { binding.store = null; out.mockRestore(); err.mockRestore(); process.chdir(oldCwd); process.exitCode = oldExit; }
}
async function saved(h: Awaited<ReturnType<typeof fixture>>, slug: string) {
  const found = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) }));
  const record = lifecycleSuccess(await h.store.read({ reference: found.reference }));
  const decoded = deserializeTransientIdentityRecord(record.content, record.reference.owner.name);
  if (decoded.kind !== "valid" || decoded.record.kind !== "errand" || decoded.record.purpose !== "errand") throw new Error("Expected an ordinary Store Errand");
  return { record, identity: decoded.record };
}

it("refuses dirty removal, leaves after preservation repair, and rematerializes the same generation after its code ref is restored", async () => {
  const h = await fixture(), slug = "preserve-cli", branch = `chore/${slug}`;
  const opened = await invoke(h, h.cwd, ["errand", "open", slug, "--isolate", "--intent", "Preserve this code", "--json"]);
  expect(opened, JSON.stringify(opened)).toMatchObject({ result: { outcome: "applied" } });
  const result = ErrandOperationResultSchema.parse(opened.result);
  if (result.outcome !== "applied" || result.allocation === null) throw new Error("Expected an allocated checkout");
  const allocation = result.allocation;
  const holder = allocation.checkoutPath, codePath = join(holder, "preserved-code.txt");
  const initial = await saved(h, slug), marker = await readWorktreeMarker(holder);
  expect(marker).toMatchObject({ kind: "present", marker: { spawnedByArc: true, createdFor: { kind: "errand", slug, claimId: initial.identity.claimId } } });
  await h.exec("git", ["push", "-u", "origin", branch], { cwd: holder });
  await writeFile(codePath, "Personal code must survive leave and rematerialize.\n");
  const dirty = await invoke(h, holder, ["errand", "leave", slug, "--state", "paused", "--json"]);
  expect(dirty, JSON.stringify(dirty)).toMatchObject({ exitCode: 1, result: { outcome: "refused", reason: "preservation-unproven", recommendedPromptText: expect.stringMatching(/dirty|uncommitted|clean/iu) } });
  expect(await readFile(codePath, "utf8")).toBe("Personal code must survive leave and rematerialize.\n");
  expect((await saved(h, slug)).record).toEqual(initial.record);
  expect(await readWorktreeMarker(holder)).toEqual(marker);
  await h.exec("git", ["add", "preserved-code.txt"], { cwd: holder });
  await h.exec("git", ["commit", "-m", "Preserve the Errand change"], { cwd: holder });
  const head = (await h.exec("git", ["rev-parse", "HEAD"], { cwd: holder })).stdout.trim();
  await h.exec("git", ["push", "-u", "origin", branch], { cwd: holder });
  const left = await invoke(h, holder, ["errand", "leave", slug, "--state", "paused", "--json"]);
  expect(left, JSON.stringify(left)).toMatchObject({ result: { outcome: "applied", settlement: { kind: "identity-tail", state: "paused", savedHead: head } } });
  expect(await exists(holder)).toBe(false);
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(holder);
  const paused = await saved(h, slug);
  expect(paused.record.reference.owner).toEqual(initial.record.reference.owner);
  expect(paused.identity).toMatchObject({ state: "paused", savedHead: head, claimId: initial.identity.claimId });
  expect(paused.record.placement).toEqual({ kind: "active" });
  expect((await h.exec("git", ["show", `${head}:preserved-code.txt`])).stdout.trim()).toBe("Personal code must survive leave and rematerialize.");
  await h.exec("git", ["branch", "-D", branch]);
  await h.exec("git", ["push", "origin", "--delete", branch]);
  const materialize = ["errand", "materialize", slug, "--claim-id", initial.identity.claimId, "--expected-head", head, "--json"];
  const missingCode = await invoke(h, h.cwd, materialize);
  expect(missingCode, JSON.stringify(missingCode)).toMatchObject({ exitCode: 1, result: { outcome: "refused", reason: "preservation-unproven" } });
  expect((await saved(h, slug)).record).toEqual(paused.record);
  expect(await exists(holder)).toBe(false);
  expect((await h.exec("git", ["for-each-ref", "--format=%(refname)", `refs/heads/${branch}`])).stdout).toBe("");
  await h.exec("git", ["push", "origin", `${head}:refs/heads/${branch}`]);
  const resumed = await invoke(h, h.cwd, materialize);
  expect(resumed, JSON.stringify(resumed)).toMatchObject({ result: { outcome: "applied", operation: "errand-materialize", allocation: { checkoutPath: holder } } });
  expect(await readFile(codePath, "utf8")).toBe("Personal code must survive leave and rematerialize.\n");
  expect((await h.exec("git", ["rev-parse", "HEAD"], { cwd: holder })).stdout.trim()).toBe(head);
  expect((await h.exec("git", ["branch", "--show-current"], { cwd: holder })).stdout.trim()).toBe(branch);
  const reopened = await saved(h, slug);
  expect(reopened.record.reference.owner).toEqual(initial.record.reference.owner);
  expect(reopened.identity).toMatchObject({ state: "open", claimId: initial.identity.claimId });
  expect(await readWorktreeMarker(holder)).toMatchObject({ kind: "present", marker: { spawnedByArc: true, createdFor: { kind: "errand", slug, claimId: initial.identity.claimId } } });
}, 60_000);
