/** UID-selected rename preserves unbound checkout recovery beneath a current-name clash. */
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
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, readWorktreeMarker, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function fixture() {
  const cli = await repairCliFixture(), f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  const project = f.reference("project-registry/identity");
  await seed(f, project, f.content(project));
  const firstUid = "12345678-abcd-4abc-8abc-123456789abc", secondUid = "12345678-abcd-4abc-8abc-123456789def";
  const content = makeMetaFixture("shared", { owner: "test-user", workClass: "Light", state: "Planning", currentWorkflow: "draft-design" });
  const first = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: firstUid, content });
  const second = await plantRefPrimary(f, { kind: "work-item/meta", name: "shared", uid: secondUid, content });
  const invoke = (args: readonly string[], cwd = cli.cwd) => repairCli({ ...cli, cwd }, args, { storeFactory: async () => {
    const { createRefStore } = await import("../../src/lib/store/create.js");
    const { createDefaultRefStorePorts } = await import("../../src/lib/store/default-ports.js");
    const fresh = createDefaultRefStorePorts({ checkoutRoot: f.root, backingRepository: async () => null });
    return createRefStore({ ...fresh, registry: f.ports.registry, identity: f.ports.identity,
      actor: f.ports.actor, clock: f.ports.clock, random: f.ports.random });
  } });
  await writeFile(join(cli.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  const checkout = async (name: string, unbound = true) => {
    const path = join(cli.cwd, ".arc-checkouts", name);
    await cli.exec("git", ["worktree", "add", "--detach", path, "main"]);
    await ensureWorktreeMarkerIgnored(path, cli.exec, nodeWorktreeMarkerIgnoreFs);
    if (unbound) await writeWorktreeMarker(path, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "shared" },
      spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
    return path;
  };
  return { ...f, cli, invoke, checkout, first, second, firstUid, secondUid };
}

it.each([false, true])("reports checkout-scoped exits before mutation and rebinds both owners after release, json=%s", async json => {
  const f = await fixture(), path = await f.checkout("unbound"), otherPath = await f.checkout("other", false);
  const before = success(await f.store.version()), first = success(await f.store.read({ reference: f.first }));
  const second = success(await f.store.read({ reference: f.second })), marker = await readWorktreeMarker(path);
  const refused = await f.invoke(["rename", f.firstUid, "renamed", ...(json ? ["--json"] : [])]);
  expect(refused.exitCode).toBe(1);
  if (json) expect(refused.result).toMatchObject({ status: "rejected", reason: expect.stringContaining("unbound work-unit marker"),
    remedy: [{ text: "arc locus release", argv: ["arc", "locus", "release"], checkout: path }] });
  for (const text of [f.firstUid, f.secondUid, "arc locus release", path]) expect(refused.stdout + refused.stderr).toContain(text);
  expect(success(await f.store.version())).toBe(before);
  expect(success(await f.store.read({ reference: f.first }))).toEqual(first);
  expect(success(await f.store.read({ reference: f.second }))).toEqual(second);
  expect(await readWorktreeMarker(path)).toEqual(marker);
  const released = await f.invoke(["locus", "release"], path);
  expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
  expect(await readWorktreeMarker(path)).toEqual({ kind: "absent" });
  const renamed = await f.invoke(["rename", f.firstUid, "renamed", "--json"]);
  expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
  const landed = success(await f.store.read({ reference: f.first })), version = success(await f.store.version());
  expect(landed.reference.owner.name).toBe("renamed");
  expect(success(await f.store.read({ reference: f.second }))).toEqual(second);
  for (const [name, checkout, uid] of [["renamed", path, f.firstUid], ["shared", otherPath, f.secondUid]] as const) {
    const bound = await f.invoke(["materialize", name, "--here"], checkout);
    expect(bound.exitCode ?? 0, bound.stdout + bound.stderr).toBe(0);
    expect(await readWorktreeMarker(checkout)).toMatchObject({ kind: "present", marker: {
      spawnedByArc: false, createdFor: { kind: "work-unit", name, uid },
    } });
  }
  expect(success(await f.store.version())).toBe(version);
}, 60_000);

it.each([false, true])("retains the shared multiple-marker refusal and retries after both releases, json=%s", async json => {
  const f = await fixture(), paths = [await f.checkout("one"), await f.checkout("two")];
  const before = success(await f.store.version()), markers = await Promise.all(paths.map(readWorktreeMarker));
  const refused = await f.invoke(["rename", f.firstUid, "renamed", ...(json ? ["--json"] : [])]);
  expect(refused.exitCode).toBe(1);
  const text = refused.stdout + refused.stderr;
  for (const value of ["multiple marker holders", ...paths, f.firstUid, f.secondUid, "arc locus release"]) expect(text).toContain(value);
  expect(success(await f.store.version())).toBe(before);
  expect(await Promise.all(paths.map(readWorktreeMarker))).toEqual(markers);
  for (const path of paths) {
    const released = await f.invoke(["locus", "release"], path);
    expect(released.exitCode ?? 0, released.stdout + released.stderr).toBe(0);
    expect(await readWorktreeMarker(path)).toEqual({ kind: "absent" });
  }
  const retry = await f.invoke(["rename", f.firstUid, "renamed", "--json"]);
  expect(retry.exitCode ?? 0, retry.stdout + retry.stderr).toBe(0);
  expect(success(await f.store.read({ reference: f.first })).reference.owner.name).toBe("renamed");
  expect(success(await f.store.read({ reference: f.second })).reference.owner.name).toBe("shared");
}, 60_000);

it("renames the exact UID-bound checkout while preserving its namesake's marker", async () => {
  const f = await fixture(), path = await f.checkout("selected", false), otherPath = await f.checkout("namesake", false);
  for (const [checkout, uid] of [[path, f.firstUid], [otherPath, f.secondUid]] as const) await writeWorktreeMarker(checkout, {
    spawnedByArc: false, createdFor: { kind: "work-unit", name: "shared", uid },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z",
  });
  const otherMarker = await readWorktreeMarker(otherPath), other = success(await f.store.read({ reference: f.second }));
  const renamed = await f.invoke(["rename", f.firstUid, "renamed", "--json"]);
  expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
  expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present", marker: {
    createdFor: { kind: "work-unit", name: "renamed", uid: f.firstUid },
  } });
  expect(await readWorktreeMarker(otherPath)).toEqual(otherMarker);
  expect(success(await f.store.read({ reference: f.second }))).toEqual(other);
}, 60_000);
