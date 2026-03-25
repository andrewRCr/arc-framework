import { describe, it, expect, vi, beforeEach } from "vitest";
import { runJoin } from "../../src/commands/join.js";
import type { JoinIOContext, JoinOptions } from "../../src/commands/join.js";
import { UserFacingError } from "../../src/lib/errors.js";
import { CANONICAL_SKILLS } from "../../src/lib/skills/index.js";

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
    pmMode: "none",
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

  it("configures git integration (gitattributes, merge driver, hooks)", async () => {
    await runJoin(opts);

    const execCalls = (io.exec as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];

    // merge driver
    const mergeDriver = execCalls.find(
      (c) => c[1]?.includes("merge.ours.driver"),
    );
    expect(mergeDriver).toBeDefined();

    // hooks path
    const hooksPath = execCalls.find(
      (c) => c[1]?.includes("core.hooksPath"),
    );
    expect(hooksPath).toBeDefined();

    // gitattributes block written
    const writeCalls = (io.writeFile as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    const gitattrsWrite = writeCalls.find(
      (c) => c[0] === "/project/.gitattributes",
    );
    expect(gitattrsWrite).toBeDefined();
    expect(gitattrsWrite![1]).toContain("WORK-STATUS.md merge=ours");
    expect(gitattrsWrite![1]).toContain("# ARC Framework (managed by arc cli)");
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

  it("works with pm.mode=external", async () => {
    opts.pmMode = "external";
    const result = await runJoin(opts);

    expect(result.role).toBe("maintainer");
    expect(result.tools).toEqual(["claude"]);
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
});
