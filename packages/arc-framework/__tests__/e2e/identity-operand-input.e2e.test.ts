/** Identity subjects preserve the in-repo slug boundary and earlier refusals. */
import { describe, expect, it, onTestFinished } from "vitest";
import { cleanupTempDir, createTempRepo, git, runArc, runArcNoTty } from "./helpers.js";

const upper = "ABCDEF01-2345-4678-9ABC-DEF012345678";
const lower = upper.toLowerCase();
const cases = [
  { command: "rename", args: (subject: string) => ["rename", subject, "renamed"], input: "Review command usage" },
  { command: "errand close", args: (subject: string) => ["errand", "close", subject, "--json"], input: "locus.errand-close.input" },
  { command: "errand abandon", args: (subject: string) => ["errand", "abandon", subject, "--json"], input: "locus.errand-abandon.input" },
];
async function fixture(initialized: boolean) {
  const root = await createTempRepo();
  onTestFinished(() => cleanupTempDir(root));
  await git(root, ["config", "arc.identity", "test-user"]);
  if (initialized) expect((await runArc(["init", "--yes", "--name", "test-project"], root)).exitCode).toBe(0);
  return root;
}
describe("identity operands before the store capability flip", () => {
  it.each(cases)("$command help describes UID subjects", async ({ command }) => {
    const root = await fixture(false);
    const result = await runArcNoTty([...command.split(" "), "--help"], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toContain("slug or UID");
  });
  it.each(cases)("$command reports the missing project before rejecting a UUID subject", async ({ args, input }) => {
    const root = await fixture(false);
    const result = await runArcNoTty(["--no-input", ...args(upper)], root);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/ARC project/u);
    expect(result.stdout + result.stderr).not.toContain(input);
  });
  it.each(cases)("$command keeps lower-case UUIDs as slugs and rejects upper-case UUIDs after opening", async ({ args, input }) => {
    const root = await fixture(true);
    const before = await git(root, ["status", "--porcelain"]);
    const accepted = await runArcNoTty(["--no-input", ...args(lower)], root);
    expect(accepted.exitCode).toBe(1);
    expect(accepted.stdout + accepted.stderr).not.toContain(input);
    const refused = await runArcNoTty(["--no-input", ...args(upper)], root);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout + refused.stderr).toContain(input);
    expect(await git(root, ["status", "--porcelain"])).toBe(before);
  });
});
