import { describe, expect, it, vi } from "vitest";

import {
  emitCompactionSeed,
  parseUncommittedFiles,
  resolveCompactionSeedPath,
} from "../../../src/lib/compaction-seed/emitter.js";
import {
  parseCompactionSeedJson,
  stringifyCompactionSeed,
  type CompactionSeed,
} from "../../../src/lib/compaction-seed/schema.js";
import type { LoadSetManifest } from "../../../src/lib/load-set/types.js";

const LOAD_SET = {
  entries: [
    {
      path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md",
      readMode: { kind: "full" },
    },
    {
      path: ".arc/active/tasks-compaction-recovery.md",
      readMode: { kind: "partial-strategic" },
    },
  ],
} satisfies LoadSetManifest;

function envelope(overrides: Partial<Parameters<typeof emitCompactionSeed>[0]["envelope"]> = {}) {
  return {
    identity: { identity: "andrew" },
    worktree: { ok: true, value: { branch: "feat/compaction-recovery" } },
    active: {
      ok: true,
      value: {
        path: ".arc/active/meta-compaction-recovery.md",
        sessionType: "execution",
      },
    },
    loadSet: { ok: true, value: LOAD_SET },
    ...overrides,
  } satisfies Parameters<typeof emitCompactionSeed>[0]["envelope"];
}

function execWithStatus(statusOutput: string) {
  return vi.fn(async (_cmd: string, args: string[]) => {
    if (args.join(" ") === "rev-parse HEAD") {
      return {
        stdout: "72d145021bf4166fa70efc5b9fd11916cf0a359a\n",
        stderr: "",
      };
    }
    if (args.join(" ") === "status --porcelain=v1 -z") {
      return { stdout: statusOutput, stderr: "" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
}

async function emit(overrides: {
  statusOutput?: string;
  metaContent?: string;
  envelope?: Partial<Parameters<typeof emitCompactionSeed>[0]["envelope"]>;
  writeSeed?: (path: string, seed: CompactionSeed) => Promise<void>;
} = {}) {
  return emitCompactionSeed({
    cwd: "/repo",
    envelope: envelope(overrides.envelope),
    exec: execWithStatus(overrides.statusOutput ?? ""),
    readFile: vi.fn(async () => overrides.metaContent ?? [
      "# Metadata: Compaction Recovery",
      "",
      "- **Current Workflow:** [none]",
      "- **Next Task:** Task 2.1 — Define the `CompactionSeed` schema (line ~66)",
      "- **Next Action:** Begin Task 2.1",
    ].join("\n")),
    writeSeed: overrides.writeSeed ?? vi.fn(async () => undefined),
    now: () => new Date("2026-06-28T12:00:00.000Z"),
  });
}

describe("resolveCompactionSeedPath", () => {
  it("targets the identity-scoped internal seed path", () => {
    expect(resolveCompactionSeedPath({ cwd: "/repo", identity: "andrew" }))
      .toBe("/repo/.arc/user/andrew/.internal/compaction-seed.json");
  });
});

describe("parseUncommittedFiles", () => {
  it("derives a deterministic file list from porcelain-z output", () => {
    expect(
      parseUncommittedFiles([
        "?? zeta.txt",
        " M src/b.ts",
        "R  src/new.ts",
        "src/old.ts",
        "A  src/a.ts",
        "",
      ].join("\0")),
    ).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/new.ts",
      "zeta.txt",
    ]);
  });
});

describe("emitCompactionSeed", () => {
  it("embeds the load-set manifest supplied by the session-init envelope", async () => {
    const result = await emit();

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.loadSet).toEqual(LOAD_SET);
    }
  });

  it("derives uncommitted files from live git status with deterministic ordering", async () => {
    const result = await emit({
      statusOutput: [
        "?? packages/arc-framework/src/lib/compaction-seed/emitter.ts",
        " M .arc/active/tasks-compaction-recovery.md",
        "",
      ].join("\0"),
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.dirty).toBe(true);
      expect(result.seed.uncommittedFiles).toEqual([
        ".arc/active/tasks-compaction-recovery.md",
        "packages/arc-framework/src/lib/compaction-seed/emitter.ts",
      ]);
    }
  });

  it("populates the execution current task from the meta Next Task pointer", async () => {
    const result = await emit();

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.currentTask).toEqual({
        id: "2.1",
        title: "Define the `CompactionSeed` schema",
        lineHint: 66,
      });
    }
  });

  it("sets currentTask to null in planning sessions", async () => {
    const result = await emit({
      envelope: {
        active: {
          ok: true,
          value: {
            path: ".arc/active/meta-compaction-recovery.md",
            sessionType: "planning",
          },
        },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.currentTask).toBeNull();
    }
  });

  it("uses live git data for head and dirty while carrying the resolved branch", async () => {
    const result = await emit({
      statusOutput: " M src/changed.ts\0",
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.head).toBe("72d145021bf4166fa70efc5b9fd11916cf0a359a");
      expect(result.seed.branch).toBe("feat/compaction-recovery");
      expect(result.seed.dirty).toBe(true);
    }
  });

  it("round-trips the written seed losslessly through JSON", async () => {
    let written: CompactionSeed | null = null;
    const result = await emit({
      writeSeed: vi.fn(async (_path, seed) => { written = seed; }),
    });

    expect(result.status).toBe("written");
    expect(written).not.toBeNull();
    const parsed = parseCompactionSeedJson(stringifyCompactionSeed(written!));
    expect(parsed).toEqual({ ok: true, seed: written });
  });

  it("returns a failed write result instead of throwing when persistence fails", async () => {
    await expect(
      emit({
        writeSeed: vi.fn(async () => {
          throw new Error("disk full");
        }),
      }),
    ).resolves.toMatchObject({
      status: "failed",
      reason: "write-failed",
    });
  });

  it("returns a failed write result instead of throwing when meta parsing fails", async () => {
    await expect(
      emit({
        metaContent: [
          "# Metadata: Compaction Recovery",
          "",
          "| State    | Owner    | Branch | Class | Priority |",
          "| -------- | -------- | ------ | ----- | -------- |",
          "| `Active` | `andrew` |",
          "",
        ].join("\n"),
      }),
    ).resolves.toMatchObject({
      status: "failed",
      reason: "meta-read-failed",
    });
  });

  it("skips without touching git or fs when identity is absent", async () => {
    const exec = vi.fn();
    const readFile = vi.fn();
    const writeSeed = vi.fn();

    const result = await emitCompactionSeed({
      cwd: "/repo",
      envelope: envelope({ identity: { identity: null } }),
      exec,
      readFile,
      writeSeed,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "identity-missing",
    });
    expect(exec).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(writeSeed).not.toHaveBeenCalled();
  });
});
