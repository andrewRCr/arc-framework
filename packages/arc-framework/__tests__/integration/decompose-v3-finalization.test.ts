import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalize } from "../../src/lib/canonical/canonical-json.js";
import { contentDigest } from "../../src/lib/canonical/content-digest.js";
import { atomicWriteFile } from "../../src/lib/fs.js";
import { readGitBlobBytes } from "../../src/lib/io-context.js";
import {
  mergeProjectReadinessRecords,
  type ProjectReadinessAcceptedCandidate,
  type ProjectReadinessCompositionResult,
} from "../../src/lib/status/project-view.js";
import { createInRepoDecomposeRetirementDriver } from "../../src/lib/work-unit/decompose-retirement-driver.js";
import { renderV3IncompleteCohort } from "../../src/lib/work-unit/decompose-v3-topology.js";
import type { DecomposeReadinessDeps } from "../../src/lib/work-unit/decompose-launch-readiness.js";
import {
  resolveRetirementRecordPath,
  writeRetirementRecord,
} from "../../src/lib/work-unit/retirement-record-store.js";
import { v3DecompositionEvidenceFixture } from "../fixtures/decompose-v3.js";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);
const encoder = new TextEncoder();

function candidate(slug: string): ProjectReadinessAcceptedCandidate {
  const path = `.arc/backlog/planned/origin/${slug}/meta-${slug}.md`;
  const record = mergeProjectReadinessRecords([{
    slug,
    location: "planned",
    state: "Planning",
    priority: "P3",
    dependsOn: [],
    source: { kind: "backlog-stub", location: "planned", path },
  }])[0];
  if (record === undefined) throw new Error("candidate fixture requires one record");
  return { slug, path, lifecycleLocation: "planned", record };
}

function composition(): ProjectReadinessCompositionResult {
  const acceptedCandidates = [candidate("member-a"), candidate("member-b")];
  const records = mergeProjectReadinessRecords(acceptedCandidates.map(({ record }) => record));
  return {
    acceptedCandidates,
    rejectedRecords: [],
    records,
    treeRecords: records,
    derivationWarnings: [],
    sourceWarnings: [],
    indeterminate: false,
    oracleResult: null,
    view: {
      title: "Candidate",
      records,
      derivationWarnings: [],
      sourceWarnings: [],
      indeterminate: false,
    },
  };
}

const readyDeps: DecomposeReadinessDeps = {
  readinessProvider: {
    resolve: ({ candidates }) =>
      new Map(candidates.map(({ slug }) => [slug, { kind: "ready" as const }])),
  },
};

describe("v3 decompose refresh against real Git", () => {
  const repos: string[] = [];

  afterEach(async () => {
    await Promise.all(repos.splice(0).map(async (repo) => await cleanupTempDir(repo)));
  });

  async function harness(options: {
    raceAfterWrite?: boolean;
    omitProjectionValidator?: boolean;
  } = {}) {
    const repo = await createTempRepo("arc-v3-finalize-");
    repos.push(repo);
    await mkdir(join(repo, ".arc/active"), { recursive: true });
    await mkdir(join(repo, ".arc/backlog"), { recursive: true });
    await writeFile(join(repo, ".arc/active/draft-origin.md"), "source unit");
    await writeFile(join(repo, ".arc/backlog/ROADMAP.md"), "roadmap before");
    await execFileAsync("git", ["add", "-A"], { cwd: repo });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: repo });
    const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
    await execFileAsync("git", ["branch", "plan/origin", head], { cwd: repo });

    const template = await readFile(
      new URL("../../arc/reference/templates/arc/work-unit/template-cohort.md", import.meta.url),
    );
    const incomplete = renderV3IncompleteCohort(template, "origin");
    if (incomplete === null) throw new Error("cohort template must render");
    const topology = encoder.encode(
      new TextDecoder().decode(incomplete).replace(
        "**Purpose:** —",
        "**Purpose:** Coordinate the split.",
      ),
    );
    const labelBytes = new Map<string, Uint8Array>([
      ["source unit", encoder.encode("source unit")],
      ["cohort topology", topology],
      ["result 0", encoder.encode("result 0")],
      ["result 1", encoder.encode("result 1")],
      ["roadmap before", encoder.encode("roadmap before")],
      ["roadmap after", encoder.encode("roadmap after")],
    ]);
    const fixture = v3DecompositionEvidenceFixture({
      sourceHead: head,
      resultBaseHead: head,
      digestLabel: (label) => {
        const bytes = labelBytes.get(label);
        if (bytes === undefined) throw new Error(`missing fixture bytes: ${label}`);
        return contentDigest(bytes);
      },
    });
    const topologyFact = fixture.preparation.facts.topology.facts[0];
    if (topologyFact === undefined || topologyFact.kind === "none") {
      throw new Error("fixture requires one topology path");
    }
    const topologyPath = topologyFact.path;
    const roadmapPath = fixture.preparation.facts.prospectiveProjection.roadmap.path;
    const resultPaths = fixture.preparation.facts.destinationOutputPaths.flatMap(({ paths }) => paths);
    await Promise.all([
      [roadmapPath, encoder.encode("roadmap after")] as const,
      [topologyPath, topology] as const,
      [resultPaths[0]!, encoder.encode("result 0")] as const,
      [resultPaths[1]!, encoder.encode("result 1")] as const,
    ].map(async ([path, bytes]) => {
      await mkdir(dirname(join(repo, path)), { recursive: true });
      await writeFile(join(repo, path), bytes);
    }));
    await writeRetirementRecord(repo, fixture.receipt.receiptId, canonicalize(fixture.receipt));
    await execFileAsync("git", ["add", "-A"], { cwd: repo });
    await writeFile(join(repo, resultPaths[0]!), "refined destination");
    await execFileAsync("git", ["add", "--", resultPaths[0]!], { cwd: repo });

    let injected = false;
    const driver = createInRepoDecomposeRetirementDriver({
      cwd: repo,
      exec: makeGitExec(repo),
      lifecycleFs: {
        readdir: async (path) => await readdir(path, { withFileTypes: true }),
        readFile: async (path) => await readFile(path, "utf8"),
      },
      readFile: async (path) => await readFile(path, "utf8"),
      readBlob: async (ref, path) => await readGitBlobBytes(repo, ref, path),
      createRecord: async (receiptId, content) => await writeRetirementRecord(repo, receiptId, content),
      removeRecord: async (receiptId) => await rm(resolveRetirementRecordPath(repo, receiptId)),
      atomicWriteFile: options.raceAfterWrite === true
        ? async (path, content) => {
            await atomicWriteFile(path, content);
            if (!injected) {
              injected = true;
              await execFileAsync("git", ["commit", "-m", "injected race"], { cwd: repo });
            }
          }
        : atomicWriteFile,
      readTopologyValidationInput: async () => ({
        candidateTree: {
          [topologyPath]: {
            kind: "object",
            objectKind: "blob",
            mode: "100644",
            bytes: topology,
          },
        },
        cohortTemplate: template,
        cohortConsistency: {
          metas: [],
          cohortDocs: [{ path: topologyPath, content: new TextDecoder().decode(topology) }],
        },
      }),
      ...(options.omitProjectionValidator === true
        ? {}
        : { validateProspectiveProjection: async () => true }),
    });
    return { driver, fixture, repo, resultPaths };
  }

  it("refreshes only the staged destination refinement while the receipt stays absent from its parent", async () => {
    const { driver, fixture, repo } = await harness();
    const result = await driver.finalizeV3("origin", fixture.receipt.receiptId, {
      continuation: fixture.receipt.finalized.publication.initialContinuation,
      continuationPath: "/tmp/continuation.json",
      composition: composition(),
      readinessDeps: readyDeps,
    });

    expect(result).toMatchObject({ status: "refreshed" });
    await expect(execFileAsync("git", [
      "cat-file",
      "-e",
      `HEAD:.arc/system/.internal/retirement-receipts/${
        fixture.receipt.receiptId.replace(":", "-")
      }.json`,
    ], { cwd: repo })).rejects.toThrow();
  });

  it("refuses a missing authority record without mutating the candidate", async () => {
    const { driver, fixture, repo } = await harness();
    await rm(resolveRetirementRecordPath(repo, fixture.receipt.receiptId));
    const snapshot = async () => ({
      status: (await execFileAsync(
        "git",
        ["status", "--porcelain=v1", "-z"],
        { cwd: repo },
      )).stdout,
      staged: (await execFileAsync(
        "git",
        ["diff", "--cached", "--binary", "--no-ext-diff"],
        { cwd: repo },
      )).stdout,
      worktree: (await execFileAsync(
        "git",
        ["diff", "--binary", "--no-ext-diff"],
        { cwd: repo },
      )).stdout,
    });
    const before = await snapshot();

    expect(await driver.finalizeV3("origin", fixture.receipt.receiptId, {
      continuation: fixture.receipt.finalized.publication.initialContinuation,
      continuationPath: "/tmp/continuation.json",
      composition: composition(),
      readinessDeps: readyDeps,
    })).toMatchObject({
      status: "refused",
      reason: "evidence-missing",
      recovery: { action: "re-preflight" },
    });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a race after the pre-CAS check and restores the exact prior receipt", async () => {
    const { driver, fixture, repo } = await harness({ raceAfterWrite: true });
    const result = await driver.finalizeV3("origin", fixture.receipt.receiptId, {
      continuation: fixture.receipt.finalized.publication.initialContinuation,
      continuationPath: "/tmp/continuation.json",
      composition: composition(),
      readinessDeps: readyDeps,
    });

    expect(result).toMatchObject({
      status: "refused",
      reason: "evidence-mismatch: record-projection-moved",
      recovery: { action: "retry" },
    });
    expect(await readFile(
      resolveRetirementRecordPath(repo, fixture.receipt.receiptId),
      "utf8",
    )).toBe(canonicalize(fixture.receipt));
  });

  it("names unavailable prospective projection validation precisely", async () => {
    const { driver, fixture } = await harness({ omitProjectionValidator: true });

    expect(await driver.finalizeV3("origin", fixture.receipt.receiptId, {
      continuation: fixture.receipt.finalized.publication.initialContinuation,
      continuationPath: "/tmp/continuation.json",
      composition: composition(),
      readinessDeps: readyDeps,
    })).toMatchObject({
      status: "refused",
      reason: "prospective-projection-validation-unavailable",
      recovery: {
        action: "guidance",
        message: expect.stringMatching(/prospective projection validation is unavailable/iu),
      },
    });
  });

  it("refuses a foreign staged path before replacing the prior receipt", async () => {
    const { driver, fixture, repo } = await harness();
    await writeFile(join(repo, "foreign.txt"), "foreign");
    await execFileAsync("git", ["add", "--", "foreign.txt"], { cwd: repo });

    expect(await driver.finalizeV3("origin", fixture.receipt.receiptId, {
      continuation: fixture.receipt.finalized.publication.initialContinuation,
      continuationPath: "/tmp/continuation.json",
      composition: composition(),
      readinessDeps: readyDeps,
    })).toMatchObject({
      status: "refused",
      reason: "v3 decompose staged path set changed",
      recovery: { action: "retry" },
    });
    expect(await readFile(
      resolveRetirementRecordPath(repo, fixture.receipt.receiptId),
      "utf8",
    )).toBe(canonicalize(fixture.receipt));
  });

  it("refuses mixed index/worktree bytes before replacing the prior receipt", async () => {
    const { driver, fixture, repo, resultPaths } = await harness();
    await writeFile(join(repo, resultPaths[1]!), "unstaged edit");

    expect(await driver.finalizeV3("origin", fixture.receipt.receiptId, {
      continuation: fixture.receipt.finalized.publication.initialContinuation,
      continuationPath: "/tmp/continuation.json",
      composition: composition(),
      readinessDeps: readyDeps,
    })).toMatchObject({
      status: "refused",
      reason: "v3 decompose index/worktree projection changed",
      recovery: { action: "retry" },
    });
    expect(await readFile(
      resolveRetirementRecordPath(repo, fixture.receipt.receiptId),
      "utf8",
    )).toBe(canonicalize(fixture.receipt));
  });
});
