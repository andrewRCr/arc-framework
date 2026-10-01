/** Git-backed Candidate applicability fact production. */

import { describe, expect, it } from "vitest";

import { scriptRawGitExec } from "../../helpers/git-exec-fake.js";
import type { RawGitExec } from "../../../src/lib/git/exec.js";
import { canonicalDigest } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { createCandidateSubjectSnapshot } from "../../../src/lib/work-unit/candidate-attestation.js";
import { projectGitCandidateApplicability } from "../../../src/lib/work-unit/git-candidate-applicability.js";

const oid = (character: string): string => character.repeat(40);
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const result = (value: string) => ({ stdout: bytes(value) });

function subject(source: string) {
  return createCandidateSubjectSnapshot([{
    path: "packages/arc-framework/src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source }),
    treatment: "reviewable",
  }]);
}

function request(currentSubject = subject("current")) {
  return {
    candidateId: canonicalDigest({ candidate: "example" }),
    baselineTarget: { revision: oid("a"), subject: subject("baseline") },
    currentTarget: { revision: oid("c"), subject: currentSubject },
    currentBase: oid("b"),
  };
}

/**
 * Git answers `--is-ancestor` for divergent revisions with exit 1 and no output.
 * Each fixture pins a merge base distinct from both revisions, so the containment answer must be negative.
 */
const divergent = { failure: { exitCode: 1, stdout: bytes(""), stderr: "" } };

function mechanicalReapplyExec(): RawGitExec {
  const trees = new Map([
    [oid("1"), oid("2")],
    [oid("a"), oid("3")],
    [oid("b"), oid("4")],
    [oid("c"), oid("5")],
  ]);
  return scriptRawGitExec([
    { match: ["merge-base", "--all", oid("a"), oid("b")], responses: [result(`${oid("1")}\n`)] },
    { match: { prefix: ["merge-base", "--is-ancestor"] }, responses: [divergent] },
    { match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [result(`${oid("c")}\n`)] },
    {
      match: { predicate: (args) => args[0] === "rev-parse" && args[1] === "--verify"
        && /^([0-9a-f]+)\^\{commit\}$/u.test(args[2] ?? "")
        && trees.has(args[2]?.replace(/\^\{commit\}$/u, "") ?? "") },
      responses: [({ args }) => result(`${args[2]?.replace(/\^\{commit\}$/u, "")}\n`)],
    },
    {
      match: { predicate: (args) => args[0] === "rev-parse"
        && /^([0-9a-f]+)\^\{tree\}$/u.test(args[1] ?? "")
        && trees.has(args[1]?.replace(/\^\{tree\}$/u, "") ?? "") },
      responses: [({ args }) => result(`${trees.get(args[1]?.replace(/\^\{tree\}$/u, "") ?? "")}\n`)],
    },
    { match: { predicate: (args) => args[0] === "merge-tree" && args.includes("--name-only") },
      responses: [result(`${oid("5")}\0`)] },
    { match: { prefix: ["merge-tree"] }, responses: [result(`${oid("9")}\n`)] },
  ]).exec;
}

describe("Git Candidate applicability", () => {
  it("derives the sole baseline-to-current merge base for D4 reapplication", async () => {
    const projected = await projectGitCandidateApplicability({
      request: request(),
      exec: mechanicalReapplyExec(),
      observeEndpoints: async () => ({ candidateHead: oid("c"), baseHead: oid("b") }),
    });
    expect(
      projected.state,
      projected.state === "classification-failed" ? projected.detail : projected.state,
    ).toBe("applicable");
    expect(projected).toMatchObject({
      state: "applicable",
      nextAction: "recognize-current",
      proof: "mechanical-reapply",
      projection: {
        before: {
          predecessor: { head: oid("1"), tree: oid("2") },
          member: { head: oid("a"), tree: oid("3") },
        },
        after: {
          predecessor: { head: oid("b"), tree: oid("4") },
          member: { head: oid("c"), tree: oid("5") },
        },
      },
    });
  });

  it("stops as unavailable when no baseline-to-current merge base exists", async () => {
    const { exec } = scriptRawGitExec([
      { match: { prefix: ["merge-base"] }, responses: [divergent] },
    ]);

    await expect(projectGitCandidateApplicability({
      request: request(),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("c"), baseHead: oid("b") }),
    })).resolves.toMatchObject({
      state: "classification-unavailable",
      nextAction: "stop",
      reason: "merge-base-missing",
    });
  });

  it("stops as unavailable when the baseline-to-current merge base is ambiguous", async () => {
    const { exec } = scriptRawGitExec([
      { match: { prefix: ["merge-base", "--is-ancestor"] }, responses: [divergent] },
      { match: { prefix: ["merge-base"] }, responses: [result(`${oid("1")}\n${oid("2")}\n`)] },
    ]);

    await expect(projectGitCandidateApplicability({
      request: request(),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("c"), baseHead: oid("b") }),
    })).resolves.toMatchObject({
      state: "classification-unavailable",
      nextAction: "stop",
      reason: "merge-base-ambiguous",
    });
  });

  /**
   * An exit code other than 1 is not Git answering "no" — it is Git failing to answer. The containment
   * question stays open, so the classification stops rather than reading the silence as divergence.
   */
  it("stops when the containment question cannot be answered at all", async () => {
    const { exec } = scriptRawGitExec([
      { match: { prefix: ["merge-base", "--is-ancestor"] }, responses: [{ failure: {
        exitCode: 128, stdout: bytes(""), stderr: "fatal: bad object\n",
      } }] },
      { match: { prefix: ["merge-base"] }, responses: [result(`${oid("1")}\n`)] },
    ]);

    await expect(projectGitCandidateApplicability({
      request: request(),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("c"), baseHead: oid("b") }),
    })).resolves.toMatchObject({
      state: "classification-failed",
      nextAction: "stop",
      reason: "git-failure",
      detail: "The baseline-to-base ancestry could not be established.",
    });
  });

  it("stops malformed merge-base evidence separately from Git failure", async () => {
    const { exec } = scriptRawGitExec([
      { match: { prefix: ["merge-base"] }, responses: [result("not-an-object-id\n")] },
    ]);

    await expect(projectGitCandidateApplicability({
      request: request(),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("c"), baseHead: oid("b") }),
    })).resolves.toMatchObject({
      state: "classification-failed",
      nextAction: "stop",
      reason: "malformed-evidence",
    });
  });

  it("stops malformed UTF-8 evidence separately from Git failure", async () => {
    const { exec } = scriptRawGitExec([
      { match: { prefix: ["merge-base"] }, responses: [{ stdout: new Uint8Array([0xff]) }] },
    ]);

    await expect(projectGitCandidateApplicability({
      request: request(),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("c"), baseHead: oid("b") }),
    })).resolves.toMatchObject({
      state: "classification-failed",
      nextAction: "stop",
      reason: "malformed-evidence",
    });
  });

  it("stops an operational Git rejection as classification failure", async () => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "merge-base") throw new Error("Git is unavailable");
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };

    await expect(projectGitCandidateApplicability({
      request: request(),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("c"), baseHead: oid("b") }),
    })).resolves.toMatchObject({
      state: "classification-failed",
      nextAction: "stop",
      reason: "git-failure",
    });
  });

  it("reruns before Git classification when the Candidate endpoint moved", async () => {
    const exec: RawGitExec = async (args) => {
      throw new Error(`Git must not run after endpoint movement: ${args.join(" ")}`);
    };

    await expect(projectGitCandidateApplicability({
      request: request(),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("d"), baseHead: oid("b") }),
    })).resolves.toMatchObject({
      state: "rerun-checkpoint",
      nextAction: "rerun-checkpoint",
      reason: "candidate-moved",
      observed: { candidateHead: oid("d"), baseHead: oid("b") },
    });
  });

  it("reruns before Git classification when the base endpoint moved", async () => {
    const exec: RawGitExec = async (args) => {
      throw new Error(`Git must not run after endpoint movement: ${args.join(" ")}`);
    };

    await expect(projectGitCandidateApplicability({
      request: request(),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("c"), baseHead: oid("d") }),
    })).resolves.toMatchObject({
      state: "rerun-checkpoint",
      nextAction: "rerun-checkpoint",
      reason: "base-moved",
      observed: { candidateHead: oid("c"), baseHead: oid("d") },
    });
  });

  it("reports combined endpoint movement as one checkpoint rerun", async () => {
    const exec: RawGitExec = async (args) => {
      throw new Error(`Git must not run after endpoint movement: ${args.join(" ")}`);
    };

    await expect(projectGitCandidateApplicability({
      request: request(),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("d"), baseHead: oid("e") }),
    })).resolves.toMatchObject({
      state: "rerun-checkpoint",
      nextAction: "rerun-checkpoint",
      reason: "candidate-and-base-moved",
      observed: { candidateHead: oid("d"), baseHead: oid("e") },
    });
  });

  it("checks endpoint movement before the subject-equality fast path", async () => {
    const exec: RawGitExec = async (args) => {
      throw new Error(`Git must not run for subject equality: ${args.join(" ")}`);
    };

    await expect(projectGitCandidateApplicability({
      request: request(subject("baseline")),
      exec,
      observeEndpoints: async () => ({ candidateHead: oid("d"), baseHead: oid("b") }),
    })).resolves.toMatchObject({
      state: "rerun-checkpoint",
      nextAction: "rerun-checkpoint",
      reason: "candidate-moved",
    });
  });

  it("reruns when an endpoint moves while structural facts are being derived", async () => {
    let observation = 0;
    await expect(projectGitCandidateApplicability({
      request: request(),
      exec: mechanicalReapplyExec(),
      observeEndpoints: async () => {
        observation += 1;
        return observation === 1
          ? { candidateHead: oid("c"), baseHead: oid("b") }
          : { candidateHead: oid("d"), baseHead: oid("b") };
      },
    })).resolves.toMatchObject({
      state: "rerun-checkpoint",
      nextAction: "rerun-checkpoint",
      reason: "candidate-moved",
      observed: { candidateHead: oid("d"), baseHead: oid("b") },
    });
  });
});
