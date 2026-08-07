/**
 * Unit tests for runActiveInFlight — the oracle-backed in-flight set behind
 * `arc active in-flight`. Composes the reachability-aware branch-set resolver
 * with the in-flight oracle; the underlying ref-pruning and classification
 * behavior is covered by remote-ref-reader.test.ts and in-flight-derivation.test.ts.
 * These tests confirm the wiring — entries and the `reachable` flag pass through,
 * and `localOnly` skips the network read.
 */

import { describe, it, expect, vi } from "vitest";

import {
  ActiveInFlightCandidateExpansionSchema,
  ActiveInFlightEvidenceSchema,
  runActiveInFlightExpansion,
  runActiveInFlight,
} from "../../../../src/commands/active/in-flight.js";
import type { ExecResult, GitExec, GitExecInput } from "../../../../src/lib/git/exec.js";

const LIVE_REMOTE_TIP = "deadbeef".padEnd(40, "0");

const META = [
  "# Metadata: x",
  "",
  "- **State:** __STATE__",
  "- **Owner:** andrew",
  "- **Branch:** __BRANCH__",
  "- **Design:** spec-x.md",
  "",
  "---",
].join("\n");

function meta(state = "Active"): string {
  return META.replaceAll("__STATE__", state);
}

/**
 * Exec stub answering the reads the command makes: local remote-tracking refs
 * (`for-each-ref`), live membership (`ls-remote`), the worktree map (`worktree
 * list`), meta content (`show`), and the errand records keying errand-ness
 * (`ls-tree` + `cat-file` over `refs/arc/user/{identity}/errands`).
 */
function makeExec(opts: {
  localRefs: string[];
  liveBranches: string[] | "unreachable";
  metas?: Record<string, string>;
  errandRecords?: Array<{ slug: string; branch: string }>;
}): GitExec {
  const metas = opts.metas ?? {};
  const errandRecords = opts.errandRecords ?? [];
  const DUMMY_SHA = "0".repeat(40);
  const errandBlob = (record: { slug: string; branch: string }): string => JSON.stringify({
    version: 3,
    kind: "errand",
    slug: record.slug,
    claimId: "a".repeat(32),
    purpose: "errand",
    origin: "description",
    originEntry: null,
    intent: record.slug,
    branch: record.branch,
    state: "open",
    savedHead: null,
    changeRequest: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "for-each-ref") {
      return {
        stdout: opts.localRefs.map((b) => `refs/remotes/origin/${b}\t${DUMMY_SHA}`).join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "ls-remote") {
      if (opts.liveBranches === "unreachable") throw new Error("fatal: unreachable");
      return {
        stdout: opts.liveBranches.map((b) => `${LIVE_REMOTE_TIP}\trefs/heads/${b}`).join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "worktree" && args[1] === "list") return { stdout: "", stderr: "" };
    if (args[0] === "rev-parse") {
      if (errandRecords.length === 0) throw new Error("Needed a single revision");
      return { stdout: `${DUMMY_SHA}\n`, stderr: "" };
    }
    if (args[0] === "ls-tree" && args.includes("--name-only")) {
      const ref = args[args.indexOf("--name-only") + 1] ?? "";
      const paths = Object.keys(metas)
        .filter((target) => target.startsWith(`${ref}:`))
        .map((target) => target.slice(target.indexOf(":") + 1));
      return { stdout: paths.join("\n"), stderr: "" };
    }
    if (args[0] === "ls-tree") {
      return {
        stdout: errandRecords
          .map((record) => `100644 blob ${DUMMY_SHA} ${Buffer.byteLength(errandBlob(record))}\t${record.slug}\0`)
          .join(""),
        stderr: "",
      };
    }
    if (args[0] === "cat-file") {
      const rec = errandRecords[0];
      if (rec === undefined) throw new Error(`fatal: not found ${args[2] ?? ""}`);
      return { stdout: errandBlob(rec), stderr: "" };
    }
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (target in metas) {
        const ref = target.slice(0, target.indexOf(":"));
        const branch = ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
        return { stdout: (metas[target] ?? "").replaceAll("__BRANCH__", branch), stderr: "" };
      }
      throw new Error(`fatal: path does not exist in '${target}'`);
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}

function makeExpansionIO(opts: {
  advertised: Record<string, string>;
  advertisedAfterFetch?: Record<string, string>;
  remoteFailure?: Error;
  localOids?: readonly string[];
  fetchedOids?: Record<string, string>;
  metas?: Record<string, string>;
}): { exec: GitExec; execInput: GitExecInput } {
  const available = new Set(opts.localOids ?? []);
  const metas = opts.metas ?? {};
  let fetched = false;
  const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "ls-remote") {
      if (opts.remoteFailure !== undefined) throw opts.remoteFailure;
      const advertised = fetched && opts.advertisedAfterFetch !== undefined
        ? opts.advertisedAfterFetch
        : opts.advertised;
      return {
        stdout: Object.entries(advertised)
          .map(([branch, oid]) => `${oid}\trefs/heads/${branch}`)
          .join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "fetch") {
      const branch = args[2] ?? "";
      const fetchedOid = opts.fetchedOids?.[branch];
      if (fetchedOid === undefined) throw new Error(`fetch failed for ${branch}`);
      available.add(fetchedOid);
      fetched = true;
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "rev-parse" && args[1] === "--is-shallow-repository") {
      return { stdout: "false", stderr: "" };
    }
    if (args[0] === "for-each-ref") return { stdout: "", stderr: "" };
    if (args[0] === "worktree" && args[1] === "list") return { stdout: "", stderr: "" };
    if (args[0] === "ls-tree" && args.includes("--name-only")) {
      const ref = args[args.indexOf("--name-only") + 1] ?? "";
      const paths = Object.keys(metas)
        .filter((target) => target.startsWith(`${ref}:`))
        .map((target) => target.slice(target.indexOf(":") + 1));
      return { stdout: paths.join("\n"), stderr: "" };
    }
    if (args[0] === "show") {
      const target = args[1] ?? "";
      const content = metas[target];
      if (content === undefined) throw new Error(`missing ${target}`);
      return { stdout: content, stderr: "" };
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
  const execInput: GitExecInput = vi.fn(async (_args, input): Promise<string> =>
    input.trim().split("\n")
      .map((oid: string) => available.has(oid) ? `${oid} commit 1` : `${oid} missing`)
      .join("\n") + "\n");
  return { exec, execInput };
}

describe("runActiveInFlight", () => {
  it("completes explicit expansion after every captured candidate materializes", async () => {
    const advertisedOid = "1".repeat(40);
    const branch = "topic/remote-only";
    const io = makeExpansionIO({
      advertised: { [branch]: advertisedOid },
      fetchedOids: { [branch]: advertisedOid },
      metas: {
        [`${advertisedOid}:.arc/active/meta-remote-only.md`]: meta().replace("__BRANCH__", branch),
      },
    });

    const result = await runActiveInFlightExpansion({
      ...io,
      identity: null,
      teamMode: false,
      localOnly: false,
    });

    expect(result).toMatchObject({
      remoteEvidence: "exact",
      candidateExpansion: { status: "complete", pendingBranchCount: 0 },
      entries: [expect.objectContaining({ kind: "work-unit", name: "remote-only", branch })],
    });
    expect(io.exec).toHaveBeenCalledWith("git", ["fetch", "origin", branch], expect.any(Object));
  });

  it("reports a positive partial count when candidate fetches fail after the snapshot", async () => {
    const materializedOid = "2".repeat(40);
    const pendingOid = "3".repeat(40);
    const io = makeExpansionIO({
      advertised: {
        "topic/materialized": materializedOid,
        "topic/pending": pendingOid,
      },
      fetchedOids: { "topic/materialized": materializedOid },
      metas: {
        [`${materializedOid}:.arc/active/meta-materialized.md`]: meta().replace(
          "__BRANCH__",
          "topic/materialized",
        ),
      },
    });

    const result = await runActiveInFlightExpansion({
      ...io,
      identity: null,
      teamMode: false,
      localOnly: false,
    });

    expect(result).toMatchObject({
      remoteEvidence: "pending-fetch",
      candidateExpansion: { status: "partial", pendingBranchCount: 1 },
      entries: [expect.objectContaining({ name: "materialized" })],
    });
  });

  it("reports partial when no candidate fetch succeeds after a successful snapshot", async () => {
    const io = makeExpansionIO({
      advertised: {
        "topic/first": "7".repeat(40),
        "topic/second": "8".repeat(40),
      },
    });

    const result = await runActiveInFlightExpansion({
      ...io,
      identity: null,
      teamMode: false,
      localOnly: false,
    });

    expect(result).toMatchObject({
      entries: [],
      remoteEvidence: "pending-fetch",
      candidateExpansion: { status: "partial", pendingBranchCount: 2 },
    });
  });

  it("keeps a moved captured generation pending instead of classifying the newer tip", async () => {
    const capturedOid = "4".repeat(40);
    const newerOid = "5".repeat(40);
    const branch = "topic/moved";
    const io = makeExpansionIO({
      advertised: { [branch]: capturedOid },
      advertisedAfterFetch: { [branch]: newerOid },
      fetchedOids: { [branch]: newerOid },
      metas: {
        [`${newerOid}:.arc/active/meta-newer.md`]: meta().replace("__BRANCH__", branch),
      },
    });

    const result = await runActiveInFlightExpansion({
      ...io,
      identity: null,
      teamMode: false,
      localOnly: false,
    });

    expect(result).toMatchObject({
      entries: [],
      remoteEvidence: "pending-fetch",
      candidateExpansion: { status: "partial", pendingBranchCount: 1 },
    });
    expect(vi.mocked(io.exec).mock.calls.filter(([, args]) => args[0] === "ls-remote")).toHaveLength(1);
  });

  it("fails with the classified reason when the initial live-head snapshot is unreachable", async () => {
    const io = makeExpansionIO({
      advertised: {},
      remoteFailure: new Error("fatal: Could not resolve host: example.invalid"),
    });

    const result = await runActiveInFlightExpansion({
      ...io,
      identity: null,
      teamMode: false,
      localOnly: false,
    });

    expect(result).toMatchObject({
      entries: [],
      remoteEvidence: "unreachable",
      failureReason: "network",
      candidateExpansion: { status: "failed", pendingBranchCount: 0 },
    });
    expect(io.execInput).not.toHaveBeenCalled();
  });

  it("returns not-requested without fetching in local mode", async () => {
    const io = makeExpansionIO({ advertised: {} });

    const result = await runActiveInFlightExpansion({
      ...io,
      identity: null,
      teamMode: false,
      localOnly: true,
    });

    expect(result).toMatchObject({
      remoteEvidence: "not-applicable",
      candidateExpansion: { status: "not-requested", pendingBranchCount: 0 },
    });
    expect(vi.mocked(io.exec).mock.calls.map(([, args]) => args[0])
      .filter((command) => command === "ls-remote" || command === "fetch")).toEqual([]);
    expect(io.execInput).not.toHaveBeenCalled();
  });

  it("propagates unexpected local classification failure as a runtime failure", async () => {
    const advertisedOid = "6".repeat(40);
    const branch = "topic/malformed";
    const io = makeExpansionIO({
      advertised: { [branch]: advertisedOid },
      localOids: [advertisedOid],
      metas: { [`${advertisedOid}:.arc/active/meta-malformed.md`]: "not a meta record" },
    });

    await expect(runActiveInFlightExpansion({
      ...io,
      identity: null,
      teamMode: false,
      localOnly: false,
    })).rejects.toThrow("Advertised in-flight metadata could not be classified");
  });

  it("rejects incomplete transient identity facts before selecting fetch candidates", async () => {
    const io = makeExpansionIO({ advertised: { "topic/unknown": "9".repeat(40) } });

    await expect(runActiveInFlightExpansion({
      ...io,
      identity: "andrew",
      teamMode: false,
      localOnly: false,
    })).rejects.toThrow("Transient identity records could not be inspected completely");
    expect(vi.mocked(io.exec).mock.calls.map(([, args]) => args[0])
      .filter((command) => command === "ls-remote" || command === "fetch")).toEqual([]);
  });

  it("does not fetch an unavailable configured base head", async () => {
    const io = makeExpansionIO({ advertised: { trunk: "a".repeat(40) } });

    const result = await runActiveInFlightExpansion({
      ...io,
      identity: null,
      teamMode: false,
      localOnly: false,
      baseBranch: "trunk",
    });

    expect(result).toMatchObject({
      entries: [],
      remoteEvidence: "exact",
      candidateExpansion: { status: "complete", pendingBranchCount: 0 },
    });
    expect(vi.mocked(io.exec).mock.calls.map(([, args]) => args[0])).not.toContain("fetch");
  });

  it("pairs expansion status with exact, pending, unreachable, and disabled evidence", () => {
    expect(ActiveInFlightCandidateExpansionSchema.safeParse({
      status: "partial", pendingBranchCount: 0,
    }).success).toBe(false);
    expect(ActiveInFlightEvidenceSchema.safeParse({
      remoteEvidence: "exact", candidateExpansion: { status: "complete", pendingBranchCount: 0 },
    }).success).toBe(true);
    expect(ActiveInFlightEvidenceSchema.safeParse({
      remoteEvidence: "pending-fetch", candidateExpansion: { status: "partial", pendingBranchCount: 2 },
    }).success).toBe(true);
    expect(ActiveInFlightEvidenceSchema.safeParse({
      remoteEvidence: "unreachable", failureReason: "auth",
      candidateExpansion: { status: "failed", pendingBranchCount: 0 },
    }).success).toBe(true);
    expect(ActiveInFlightEvidenceSchema.safeParse({
      remoteEvidence: "not-applicable", candidateExpansion: { status: "not-requested", pendingBranchCount: 0 },
    }).success).toBe(true);

    expect(ActiveInFlightEvidenceSchema.safeParse({
      remoteEvidence: "exact", candidateExpansion: { status: "partial", pendingBranchCount: 1 },
    }).success).toBe(false);
    expect(ActiveInFlightEvidenceSchema.safeParse({
      remoteEvidence: "pending-fetch", candidateExpansion: { status: "partial", pendingBranchCount: 0 },
    }).success).toBe(false);
    expect(ActiveInFlightEvidenceSchema.safeParse({
      remoteEvidence: "unreachable", candidateExpansion: { status: "failed", pendingBranchCount: 0 },
    }).success).toBe(false);
    expect(ActiveInFlightEvidenceSchema.safeParse({
      remoteEvidence: "not-applicable", failureReason: "network",
      candidateExpansion: { status: "not-requested", pendingBranchCount: 0 },
    }).success).toBe(false);
  });

  it("returns oracle entries (work units and errands) with reachable=true when online", async () => {
    const exec = makeExec({
      localRefs: ["feat/x", "chore/fix-typo"],
      liveBranches: ["feat/x", "chore/fix-typo"],
      metas: { "origin/feat/x:.arc/active/meta-x.md": meta() },
      errandRecords: [{ slug: "fix-typo", branch: "chore/fix-typo" }],
    });

    const result = await runActiveInFlight({ exec, identity: "andrew", teamMode: false, localOnly: false });

    expect(result.reachable).toBe(true);
    expect(result).toMatchObject({
      remoteEvidence: "exact",
      candidateExpansion: { status: "complete", pendingBranchCount: 0 },
    });
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      kind: "work-unit",
      branch: "feat/x",
      name: "x",
      state: "Active",
      owner: "andrew",
      design: "spec-x.md",
      remoteOnly: true,
      dependsOn: [],
    });
    expect(result.entries[1]).toEqual({ kind: "errand", branch: "chore/fix-typo", slug: "fix-typo", remoteOnly: true });
    expect(result.warnings).toEqual([]);
    expect(result.snapshot.refs).toMatchObject({
      "origin/feat/x": "0".repeat(40),
      "origin/chore/fix-typo": "0".repeat(40),
    });
  });

  it("prunes a dead local ref absent from live membership", async () => {
    const exec = makeExec({
      localRefs: ["feat/x", "feat/shipped"],
      liveBranches: ["feat/x"],
      metas: {
        "origin/feat/x:.arc/active/meta-x.md": meta(),
        "origin/feat/shipped:.arc/active/meta-shipped.md": meta(),
      },
    });

    const result = await runActiveInFlight({ exec, identity: null, teamMode: false, localOnly: false });

    expect(result.entries.map((e) => e.branch)).toEqual(["feat/x"]);
  });

  it("passes oracle warnings through with the in-flight result", async () => {
    const exec = makeExec({
      localRefs: ["feat/x"],
      liveBranches: ["feat/x"],
      metas: { "origin/feat/x:.arc/active/meta-x.md": meta("Paused") },
    });

    const result = await runActiveInFlight({ exec, identity: "andrew", teamMode: false, localOnly: false });

    expect(result.entries[0]).toMatchObject({ kind: "work-unit", state: "unknown" });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: "state-unrecognized",
      branch: "feat/x",
      workUnit: "x",
    });
  });

  it("skips the network read under localOnly and reports reachable=false", async () => {
    const exec = makeExec({
      localRefs: ["feat/x"],
      liveBranches: "unreachable",
      metas: { "origin/feat/x:.arc/active/meta-x.md": meta() },
    });

    const result = await runActiveInFlight({ exec, identity: null, teamMode: false, localOnly: true });

    expect(result.reachable).toBe(false);
    expect(result).toMatchObject({
      remoteEvidence: "not-applicable",
      candidateExpansion: { status: "not-requested", pendingBranchCount: 0 },
    });
    expect(result.entries.map((e) => e.branch)).toEqual(["feat/x"]);
    expect(exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["ls-remote"]));
  });

  it("reports a failed expansion when live membership is unreachable", async () => {
    const result = await runActiveInFlight({
      exec: makeExec({ localRefs: [], liveBranches: "unreachable" }),
      identity: null,
      teamMode: false,
      localOnly: false,
    });

    expect(result).toMatchObject({
      reachable: false,
      remoteEvidence: "unreachable",
      failureReason: "error",
      candidateExpansion: { status: "failed", pendingBranchCount: 0 },
    });
  });
});
