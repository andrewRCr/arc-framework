/** The repository-only source command records a window and restores its native import without moving code checkouts. */
import { resolve, join } from "node:path";
import { mkdir, lstat } from "node:fs/promises";
import { execa } from "execa";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { readWindowHold } from "../../src/scripts/cutover-window/hold.js";
import { listWindowRefs } from "../../src/scripts/cutover-window/git.js";
import { storeImported } from "../../src/lib/store/store-imported.js";
import { seedTransients, transientCommon, transientSourceRef } from "../helpers/store/import-transients.js";
import { saveImportPersonal } from "../helpers/store/import-fixture.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";

const repository = resolve(import.meta.dirname, "../../../..");
const entry = resolve(import.meta.dirname, "../../src/scripts/cutover-window/main.ts");

it("records through the native source entry and refuses to overwrite the completed hold", async () => {
  const h = await windowFixture();
  const args = ["--import", "tsx", entry, "check", "--repo", h.root, "--flip-branch", h.flip.branch,
    "--flip-pr", String(h.flip.pullRequest), "--pull-requests", h.listingPath, "--json"];
  const run = () => execa(process.execPath, args, { cwd: repository, reject: false,
    env: { FORCE_COLOR: undefined, NO_COLOR: "1" } });
  const result = await run();
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ operation: "check", status: "passed", findings: [] });
  const held = await readWindowHold({ repo: h.root, exec: h.git, execInput: h.ports.execInput });
  expect(held.record.flip).toEqual(h.flip);
  const refs = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const refused = await run();
  expect(refused.exitCode).toBe(1);
  expect(JSON.parse(refused.stdout)).toMatchObject({ status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "refs/arc-window/" }),
  ]) });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(refs);
}, 60_000);

it.each([false, true])("restores through the source CLI and permits a fresh window (before publication=%s)", async beforePublication => {
  const h = await windowFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await seedTransients(h, [{ ...transientCommon, kind: "groom", slug: "groom-alpha", anchorStub: "alpha", members: ["alpha"],
    openedBaseHead: head, protection: "partial", branch: null, state: "open", changeRequest: null }]);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  const run = (operation: string) => execa(process.execPath, ["--import", "tsx", entry, operation,
    "--repo", h.root, "--flip-branch", h.flip.branch, "--flip-pr", String(h.flip.pullRequest),
    "--pull-requests", h.listingPath, "--json"], { cwd: repository, reject: false, env: { FORCE_COLOR: undefined, NO_COLOR: "1" } });
  expect((await run("check")).exitCode).toBe(0);
  const io = { repo: h.root, exec: h.git, execInput: h.ports.execInput };
  const { record } = await readWindowHold(io);
  const branches = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/"])).stdout;
  const worktrees = (await h.git("git", ["worktree", "list", "--porcelain", "-z"])).stdout;
  await saveImportPersonal(h.root, false);
  expect(await invokeStoreRemote(["origin", "push"], { cwd: h.root })).toMatchObject({ result: { status: "ok" } });
  if (beforePublication) {
    h.ports.migrateStep = step => step === "import.publish" ? Promise.reject(new Error("pause-before-publication")) : Promise.resolve();
    await expect(h.migrate()).rejects.toThrow("pause-before-publication");
  } else expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(await storeImported(h.root, h.git)).toBe(true);
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const directories = ["store", "store-migrate-build", "store-migrate-old"].map(name => join(common, "arc", name));
  for (const directory of directories) await mkdir(directory, { recursive: true });
  const restored = await run("restore");
  expect(restored.exitCode, restored.stderr).toBe(0);
  expect(JSON.parse(restored.stdout)).toMatchObject({ operation: "restore", status: "passed", findings: [] });
  expect(Object.fromEntries(await listWindowRefs(io, ["refs/arc/"]))).toEqual(record.refs.local);
  const remote = (await h.git("git", ["ls-remote", "origin", "refs/arc/*"])).stdout.trim();
  expect(Object.fromEntries(remote.split("\n").filter(Boolean).map(row => {
    const [tip, ref] = row.split("\t"); return [ref, tip];
  }))).toEqual(record.refs.origin);
  expect(Object.fromEntries(await listWindowRefs(io, ["refs/arc-remotes/origin/"]))).toEqual(record.refs.tracking);
  expect(await listWindowRefs(io, ["refs/arc-window/"])).toEqual(new Map());
  for (const directory of directories) await expect(lstat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.git("git", ["config", "--local", "--list", "--null"])).stdout).not.toContain("remote.origin.arc-state\n");
  expect(await storeImported(h.root, h.git)).toBe(false);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/"])).stdout).toBe(branches);
  expect((await h.git("git", ["worktree", "list", "--porcelain", "-z"])).stdout).toBe(worktrees);
  const repeated = await run("restore");
  expect(repeated.exitCode).toBe(1);
  expect(JSON.parse(repeated.stdout)).toMatchObject({ status: "refused", findings: [expect.objectContaining({ subject: "cutover hold" })] });
  expect((await run("check")).exitCode).toBe(0);
}, 60_000);
