/** Initial workflow examples and their contextual assumptions through the built CLI. */

import { describe, expect, it } from "vitest";

import { runCli } from "../helpers/run-cli.js";

const pages = [
  { path: ["start"], examples: ["arc start my-work", "arc start fresh-work --new", "arc start my-work --here"], notes: ["planned target", "new target"] },
  { path: ["status"], examples: ["arc status my-work --json", "arc status --project", "arc status --session-init --json"], notes: ["mutually exclusive"] },
  { path: ["view"], examples: ["arc view tasks --current", "arc view spec --for my-work"], notes: ["for a person", "existing work unit"] },
  { path: ["errand", "open"], examples: ["arc errand open my-fix", 'arc errand open my-fix --from-inbox "Fix the formatting issue"'], notes: ["existing capture", "bold title"] },
  { path: ["errand", "next"], examples: ["arc errand next --json"], notes: ["without opening it"] },
  { path: ["sync"], examples: ["arc sync --dry-run", "arc sync"], notes: ["without invoking either leg"] },
  { path: ["user", "status"], examples: ["arc user status", "arc user status --offline --json"], notes: ["local snapshot", "identity"] },
  { path: ["review", "resolve"], examples: ["arc review resolve --schema", "arc review resolve request.json", "cat request.json | arc review resolve -"], notes: ["valid request", "actual review target"] },
  { path: ["review", "hosted", "request"], examples: ["arc review hosted request --schema", "arc review hosted request request.json"], notes: ["valid request", "emitted action unchanged", "arc review hosted await -"] },
  { path: ["release", "commit"], examples: ["arc release commit -F message.txt"], notes: ["valid commit-message file", "required approval", "forward Git arguments"] },
];

describe("workflow help examples", () => {
  it.each(pages)("documents $path examples and assumptions", async ({ path, examples, notes }) => {
    const result = await runCli([...path, "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Examples:");
    const text = result.stdout.replace(/\s+/gu, " ");
    const exampleText = (result.stdout.split("Examples:\n")[1]?.split(/\n\S/u)[0] ?? "").replace(/\s+/gu, " ");
    let offset = 0;
    for (const example of examples) {
      const position = exampleText.indexOf(example, offset);
      expect(position, example).toBeGreaterThanOrEqual(offset);
      offset = position + example.length;
    }
    expect(result.stdout.split("\n").every((line) => line.length <= 80)).toBe(true);
    for (const note of notes) expect(text).toContain(note);
    expect(result.stdout.indexOf("Examples:")).toBeLessThan(result.stdout.indexOf("Options:"));
  });

  it("states launch and commit effects before the example invocations", async () => {
    const start = await runCli(["start", "--help"]);
    const purpose = start.stdout.slice(0, start.stdout.indexOf("Examples:")).replace(/\s+/gu, " ");
    expect(purpose).toContain("isolated worktree");
    expect(purpose).toContain("plan/<name>");
    expect(purpose).toContain("commits and pushes");
    const commit = await runCli(["release", "commit", "--help"]);
    const commitPurpose = commit.stdout.slice(0, commit.stdout.indexOf("Examples:")).replace(/\s+/gu, " ");
    expect(commitPurpose).toContain("validation");
    expect(commitPurpose).toContain("required approval");
  });
});
