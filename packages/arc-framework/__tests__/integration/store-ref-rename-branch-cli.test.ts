/** Branch rename follows UID checkout authority and repository-qualified link ownership. */
import { expect, it } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createKindRegistry } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import type { Store } from "../../src/lib/store/contract.js";
import { StoreRefusalSchema, RemedySchema } from "../../src/lib/store/refusal.js";
import { resolveStoreBranch } from "../../src/lib/session-init/store-branch-classification.js";
import { writeMetaNextAction } from "../../src/lib/store/kinds/meta/writers.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function fixture(clash = true, linkedAs: "created" | "adopted" = "created") {
  const cli = await repairCliFixture(), f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  const projectRef = f.reference("project-registry/identity"), project = await seed(f, projectRef, f.content(projectRef));
  if (project.reference.owner.type !== "project" || project.reference.owner.uid === undefined) throw new Error("Expected project UID");
  const repository = project.reference.owner.uid, uid = "12345678-abcd-4abc-8abc-123456789abc", otherUid = "12345678-abcd-4abc-8abc-123456789def";
  const source = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid, content: makeMetaFixture("shared") });
  const other = clash ? await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: otherUid, content: makeMetaFixture("shared") }) : undefined;
  const link = { repository, ref: "feat/shared", linkedAs, excluded: [] };
  for (const reference of [source, ...(other === undefined ? [] : [other])]) {
    const record = success(await f.store.read({ reference }));
    success(await f.store.write({ ...recordPut(record, { links: { branches: [link] } }), provenance: { verb: "fixture", lifecycleAction: "link" } }));
  }
  const invoke = (args: readonly string[], decorate?: (store: Store) => Store, cwd = cli.cwd) => repairCli({ ...cli, cwd }, args, { storeFactory: async () => {
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: f.root, backingRepository: async () => null });
    const store = createRefStore({ ...fresh, registry: f.ports.registry, identity: f.ports.identity,
      actor: f.ports.actor, clock: f.ports.clock, random: f.ports.random });
    return decorate?.(store) ?? store;
  } });
  const marker = (path: string, owner: string) => writeWorktreeMarker(path, { spawnedByArc: false,
    createdFor: { kind: "work-unit", name: "shared", uid: owner }, spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  await ensureWorktreeMarkerIgnored(cli.cwd, cli.exec, nodeWorktreeMarkerIgnoreFs);
  return { ...f, cli, source, other, link, repository, uid, otherUid, invoke, marker };
}

async function publish(f: Awaited<ReturnType<typeof fixture>>, includeWork = true) {
  const remote = join(f.cli.cwd, ".git", "code-origin.git");
  await f.cli.exec("git", ["init", "--bare", remote]);
  await f.cli.exec("git", ["remote", "add", "origin", remote]);
  await f.cli.exec("git", ["push", "origin", "main", ...(includeWork ? ["feat/shared"] : [])]);
  return (await f.cli.exec("git", ["rev-parse", "feat/shared"])).stdout.trim();
}

async function remoteHolderFixture(published = true) {
  const f = await fixture();
  await f.cli.exec("git", ["switch", "-c", "feat/shared"]);
  await f.marker(f.cli.cwd, f.otherUid);
  const oid = await publish(f, published), peer = join(f.cli.cwd, ".git", "selected-clone");
  await f.cli.exec("git", ["clone", "--branch", published ? "feat/shared" : "main", join(f.cli.cwd, ".git", "code-origin.git"), peer]);
  if (!published) await f.cli.exec("git", ["switch", "-c", "feat/shared"], { cwd: peer });
  await f.cli.exec("git", ["config", "arc.identity", "test-user"], { cwd: peer });
  await ensureWorktreeMarkerIgnored(peer, f.cli.exec, nodeWorktreeMarkerIgnoreFs);
  await f.marker(peer, f.uid);
  const first = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(first.exitCode ?? 0, first.stdout + first.stderr).toBe(0);
  expect(success(await f.store.read({ reference: f.source })).links?.branches).toEqual([f.link]);
  return { ...f, peer, oid };
}

it.each(["detached", "unrelated"] as const)("does not authorize catch-up from a %s subject checkout", async mode => {
  const f = await remoteHolderFixture();
  await f.cli.exec("git", mode === "detached" ? ["switch", "--detach"] : ["switch", "-c", "personal/unrelated"], { cwd: f.peer });
  const primary = success(await f.store.read({ reference: f.source })), history = success(await f.store.history({ reference: f.source }));
  const marker = await readWorktreeMarker(f.peer), branch = (await f.cli.exec("git", ["branch", "--show-current"], { cwd: f.peer })).stdout;
  const result = await f.invoke(["rename", f.uid, "renamed", "--json"], undefined, f.peer);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "renamed", recordBatch: "existing" });
  expect(success(await f.store.read({ reference: f.source }))).toEqual(primary);
  expect(success(await f.store.history({ reference: f.source }))).toEqual(history);
  expect(await readWorktreeMarker(f.peer)).toEqual(marker);
  expect((await f.cli.exec("git", ["branch", "--show-current"], { cwd: f.peer })).stdout).toBe(branch);
  expect((await f.cli.exec("git", ["for-each-ref", "--format=%(refname)", "refs/heads/feat/renamed"], { cwd: f.peer })).stdout).toBe("");
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/renamed"])).stdout).toBe("");
}, 60_000);

it("keeps an unpublished branch unpublished while catching up its local name and link", async () => {
  const f = await remoteHolderFixture(false), marker = await readWorktreeMarker(f.peer);
  const result = await f.invoke(["rename", f.uid, "renamed", "--json"], undefined, f.peer);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ status: "renamed", recordBatch: "applied", remote: { status: "unpublished" } });
  expect(success(await f.store.read({ reference: f.source })).links?.branches).toEqual([{ ...f.link, ref: "feat/renamed" }]);
  expect((await f.cli.exec("git", ["branch", "--show-current"], { cwd: f.peer })).stdout.trim()).toBe("feat/renamed");
  for (const name of ["shared", "renamed"]) expect((await f.cli.exec("git", ["ls-remote", "origin", `refs/heads/feat/${name}`])).stdout).toBe("");
  expect(await readWorktreeMarker(f.peer)).toEqual(marker);
}, 60_000);

it("rolls back a caught-up branch and upstream when its primary advances before the batch", async () => {
  const f = await remoteHolderFixture(), primary = success(await f.store.read({ reference: f.source }));
  const marker = await readWorktreeMarker(f.peer);
  const upstream = (await f.cli.exec("git", ["for-each-ref", "--format=%(upstream)", "refs/heads/feat/shared"], { cwd: f.peer })).stdout;
  const content = writeMetaNextAction(primary.content, "Preserve the concurrent action.");
  const refused = await f.invoke(["rename", f.uid, "renamed", "--json"], store => {
    const batch = store.batch.bind(store); let once = true;
    store.batch = async input => {
      if (once) {
        once = false;
        success(await f.store.write({ ...recordPut(primary, { content }), provenance: { verb: "fixture", lifecycleAction: "concurrent-edit" } }));
      }
      return batch(input);
    };
    return store;
  }, f.peer);
  expect(refused.exitCode).toBe(1);
  expect(refused.result).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  const concurrent = success(await f.store.read({ reference: f.source }));
  expect(concurrent).toMatchObject({ content, links: primary.links });
  expect((await f.cli.exec("git", ["branch", "--show-current"], { cwd: f.peer })).stdout.trim()).toBe("feat/shared");
  expect((await f.cli.exec("git", ["for-each-ref", "--format=%(upstream)", "refs/heads/feat/shared"], { cwd: f.peer })).stdout).toBe(upstream);
  expect((await f.cli.exec("git", ["for-each-ref", "--format=%(refname)", "refs/heads/feat/renamed"], { cwd: f.peer })).stdout).toBe("");
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/renamed"])).stdout).toBe("");
  expect(await readWorktreeMarker(f.peer)).toEqual(marker);
  const retry = await f.invoke(["rename", f.uid, "renamed", "--json"], undefined, f.peer);
  expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
  expect(retry.result).toMatchObject({ status: "renamed", recordBatch: "applied" });
  expect(success(await f.store.read({ reference: f.source }))).toMatchObject({ content, links: { branches: [{ ...f.link, ref: "feat/renamed" }] } });
  expect(await readWorktreeMarker(f.peer)).toEqual(marker);
}, 60_000);

it("recovers an older nonfinal alias catch-up through its exact pending push", async () => {
  const f = await remoteHolderFixture();
  const second = await f.invoke(["rename", f.uid, "latest", "--json"]);
  expect(second.exitCode ?? 0, second.stdout + second.stderr).toBe(0);
  const record = success(await f.store.read({ reference: f.source }));
  const priorLink = { ...f.link, excluded: [{ repository: f.repository, sha: f.oid }] };
  const extra = { ...f.link, ref: "chore/latest" };
  success(await f.store.write({ ...recordPut(record, { links: { branches: [priorLink, extra] } }),
    provenance: { verb: "fixture", lifecycleAction: "link" } }));
  const hook = join(f.cli.cwd, ".git", "code-origin.git", "hooks", "pre-receive");
  await writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const partial = await f.invoke(["rename", f.uid, "latest", "--json"], undefined, f.peer);
  expect(partial.exitCode).toBe(1);
  expect(partial.result).toMatchObject({ status: "partial", reference: { owner: { name: "latest", uid: f.uid } },
    remedy: { argv: ["git", "-C", f.peer, "push", "-u", "origin", "feat/latest"] },
    report: { keptBranches: [{ branch: "chore/latest", reason: "other-link" }, { branch: "feat/shared", reason: "continuation" }] } });
  const landed = success(await f.store.read({ reference: f.source }));
  expect(landed).toMatchObject({ content: record.content, links: { branches: [extra, { ...priorLink, ref: "feat/latest" }] } });
  const history = success(await f.store.history({ reference: f.source }));
  const marker = await readWorktreeMarker(f.peer), otherMarker = await readWorktreeMarker(f.cli.cwd);
  expect((await f.cli.exec("git", ["branch", "--show-current"], { cwd: f.peer })).stdout.trim()).toBe("feat/latest");
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/latest"])).stdout).toBe("");
  await rm(hook);
  if (typeof partial.result !== "object" || partial.result === null || !("remedy" in partial.result)) throw new Error("Expected partial repair");
  const repair = RemedySchema.parse(partial.result.remedy);
  if (repair.argv === undefined || repair.argv[0] !== "git") throw new Error("Expected exact Git repair");
  await f.cli.exec("git", repair.argv.slice(1));
  for (const branch of ["shared", "latest"]) expect((await f.cli.exec("git", ["ls-remote", "origin", `refs/heads/feat/${branch}`])).stdout).toContain(f.oid);
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/chore/latest"])).stdout).toBe("");
  expect(success(await f.store.read({ reference: f.source }))).toEqual(landed);
  expect(success(await f.store.history({ reference: f.source }))).toEqual(history);
  expect(await readWorktreeMarker(f.peer)).toEqual(marker);
  expect(await readWorktreeMarker(f.cli.cwd)).toEqual(otherMarker);
}, 60_000);

it("catches up only the subject's remote checkout after both holders rename elsewhere", async () => {
  const f = await remoteHolderFixture();
  if (f.other === undefined) throw new Error("Expected namesake");
  const otherRename = await f.invoke(["rename", f.otherUid, "other-renamed", "--json"], undefined, f.peer);
  expect(otherRename.exitCode ?? 0, otherRename.stdout + otherRename.stderr).toBe(0);
  const other = success(await f.store.read({ reference: f.other })), prior = success(await f.store.read({ reference: f.source }));
  expect(other.links?.branches).toEqual([f.link]);
  expect((await f.cli.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("feat/shared");
  expect((await f.cli.exec("git", ["branch", "--show-current"], { cwd: f.peer })).stdout.trim()).toBe("feat/shared");
  const before = await resolveStoreBranch(f.store, "feat/shared", async () => f.repository);
  expect(before).toMatchObject({ status: "unavailable", reason: expect.stringContaining(`arc rename ${f.uid} renamed`) });
  if (before.status !== "unavailable") throw new Error("Expected branch-link repair");
  const repair = /`arc (rename [^`]+)`/u.exec(before.reason)?.[1];
  if (repair === undefined) throw new Error("Expected an executable rename repair");
  const marker = await readWorktreeMarker(f.peer), otherMarker = await readWorktreeMarker(f.cli.cwd);
  const history = success(await f.store.history({ reference: f.source }));
  const caughtUp = await f.invoke([...repair.split(" "), "--json"], undefined, f.peer);
  expect(caughtUp.exitCode ?? 0, caughtUp.stdout + caughtUp.stderr).toBe(0);
  expect(caughtUp.result).toMatchObject({ status: "renamed", recordBatch: "applied", remote: { status: "retained", oldBranch: "feat/shared" },
    report: { keptBranches: [{ branch: "feat/shared", reason: "continuation" }] } });
  const current = success(await f.store.read({ reference: f.source }));
  expect(current).toMatchObject({ reference: prior.reference, content: prior.content, placement: prior.placement,
    links: { branches: [{ ...f.link, ref: "feat/renamed" }] } });
  expect(success(await f.store.history({ reference: f.source }))).toHaveLength(history.length + 1);
  expect((await f.cli.exec("git", ["branch", "--show-current"], { cwd: f.peer })).stdout.trim()).toBe("feat/renamed");
  expect((await f.cli.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("feat/shared");
  expect(await readWorktreeMarker(f.peer)).toEqual(marker);
  expect(await readWorktreeMarker(f.cli.cwd)).toEqual(otherMarker);
  expect(success(await f.store.read({ reference: f.other }))).toEqual(other);
  expect(await resolveStoreBranch(f.store, "feat/shared", async () => f.repository)).toMatchObject({ status: "ready", record: { reference: other.reference } });
  expect(await resolveStoreBranch(f.store, "feat/renamed", async () => f.repository)).toMatchObject({ status: "ready", record: { reference: current.reference } });
  for (const branch of ["shared", "renamed"]) expect((await f.cli.exec("git", ["ls-remote", "origin", `refs/heads/feat/${branch}`])).stdout).toContain(f.oid);
  const afterHistory = success(await f.store.history({ reference: f.source }));
  const again = await f.invoke(["rename", f.uid, "renamed", "--json"], undefined, f.peer);
  expect(again.exitCode ?? 0, again.stdout + again.stderr).toBe(0);
  expect(again.result).toMatchObject({ status: "renamed", recordBatch: "existing" });
  expect(success(await f.store.read({ reference: f.source }))).toEqual(current);
  expect(success(await f.store.history({ reference: f.source }))).toEqual(afterHistory);
  expect(await readWorktreeMarker(f.peer)).toEqual(marker);
}, 60_000);

it("explains both readings of unpreserved commits and completes its retry with the old remote kept", async () => {
  const f = await fixture(false);
  await f.cli.exec("git", ["switch", "-c", "feat/shared"]);
  await f.marker(f.cli.cwd, f.uid);
  const initial = await publish(f);
  await writeFile(join(f.cli.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  const peer = join(f.cli.cwd, ".arc-checkouts", "advanced");
  await f.cli.exec("git", ["worktree", "add", "--detach", peer, "main"]);
  await f.cli.exec("git", ["commit", "--allow-empty", "-m", "Advance the old remote"], { cwd: peer });
  await f.cli.exec("git", ["push", "origin", "HEAD:refs/heads/feat/shared"], { cwd: peer });
  const advanced = (await f.cli.exec("git", ["rev-parse", "HEAD"], { cwd: peer })).stdout.trim();
  const partial = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(partial.exitCode).toBe(1);
  expect(partial.result).toMatchObject({ status: "partial", remedy: { argv: ["arc", "rename", f.uid, "renamed"] } });
  for (const text of ["If these commits belong to this work unit", "If the branch belongs to another holder, leave it in place"])
    expect(partial.stdout).toContain(text);
  const landed = success(await f.store.read({ reference: f.source })), history = success(await f.store.history({ reference: f.source }));
  const marker = await readWorktreeMarker(f.cli.cwd);
  const resumed = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  expect(resumed.result).toMatchObject({ status: "renamed", recordBatch: "existing", remote: { status: "retained", oldOid: advanced },
    report: { keptBranches: [{ branch: "feat/shared", reason: "continuation" }] } });
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/shared"])).stdout).toContain(advanced);
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/renamed"])).stdout).toContain(initial);
  expect(success(await f.store.read({ reference: f.source }))).toEqual(landed);
  expect(success(await f.store.history({ reference: f.source }))).toEqual(history);
  expect(await readWorktreeMarker(f.cli.cwd)).toEqual(marker);
}, 60_000);

it.each([false, true])("keeps the old remote after a failed-push continuation, clash=%s", async clash => {
  const f = await fixture(clash);
  await f.cli.exec("git", ["switch", "-c", "feat/shared"]);
  await f.marker(f.cli.cwd, f.uid);
  const oid = await publish(f), hook = join(f.cli.cwd, ".git", "code-origin.git", "hooks", "pre-receive");
  await writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const failed = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(failed.exitCode).toBe(1);
  expect(failed.result).toMatchObject({ status: "partial", remedy: { argv: ["arc", "rename", f.uid, "renamed"] } });
  const landed = success(await f.store.read({ reference: f.source })), history = success(await f.store.history({ reference: f.source }));
  const marker = await readWorktreeMarker(f.cli.cwd), head = (await f.cli.exec("git", ["rev-parse", "HEAD"])).stdout;
  await rm(hook);
  const resumed = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(resumed.exitCode ?? 0, resumed.stdout + resumed.stderr).toBe(0);
  expect(resumed.result).toMatchObject({ status: "renamed", recordBatch: "existing", remote: { status: "retained", oldBranch: "feat/shared" },
    report: { keptBranches: [{ branch: "feat/shared", reason: "continuation" }] } });
  expect(resumed.stdout).not.toContain("--delete"); expect(resumed.stdout).not.toContain("manualDelete");
  for (const branch of ["shared", "renamed"]) expect((await f.cli.exec("git", ["ls-remote", "origin", `refs/heads/feat/${branch}`])).stdout).toContain(oid);
  expect(success(await f.store.read({ reference: f.source }))).toEqual(landed);
  expect(success(await f.store.history({ reference: f.source }))).toEqual(history);
  expect(await readWorktreeMarker(f.cli.cwd)).toEqual(marker);
  expect((await f.cli.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
}, 60_000);

it.each(["created", "adopted"] as const)("retains a published %s branch when its ownership lookup is unavailable", async linkedAs => {
  const f = await fixture(false, linkedAs);
  await f.cli.exec("git", ["switch", "-c", "feat/shared"]);
  await f.marker(f.cli.cwd, f.uid);
  const oid = await publish(f);
  const unavailable = StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: "Branch ownership inventory is unavailable.", remedy: { text: "Restore branch ownership evidence." } });
  const result = await f.invoke(["rename", f.uid, "renamed", "--json"], store => {
    const lookup = store.lookup.bind(store);
    store.lookup = async input => input.kind === "ref" ? { status: "refused", refusal: unavailable } : lookup(input);
    return store;
  });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ remote: { status: "retained", oldBranch: "feat/shared", oldOid: oid },
    report: { keptBranches: [{ branch: "feat/shared" }] } });
  expect(result.stdout).not.toContain("--delete"); expect(result.stdout).not.toContain("manualDelete");
  for (const branch of ["shared", "renamed"]) expect((await f.cli.exec("git", ["ls-remote", "origin", `refs/heads/feat/${branch}`])).stdout).toContain(oid);
  expect(success(await f.store.read({ reference: f.source })).links?.branches).toEqual([{ ...f.link, ref: "feat/renamed" }]);
}, 60_000);

it.each([
  { linkedAs: "created", own: true, json: true }, { linkedAs: "created", own: false, json: false },
  { linkedAs: "adopted", own: true, json: false }, { linkedAs: "adopted", own: false, json: true },
] as const)("keeps the published $linkedAs shared branch without deletion advice, own=$own json=$json", async ({ linkedAs, own, json }) => {
  const f = await fixture(true, linkedAs);
  await f.cli.exec("git", ["switch", "-c", "feat/shared"]);
  await f.marker(f.cli.cwd, own ? f.uid : f.otherUid);
  const oid = await publish(f);
  if (f.other === undefined) throw new Error("Expected namesake");
  const other = success(await f.store.read({ reference: f.other }));
  const result = await f.invoke(["rename", f.uid, "renamed", ...(json ? ["--json"] : [])]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const text = result.stdout + result.stderr;
  if (json) {
    expect(result.result).toMatchObject({ remote: { status: "retained", oldBranch: "feat/shared", oldOid: oid },
      report: { keptBranches: [{ branch: "feat/shared" }] } });
    expect(text).not.toContain("manualDelete");
  } else { expect(text).toContain("kept feat/shared"); expect(text).not.toContain("unpublished"); }
  expect(text).not.toContain("--delete");
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/shared"])).stdout).toContain(oid);
  const newRemote = (await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/renamed"])).stdout;
  if (own) expect(newRemote).toContain(oid); else expect(newRemote).toBe("");
  expect(success(await f.store.read({ reference: f.source })).links?.branches).toEqual([{ ...f.link, ref: own ? "feat/renamed" : "feat/shared" }]);
  expect(success(await f.store.read({ reference: f.other }))).toEqual(other);
}, 60_000);

it("gives an adopted sole holder conditional manual deletion guidance", async () => {
  const f = await fixture(false, "adopted");
  await f.cli.exec("git", ["branch", "feat/shared"]);
  const oid = await publish(f), result = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ report: { keptBranches: [{ branch: "feat/shared", reason: "adopted",
    manualDelete: { text: "Owner decision: delete it only if no longer needed.", argv: ["git", "push", "origin", "--delete", "feat/shared"] },
  }] } });
  for (const branch of ["shared", "renamed"]) expect((await f.cli.exec("git", ["ls-remote", "origin", `refs/heads/feat/${branch}`])).stdout).toContain(oid);
}, 60_000);

it("publishes a sole created holder's new name and deletes its preserved old remote on the first run", async () => {
  const f = await fixture(false);
  await f.cli.exec("git", ["branch", "feat/shared"]);
  const oid = await publish(f), result = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(result.result).toMatchObject({ remote: { status: "renamed", oldOid: oid }, report: { keptBranches: [] } });
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/shared"])).stdout).toBe("");
  expect((await f.cli.exec("git", ["ls-remote", "origin", "refs/heads/feat/renamed"])).stdout).toContain(oid);
  expect(success(await f.store.read({ reference: f.source })).links?.branches).toEqual([{ ...f.link, ref: "feat/renamed" }]);
}, 60_000);

it("keeps the other holder's local branch and the subject's link, reporting exact catch-up", async () => {
  const f = await fixture();
  await f.cli.exec("git", ["switch", "-c", "feat/shared"]);
  await f.marker(f.cli.cwd, f.otherUid);
  if (f.other === undefined) throw new Error("Expected namesake");
  expect(await f.store.lookup({ kind: "ref", repository: f.repository, ref: f.link.ref }))
    .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
  const other = success(await f.store.read({ reference: f.other })), marker = await readWorktreeMarker(f.cli.cwd);
  const result = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const renamed = success(await f.store.read({ reference: f.source }));
  expect(renamed.reference.owner.name).toBe("renamed");
  expect(renamed.links?.branches).toEqual([f.link]);
  expect(result.result).toMatchObject({ report: { keptBranches: [{ branch: "feat/shared", reason: "another-holder",
    catchUp: { argv: ["arc", "rename", f.uid, "renamed"] } }] } });
  expect((await f.cli.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("feat/shared");
  expect(await readWorktreeMarker(f.cli.cwd)).toEqual(marker);
  expect(success(await f.store.read({ reference: f.other }))).toEqual(other);
}, 60_000);

it("moves the selected checkout's shared local branch and leaves the other checkout untouched", async () => {
  const f = await fixture();
  await f.cli.exec("git", ["switch", "-c", "feat/shared"]);
  await f.marker(f.cli.cwd, f.uid);
  await writeFile(join(f.cli.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  const otherPath = join(f.cli.cwd, ".arc-checkouts", "namesake");
  await f.cli.exec("git", ["worktree", "add", "--detach", otherPath, "main"]);
  await ensureWorktreeMarkerIgnored(otherPath, f.cli.exec, nodeWorktreeMarkerIgnoreFs);
  await f.marker(otherPath, f.otherUid);
  if (f.other === undefined) throw new Error("Expected namesake");
  const other = success(await f.store.read({ reference: f.other })), marker = await readWorktreeMarker(otherPath);
  const head = (await f.cli.exec("git", ["rev-parse", "HEAD"], { cwd: otherPath })).stdout;
  const result = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(success(await f.store.read({ reference: f.source })).links?.branches).toEqual([{ ...f.link, ref: "feat/renamed" }]);
  expect((await f.cli.exec("git", ["branch", "--show-current"])).stdout.trim()).toBe("feat/renamed");
  expect(await readWorktreeMarker(f.cli.cwd)).toMatchObject({ kind: "present", marker: {
    createdFor: { kind: "work-unit", name: "renamed", uid: f.uid },
  } });
  expect(await readWorktreeMarker(otherPath)).toEqual(marker);
  expect((await f.cli.exec("git", ["rev-parse", "HEAD"], { cwd: otherPath })).stdout).toBe(head);
  expect(success(await f.store.read({ reference: f.other }))).toEqual(other);
}, 60_000);

it("refuses a sole holder's missing local branch before mutation and retries once restored", async () => {
  const f = await fixture(false), before = success(await f.store.version()), source = success(await f.store.read({ reference: f.source }));
  const result = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(result.exitCode).toBe(1);
  expect(result.result).toMatchObject({ status: "rejected", reason: expect.stringContaining("neither ref exists") });
  expect(success(await f.store.version())).toBe(before);
  expect(success(await f.store.read({ reference: f.source }))).toEqual(source);
  await f.cli.exec("git", ["branch", "feat/shared"]);
  const retry = await f.invoke(["rename", f.uid, "renamed", "--json"]);
  expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
  expect(success(await f.store.read({ reference: f.source })).links?.branches).toEqual([{ ...f.link, ref: "feat/renamed" }]);
  expect((await f.cli.exec("git", ["for-each-ref", "--format=%(refname)", "refs/heads/feat/"])).stdout.trim()).toBe("refs/heads/feat/renamed");
}, 60_000);
