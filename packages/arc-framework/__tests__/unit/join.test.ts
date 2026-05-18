import { describe, it, expect, vi, beforeEach } from "vitest";
import { runJoin, runJoinReconfigure, buildPostJoinMessage } from "../../src/commands/join.js";
import type {
  JoinIOContext, JoinOptions, JoinReconfigureOptions, JoinResult,
} from "../../src/commands/join.js";
import { UserFacingError } from "../../src/lib/errors.js";
import { CANONICAL_SKILLS } from "../../src/lib/skills/index.js";
import type { SkillRemovalIO } from "../../src/lib/skills/index.js";

// --- Test Helpers ---

/** Build stub canonical skill files for a template directory. */
function canonicalSkillFiles(templateDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of CANONICAL_SKILLS) {
    files[`${templateDir}/system/skills/${name}/SKILL.md`] = [
      "---",
      `name: ${name}`,
      `description: Stub skill for testing.`,
      "disable-model-invocation: false",
      "---",
      "",
      `# ${name}`,
      "",
    ].join("\n");
  }
  return files;
}

/** Create a mock IOContext with an in-memory filesystem. */
function mockIO(files: Record<string, string> = {}): JoinIOContext {
  const store = new Map(Object.entries(files));

  return {
    readFile: vi.fn(async (path: string) => {
      const content = store.get(path);
      if (content === undefined) {
        const err = new Error(`ENOENT: ${path}`);
        (err as NodeJS.ErrnoException).code = "ENOENT";
        throw err;
      }
      return content;
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      store.set(path, content);
    }),
    mkdir: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({ stdout: "", stderr: "" })),
    access: vi.fn(async (path: string) => {
      if (!store.has(path)) {
        const err = new Error(`ENOENT: ${path}`);
        (err as NodeJS.ErrnoException).code = "ENOENT";
        throw err;
      }
    }),
  };
}

const DEFAULT_PROMPTS = { role: "maintainer" as const, tools: ["claude"] };

function baseOptions(io: JoinIOContext): JoinOptions {
  return {
    cwd: "/project",
    io,
    templateDir: "/templates",
    internalTemplateDir: "/internal-templates",
    prompts: DEFAULT_PROMPTS,
    identityResult: "andrew",
  };
}

// --- Tests ---

describe("runJoin", () => {
  let io: JoinIOContext;
  let opts: JoinOptions;

  beforeEach(() => {
    io = mockIO({
      // Existing ARC installation
      "/project/.arc/system/arc-config.yml": "pm.mode: none\n",
      // Gitignore and gitattributes for block writes
      "/project/.gitignore": "node_modules/\n",
      "/project/.gitattributes": "",
      // Canonical skill templates
      ...canonicalSkillFiles("/templates"),
      // Internal templates for user directory setup
      "/internal-templates/user/SESSION-NOTES.md": "# Session Notes\n",
      "/internal-templates/user/WORKING-MEMORY.md": "# Working Memory\n",
      "/internal-templates/user/USER-INBOX.md": "# User Inbox\n",
    });
    opts = baseOptions(io);
  });

  it("errors when .arc/ doesn't exist (suggests arc init)", async () => {
    io = mockIO({
      // No arc-config.yml — no installation
      "/project/.gitignore": "",
      "/project/.gitattributes": "",
    });
    opts = baseOptions(io);

    try {
      await runJoin(opts);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UserFacingError);
      const ufErr = err as UserFacingError;
      expect(ufErr.code).toBe("NO_ARC_INSTALLATION");
      expect(ufErr.whatToDo).toContain("arc init");
    }
  });

  it("sets git config arc.role", async () => {
    await runJoin(opts);

    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const roleCall = execCalls.find(
      (c) => c[1]?.includes("arc.role"),
    );
    expect(roleCall).toBeDefined();
    expect(roleCall![1]).toEqual(["config", "--local", "arc.role", "maintainer"]);
  });

  it("sets contributor role when specified", async () => {
    opts.prompts = { role: "contributor", tools: [] };
    await runJoin(opts);

    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const roleCall = execCalls.find(
      (c) => c[1]?.includes("arc.role"),
    );
    expect(roleCall).toBeDefined();
    expect(roleCall![1]).toEqual(["config", "--local", "arc.role", "contributor"]);
  });

  it("sets git config arc.identity", async () => {
    await runJoin(opts);

    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const identityCall = execCalls.find(
      (c) => c[1]?.includes("arc.identity") && c[1]?.includes("andrew"),
    );
    expect(identityCall).toBeDefined();
  });

  it("configures git integration (hooks path)", async () => {
    await runJoin(opts);

    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];

    // hooks path — exact call shape
    const hooksPath = execCalls.find(
      (c) => c[1]?.includes("core.hooksPath"),
    );
    expect(hooksPath).toBeDefined();
    expect(hooksPath).toEqual([
      "git",
      ["config", "core.hooksPath", ".arc/system/githooks"],
    ]);

    // guard: merge driver was retired in d8e5048 — no merge.* git config should be written
    const mergeDriverCall = execCalls.find(
      (c) => c[1]?.some((arg) => arg.startsWith("merge.")),
    );
    expect(mergeDriverCall).toBeUndefined();
  });

  it("creates user directory with templates", async () => {
    await runJoin(opts);

    const mkdirCalls = (io.mkdir as ReturnType<typeof vi.fn>).mock.calls as [string, object][];
    const userDirCall = mkdirCalls.find(
      (c) => (c[0] as string).includes("user/andrew"),
    );
    expect(userDirCall).toBeDefined();

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    const sessionNotesWrite = writeCalls.find(
      (c) => c[0] === "/project/.arc/user/andrew/SESSION-NOTES.md",
    );
    expect(sessionNotesWrite).toBeDefined();
  });

  it("writes managed gitignore block", async () => {
    await runJoin(opts);

    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    const gitignoreWrite = writeCalls.find(
      (c) => c[0] === "/project/.gitignore",
    );
    expect(gitignoreWrite).toBeDefined();
    expect(gitignoreWrite![1]).toContain("# ARC Framework (managed by arc cli)");
    expect(gitignoreWrite![1]).toContain(".arc/user/*/");
  });

  it("returns result with role, tools, and identity", async () => {
    const result = await runJoin(opts);

    expect(result.role).toBe("maintainer");
    expect(result.tools).toEqual(["claude"]);
    expect(result.identity).toBe("andrew");
  });

  it("handles null identity gracefully", async () => {
    opts.identityResult = null;
    const result = await runJoin(opts);

    expect(result.identity).toBeNull();

    // Should not attempt to set arc.identity
    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const identityCalls = execCalls.filter(
      (c) => c[1]?.includes("arc.identity"),
    );
    // Only the one from runPostInitSetup won't fire (guarded by identityResult check)
    // but runJoin itself also guards on identityResult
    expect(identityCalls.length).toBe(0);
  });

  it("is idempotent — second run succeeds without error", async () => {
    await runJoin(opts);

    // Reset mock call counts but keep the same store (files from first run persist)
    (io.exec as ReturnType<typeof vi.fn>).mockClear();
    (io.writeFile as ReturnType<typeof vi.fn>).mockClear();
    (io.mkdir as ReturnType<typeof vi.fn>).mockClear();

    // Second run should succeed
    const result = await runJoin(opts);
    expect(result.role).toBe("maintainer");
    expect(result.tools).toEqual(["claude"]);
  });

  it("persists tools in git config arc.tools", async () => {
    await runJoin(opts);

    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const toolsCall = execCalls.find(
      (c) => c[1]?.includes("arc.tools"),
    );
    expect(toolsCall).toBeDefined();
    expect(toolsCall![1]).toEqual(["config", "--local", "arc.tools", "claude"]);
  });
});

// --- Join Reconfigure Tests ---

describe("runJoinReconfigure", () => {
  let io: JoinIOContext;
  let removeIO: SkillRemovalIO;
  const removedPaths: string[] = [];

  function buildReconfigureOpts(overrides?: Partial<JoinReconfigureOptions>): JoinReconfigureOptions {
    return {
      cwd: "/project",
      io,
      templateDir: "/templates",
      prompts: { role: "maintainer", tools: ["cursor"] },
      previousTools: ["claude"],
      removeIO,
      ...overrides,
    };
  }

  /** Pre-populate skill files on disk for cleanup testing. */
  function addSkillFiles(store: Map<string, string>, dir: string): void {
    for (const name of CANONICAL_SKILLS) {
      const path = `/project/${dir}/${name}/SKILL.md`;
      store.set(path, `---\nname: ${name}\n---\n`);
    }
  }

  beforeEach(() => {
    removedPaths.length = 0;

    const store = new Map<string, string>([
      ["/project/.arc/system/arc-config.yml", "pm.mode: none\n"],
      ["/project/.gitignore", "node_modules/\n"],
      ["/project/.gitattributes", ""],
      ...Object.entries(canonicalSkillFiles("/templates")),
    ]);

    // Add existing claude skill files (the old tools)
    addSkillFiles(store, ".claude/skills");

    io = {
      readFile: vi.fn(async (path: string) => {
        const content = store.get(path);
        if (content === undefined) {
          const err = new Error(`ENOENT: ${path}`);
          (err as NodeJS.ErrnoException).code = "ENOENT";
          throw err;
        }
        return content;
      }),
      writeFile: vi.fn(async (path: string, content: string) => {
        store.set(path, content);
      }),
      mkdir: vi.fn(async () => undefined),
      exec: vi.fn(async () => ({ stdout: "", stderr: "" })),
      access: vi.fn(async (path: string) => {
        if (!store.has(path)) {
          const err = new Error(`ENOENT: ${path}`);
          (err as NodeJS.ErrnoException).code = "ENOENT";
          throw err;
        }
      }),
    };

    removeIO = {
      access: vi.fn(async (path: string) => {
        if (!store.has(path)) {
          const err = new Error(`ENOENT: ${path}`);
          (err as NodeJS.ErrnoException).code = "ENOENT";
          throw err;
        }
      }),
      unlink: vi.fn(async (path: string) => {
        if (store.has(path)) {
          store.delete(path);
          removedPaths.push(path);
        } else {
          const err = new Error(`ENOENT: ${path}`);
          (err as NodeJS.ErrnoException).code = "ENOENT";
          throw err;
        }
      }),
      rmdir: vi.fn(async () => {
        // Simulated rmdir — always succeeds (empty dir)
      }),
    };
  });

  it("role change updates git config", async () => {
    const result = await runJoinReconfigure(buildReconfigureOpts({
      prompts: { role: "contributor", tools: ["claude"] },
      previousTools: ["claude"],
    }));

    expect(result.role).toBe("contributor");
    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const roleCall = execCalls.find((c) => c[1]?.includes("arc.role"));
    expect(roleCall![1]).toEqual(["config", "--local", "arc.role", "contributor"]);
  });

  it("tool change regenerates skills for new selection", async () => {
    const result = await runJoinReconfigure(buildReconfigureOpts({
      prompts: { role: "maintainer", tools: ["cursor"] },
      previousTools: ["claude"],
    }));

    expect(result.tools).toEqual(["cursor"]);

    // Verify new skill files were written to the universal dir (cursor is universal)
    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    const skillWrites = writeCalls.filter(
      (c) => c[0].includes("/skills/arc-") && c[0].endsWith("SKILL.md"),
    );
    // Should have written skills for cursor (resolves to .agents/skills/)
    expect(skillWrites.length).toBe(CANONICAL_SKILLS.length);
  });

  it("tool change removes skill files for deselected tools", async () => {
    const result = await runJoinReconfigure(buildReconfigureOpts({
      prompts: { role: "maintainer", tools: ["cursor"] },
      previousTools: ["claude"],
    }));

    // Old claude skills should be removed
    expect(result.removedSkills.length).toBeGreaterThan(0);
    // Each removed path should be under .claude/skills/arc-*
    for (const p of result.removedSkills) {
      expect(p).toMatch(/^\.claude\/skills\/arc-/);
    }
  });

  it("unchanged values produce no side effects", async () => {
    const result = await runJoinReconfigure(buildReconfigureOpts({
      prompts: { role: "maintainer", tools: ["claude"] },
      previousTools: ["claude"],
    }));

    // No skills removed (same tool)
    expect(result.removedSkills).toHaveLength(0);
    expect(result.tools).toEqual(["claude"]);
  });

  it("works for both maintainer and contributor roles", async () => {
    // Contributor
    const contribResult = await runJoinReconfigure(buildReconfigureOpts({
      prompts: { role: "contributor", tools: ["claude"] },
      previousTools: ["claude"],
    }));
    expect(contribResult.role).toBe("contributor");

    // Maintainer
    const maintainerResult = await runJoinReconfigure(buildReconfigureOpts({
      prompts: { role: "maintainer", tools: ["claude"] },
      previousTools: ["claude"],
    }));
    expect(maintainerResult.role).toBe("maintainer");
  });
});

// --- buildPostJoinMessage ---

describe("buildPostJoinMessage", () => {
  function makeJoinResult(overrides: Partial<JoinResult> = {}): JoinResult {
    return {
      role: "maintainer",
      tools: ["claude"],
      identity: "andrew",
      ...overrides,
    };
  }

  it("opens with role-confirmation line", () => {
    const msg = buildPostJoinMessage(makeJoinResult({ role: "contributor" }));

    expect(msg.startsWith("Joined as contributor.")).toBe(true);
  });

  it("includes skill restart cue when tools are configured", () => {
    const msg = buildPostJoinMessage(makeJoinResult());

    expect(msg).toContain("Restart your AI tool so the new /arc-resume skill is available");
  });

  it("omits skill restart cue when no tools are configured", () => {
    const msg = buildPostJoinMessage(makeJoinResult({ tools: [] }));

    expect(msg).not.toContain("Restart your AI tool");
  });

  it("introduces user-notes orientation when identity is set", () => {
    const msg = buildPostJoinMessage(makeJoinResult({ identity: "alice" }));

    expect(msg).toContain(".arc/user/alice/");
    expect(msg).toContain("(gitignored)");
    expect(msg).toContain("user notes");
    expect(msg).toContain("git notes ref");
    expect(msg).toContain("`arc sync`");
  });

  it("omits user-notes orientation when identity is null", () => {
    const msg = buildPostJoinMessage(makeJoinResult({ identity: null }));

    expect(msg).not.toContain(".arc/user/");
    expect(msg).not.toContain("user notes");
  });

  it("interpolates the resolved identity into the user directory path", () => {
    const msg = buildPostJoinMessage(makeJoinResult({ identity: "robin-q" }));

    expect(msg).toContain(".arc/user/robin-q/");
  });
});
