import { describe, expect, it, vi } from "vitest";

import { proveNotesPublication } from "../../src/lib/user-sync/notes-publication-proof.js";
import type { ExecResult, GitExec, GitExecInput } from "../../src/lib/git/exec.js";

const oid = (seed: string): string => seed.padEnd(40, "0");

interface ProofFixture {
  heads?: ReadonlyArray<{ branch: string; tip: string }>;
  headOutput?: string;
  objectTypes?: Record<string, string>;
  objectOutput?: string;
  reachable?: readonly string[];
  reachabilityOutput?: string;
  shallow?: string;
  fail?: "heads" | "objects" | "reachability" | "shallow";
}

function proofFixture(fixture: ProofFixture): {
  exec: GitExec;
  execInput: GitExecInput;
  calls: { exec: string[][]; input: Array<{ args: string[]; input: string }> };
} {
  const calls = { exec: [] as string[][], input: [] as Array<{ args: string[]; input: string }> };
  const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
    calls.exec.push(args);
    if (args[0] === "ls-remote") {
      if (fixture.fail === "heads") throw new Error("heads unavailable");
      return {
        stdout: fixture.headOutput ?? (fixture.heads ?? [])
          .map(({ branch, tip }) => `${tip}\trefs/heads/${branch}`)
          .join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "rev-parse" && args[1] === "--is-shallow-repository") {
      if (fixture.fail === "shallow") throw new Error("shallow read failed");
      return { stdout: fixture.shallow ?? "false", stderr: "" };
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
  const execInput: GitExecInput = vi.fn(async (args: string[], input: string): Promise<string> => {
    calls.input.push({ args, input });
    if (args[0] === "cat-file") {
      if (fixture.fail === "objects") throw new Error("object read failed");
      return fixture.objectOutput ?? input.trimEnd().split("\n")
        .map((tip) => `${tip} ${fixture.objectTypes?.[tip] ?? "commit"}`)
        .join("\n");
    }
    if (args[0] === "rev-list") {
      if (fixture.fail === "reachability") throw new Error("walk failed");
      return fixture.reachabilityOutput ?? (fixture.reachable ?? []).join("\n");
    }
    throw new Error(`unexpected git input ${args.join(" ")}`);
  });
  return { exec, execInput, calls };
}

describe("proveNotesPublication", () => {
  it("proves an empty publication set without reading heads or objects", async () => {
    const { exec } = proofFixture({ fail: "heads" });

    await expect(proveNotesPublication({ exec, annotatedCommits: [] }))
      .resolves.toEqual({ kind: "proven" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("returns unavailable when non-empty proof lacks the stdin Git seam", async () => {
    const { exec } = proofFixture({});

    await expect(proveNotesPublication({ exec, annotatedCommits: [oid("a1")] }))
      .resolves.toMatchObject({ kind: "unavailable", message: expect.stringContaining("stdin") });
  });

  it("proves publication through one union walk and deduplicates live tips", async () => {
    const annotated = oid("a1");
    const tip = oid("b2");
    const { exec, execInput, calls } = proofFixture({
      heads: [{ branch: "main", tip }, { branch: "feat/sibling", tip }],
      reachable: [tip, annotated],
    });

    await expect(proveNotesPublication({ exec, execInput, annotatedCommits: [annotated, annotated] }))
      .resolves.toEqual({ kind: "proven" });
    expect(calls.input).toEqual([
      { args: ["cat-file", "--batch-check=%(objectname) %(objecttype)"], input: `${tip}\n` },
      { args: ["rev-list", "--stdin"], input: `${tip}\n` },
    ]);
  });

  it("lets another readable live head prove the set when one tip is missing", async () => {
    const annotated = oid("a1");
    const readable = oid("b2");
    const missing = oid("c3");
    const { exec, execInput } = proofFixture({
      heads: [{ branch: "main", tip: readable }, { branch: "missing", tip: missing }],
      objectTypes: { [missing]: "missing" },
      reachable: [readable, annotated],
    });

    await expect(proveNotesPublication({ exec, execInput, annotatedCommits: [annotated] }))
      .resolves.toEqual({ kind: "proven" });
  });

  it("reports unpublished history only from a complete non-shallow readable union", async () => {
    const annotated = oid("a1");
    const tip = oid("b2");
    const { exec, execInput } = proofFixture({ heads: [{ branch: "main", tip }], reachable: [tip] });

    await expect(proveNotesPublication({ exec, execInput, annotatedCommits: [annotated] }))
      .resolves.toEqual({ kind: "unpublished", commits: [annotated] });
  });

  it.each([
    ["incomplete live heads", { headOutput: `${oid("b2")}\trefs/heads/main\nmalformed` }],
    ["missing live tip visibility", {
      heads: [{ branch: "main", tip: oid("b2") }],
      objectTypes: { [oid("b2")]: "missing" },
    }],
    ["malformed object output", {
      heads: [{ branch: "main", tip: oid("b2") }],
      objectOutput: "malformed",
    }],
    ["malformed reachability output", {
      heads: [{ branch: "main", tip: oid("b2") }],
      reachabilityOutput: "not-an-object-id",
    }],
    ["shallow history", {
      heads: [{ branch: "main", tip: oid("b2") }],
      reachable: [oid("b2")],
      shallow: "true",
    }],
  ] as const)("returns unavailable for %s", async (_label, fixture) => {
    const { exec, execInput } = proofFixture(fixture);

    await expect(proveNotesPublication({ exec, execInput, annotatedCommits: [oid("a1")] }))
      .resolves.toMatchObject({ kind: "unavailable" });
  });

  it("rejects reordered or truncated object-check responses", async () => {
    const first = oid("b2");
    const second = oid("c3");
    const reordered = proofFixture({
      heads: [{ branch: "first", tip: first }, { branch: "second", tip: second }],
      objectOutput: `${second} commit\n${first} commit`,
    });
    const truncated = proofFixture({
      heads: [{ branch: "first", tip: first }, { branch: "second", tip: second }],
      objectOutput: `${first} commit`,
    });

    await expect(proveNotesPublication({
      exec: reordered.exec,
      execInput: reordered.execInput,
      annotatedCommits: [oid("a1")],
    })).resolves.toMatchObject({ kind: "unavailable" });
    await expect(proveNotesPublication({
      exec: truncated.exec,
      execInput: truncated.execInput,
      annotatedCommits: [oid("a1")],
    })).resolves.toMatchObject({ kind: "unavailable" });
  });
});
