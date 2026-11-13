/** Store and designation admission refuses before touching the restore namespace. */
import { readFile, writeFile, unlink, mkdir, rm, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { writeWindowHold, type WindowRecord } from "../../src/scripts/cutover-window/hold.js";
import { seedTransients } from "../helpers/store/import-transients.js";
import { writeBackingRepository } from "../../src/lib/config/status-reader.js";

it.each([
  { key: "remote.origin.arc-state", value: "push" },
  { key: "remote.origin.arc-state", value: "off" },
  { key: "remote.unconfigured.arc-state", value: "unrecognized" },
  { key: "remote.unconfigured.arc-state", value: "" },
])("refuses configured key $key=$value and passes after it is unset", async ({ key, value }) => {
  const h = await windowFixture();
  await h.git("git", ["config", key, value]);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: key, remedy: expect.any(String) }),
  ]) } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  await h.git("git", ["config", "--unset-all", key]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses a code remote other than origin and passes after its repair", async () => {
  const h = await windowFixture();
  await h.git("git", ["remote", "add", "other", h.origin]);
  await h.git("git", ["config", "remote.pushDefault", "other"]);
  expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "origin", condition: expect.stringContaining("other") }),
  ]) } });
  await h.git("git", ["config", "--unset", "remote.pushDefault"]);
  await h.git("git", ["remote", "remove", "other"]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses a backing pointer and passes once its configuration is restored", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc/system/arc-config.yml");
  const original = await readFile(path, "utf8").catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  });
  await writeBackingRepository(h.root, h.origin);
  expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "storage.backing_repository" }),
  ]) } });
  if (original === null) await unlink(path); else await writeFile(path, original);
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);


it.each(["store", "store-migrate-build", "store-migrate-old"])("refuses pre-existing %s and passes after its removal", async name => {
  const h = await windowFixture();
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const path = join(common, "arc", name);
  await mkdir(path, { recursive: true });
  expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, remedy: expect.any(String) }),
  ]) } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim()).toBe("");
  await rm(path, { recursive: true });
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it.each(["refs/arc/project/registry", "refs/arc/user/andrew/claims", "refs/arc/tmp/version", "refs/arc/tmp/migrate/import"])(
  "refuses store ref %s and passes after its removal", async ref => {
    const h = await windowFixture();
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["update-ref", ref, head]);
    const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
    expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
      expect.objectContaining({ subject: ref }),
    ]) } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
    await h.git("git", ["update-ref", "-d", ref]);
    expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
  }, 30_000,
);


it("permits pre-existing non-store ARC refs and unrelated temporary refs", async () => {
  const h = await windowFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await seedTransients(h, []);
  const refs = ["refs/arc/delivery-candidates/example", "refs/arc/delivery-refresh-candidates/example",
    "refs/arc/recovery/test", "refs/arc/bootstrap/test", "refs/arc/review/local/test", "refs/arc/review/local-scope/test",
    "refs/arc/user/andrew/sync-state", "refs/arc/user/andrew/errands-remote", "refs/arc/tmp/errand-close",
    "refs/arc/tmp/errand-pause/test", "refs/arc/tmp/base-head/test", "refs/arc/tmp/transient-discovery/test",
    "refs/arc/tmp/transient-materialize/test", "refs/arc/tmp/retirement-source/test"];
  for (const ref of refs) await h.git("git", ["update-ref", ref, head]);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
}, 30_000);

it.each(["refs/arc/project/registry", "refs/arc/tmp/migrate/import"])(
  "refuses an origin-only store ref %s without acquiring a hold and passes after repair", async ref => {
    const h = await windowFixture();
    await h.git("git", ["push", "origin", `HEAD:${ref}`]);
    const local = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
    const origin = (await h.git("git", ["ls-remote", "origin"])).stdout;
    expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
      expect.objectContaining({ subject: `origin:${ref}`, remedy: expect.stringContaining("Owner") }),
    ]) } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(local);
    expect((await h.git("git", ["ls-remote", "origin"])).stdout).toBe(origin);
    await h.git("git", ["push", "origin", `:${ref}`]);
    expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
  }, 30_000,
);


it("keeps an incomplete earlier hold intact and passes after that hold is removed", async () => {
  const h = await windowFixture();
  const ref = "refs/arc-window/origin/refs/arc/user/andrew/errands";
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["update-ref", ref, head]);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "refs/arc-window/", condition: expect.stringContaining("incomplete"),
      remedy: expect.stringContaining("Remove") }),
  ]) } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  await h.git("git", ["update-ref", "-d", ref]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("keeps a complete earlier hold intact and names its restore route", async () => {
  const h = await windowFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const record: WindowRecord = { version: 1, flip: h.flip, worktrees: [{ path: h.root, head, branch: "main" }],
    branches: { local: { main: head, "feat/alpha": head, [h.flip.branch]: h.flip.head },
      origin: { main: head, [h.flip.branch]: h.flip.head } }, refs: { local: {}, origin: {}, tracking: {} } };
  await writeWindowHold({ repo: h.root, exec: h.git, execInput: h.ports.execInput }, record);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "refs/arc-window/", condition: expect.stringContaining("completion"),
      remedy: expect.stringContaining("restore") }),
  ]) } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 30_000);


it("reports every failing precondition while preserving all existing state", async () => {
  const h = await windowFixture();
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const directory = join(common, "arc", "store-migrate-old");
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["config", "remote.origin.arc-state", "push"]);
  await mkdir(directory, { recursive: true });
  await h.git("git", ["update-ref", "refs/arc/project/registry", head]);
  await h.git("git", ["update-ref", "refs/arc-window/record", head]);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await checkFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "remote.origin.arc-state" }),
    expect.objectContaining({ subject: directory }),
    expect.objectContaining({ subject: "refs/arc/project/registry" }),
    expect.objectContaining({ subject: "refs/arc-window/" }),
  ]) } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  expect((await h.git("git", ["config", "--get", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect((await lstat(directory)).isDirectory()).toBe(true);
}, 30_000);
