/** A held, imported window and exact post-restore assertions for native interruption scenarios. */
import { mkdir, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect } from "vitest";
import { windowFixture } from "./fixture.js";
import { checkFixture } from "./check.js";
import { readWindowHold } from "../../../src/scripts/cutover-window/hold.js";
import { listWindowRefs } from "../../../src/scripts/cutover-window/git.js";
import { storeImported } from "../../../src/lib/store/store-imported.js";
import { seedTransients, transientCommon, transientSourceRef } from "../store/import-transients.js";
import { saveImportPersonal } from "../store/import-fixture.js";
import { invokeStoreRemote } from "../store/remote-command.js";

/** Import a recorded grooming claim, optionally stopping before publication. */
export async function restorableWindow(beforePublication = false) {
  const h = await windowFixture();
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const held = await seedTransients(h, [{ ...transientCommon, kind: "groom", slug: "groom-alpha", anchorStub: "alpha", members: ["alpha"],
    openedBaseHead: head, protection: "partial", branch: null, state: "open", changeRequest: null }]);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const io = { repo: h.root, exec: h.git, execInput: h.ports.execInput };
  const { record } = await readWindowHold(io);
  const branches = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/"])).stdout;
  const worktrees = (await h.git("git", ["worktree", "list", "--porcelain", "-z"])).stdout;
  await saveImportPersonal(h.root, false);
  expect(await invokeStoreRemote(["origin", "push"], { cwd: h.root })).toMatchObject({ result: { status: "ok" } });
  if (beforePublication) {
    h.ports.migrateStep = step => step === "import.publish" ? Promise.reject(new Error("pause-import")) : Promise.resolve();
    await expect(h.migrate()).rejects.toThrow("pause-import");
  } else expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(await storeImported(h.root, h.git)).toBe(true);
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const directories = ["store", "store-migrate-build", "store-migrate-old"].map(name => join(common, "arc", name));
  for (const directory of directories) await mkdir(directory, { recursive: true });
  return { ...h, io, record, held, common, directories, branches, worktrees };
}

/** Require the exact recorded refs, removed installation and hold, lifted seal, and unchanged code checkouts. */
export async function expectRestoredWindow(h: Awaited<ReturnType<typeof restorableWindow>>) {
  expect(Object.fromEntries(await listWindowRefs(h.io, ["refs/arc/"]))).toEqual(h.record.refs.local);
  expect(Object.fromEntries(await listWindowRefs({ repo: h.origin, exec: h.remote }, ["refs/arc/"]))).toEqual(h.record.refs.origin);
  expect(Object.fromEntries(await listWindowRefs(h.io, ["refs/arc-remotes/origin/"]))).toEqual(h.record.refs.tracking);
  expect(await listWindowRefs(h.io, ["refs/arc-window/"])).toEqual(new Map());
  for (const directory of h.directories) await expect(lstat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.git("git", ["config", "--local", "--list", "--null"])).stdout).not.toContain("remote.origin.arc-state\n");
  expect(await storeImported(h.root, h.git)).toBe(false);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/"])).stdout).toBe(h.branches);
  expect((await h.git("git", ["worktree", "list", "--porcelain", "-z"])).stdout).toBe(h.worktrees);
}
