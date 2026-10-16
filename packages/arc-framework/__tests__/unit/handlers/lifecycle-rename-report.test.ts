/** Human rename results retain executable recovery and personal branch evidence. */
import { afterEach, expect, it, vi } from "vitest";
import { reportRenameResult } from "../../../src/handlers/lifecycle-rename-report.js";
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });
function capture(): string[] {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => { output.push(String(chunk)); return true; });
  return output;
}
it("prints a typed continuation and nonzero exit after the records have landed", () => {
  const output = capture();
  reportRenameResult("source", "target", { status: "partial", reason: "Origin unavailable.",
    remedy: { text: "Finish the remaining remote and personal workspace rename.", argv: ["arc", "rename", "source", "target"] } });
  expect(output.join("")).toContain("arc rename source target"); expect(process.exitCode).toBe(1);
  expect(output.join("")).not.toContain("Done.");
});
it("names every preserved link and the adopted remote branch", () => {
  const output = capture();
  reportRenameResult("source", "target", { status: "renamed", shape: "in-place", recordBatch: "applied", pendingIntegration: false,
    advisories: [], keptBranches: ["errand/earlier", "personal/topic"], remote: { status: "retained", oldBranch: "feat/source", newBranch: "feat/target", oldOid: "a".repeat(40) } });
  expect(output.join("")).toContain("errand/earlier"); expect(output.join("")).toContain("personal/topic");
  expect(output.join("")).toContain("Owner decision: delete it only if no longer needed.");
  expect(output.join("")).toContain("git push origin --delete 'feat/source'");
  expect(output.join("")).toContain("retained personal branch feat/source"); expect(output.join("")).not.toContain("unmanaged");
});
