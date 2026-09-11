/** Integration coverage for reusable prepared-repository fixtures. */

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
  readFile,
  writeFile,
} from "../helpers/integration.js";
import {
  copyPreparedRepository,
  prepareRepositoryTemplate,
  PREPARED_REMOTE_PATH,
  PREPARED_WORKTREE_PATH,
  type PreparedRepositoryShape,
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

async function trackedTree(root: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--stage", "--others", "--exclude-standard"],
    { cwd: root },
  );
  return stdout;
}

async function absolutePathOccurrences(root: string, path: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/grep",
      ["-R", "-a", "-F", "-l", "--", path, root],
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
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

    expect(stdout.trim()).toBe(join(copy, PREPARED_REMOTE_PATH));
    expect(await absolutePathOccurrences(copy, template.root)).toEqual([]);
  });

  it("resolves a copied worktree-bearing fixture inside its own copy", async () => {
    const template = await prepareRepositoryTemplate(worktreeShape, buildWorktreeRepository);
    const copy = await copyPreparedRepository(template, worktreeShape);
    roots.add(copy);
    const linked = join(copy, PREPARED_WORKTREE_PATH);
    const { stdout } = await execFileAsync("git", ["rev-parse", "--absolute-git-dir"], { cwd: linked });

    expect(stdout.trim().startsWith(`${copy}/`)).toBe(true);
    expect(await absolutePathOccurrences(copy, template.root)).toEqual([]);
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

  it("refuses to serve a fixture requested as a different shape", async () => {
    const template = await prepareRepositoryTemplate(plainShape, buildPlainRepository);
    const attempt = copyPreparedRepository(template, remoteShape).then((root) => {
      roots.add(root);
      return root;
    });

    await expect(attempt).rejects.toThrow(/shape/u);
  });
});
