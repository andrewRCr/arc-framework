/**
 * Unit tests for the worktree-ownership marker lib.
 *
 * Covers the write/read round-trip of the machine-local marker that records
 * ARC created a worktree, the absent-marker tolerance (a missing file reads as
 * "no marker", not an error), and schema validation on read.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join, dirname } from "node:path";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  classifyTransientWorktreeProvenance,
  createWorktreeMarkerGeneration,
  decodeWorktreeMarkerOwnership,
  ensureWorktreeMarkerIgnored,
  decodeWorktreeHuskStamp,
  nodeWorktreeMarkerIgnoreFs,
  readWorktreeMarker,
  readWorktreeMarkerGeneration,
  removePrimaryTransientOccupancy,
  removeWorktreeMarkerGeneration,
  replaceWorktreeMarkerGeneration,
  stampWorktreeHusk,
  writeWorktreeMarker,
  writeWorktreeOwnershipMarker,
  resolveWorktreeMarkerPath,
  type WorktreeMarker,
  type WorktreeMarkerReadResult,
  type WorktreeHuskStamp,
  type WorktreeRenameMovePending,
  type WorktreeSubject,
} from "../../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";

describe("worktree-marker", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-worktree-marker-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const sampleMarker: WorktreeMarker = {
    spawnedByArc: true,
    wuName: "worktree-foundation",
    spawningIdentity: "andrew",
    createdAt: "2026-05-25T00:00:00.000Z",
  };

  it("writes a schema-valid marker that read round-trips", async () => {
    await writeWorktreeMarker(cwd, sampleMarker);

    // Lands at the documented machine-local location as pretty-printed JSON.
    const raw = await readFile(resolveWorktreeMarkerPath(cwd), "utf8");
    expect(JSON.parse(raw)).toEqual(sampleMarker);

    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: sampleMarker });
    expect(await readWorktreeMarkerGeneration(cwd)).toEqual({
      kind: "present",
      marker: sampleMarker,
      bytes: Buffer.from(raw),
    });
  });

  it("tolerates an absent marker — a missing file reads as 'no marker', not an error", async () => {
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "absent" });
  });

  it("reports invalid marker JSON as malformed", async () => {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{ not json", "utf8");

    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
  });

  it("reports a marker that parses but fails the schema as malformed", async () => {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ spawnedByArc: "yes", wuName: 3 }), "utf8");

    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
  });

  it("creates, replaces, and removes only exact marker generations", async () => {
    const created = await createWorktreeMarkerGeneration(cwd, sampleMarker);
    expect(created.kind).toBe("created");
    if (created.kind !== "created") throw new Error("fixture create failed");
    await expect(createWorktreeMarkerGeneration(cwd, sampleMarker)).resolves.toEqual({ kind: "exists" });

    const next = { ...sampleMarker, createdAt: "2026-05-26T00:00:00.000Z" };
    await expect(replaceWorktreeMarkerGeneration(cwd, Buffer.from("stale"), next))
      .resolves.toEqual({ kind: "generation-mismatch" });
    const replaced = await replaceWorktreeMarkerGeneration(cwd, created.bytes, next);
    expect(replaced.kind).toBe("replaced");
    if (replaced.kind !== "replaced") throw new Error("fixture replace failed");

    await expect(removeWorktreeMarkerGeneration(cwd, created.bytes))
      .resolves.toEqual({ kind: "generation-mismatch" });
    await expect(removeWorktreeMarkerGeneration(cwd, replaced.bytes)).resolves.toEqual({ kind: "removed" });
  });

  it.each<WorktreeSubject>([
    { kind: "work-unit", name: "worktree-foundation" },
    { kind: "errand", slug: "refresh-fixtures" },
    { kind: "branch", ref: "chore/refresh-fixtures" },
  ])("round-trips neutral $kind ownership without deriving it from a branch", async (createdFor) => {
    const marker: WorktreeMarker = {
      spawnedByArc: true,
      createdFor,
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    };

    await writeWorktreeMarker(cwd, marker);

    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker });
  });

  it.each(["errand", "groom", "housekeep"] as const)(
    "round-trips exact %s claim provenance through pending and ready provisioning",
    async (kind) => {
      for (const provisioning of ["pending", "ready"] as const) {
        const marker: WorktreeMarker = {
          spawnedByArc: true,
          createdFor: { kind, slug: "refresh-fixtures", claimId: "a".repeat(32) },
          provisioning,
          spawningIdentity: "andrew",
          createdAt: "2026-05-25T00:00:00.000Z",
        };
        await writeWorktreeMarker(cwd, marker);

        const read = await readWorktreeMarker(cwd);
        expect(read).toEqual({ kind: "present", marker });
        if (read.kind !== "present") throw new Error("expected marker");
        expect(decodeWorktreeMarkerOwnership(read.marker)).toEqual({
          kind: "current",
          subject: marker.createdFor,
          provisioning,
        });
      }
    },
  );

  it("round-trips unified primary and partial transient occupancy", async () => {
    const primary: WorktreeMarker = {
      spawnedByArc: false,
      createdFor: { kind: "errand", slug: "refresh-fixtures", claimId: "a".repeat(32) },
      provisioning: "ready",
      parentCheckoutPath: "/repo/parent",
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    };
    await writeWorktreeMarker(cwd, primary);
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: primary });

    const partial: WorktreeMarker = {
      spawnedByArc: false,
      createdFor: { kind: "partial-errand", slug: "refresh-fixtures", claimId: null },
      provisioning: "ready",
      parentCheckoutPath: "/repo/parent",
      originEntry: "Refresh generated fixtures",
      originEntrySourceDigest: `sha256:${"b".repeat(64)}`,
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    };
    await writeWorktreeMarker(cwd, partial);
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: partial });
    expect(decodeWorktreeMarkerOwnership(partial)).toEqual({
      kind: "current",
      subject: partial.createdFor,
      provisioning: "ready",
    });
  });

  it("removes only the exact ready primary transient generation", async () => {
    const subject = { kind: "errand", slug: "refresh-fixtures", claimId: "a".repeat(32) } as const;
    const marker: WorktreeMarker = {
      spawnedByArc: false,
      createdFor: subject,
      provisioning: "ready",
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    };
    await writeWorktreeMarker(cwd, marker);
    await expect(removePrimaryTransientOccupancy(cwd, { ...subject, claimId: "b".repeat(32) }))
      .resolves.toEqual({ kind: "refused", reason: "subject-mismatch" });
    await expect(removePrimaryTransientOccupancy(cwd, subject)).resolves.toEqual({ kind: "removed" });
    await expect(removePrimaryTransientOccupancy(cwd, subject)).resolves.toEqual({ kind: "absent" });
  });

  it("classifies transient provisioning and exact claim mismatches without granting authority", () => {
    const subject = { kind: "errand", slug: "refresh-fixtures", claimId: "a".repeat(32) } as const;
    const marker = (provisioning: "pending" | "ready" | "future"): WorktreeMarkerReadResult => ({
      kind: "present",
      marker: {
        spawnedByArc: true,
        createdFor: subject,
        provisioning,
        spawningIdentity: "andrew",
        createdAt: "2026-05-25T00:00:00.000Z",
      },
    });

    expect(classifyTransientWorktreeProvenance(marker("pending"), subject)).toEqual({ kind: "pending", subject });
    expect(classifyTransientWorktreeProvenance(marker("ready"), subject)).toEqual({ kind: "ready", subject });
    expect(classifyTransientWorktreeProvenance(marker("ready"), {
      ...subject,
      claimId: "b".repeat(32),
    })).toEqual({
      kind: "claim-mismatch",
      subject,
      expected: { ...subject, claimId: "b".repeat(32) },
    });
    expect(classifyTransientWorktreeProvenance(marker("future"))).toEqual({
      kind: "unknown",
      reason: "unknown-provisioning",
    });
    expect(classifyTransientWorktreeProvenance({
      kind: "malformed",
      path: "/work/marker.json",
      message: "invalid marker",
    })).toEqual({ kind: "malformed", message: "invalid marker" });
    const legacy = { kind: "errand", slug: "refresh-fixtures" } as const;
    expect(classifyTransientWorktreeProvenance({
      kind: "present",
      marker: {
        spawnedByArc: true,
        createdFor: legacy,
        spawningIdentity: "andrew",
        createdAt: "2026-05-25T00:00:00.000Z",
      },
    })).toEqual({ kind: "legacy", subject: legacy });
    expect(classifyTransientWorktreeProvenance({
      kind: "present",
      marker: {
        spawnedByArc: true,
        createdFor: { kind: "work-unit", name: "demo" },
        spawningIdentity: "andrew",
        createdAt: "2026-05-25T00:00:00.000Z",
      },
    })).toBeNull();
    expect(classifyTransientWorktreeProvenance({ kind: "absent" })).toBeNull();
  });

  it("rejects incomplete or malformed transient claim provenance", async () => {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    const base = {
      spawnedByArc: true,
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    };
    for (const marker of [
      { ...base, createdFor: { kind: "groom", slug: "anchor", claimId: "a".repeat(32) } },
      {
        ...base,
        createdFor: { kind: "housekeep", slug: "sweep", claimId: "short" },
        provisioning: "pending",
      },
      {
        ...base,
        createdFor: { kind: "errand", slug: "errand" },
        provisioning: "pending",
      },
    ]) {
      await writeFile(path, JSON.stringify(marker), "utf8");
      expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
    }
  });

  it("accepts agreeing dual-written WU ownership and rejects conflicting or identity-free markers", async () => {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    const base = {
      spawnedByArc: true,
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    };
    const agreeing: WorktreeMarker = {
      ...base,
      wuName: "worktree-foundation",
      createdFor: { kind: "work-unit", name: "worktree-foundation" },
    };

    await writeFile(path, JSON.stringify(agreeing), "utf8");
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: agreeing });

    await writeFile(
      path,
      JSON.stringify({
        ...base,
        wuName: "worktree-foundation",
        createdFor: { kind: "work-unit", name: "another-work-unit" },
      }),
      "utf8",
    );
    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");

    await writeFile(path, JSON.stringify(base), "utf8");
    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
  });

  it("round-trips a complete husk stamp without changing its terminal identity or projection", async () => {
    const husk: WorktreeHuskStamp = {
      sha: "0123456789abcdef0123456789abcdef01234567",
      at: "2026-07-14T20:00:00.000Z",
      subject: { kind: "work-unit", name: "worktree-foundation" },
      branch: "feat/worktree-foundation",
    };
    const marker: WorktreeMarker = { ...sampleMarker, husk };

    await writeWorktreeMarker(cwd, marker);

    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker });
  });

  it("round-trips a closed pending rename move and rejects a marker that is also husked", async () => {
    const renameMovePending: WorktreeRenameMovePending = {
      oldSlug: "old-name",
      newSlug: "new-name",
      branch: "feat/new-name",
      head: "0123456789abcdef0123456789abcdef01234567",
      from: "/work/project.old-name",
      to: "/work/project.new-name",
    };
    const marker: WorktreeMarker = { ...sampleMarker, renameMovePending };

    await writeWorktreeMarker(cwd, marker);
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker });

    const path = resolveWorktreeMarkerPath(cwd);
    await writeFile(path, JSON.stringify({
      ...marker,
      husk: {
        sha: renameMovePending.head,
        at: "2026-07-14T20:00:00.000Z",
        subject: { kind: "work-unit", name: "new-name" },
        branch: "feat/new-name",
      },
    }), "utf8");
    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
  });

  it("rejects partial husk stamps and recordless subjects that disagree with the stamped branch", async () => {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });

    await writeFile(path, JSON.stringify({ ...sampleMarker, husk: { sha: "abc" } }), "utf8");
    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");

    await writeFile(
      path,
      JSON.stringify({
        ...sampleMarker,
        husk: {
          sha: "0123456789abcdef0123456789abcdef01234567",
          at: "2026-07-14T20:00:00.000Z",
          subject: { kind: "branch", ref: "chore/one" },
          branch: "chore/two",
        },
      }),
      "utf8",
    );
    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
  });
});

describe("decodeWorktreeHuskStamp", () => {
  const base: WorktreeHuskStamp = {
    sha: "0123456789abcdef0123456789abcdef01234567",
    at: "2026-07-14T20:00:00.000Z",
    subject: { kind: "work-unit", name: "demo" },
    branch: "feat/demo",
  };

  it("decodes the all-absent legacy shape without remote-delete authority", () => {
    expect(decodeWorktreeHuskStamp(base)).toEqual({ kind: "legacy", authorization: "merged-preserved" });
  });

  it("decodes an all-present current stamp", () => {
    const stamp: WorktreeHuskStamp = {
      ...base,
      authorization: "discard-confirmed",
      remoteRef: { remote: "origin", oid: base.sha, disposition: "delete" },
      evidence: {
        kind: "git-transition",
        transition: "abandon",
        resultDigest: `sha256:${"2".repeat(64)}`,
      },
    };

    expect(decodeWorktreeHuskStamp(stamp)).toMatchObject({
      kind: "current",
      authorization: "discard-confirmed",
    });
  });

  it("enforces the authorization/evidence matrix", () => {
    const digest = `sha256:${"3".repeat(64)}` as const;
    const common = { ...base, remoteRef: null };

    expect(decodeWorktreeHuskStamp({
      ...common,
      authorization: "merged-preserved",
      evidence: {
        kind: "shipped",
        expectedLifecycle: "completed",
        resultDigest: digest,
        baseProofOid: base.sha,
      },
    }).kind).toBe("current");
    expect(decodeWorktreeHuskStamp({
      ...common,
      authorization: "planning-relocated",
      evidence: {
        kind: "git-transition",
        transition: "park-planning",
        resultDigest: digest,
      },
    }).kind).toBe("current");
    expect(decodeWorktreeHuskStamp({
      ...common,
      authorization: "discard-confirmed",
      evidence: {
        kind: "git-transition",
        transition: "abandon",
        resultDigest: digest,
      },
    }).kind).toBe("current");

    expect(decodeWorktreeHuskStamp({
      ...common,
      authorization: "discard-confirmed",
      evidence: {
        kind: "shipped",
        expectedLifecycle: "completed",
        resultDigest: digest,
        baseProofOid: base.sha,
      },
    })).toEqual({ kind: "manual-only", reason: "evidence-mismatch" });
    expect(decodeWorktreeHuskStamp({
      ...common,
      authorization: "planning-relocated",
      evidence: {
        kind: "git-transition",
        transition: "abandon",
        resultDigest: digest,
      },
    })).toEqual({ kind: "manual-only", reason: "evidence-mismatch" });
    expect(decodeWorktreeHuskStamp({
      ...common,
      authorization: "discard-confirmed",
      evidence: {
        kind: "git-transition",
        transition: "park-planning",
        resultDigest: digest,
      },
    })).toEqual({ kind: "manual-only", reason: "evidence-mismatch" });
  });

  it("keeps retired receipt evidence manual-only", () => {
    const digest = `sha256:${"3".repeat(64)}` as const;
    expect(decodeWorktreeHuskStamp({
      ...base,
      authorization: "discard-confirmed",
      remoteRef: null,
      evidence: {
        kind: "receipt",
        receiptId: digest,
        transition: "abandon",
        expectedLifecycle: "nonexistent",
        resultDigest: digest,
      },
    })).toEqual({ kind: "manual-only", reason: "unknown-evidence" });
  });

  it.each([
    {
      name: "a partial shape",
      evidence: { kind: "git-transition", transition: "abandon" },
    },
    {
      name: "a noncanonical digest",
      evidence: { kind: "git-transition", transition: "abandon", resultDigest: "sha256:short" },
    },
    {
      name: "an extra lifecycle field",
      evidence: {
        kind: "git-transition",
        transition: "abandon",
        resultDigest: `sha256:${"4".repeat(64)}`,
        expectedLifecycle: "nonexistent",
      },
    },
    {
      name: "rename evidence",
      evidence: {
        kind: "git-transition",
        transition: "rename",
        resultDigest: `sha256:${"4".repeat(64)}`,
      },
    },
    {
      name: "decompose evidence",
      evidence: {
        kind: "git-transition",
        transition: "decompose",
        resultDigest: `sha256:${"4".repeat(64)}`,
      },
    },
  ])("keeps $name manual-only", ({ evidence }) => {
    expect(decodeWorktreeHuskStamp({
      ...base,
      authorization: "discard-confirmed",
      remoteRef: null,
      evidence,
    })).toEqual({ kind: "manual-only", reason: "unknown-evidence" });
  });

  it("makes mixed and unknown future shapes manual-only", () => {
    expect(decodeWorktreeHuskStamp({ ...base, authorization: "merged-preserved" })).toEqual({
      kind: "manual-only",
      reason: "mixed-presence",
    });
    expect(decodeWorktreeHuskStamp({
      ...base,
      authorization: "future-proof",
      remoteRef: null,
      evidence: { kind: "future-evidence", version: 2 },
    })).toEqual({ kind: "manual-only", reason: "unknown-authorization" });
  });
});

describe("writeWorktreeOwnershipMarker — created-by-arc flag gates the write", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-worktree-ownership-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("writes a spawnedByArc marker with the injected timestamp when ARC created the worktree", async () => {
    await writeWorktreeOwnershipMarker(cwd, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "worktree-foundation" },
      spawningIdentity: "andrew",
      now: Date.parse("2026-05-27T12:00:00.000Z"),
    });

    expect(await readWorktreeMarker(cwd)).toEqual({
      kind: "present",
      marker: {
        spawnedByArc: true,
        wuName: "worktree-foundation",
        createdFor: { kind: "work-unit", name: "worktree-foundation" },
        spawningIdentity: "andrew",
        createdAt: "2026-05-27T12:00:00.000Z",
      },
    });
  });

  it("carries one exact decomposition candidate generation without a host path", async () => {
    const decompositionCandidate = {
      claimId: canonicalDigest("claim"),
      generation: 3,
      candidateWorktree: canonicalDigest("candidate-worktree"),
    };
    await writeWorktreeOwnershipMarker(cwd, {
      createdByArc: true,
      createdFor: { kind: "branch", ref: "chore/decompose-origin" },
      spawningIdentity: "andrew",
      decompositionCandidate,
      now: 0,
    });
    expect(await readWorktreeMarker(cwd)).toMatchObject({
      kind: "present",
      marker: { decompositionCandidate },
    });
    expect(JSON.stringify((await readWorktreeMarker(cwd)))).not.toContain(cwd);
  });

  it("writes no marker for an advisory worktree ARC did not create", async () => {
    await writeWorktreeOwnershipMarker(cwd, {
      createdByArc: false,
      createdFor: { kind: "work-unit", name: "worktree-foundation" },
      spawningIdentity: "andrew",
    });

    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "absent" });
  });

  it("writes neutral non-WU ownership without fabricating a legacy WU name", async () => {
    await writeWorktreeOwnershipMarker(cwd, {
      createdByArc: true,
      createdFor: { kind: "errand", slug: "refresh-fixtures" },
      spawningIdentity: "andrew",
      now: Date.parse("2026-05-27T12:00:00.000Z"),
    });

    expect(await readWorktreeMarker(cwd)).toEqual({
      kind: "present",
      marker: {
        spawnedByArc: true,
        createdFor: { kind: "errand", slug: "refresh-fixtures" },
        spawningIdentity: "andrew",
        createdAt: "2026-05-27T12:00:00.000Z",
      },
    });
  });
});

describe("stampWorktreeHusk", () => {
  let cwd: string;
  const husk: WorktreeHuskStamp = {
    sha: "0123456789abcdef0123456789abcdef01234567",
    at: "2026-07-14T20:00:00.000Z",
    subject: { kind: "work-unit", name: "worktree-foundation" },
    branch: "feat/worktree-foundation",
  };

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-worktree-husk-stamp-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it.each<WorktreeMarker>([
    {
      spawnedByArc: true,
      wuName: "worktree-foundation",
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    },
    {
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: "refresh-fixtures" },
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    },
  ])("extends valid ownership without changing its creation fields", async (marker) => {
    await writeWorktreeMarker(cwd, marker);

    expect(await stampWorktreeHusk(cwd, husk)).toEqual({
      kind: "stamped",
      marker: { ...marker, husk },
    });
    expect(await readWorktreeMarker(cwd)).toEqual({
      kind: "present",
      marker: { ...marker, husk },
    });
  });

  it("does not mint or repair ownership when the marker is absent or malformed", async () => {
    expect(await stampWorktreeHusk(cwd, husk)).toEqual({ kind: "absent" });
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "absent" });

    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{ not json", "utf8");

    expect((await stampWorktreeHusk(cwd, husk)).kind).toBe("malformed");
    expect(await readFile(path, "utf8")).toBe("{ not json");
  });

  it.each([
    {
      authorization: "discard-confirmed",
      evidence: {
        kind: "git-transition",
        transition: "abandon",
        resultDigest: `sha256:${"5".repeat(64)}`,
      },
    },
    {
      authorization: "planning-relocated",
      evidence: {
        kind: "git-transition",
        transition: "park-planning",
        resultDigest: `sha256:${"6".repeat(64)}`,
      },
    },
  ] as const)("round-trips $evidence.transition evidence with the exact terminal projection", async ({
    authorization,
    evidence,
  }) => {
    const marker: WorktreeMarker = {
      spawnedByArc: true,
      wuName: "worktree-foundation",
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    };
    const currentHusk: WorktreeHuskStamp = {
      ...husk,
      authorization,
      remoteRef: null,
      evidence,
    };
    await writeWorktreeMarker(cwd, marker);

    await stampWorktreeHusk(cwd, currentHusk);

    expect(await readWorktreeMarker(cwd)).toEqual({
      kind: "present",
      marker: { ...marker, husk: currentHusk },
    });
  });

  it("clears a pending rename move when terminal husking supersedes it", async () => {
    const marker: WorktreeMarker = {
      spawnedByArc: true,
      wuName: "worktree-foundation",
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
      renameMovePending: {
        oldSlug: "old-name",
        newSlug: "worktree-foundation",
        branch: "feat/worktree-foundation",
        head: husk.sha,
        from: "/work/project.old-name",
        to: "/work/project.worktree-foundation",
      },
    };
    await writeWorktreeMarker(cwd, marker);

    expect(await stampWorktreeHusk(cwd, husk)).toEqual({
      kind: "stamped",
      marker: {
        spawnedByArc: true,
        wuName: "worktree-foundation",
        spawningIdentity: "andrew",
        createdAt: "2026-05-25T00:00:00.000Z",
        husk,
      },
    });
  });
});

describe("ensureWorktreeMarkerIgnored", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-worktree-marker-ignore-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  function execReturningGitExclude(): { exec: GitExec; calls: string[][] } {
    const calls: string[][] = [];
    const exec: GitExec = async (cmd, args, options) => {
      calls.push([cmd, ...args, options?.cwd ?? ""]);
      return { stdout: ".git/info/exclude\n" };
    };
    return { exec, calls };
  }

  it("appends the marker pattern to the worktree's git exclude file", async () => {
    const { exec, calls } = execReturningGitExclude();
    const excludePath = join(cwd, ".git", "info", "exclude");
    await mkdir(dirname(excludePath), { recursive: true });
    await writeFile(excludePath, "# local ignores\n", "utf8");

    await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);

    await expect(readFile(excludePath, "utf8")).resolves.toBe(
      "# local ignores\n.arc/system/.internal/worktree-marker.json\n",
    );
    expect(calls).toEqual([["git", "rev-parse", "--git-path", "info/exclude", cwd]]);
  });

  it("does not duplicate an existing marker pattern", async () => {
    const { exec } = execReturningGitExclude();
    const excludePath = join(cwd, ".git", "info", "exclude");
    const existing = ".arc/system/.internal/worktree-marker.json\n";
    await mkdir(dirname(excludePath), { recursive: true });
    await writeFile(excludePath, existing, "utf8");

    await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);

    await expect(readFile(excludePath, "utf8")).resolves.toBe(existing);
  });
});
