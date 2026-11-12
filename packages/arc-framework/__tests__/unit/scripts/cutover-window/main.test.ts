/** The repository tool refuses unsupported operations and requires an explicit checkout. */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runWindow, type WindowOutput } from "../../../../src/scripts/cutover-window/main.js";

function capture(): { output: WindowOutput; stdout: string[]; stderr: string[] } {
  const stdout: string[] = []; const stderr: string[] = [];
  return { stdout, stderr, output: { stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); } } };
}

describe("window entry", () => {
  it.each(["unknown", "check", "toString"])("refuses unsupported operation %s with usage", async operation => {
    const { output, stderr } = capture();
    expect(await runWindow([operation, "--repo", "/target"], {}, output)).toBe(1);
    expect(stderr.join("")).toContain("Usage:");
    expect(stderr.join("")).toContain(operation);
  });

  it("refuses an operation without an explicitly named checkout", async () => {
    const { output, stderr } = capture();
    const handlers = { check: async () => ({ operation: "check", status: "passed" as const, findings: [] }) };
    expect(await runWindow(["check"], handlers, output)).toBe(1);
    expect(stderr.join("")).toContain("--repo");
  });
});


describe("window results", () => {
  const cases = [
    { operation: "check", status: "passed", exit: 0 },
    { operation: "check", status: "refused", exit: 1 },
    { operation: "recompute", status: "stopped", exit: 1 },
    { operation: "account", status: "findings", exit: 1 },
    { operation: "chain", status: "findings", exit: 1 },
    { operation: "compare", status: "reported", exit: 0 },
    { operation: "lock", status: "reported", exit: 0 },
  ] as const;

  it.each(cases)("returns $exit for $operation/$status and emits one typed result", async ({ operation, status, exit }) => {
    const { output, stdout, stderr } = capture();
    const target = resolve("named-checkout");
    const handlers = { [operation]: async ({ repo }: { repo: string }) => ({
      operation, status, findings: [], data: { target: repo },
    }) };
    expect(await runWindow([operation, "--repo", target, "--json"], handlers, output)).toBe(exit);
    expect(stdout.join("")).toContain(`"status":"${status}"`);
    expect(JSON.parse(stdout.join(""))).toEqual({ operation, status, findings: [], data: { target } });
    expect(stderr.join("")).toContain(`${operation}: ${status}`);
  });

  it("prints every failing subject and remedy in both human and JSON modes", async () => {
    const findings = [
      { subject: "checkout one", condition: "dirty", remedy: "commit or discard" },
      { subject: "branch two", condition: "diverged", remedy: "merge and push" },
      { subject: "pull request three", condition: "auto-merge armed", remedy: "disarm auto-merge" },
    ];
    const handlers = { check: async () => ({ operation: "check", status: "refused" as const, findings }) };
    for (const json of [false, true]) {
      const { output, stdout, stderr } = capture();
      expect(await runWindow(["check", "--repo", resolve("target"), ...(json ? ["--json"] : [])], handlers, output)).toBe(1);
      const report = (json ? stderr : stdout).join("");
      for (const finding of findings) {
        expect(report).toContain(finding.subject);
        expect(report).toContain(finding.condition);
        expect(report).toContain(finding.remedy);
      }
      if (json) expect(JSON.parse(stdout.join(""))).toMatchObject({ findings });
    }
  });
});
