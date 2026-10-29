/** Integration coverage for reusable prepared-repository fixtures. */

import { mkdtemp, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  addBareRemote,
  DEFAULT_PROMPTS,
  execFileAsync,
  initInTempRepo,
  join,
  makeCommit,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "../helpers/integration.js";
import {
  copyPreparedRepository,
  prepareRepositoryTemplate,
  PREPARED_REMOTE_PATH,
  PREPARED_WORKTREE_PATH,
  type PreparedRepositoryShape,
  type PreparedSiblingWorktreeShape,
} from "../helpers/prepared-repository.js";

const plainShape: PreparedRepositoryShape = { kind: "plain", key: "default-init" };
const remoteShape: PreparedRepositoryShape = {
  kind: "remote-bearing",
  key: "default-init-with-origin",
};
const worktreeShape: PreparedRepositoryShape = {
  kind: "worktree-bearing",
  key: "default-init-with-worktree",
};
const siblingShape: PreparedSiblingWorktreeShape = {
  kind: "sibling-worktree-bearing", key: "default-init-with-sibling", worktreeName: "linked",
};
const multiShape: PreparedRepositoryShape = { kind: "multi-clone", key: "origin-clones-store-and-links" };
const roots = new Set<string>();

async function buildPlainRepository(): Promise<string> {
  const root = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
  roots.add(root);
  return root;
}

async function buildRemoteRepository(): Promise<string> {
  const root = await buildPlainRepository();
  await makeCommit(root, "prepared fixture");
  await mkdir(join(root, ".arc-fixture"), { recursive: true });
  await writeFile(join(root, ".git", "info", "exclude"), "\n/.arc-fixture/\n", { flag: "a" });
  const remote = join(root, PREPARED_REMOTE_PATH);
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: root });
  await execFileAsync("git", ["push", "-u", "origin", "HEAD"], { cwd: root });
  return root;
}

async function buildWorktreeRepository(): Promise<string> {
  const root = await buildPlainRepository();
  await makeCommit(root, "prepared fixture");
  await mkdir(join(root, ".arc-fixture"), { recursive: true });
  await writeFile(join(root, ".git", "info", "exclude"), "\n/.arc-fixture/\n", { flag: "a" });
  await execFileAsync(
    "git",
    ["worktree", "add", "-b", "prepared-linked", join(root, PREPARED_WORKTREE_PATH)],
    { cwd: root },
  );
  return root;
}

async function buildSiblingRepository(): Promise<string> {
  const root = await buildPlainRepository();
  await makeCommit(root, "prepared sibling fixture");
  const parent = await mkdtemp(join(tmpdir(), "arc-prepared-original-sibling-"));
  roots.add(parent);
  await execFileAsync("git", ["worktree", "add", "-b", "prepared-sibling", join(parent, "linked")], { cwd: root });
  return root;
}

/** An origin, a clone with a linked worktree, a separate store, and a backing pointer, and a clone borrowing objects. */
async function buildMultiCloneRepository(withPathInObject = false, escaped = false): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "arc-prepared-multi-"));
  roots.add(parent);
  const root = escaped && process.platform !== "win32" ? join(parent, "multi\\escaped") : parent;
  if (root !== parent) await mkdir(root);
  const origin = join(root, "origin.git"), a = join(root, "a"), b = join(root, "b");
  const git = async (args: string[], cwd?: string): Promise<void> => { await execFileAsync("git", args, cwd === undefined ? {} : { cwd }); };
  await git(["init", "--bare", "--initial-branch=main", origin]);
  await git(["init", "--initial-branch=main", a]);
  await writeFile(join(a, "fixture.txt"), withPathInObject ? `${root}\n` : "Prepared multi-clone fixture.\n");
  await git(["add", "fixture.txt"], a);
  await git(["-c", "user.name=Prepared", "-c", "user.email=prepared@example.com", "-c", "core.hooksPath=/dev/null",
    "commit", "-m", "prepared multi-clone"], a);
  await git(["remote", "add", "origin", origin], a);
  await git(["push", "-u", "origin", "main"], a);
  await git(["clone", origin, b]);
  await git(["worktree", "add", "-b", "linked", join(root, "a-linked")], a);
  await writeFile(join(b, ".git", "objects", "info", "alternates"), `${join(origin, "objects")}\n`);
  const store = join(a, ".git", "arc", "store");
  await git(["init", "--bare", "--ref-format=reftable", store]);
  await git([`--git-dir=${store}`, "remote", "add", "backing", origin]);
  await mkdir(join(a, ".arc", "system"), { recursive: true });
  await writeFile(join(a, ".arc", "system", "arc-config.yml"), `storage.backing_repository: ${JSON.stringify(origin)}\n`);
  return root;
}

async function trackedTree(root: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--stage", "--others", "--exclude-standard"],
    { cwd: root },
  );
  return stdout;
}

async function absolutePathOccurrences(root: string, path: string): Promise<string[]> {
  const needle = Buffer.from(path);
  const directories = [root];
  const occurrences: string[] = [];

  while (directories.length > 0) {
    const current = directories.pop();
    if (current === undefined) break;

    for (const entry of await readdir(current, { withFileTypes: true })) {
      const candidate = join(current, entry.name);
      if (entry.isDirectory()) directories.push(candidate);
      else if (entry.isFile() && (await readFile(candidate)).includes(needle)) occurrences.push(candidate);
    }
  }

  return occurrences.sort();
}

afterEach(async () => {
  await Promise.all([...roots].map(async (root) => cleanupTempDir(root)));
  roots.clear();
});

describe("prepared repository fixtures", () => {
  it("copies the same tracked tree as a freshly built fixture", async () => {
    const template = await prepareRepositoryTemplate(plainShape, buildPlainRepository);
    const copy = await copyPreparedRepository(template, plainShape);
    roots.add(copy);
    const fresh = await buildPlainRepository();

    expect(copy).not.toBe(template.root);
    expect(await trackedTree(copy)).toBe(await trackedTree(fresh));
  });

  it("leaves no template path in a copied plain fixture", async () => {
    const template = await prepareRepositoryTemplate(plainShape, buildPlainRepository);
    const copy = await copyPreparedRepository(template, plainShape);
    roots.add(copy);

    expect(await absolutePathOccurrences(copy, template.root)).toEqual([]);
  });

  it("resolves a copied remote-bearing fixture to its own remote", async () => {
    const template = await prepareRepositoryTemplate(remoteShape, buildRemoteRepository);
    const copy = await copyPreparedRepository(template, remoteShape);
    roots.add(copy);
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: copy });

    expect(resolve(stdout.trim())).toBe(resolve(join(copy, PREPARED_REMOTE_PATH)));
    expect(await absolutePathOccurrences(copy, template.root)).toEqual([]);
  });

  it("copies a remote whose template path Git serializes with escaped backslashes", async () => {
    const template = await prepareRepositoryTemplate(remoteShape, async () => {
      const original = await buildRemoteRepository();
      if (process.platform === "win32") return original;
      const root = `${original}\\escaped`;
      await rename(original, root); roots.delete(original); roots.add(root);
      await execFileAsync("git", ["remote", "set-url", "origin", join(root, PREPARED_REMOTE_PATH)], { cwd: root });
      return root;
    });
    const copy = await copyPreparedRepository(template, remoteShape); roots.add(copy);
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: copy });
    expect(resolve(stdout.trim())).toBe(resolve(join(copy, PREPARED_REMOTE_PATH)));
    await makeCommit(copy, "independent escaped-path copy");
    await execFileAsync("git", ["push", "origin", "HEAD"], { cwd: copy });
    const original = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: template.root });
    const published = await execFileAsync("git", ["--git-dir", join(copy, PREPARED_REMOTE_PATH), "rev-parse", "HEAD"]);
    expect(published.stdout).not.toBe(original.stdout);
  });

  it("resolves a copied worktree-bearing fixture inside its own copy", async () => {
    const template = await prepareRepositoryTemplate(worktreeShape, buildWorktreeRepository);
    const copy = await copyPreparedRepository(template, worktreeShape);
    roots.add(copy);
    const linked = join(copy, PREPARED_WORKTREE_PATH);
    const { stdout } = await execFileAsync("git", ["rev-parse", "--absolute-git-dir"], { cwd: linked });

    expect(resolve(stdout.trim())).toBe(resolve(join(copy, ".git", "worktrees", "worktree")));
    expect(await absolutePathOccurrences(copy, template.root)).toEqual([]);
  });

  it("lists a copied sibling worktree at its new path", async () => {
    const template = await prepareRepositoryTemplate(siblingShape, buildSiblingRepository);
    const copy = await copyPreparedRepository(template, siblingShape);
    roots.add(copy.root);
    roots.add(copy.parent);
    const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: copy.root });

    expect(stdout.split("\n").filter((line) => line.startsWith("worktree "))
      .map((line) => resolve(line.slice("worktree ".length)))).toContain(resolve(copy.worktree));
  });

  it("resolves copied sibling Git commands to the copied repository", async () => {
    const template = await prepareRepositoryTemplate(siblingShape, buildSiblingRepository);
    const copy = await copyPreparedRepository(template, siblingShape);
    roots.add(copy.root);
    roots.add(copy.parent);
    const { stdout } = await execFileAsync("git", ["rev-parse", "--git-common-dir"], { cwd: copy.worktree });

    expect(resolve(stdout.trim())).toBe(resolve(join(copy.root, ".git")));
  });

  it("registers cleanup for a bare remote even when its return is ignored", async () => {
    const repository = await buildPlainRepository();
    await makeCommit(repository, "remote owner");
    let cleanup: (() => Promise<void>) | undefined;

    await addBareRemote(repository, {
      registerCleanup: (handler) => { cleanup = handler; },
    });
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: repository });
    const remote = stdout.trim();
    roots.add(remote);

    expect(cleanup).toBeTypeOf("function");
    await cleanup?.();
    await expect(readFile(join(remote, "HEAD"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("lets two remote-bearing copies push to different remotes", async () => {
    const template = await prepareRepositoryTemplate(remoteShape, buildRemoteRepository);
    const [left, right] = await Promise.all([
      copyPreparedRepository(template, remoteShape),
      copyPreparedRepository(template, remoteShape),
    ]);
    roots.add(left);
    roots.add(right);

    await makeCommit(left, "left copy");
    await execFileAsync("git", ["push", "origin", "HEAD"], { cwd: left });
    await makeCommit(right, "right copy");
    await execFileAsync("git", ["push", "origin", "HEAD"], { cwd: right });
    const [{ stdout: leftRemote }, { stdout: rightRemote }] = await Promise.all([
      execFileAsync("git", ["remote", "get-url", "origin"], { cwd: left }),
      execFileAsync("git", ["remote", "get-url", "origin"], { cwd: right }),
    ]);

    expect(leftRemote.trim()).not.toBe(rightRemote.trim());
  });

  it("keeps concurrent copies independent under writes", async () => {
    const template = await prepareRepositoryTemplate(plainShape, buildPlainRepository);
    const [left, right] = await Promise.all([
      copyPreparedRepository(template, plainShape),
      copyPreparedRepository(template, plainShape),
    ]);
    roots.add(left);
    roots.add(right);

    await Promise.all([
      writeFile(join(left, "copy-marker"), "left", "utf8"),
      writeFile(join(right, "copy-marker"), "right", "utf8"),
    ]);

    expect(await readFile(join(left, "copy-marker"), "utf8")).toBe("left");
    expect(await readFile(join(right, "copy-marker"), "utf8")).toBe("right");
  });

  it.each([["a plain root", false], ["a root Git serializes with escaped backslashes", true]] as const)(
    "resolves a copied multi-clone fixture's remotes, links, alternates, store, and pointer inside the copy from %s", async (_, escaped) => {
    const template = await prepareRepositoryTemplate(multiShape, () => buildMultiCloneRepository(false, escaped));
    const copy = await copyPreparedRepository(template, multiShape);
    roots.add(copy);
    const git = async (args: string[], cwd?: string): Promise<string> =>
      (await execFileAsync("git", args, cwd === undefined ? {} : { cwd })).stdout.trim();
    const origin = resolve(join(copy, "origin.git")), store = join(copy, "a", ".git", "arc", "store");

    for (const clone of ["a", "b"]) expect(resolve(await git(["remote", "get-url", "origin"], join(copy, clone)))).toBe(origin);
    expect(resolve(await git(["rev-parse", "--path-format=absolute", "--git-common-dir"], join(copy, "a-linked"))))
      .toBe(resolve(join(copy, "a", ".git")));
    expect((await git(["worktree", "list", "--porcelain"], join(copy, "a"))).split("\n").filter((line) => line.startsWith("worktree "))
      .map((line) => resolve(line.slice("worktree ".length)))).toContain(resolve(join(copy, "a-linked")));
    expect(resolve((await readFile(join(copy, "b", ".git", "objects", "info", "alternates"), "utf8")).trim()))
      .toBe(resolve(join(copy, "origin.git", "objects")));
    expect(resolve(await git([`--git-dir=${store}`, "remote", "get-url", "backing"]))).toBe(origin);
    const pointer = /^storage\.backing_repository: (".*")$/mu.exec(await readFile(join(copy, "a", ".arc", "system", "arc-config.yml"), "utf8"));
    expect(resolve(JSON.parse(pointer?.[1] ?? "null") as string)).toBe(origin);

    for (const repository of [join(copy, "a", ".git"), join(copy, "b", ".git"), join(copy, "origin.git"), store]) {
      const objects = await execFileAsync("git", [`--git-dir=${repository}`, "cat-file", "--batch-all-objects", "--batch"],
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
      expect(objects.stdout.includes(Buffer.from(template.root))).toBe(false);
    }
    for (const form of [template.root, template.root.replaceAll("\\", "\\\\")]) {
      expect((await absolutePathOccurrences(copy, form)).filter((path) => !/[\\/]logs[\\/]/u.test(path))).toEqual([]);
    }

    await git(["-c", "user.name=Copy", "-c", "user.email=copy@example.com", "-c", "core.hooksPath=/dev/null",
      "commit", "--allow-empty", "-m", "independent multi-clone copy"], join(copy, "a"));
    await git(["push", "origin", "main"], join(copy, "a"));
    expect(await git([`--git-dir=${origin}`, "rev-parse", "main"])).toBe(await git(["rev-parse", "main"], join(copy, "a")));
    expect(await git([`--git-dir=${join(template.root, "origin.git")}`, "rev-parse", "main"]))
      .toBe(await git(["rev-parse", "main"], join(template.root, "a")));
  });

  it("refuses a multi-clone template whose objects name its own path", async () => {
    await expect(prepareRepositoryTemplate(multiShape, () => buildMultiCloneRepository(true)))
      .rejects.toThrow(/names its own path in an object of (a|origin\.git|b)[\\/]?/u);
  });

  it("refuses to serve a fixture requested as a different shape", async () => {
    const template = await prepareRepositoryTemplate(plainShape, buildPlainRepository);
    const attempt = copyPreparedRepository(template, remoteShape).then((root) => {
      roots.add(root);
      return root;
    });

    await expect(attempt).rejects.toThrow(/shape/u);
  });
});
