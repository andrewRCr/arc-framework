/** Branch rename follows UID checkout authority and repository-qualified link ownership. */
import { expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
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
import { StoreRefusalSchema } from "../../src/lib/store/refusal.js";
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
  const invoke = (args: readonly string[], decorate?: (store: Store) => Store) => repairCli(cli, args, { storeFactory: async () => {
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

async function publish(f: Awaited<ReturnType<typeof fixture>>) {
  const remote = join(f.cli.cwd, ".git", "code-origin.git");
  await f.cli.exec("git", ["init", "--bare", remote]);
  await f.cli.exec("git", ["remote", "add", "origin", remote]);
  await f.cli.exec("git", ["push", "origin", "main", "feat/shared"]);
  return (await f.cli.exec("git", ["rev-parse", "feat/shared"])).stdout.trim();
}

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
