import { join } from "node:path";

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
import {
  LOAD_SET_MANIFEST_VERSION,
  type LoadSetManifest,
} from "../../../src/lib/load-set/types.js";
import type { LocusRowV1, LocusStateV1 } from "../../../src/lib/locus/schema/index.js";

const LOAD_SET = {
  manifestVersion: LOAD_SET_MANIFEST_VERSION,
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

const RECOVERY_LOAD_SET = {
  manifestVersion: LOAD_SET_MANIFEST_VERSION,
  entries: [
    {
      path: ".arc/reference/briefs/AGENT-BRIEF.ARC.md",
      readMode: { kind: "full" },
    },
    {
      path: ".arc/active/meta-compaction-recovery.md",
      readMode: { kind: "full" },
    },
    {
      path: ".arc/active/tasks-compaction-recovery.md",
      readMode: { kind: "partial-strategic" },
    },
    {
      path: ".arc/system/workflows/arc/process-task-loop.md",
      readMode: { kind: "full" },
    },
  ],
} satisfies LoadSetManifest;

const WU_CURSOR = {
  status: "found",
  cursor: {
    section: { id: "2.1", title: "Define the task-list cursor", lineHint: 66 },
    leaf: { id: "2.1.a", title: "Parse cursor markers", lineHint: 70 },
  },
} as const;

function locusState(overrides: Partial<LocusStateV1> = {}): LocusStateV1 {
  return {
    roster: { mode: "locus", ok: true, primaryPath: "/repo", rows: [], diagnostics: [] },
    current: { kind: "none" },
    primaryAvailability: { kind: "free", checkoutPath: "/repo" },
    inFlightIdentities: [],
    recovery: { kind: "none" },
    reconciliation: { kind: "clean" },
    ...overrides,
  };
}

function workUnitRow(recordId: string, leaseId: string): LocusRowV1 {
  return {
    kind: "managed-role",
    checkoutPath: "/repo",
    primary: false,
    recordId,
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: "compaction-recovery", claimId: null },
      parentCheckoutPath: null,
      originEntry: null,
    },
    identity: null,
    lease: {
      leaseId,
      selfHeld: false,
      state: "live",
      sessionHomePath: "/repo",
      attachedAt: "2026-06-28T12:00:00.000Z",
      heartbeatAt: "2026-06-28T12:00:00.000Z",
    },
    frame: "suspended",
    derived: {
      workflow: "process-task-loop",
      stage: null,
      sessionType: "execution",
      taskCursor: WU_CURSOR,
      loadSet: RECOVERY_LOAD_SET,
    },
    diagnostics: [],
  };
}

function envelope(overrides: Partial<Parameters<typeof emitCompactionSeed>[0]["envelope"]> = {}) {
  return {
    identity: { identity: "andrew" },
    locusState: { ok: true, value: locusState() },
    worktree: {
      ok: true,
      value: {
        branch: "feat/compaction-recovery",
        identity: { kind: "linked", path: "/repo" },
      },
    },
    active: {
      ok: true,
      value: {
        path: ".arc/active/meta-compaction-recovery.md",
        sessionType: "execution",
        currentWorkflow: "process-task-loop",
      },
    },
    loadSet: { ok: true, value: LOAD_SET },
    taskCursor: {
      ok: true,
      value: {
        status: "found",
        cursor: {
          section: {
            id: "2.1",
            title: "Define the task-list cursor",
            lineHint: 66,
          },
          leaf: {
            id: "2.1.a",
            title: "Parse cursor markers",
            lineHint: 70,
          },
        },
      },
    },
    ...overrides,
  } satisfies Parameters<typeof emitCompactionSeed>[0]["envelope"];
}

async function emit(overrides: {
  cwd?: string;
  uncommittedFiles?: string[];
  envelope?: Partial<Parameters<typeof emitCompactionSeed>[0]["envelope"]>;
  writeSeed?: (path: string, seed: CompactionSeed) => Promise<void>;
} = {}) {
  return emitCompactionSeed({
    cwd: overrides.cwd ?? "/repo",
    envelope: envelope(overrides.envelope),
    gitSnapshot: {
      head: "72d145021bf4166fa70efc5b9fd11916cf0a359a",
      uncommittedFiles: overrides.uncommittedFiles ?? [],
    },
    writeSeed: overrides.writeSeed ?? vi.fn(async () => undefined),
    now: () => new Date("2026-06-28T12:00:00.000Z"),
  });
}

describe("resolveCompactionSeedPath", () => {
  it("targets the identity-scoped internal seed path", () => {
    expect(resolveCompactionSeedPath({ cwd: "/repo", identity: "andrew" }))
      .toBe(join("/repo", ".arc", "user", "andrew", ".internal", "compaction-seed.json"));
  });

  it("stays worktree-local so concurrent worktrees never share a seed", () => {
    // The seed roots at the active checkout, not a shared identity-global root, so two
    // worktrees of the same identity own distinct seeds and cannot clobber each other.
    expect(resolveCompactionSeedPath({ cwd: "/repo-linked", identity: "andrew" }))
      .toBe(join("/repo-linked", ".arc", "user", "andrew", ".internal", "compaction-seed.json"));
    expect(resolveCompactionSeedPath({ cwd: "/repo-linked", identity: "andrew" }))
      .not.toBe(resolveCompactionSeedPath({ cwd: "/repo", identity: "andrew" }));
  });

  it("rejects identities that would escape the user directory", () => {
    for (const identity of [
      "../andrew",
      "team/andrew",
      "C:andrew",
      ".internal",
      "bad*name",
      "bad?name",
      "bad\"name",
      "bad<name",
      "bad>name",
      "bad|name",
      "bad\nname",
      "bad\rname",
      "bad\tname",
      "bad\u0001name",
      "bad\u007Fname",
      "andrew.",
      "andrew ",
      "CON",
      "NUL",
      "COM1",
      "LPT9",
      "CON.txt",
    ]) {
      expect(() => resolveCompactionSeedPath({ cwd: "/repo", identity }))
        .toThrow("Invalid compaction seed identity");
    }
  });
});

describe("parseUncommittedFiles", () => {
  it("derives a deterministic file list from porcelain-z output", () => {
    expect(
      parseUncommittedFiles([
        "?? zeta.txt",
        "?? Zeta.txt",
        "?? .arc/backlog/provisional/new-stub/",
        " M src/b.ts",
        "R  src/new.ts",
        "src/old.ts",
        "A  src/a.ts",
        "",
      ].join("\0")),
    ).toEqual([
      ".arc/backlog/provisional/new-stub",
      "Zeta.txt",
      "src/a.ts",
      "src/b.ts",
      "src/new.ts",
      "zeta.txt",
    ]);
  });
});

describe("emitCompactionSeed", () => {
  it("derives recovery context from a leaseless WU at the current checkout", async () => {
    const recordId = `sha256:${"a".repeat(64)}`;
    const wu = { ...workUnitRow(recordId, "b".repeat(32)), lease: null, frame: "idle" as const };
    const result = await emit({
      cwd: "/caller/symlink",
      envelope: {
        active: {
          ok: true,
          value: {
            path: ".arc/active/meta-compaction-recovery.md",
            sessionType: "execution",
            currentWorkflow: null,
          },
        },
        locusState: {
          ok: true,
          value: locusState({
            roster: {
              mode: "locus", ok: true, primaryPath: "/repo", rows: [wu], diagnostics: [],
            },
          }),
        },
      },
    });

    expect(result).toMatchObject({
      status: "written",
      seed: {
        currentWorkflow: "process-task-loop",
        taskCursor: WU_CURSOR.cursor,
        loadSet: RECOVERY_LOAD_SET,
      },
    });
    if (result.status === "written") {
      expect(result.seed).not.toHaveProperty("locus");
      // Omission is never silent: an idle checkout is a reader-established absence.
      expect(result.seed.locusAbsence).toBe("none");
    }
  });

  it("records an unavailable disposition when the locus probe itself failed", async () => {
    const result = await emit({
      envelope: {
        locusState: { ok: false, error: { kind: "runtime", message: "topology unavailable" } },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed).not.toHaveProperty("locus");
      expect(result.seed.locusAbsence).toBe("unavailable");
    }
  });

  it("uses the resolved worktree path rather than the raw caller cwd", async () => {
    const recordId = `sha256:${"a".repeat(64)}`;
    const wu = { ...workUnitRow(recordId, "b".repeat(32)), lease: null, frame: "idle" as const };
    const result = await emit({
      envelope: {
        locusState: {
          ok: true,
          value: locusState({
            roster: {
              mode: "locus", ok: true, primaryPath: "/primary", rows: [wu], diagnostics: [],
            },
          }),
        },
        worktree: {
          ok: true,
          value: {
            branch: "feat/compaction-recovery",
            identity: { kind: "linked", path: "/repo" },
          },
        },
      },
    });

    expect(result).toMatchObject({
      status: "written",
      seed: { currentWorkflow: "process-task-loop", taskCursor: WU_CURSOR.cursor },
    });
  });

  it("embeds the load-set manifest supplied by the session-init envelope", async () => {
    const result = await emit();

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.loadSet).toEqual(LOAD_SET);
      expect(result.seed).not.toHaveProperty("harness");
    }
  });

  it("emits the exact locus hint and reader-owned parent context for a warm transient", async () => {
    const recordId = `sha256:${"a".repeat(64)}`;
    const parentRecordId = `sha256:${"c".repeat(64)}`;
    const parentLeaseId = "e".repeat(32);
    const claimId = "d".repeat(32);
    const result = await emit({
      envelope: {
        locusState: {
          ok: true,
          value: locusState({
            current: { kind: "resolved", sessionHomeRecordId: parentRecordId, activeRecordId: recordId, parentRecordId },
            roster: {
              mode: "locus", ok: true, primaryPath: "/repo", diagnostics: [],
              rows: [workUnitRow(parentRecordId, parentLeaseId), {
                kind: "managed-role", checkoutPath: "/repo/worktrees/errand", primary: false, recordId,
                role: {
                  kind: "errand", subject: { kind: "errand", key: "task", claimId },
                  parentCheckoutPath: "/repo", originEntry: null,
                },
                identity: {
                  kind: "errand", key: "task", claimId, protection: "full", branch: "chore/task",
                  purpose: "errand", origin: "description", originEntry: null,
                  state: "open", savedHead: null, changeRequest: null,
                },
                lease: {
                  leaseId: "b".repeat(32), selfHeld: false, state: "live", sessionHomePath: "/repo",
                  attachedAt: "2026-06-28T12:00:00.000Z", heartbeatAt: "2026-06-28T12:00:00.000Z",
                },
                frame: "active", derived: null, diagnostics: [],
              }],
            },
            recovery: { kind: "resume", activeRecordId: recordId, parentRecordId },
          }),
        },
      },
    });
    expect(result).toMatchObject({
      status: "written",
      seed: {
        locus: {
          sessionHomePath: "/repo",
          activeLocusPath: "/repo/worktrees/errand",
          recordId,
          leaseId: "b".repeat(32),
          parentRecordId,
        },
        currentWorkflow: "run-errand",
        taskCursor: WU_CURSOR.cursor,
        loadSet: {
          entries: [
            ...RECOVERY_LOAD_SET.entries,
            {
              path: ".arc/system/workflows/arc/supplemental/run-errand.md",
              readMode: { kind: "full" },
            },
          ],
        },
      },
    });
  });

  it.each([
    ["none", { ok: true, value: locusState() }],
    ["ambiguous", { ok: true, value: locusState({ current: { kind: "ambiguous", recordIds: [], reasons: ["role-conflict"] } }) }],
    ["probe failure", { ok: false, error: { kind: "runtime", message: "unavailable" } }],
  ] as const)("omits the locus hint for %s", async (_label, locusStateProbe) => {
    const result = await emit({ envelope: { locusState: locusStateProbe } });
    expect(result.status).toBe("written");
    if (result.status === "written") expect(result.seed).not.toHaveProperty("locus");
  });

  it("embeds uncommitted files from the supplied git snapshot", async () => {
    const result = await emit({
      uncommittedFiles: [
        ".arc/active/tasks-compaction-recovery.md",
        "packages/arc-framework/src/lib/compaction-seed/emitter.ts",
      ],
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

  it("canonicalizes untracked directory paths before schema validation", async () => {
    const result = await emit({
      uncommittedFiles: [
        ".arc/backlog/provisional/new-stub/",
        ".arc/backlog/provisional/new-stub",
      ],
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.uncommittedFiles).toEqual([
        ".arc/backlog/provisional/new-stub",
      ]);
    }
  });

  it("populates the execution task cursor from the envelope cursor projection", async () => {
    const result = await emit();

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.taskCursor).toEqual({
        section: {
          id: "2.1",
          title: "Define the task-list cursor",
          lineHint: 66,
        },
        leaf: {
          id: "2.1.a",
          title: "Parse cursor markers",
          lineHint: 70,
        },
      });
    }
  });

  it("sets taskCursor to null in planning sessions", async () => {
    const result = await emit({
      envelope: {
        active: {
          ok: true,
          value: {
            path: ".arc/active/meta-compaction-recovery.md",
            sessionType: "planning",
            currentWorkflow: "create-spec",
          },
        },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.taskCursor).toBeNull();
    }
  });

  it("keeps a resolved task cursor for integration sessions", async () => {
    const result = await emit({
      envelope: {
        active: {
          ok: true,
          value: {
            path: ".arc/active/meta-compaction-recovery.md",
            sessionType: "integration",
            currentWorkflow: "integrate-work-unit Step 4",
          },
        },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.taskCursor).toEqual({
        section: {
          id: "2.1",
          title: "Define the task-list cursor",
          lineHint: 66,
        },
        leaf: {
          id: "2.1.a",
          title: "Parse cursor markers",
          lineHint: 70,
        },
      });
    }
  });

  it("uses the supplied git snapshot for head and dirty while carrying the resolved branch", async () => {
    const result = await emit({
      uncommittedFiles: ["src/changed.ts"],
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.head).toBe("72d145021bf4166fa70efc5b9fd11916cf0a359a");
      expect(result.seed.branch).toBe("feat/compaction-recovery");
      expect(result.seed.dirty).toBe(true);
    }
  });

  it("uses currentWorkflow from the resolved active envelope without rereading the meta", async () => {
    const result = await emit({
      envelope: {
        active: {
          ok: true,
          value: {
            path: ".arc/active/meta-compaction-recovery.md",
            sessionType: "integration",
            currentWorkflow: "integrate-work-unit Step 4",
          },
        },
      },
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.seed.currentWorkflow).toBe("integrate-work-unit Step 4");
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

  it("fails before writing when the generated seed violates the schema", async () => {
    const writeSeed = vi.fn();
    const result = await emit({
      envelope: {
        loadSet: {
          ok: true,
          value: {
            ...LOAD_SET,
            entries: [
              {
                path: "../escape.md",
                readMode: { kind: "full" },
              },
            ],
          } as LoadSetManifest,
        },
      },
      writeSeed,
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "seed-invalid",
    });
    expect(writeSeed).not.toHaveBeenCalled();
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

  it("skips without touching git or fs when identity is absent", async () => {
    const writeSeed = vi.fn();

    const result = await emitCompactionSeed({
      cwd: "/repo",
      envelope: envelope({ identity: { identity: null } }),
      gitSnapshot: {
        head: "72d145021bf4166fa70efc5b9fd11916cf0a359a",
        uncommittedFiles: [],
      },
      writeSeed,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "identity-missing",
    });
    expect(writeSeed).not.toHaveBeenCalled();
  });

  it("fails without writing when the configured identity is not a safe segment", async () => {
    const writeSeed = vi.fn();

    const result = await emit({
      envelope: {
        identity: { identity: "../andrew" },
      },
      writeSeed,
    });

    expect(result).toMatchObject({
      status: "failed",
      reason: "identity-invalid",
    });
    expect(writeSeed).not.toHaveBeenCalled();
  });
});
