/** Retained-tip comparison and strict registry reads distinguish consumption from an unfinished build. */
import { expect, it } from "vitest";
import { compareWindowConsumption } from "../../../../src/scripts/cutover-window/consumed.js";
import { scriptGitExec, makeGitProcessError } from "../../../helpers/git-exec-fake.js";

const ref = "refs/arc/user/andrew/errands", tip = "a".repeat(40), registry = "b".repeat(40);
const prefix = "refs/arc/tmp/migrate/import/kept/";
const keptRef = prefix + "user/andrew/errands";
function io(kept: string, landed = true) {
  return { repo: "/importing", ...scriptGitExec([
    { match: { predicate: args => args.includes("rev-parse") && args.at(-1) === "refs/arc/project/registry" }, responses: [landed ? { stdout: registry } : { failure: { exitCode: 1 } }] },
    { match: { predicate: args => args[0] === "for-each-ref" && args.at(-1) === prefix }, responses: [{ stdout: kept }] },
    { match: { predicate: args => args[0] === "for-each-ref" && args.includes("refs/arc/work/") }, responses: [{ stdout: "" }] },
    { match: { predicate: args => args.includes("rev-parse") && (args.at(-1)?.endsWith("^{commit}") ?? false) },
      responses: [({ args }) => ({ stdout: args.at(-1)?.replace("^{commit}", "") ?? "" })] },
    { match: { prefix: ["ls-tree"] }, responses: [{ stdout: "" }] },
  ]) };
}

it("uses equal retained tips as the consumption witness after landing", async () => {
  expect(await compareWindowConsumption(io(`${keptRef} ${tip}\n`), { [ref]: tip })).toEqual({ regime: "kept",
    identities: [{ ref, held: tip, kept: tip }], findings: [] });
});

it("reports every mismatched, missing, and unheld retained identity with both tips", async () => {
  const moved = "c".repeat(40), other = "refs/arc/user/alex/errands", missing = "refs/arc/user/casey/errands";
  const result = await compareWindowConsumption(io(`${keptRef} ${moved}\n${prefix}user/alex/errands ${moved}\n`), { [ref]: tip, [missing]: tip });
  expect(result.regime).toBe("kept");
  expect(result.findings.map(finding => finding.subject).sort()).toEqual([ref, other, missing].sort());
  for (const finding of result.findings) {
    expect(finding.condition).toContain(finding.subject);
    expect(finding.condition).toContain("held");
    expect(finding.condition).toContain("kept");
    expect(finding.remedy).toContain("accept");
  }
  expect(result.findings.find(finding => finding.subject === ref)?.condition).toContain(moved);
  expect(result.findings.find(finding => finding.subject === missing)?.condition).toContain(tip);
});

it.each(["", `${keptRef} ${"c".repeat(40)}\n`])("reports no consumption before landing, even with an unfinished build's kept tips: %s", async kept => {
  expect(await compareWindowConsumption(io(kept, false), { [ref]: tip })).toEqual({ regime: "unconsumed",
    identities: [{ ref, held: tip, kept: null }], findings: [] });
});

it.each([
  { exitCode: 128 }, { exitCode: 1, signal: "SIGTERM" }, { exitCode: 1, timedOut: true }, { exitCode: 1, isCanceled: true },
])("preserves a failed registry read instead of treating it as absence: %j", async failure => {
  const original = makeGitProcessError({ command: "git", args: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "--end-of-options", "refs/arc/project/registry"], ...failure });
  const boundary = scriptGitExec([{ match: { predicate: args => args.includes("rev-parse") }, responses: [() => { throw original; }] }]);
  await expect(compareWindowConsumption({ repo: "/importing", exec: boundary.exec }, { [ref]: tip })).rejects.toBe(original);
});

it("refuses a successful registry resolution that did not produce a full object ID", async () => {
  const boundary = scriptGitExec([
    { match: { predicate: args => args.includes("rev-parse") }, responses: [{ stdout: "invalid" }] },
    { match: { prefix: ["for-each-ref"] }, responses: [{ stdout: `${keptRef} ${tip}\n` }] },
  ]);
  await expect(compareWindowConsumption({ repo: "/importing", exec: boundary.exec }, { [ref]: tip })).rejects.toBeDefined();
});
