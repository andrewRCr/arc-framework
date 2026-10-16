import { mkdtemp, mkdir, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readGitDirectories } from "../../../../src/lib/git/directories.js";
import type { CoreIO } from "../../../../src/lib/types.js";
import { getOrCreateMachineId as getNotesMachineId } from "../../../../src/lib/user-sync/sync-state.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { getOrCreateMachineId } from "../../../../src/lib/store/machine-id.js";

const roots: string[] = [];
const files = { lstat, readFile: (path: string) => readFile(path, "utf8") };
const identity = "andrew";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function root() {
  const path = await mkdtemp(join(tmpdir(), "arc-store-machine-id-"));
  roots.push(path);
  return path;
}

describe("store machine identity", () => {
  it("shares a persisted ID between worktrees and mints another in a fresh clone", async () => {
    const path = await root();
    const main = join(path, "main");
    const linked = join(path, "linked");
    const other = join(path, "other");
    const common = join(main, ".git");
    const privateDir = join(common, "worktrees", "linked");
    await mkdir(privateDir, { recursive: true });
    await mkdir(linked);
    await mkdir(join(other, ".git"), { recursive: true });
    await writeFile(join(linked, ".git"), `gitdir: ${privateDir}\n`);
    await writeFile(join(privateDir, "commondir"), "../..\n");
    const resolve = async (checkout: string) => getOrCreateMachineId({
      commonGitDir: (await readGitDirectories(checkout, files)).commonDir, identity, fs: files,
    });
    const first = await resolve(main);
    const sibling = await resolve(linked);
    const fresh = await resolve(other);
    expect(first).toMatch(uuid);
    expect(sibling).toBe(first);
    expect(fresh).toMatch(uuid);
    expect(fresh).not.toBe(first);
    expect((await readFile(join(common, "arc", "user", identity, ".internal", ".machine-id"), "utf8")).trim()).toBe(first);
  });

  it("adopts a lost create's complete winner after a partial write", async () => {
    const commonGitDir = await root();
    const winner = "99999999-9999-4999-8999-999999999999";
    const collision = Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    let writtenPath = "";
    const id = await getOrCreateMachineId({
      commonGitDir, identity, fs: files,
      exclusiveCreate: async (path) => {
        writtenPath = path;
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, winner.slice(0, 20));
        throw collision;
      },
      wait: async () => { await writeFile(writtenPath, winner); },
    });
    expect(id).toBe(winner);
    expect(await readFile(writtenPath, "utf8")).toBe(winner);
  });


  it("uses one ID for notes sync and the store for the same clone and identity", async () => {
    const checkout = await root();
    const commonGitDir = join(checkout, ".git");
    const { exec } = scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: commonGitDir }] }]);
    const io: CoreIO = {
      exec, readFile: files.readFile,
      writeFile: async (path, content) => { await writeFile(path, content); },
      mkdir: async (path) => { await mkdir(path, { recursive: true }); },
    };
    const notes = await getNotesMachineId(checkout, io, identity);
    const store = await getOrCreateMachineId({ commonGitDir, identity, fs: files });
    expect(store).toBe(notes);
    expect(await getNotesMachineId(checkout, io, identity)).toBe(store);
  });

});
