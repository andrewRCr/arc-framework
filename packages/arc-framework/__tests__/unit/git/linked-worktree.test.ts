/** Target-agnostic linked-worktree creation and setup. */

import { makeGitProcessError } from "../../helpers/git-exec-fake.js";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLinkedWorktree } from "../../../src/lib/git/linked-worktree.js";
import { setupLinkedWorktree } from "../../../src/lib/git/linked-worktree-setup.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { readWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("createLinkedWorktree", () => {
  it("returns a proof-bearing fresh-branch creation receipt", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "" };
    };

    const result = await createLinkedWorktree({ exec, pathExists: async () => false }, {
      locationTemplate: "/work/{repo}.{name}",
      primaryWorktreePath: "/work/repo",
      repo: "repo",
      placementName: "target",
      branch: "feat/target",
      createBranch: true,
      base: "main",
    });

    expect(result).toEqual({
      kind: "created",
      receipt: {
        worktreePath: "/work/repo.target",
        branch: "feat/target",
        worktreeCreated: true,
        branchCreated: true,
        base: "main",
      },
    });
    expect(calls).toEqual([
      ["git", "worktree", "add", "/work/repo.target", "-b", "feat/target", "main"],
    ]);
  });

  it("returns an existing-branch receipt without claiming branch creation", async () => {
    const calls: string[][] = [];
    const result = await createLinkedWorktree({
      exec: async (command, args) => {
        calls.push([command, ...args]);
        return { stdout: "" };
      },
      pathExists: async () => false,
    }, {
      locationTemplate: "../{repo}.{name}",
      primaryWorktreePath: "/work/repo",
      repo: "repo",
      placementName: "existing",
      branch: "feat/existing",
      createBranch: false,
      base: "ignored",
    });

    expect(result).toEqual({
      kind: "created",
      receipt: {
        worktreePath: "/work/repo.existing",
        branch: "feat/existing",
        worktreeCreated: true,
        branchCreated: false,
        base: null,
      },
    });
    expect(calls).toEqual([["git", "worktree", "add", "/work/repo.existing", "feat/existing"]]);
  });

  it("fails closed when relative placement has no resolvable primary worktree", async () => {
    const calls: string[][] = [];
    let pathChecked = false;
    const result = await createLinkedWorktree({
      exec: async (command, args) => {
        calls.push([command, ...args]);
        return { stdout: "" };
      },
      pathExists: async () => {
        pathChecked = true;
        return false;
      },
    }, {
      locationTemplate: "../{repo}.{name}",
      repo: "repo",
      placementName: "target",
      branch: "feat/target",
      createBranch: true,
      base: "main",
    });

    expect(result).toMatchObject({ kind: "error", reason: "primary-unavailable" });
    expect(calls).toEqual([["git", "worktree", "list", "--porcelain", "-z"]]);
    expect(pathChecked).toBe(false);
  });

  it("refuses a configured path collision before invoking Git", async () => {
    let invoked = false;
    const result = await createLinkedWorktree({
      exec: async () => {
        invoked = true;
        return { stdout: "" };
      },
      pathExists: async () => true,
    }, {
      locationTemplate: "/work/{name}",
      primaryWorktreePath: "/work/repo",
      repo: "repo",
      placementName: "occupied",
      branch: "feat/occupied",
      createBranch: true,
      base: "main",
    });

    expect(result).toEqual({ kind: "refused", reason: "path-collision", worktreePath: "/work/occupied" });
    expect(invoked).toBe(false);
  });

  it("contains a worktree-add failure in a typed error", async () => {
    const failure = makeGitProcessError({ command: "git",
      args: ["worktree", "add", "-b", "feat/target", "/work/target", "main"],
      exitCode: 128, stderr: "git rejected add" });
    await expect(createLinkedWorktree({
      exec: async () => { throw failure; },
      pathExists: async () => false,
    }, {
      locationTemplate: "/work/{name}",
      primaryWorktreePath: "/work/repo",
      repo: "repo",
      placementName: "target",
      branch: "feat/target",
      createBranch: true,
      base: "main",
    })).resolves.toEqual({ kind: "error", reason: "git-worktree-add-failed", error: failure });
  });

  it("writes no work-unit or transient provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-linked-worktree-"));
    temporaryRoots.push(root);
    const target = join(root, "target");
    const result = await createLinkedWorktree({
      exec: async (_command, args) => {
        await mkdir(args[2] ?? "");
        return { stdout: "" };
      },
      pathExists: async (path) => access(path).then(() => true, () => false),
    }, {
      locationTemplate: target,
      primaryWorktreePath: root,
      repo: "repo",
      placementName: "target",
      branch: "feat/target",
      createBranch: true,
      base: "main",
    });

    expect(result).toMatchObject({ kind: "created" });
    expect(await readWorktreeMarker(target)).toEqual({ kind: "absent" });
  });
});

describe("setupLinkedWorktree", () => {
  it("runs post-create and copies registered harness directories in order", async () => {
    const events: string[] = [];

    const result = await setupLinkedWorktree({
      exec: async (command, args) => {
        events.push([command, ...args].join(" "));
        return { stdout: "" };
      },
      fs: {
        pathExists: async () => false,
        copyFileIfAbsent: async () => {},
        directoryExists: async (path) => {
          events.push(`exists ${path}`);
          return path.endsWith("/.codex");
        },
        copyDirectory: async (source, destination) => {
          events.push(`copy ${source} ${destination}`);
        },
      },
    }, {
      worktreePath: "/work/target",
      primaryWorktreePath: "/work/repo",
      postCreateScript: "npm install",
      registeredHarnessDirs: ".codex,.missing",
    });

    const command = process.platform === "win32"
      ? "cmd.exe /d /s /c npm install"
      : "sh -c npm install";
    expect(result).toEqual({});
    expect(events).toEqual([
      command,
      "exists /work/repo/.codex",
      "copy /work/repo/.codex /work/target/.codex",
      "exists /work/repo/.missing",
    ]);
  });

  it("fails before harness copying when post-create setup fails", async () => {
    let copied = false;

    await expect(setupLinkedWorktree({
      exec: async () => { throw new Error("exit 17"); },
      fs: {
        pathExists: async () => false,
        copyFileIfAbsent: async () => {},
        directoryExists: async () => true,
        copyDirectory: async () => { copied = true; },
      },
    }, {
      worktreePath: "/work/target",
      primaryWorktreePath: "/work/repo",
      postCreateScript: "npm install",
      registeredHarnessDirs: ".codex",
    })).rejects.toThrow(/worktree\.post_create failed: exit 17/u);

    expect(copied).toBe(false);
  });

  it("copies matches the new worktree ignores before post-create and harness directories", async () => {
    const events: string[] = [];
    const includeFile = join("/work/repo", ".worktreeinclude");

    await setupLinkedWorktree({
      exec: async (command, args, options) => {
        events.push(`${options?.cwd ?? "-"}: ${[command, ...args].join(" ")}`);
        if (args[0] === "ls-files") {
          return { stdout: ".env\0.arc/user/notes.md\0config/local.json\0notes.txt\0" };
        }
        if (args[0] === "check-ignore" && args.at(-1) === "./notes.txt") {
          throw makeGitProcessError({ command, args, exitCode: 1, stderr: "" });
        }
        return { stdout: "" };
      },
      fs: {
        pathExists: async (path) => path === includeFile,
        copyFileIfAbsent: async (source, destination) => {
          events.push(`copy-file ${source} ${destination}`);
        },
        directoryExists: async () => true,
        copyDirectory: async (source, destination) => {
          events.push(`copy ${source} ${destination}`);
        },
      },
    }, {
      worktreePath: "/work/target",
      primaryWorktreePath: "/work/repo",
      postCreateScript: "npm install",
      registeredHarnessDirs: ".codex",
    });

    const command = process.platform === "win32"
      ? "cmd.exe /d /s /c npm install"
      : "sh -c npm install";
    expect(events).toEqual([
      `/work/repo: git ls-files --others --ignored -z --exclude-from=${includeFile}`,
      "/work/target: git check-ignore -q -- ./.env",
      `copy-file ${join("/work/repo", ".env")} ${join("/work/target", ".env")}`,
      "/work/target: git check-ignore -q -- ./config/local.json",
      `copy-file ${join("/work/repo", "config/local.json")} ${join("/work/target", "config/local.json")}`,
      "/work/target: git check-ignore -q -- ./notes.txt",
      `/work/target: ${command}`,
      `copy ${join("/work/repo", ".codex")} ${join("/work/target", ".codex")}`,
    ]);
  });

  it("fails before post-create setup when an include-file copy fails", async () => {
    let postCreateRan = false;

    await expect(setupLinkedWorktree({
      exec: async (command) => {
        if (command !== "git") postCreateRan = true;
        return { stdout: ".env\0" };
      },
      fs: {
        pathExists: async () => true,
        copyFileIfAbsent: async () => { throw new Error("permission denied"); },
        directoryExists: async () => false,
        copyDirectory: async () => {},
      },
    }, {
      worktreePath: "/work/target",
      primaryWorktreePath: "/work/repo",
      postCreateScript: "npm install",
      registeredHarnessDirs: "",
    })).rejects.toThrow(/\.worktreeinclude copy failed: permission denied/u);

    expect(postCreateRan).toBe(false);
  });
});
