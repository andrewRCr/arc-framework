/** Worktree-first production evidence boundary. */

import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  acquireDerivedLocusEvidence,
  createDerivedLocusEvidenceIO,
  type DerivedLocusEvidenceIO,
} from "../../../src/lib/locus/derived-evidence.js";
import { readDerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";

describe("derived locus evidence", () => {
  it("contains an identity-root error without losing independent checkout evidence", async () => {
    const io: DerivedLocusEvidenceIO = {
      scanWorktrees: vi.fn().mockResolvedValue({
        ok: true,
        worktrees: [{
          path: "/repo",
          head: "a".repeat(40),
          branch: "main",
          detached: false,
          primary: true,
        }],
      }),
      listDirectory: vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" })),
      readArchivedMeta: vi.fn().mockResolvedValue({ kind: "absent" }),
      readText: vi.fn(),
      readMarker: vi.fn().mockResolvedValue({ kind: "absent" }),
      readIdentities: vi.fn().mockResolvedValue({
        kind: "error",
        stage: "tree",
        message: "identity root unavailable",
      }),
      readCompleted: vi.fn().mockResolvedValue({ status: "available", records: new Map() }),
      readPrimarySafety: vi.fn().mockResolvedValue({ kind: "complete", clean: true, onBase: true }),
      canonicalizePath: vi.fn(async (path: string) => path),
    };

    await expect(acquireDerivedLocusEvidence({ identity: "andrew", io })).resolves.toMatchObject({
      kind: "complete",
      checkouts: [{ checkoutPath: "/repo", marker: { kind: "absent" }, metas: [] }],
      identities: { kind: "error", stage: "tree", message: "identity root unavailable" },
      primarySafety: { kind: "complete", clean: true, onBase: true },
    });
  });

  it("acquires only the marker-selected archived WU meta from its checkout", async () => {
    const archivedText = "# Metadata: demo\n\n- **State:** `Shipped`\n- **Owner:** `andrew`\n";
    const io: DerivedLocusEvidenceIO = {
      scanWorktrees: vi.fn().mockResolvedValue({
        ok: true,
        worktrees: [{
          path: "/repo/demo",
          head: "a".repeat(40),
          branch: "fix/demo",
          detached: false,
          primary: false,
        }],
      }),
      listDirectory: vi.fn().mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" })),
      readArchivedMeta: vi.fn().mockResolvedValue({
        kind: "read",
        path: ".arc/completed/2026-q3/49_demo/meta-demo.md",
        text: archivedText,
      }),
      readText: vi.fn().mockResolvedValue(archivedText),
      readMarker: vi.fn().mockResolvedValue({
        kind: "present",
        bytes: Buffer.from("marker"),
        marker: {
          spawnedByArc: true,
          createdFor: { kind: "work-unit", name: "demo" },
        },
      }),
      readIdentities: vi.fn().mockResolvedValue({ kind: "absent" }),
      readCompleted: vi.fn().mockResolvedValue({ status: "available", records: new Map() }),
      readPrimarySafety: vi.fn().mockResolvedValue({ kind: "complete", clean: true, onBase: true }),
      canonicalizePath: vi.fn(async (path: string) => path),
    };

    await expect(acquireDerivedLocusEvidence({ identity: "andrew", io })).resolves.toMatchObject({
      kind: "complete",
      checkouts: [{
        checkoutPath: "/repo/demo",
        archivedMetaRoots: [{ kind: "listed", path: "/repo/demo/.arc/completed" }],
        archivedMetas: [{
          kind: "read",
          name: "meta-demo.md",
          path: "/repo/demo/.arc/completed/2026-q3/49_demo/meta-demo.md",
          text: archivedText,
        }],
      }],
    });
  });

  it("builds a free-primary entering frame without record, lock, or process commands", async () => {
    const exec: GitExec = async (_command, args) => {
      const rendered = args.join(" ");
      if (rendered === "worktree list --porcelain -z") {
        return {
          stdout: [
            "worktree /repo",
            `HEAD ${"a".repeat(40)}`,
            "branch refs/heads/main",
            "",
            "",
          ].join("\0"),
        };
      }
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        throw new Error("Needed a single revision");
      }
      if (args[0] === "ls-tree") return { stdout: "" };
      if (rendered === "status --porcelain=v1 --untracked-files=normal") return { stdout: "" };
      if (rendered === "rev-parse --abbrev-ref HEAD") return { stdout: "main\n" };
      throw new Error(`Unexpected derived-reader Git command: ${rendered}`);
    };
    const io = createDerivedLocusEvidenceIO({ exec, identity: "andrew", baseBranch: "main" });
    const evidence = await acquireDerivedLocusEvidence({ identity: "andrew", io });
    expect(evidence.kind).toBe("complete");
    if (evidence.kind !== "complete") return;

    const frame = await readDerivedLocusFrame({
      identity: "andrew",
      enteringCheckoutPath: "/repo",
      topology: evidence.topology,
      checkouts: evidence.checkouts,
      completed: evidence.completed,
      identities: evidence.identities,
      primarySafety: evidence.primarySafety,
      canonicalizePath: io.canonicalizePath,
      subjectMetaIO: {
        readFile: async () => { throw new Error("unexpected meta read"); },
        pathExists: async () => false,
        realpath: async (path) => path,
        lstat: async () => ({ isSymbolicLink: () => false }),
      },
    });

    expect(frame).toMatchObject({
      entering: { kind: "selected", row: { kind: "free-primary" } },
      primaryAvailability: { kind: "free", checkoutPath: "/repo" },
      identityDiscovery: { kind: "absent" },
      active: null,
    });
  });
});
