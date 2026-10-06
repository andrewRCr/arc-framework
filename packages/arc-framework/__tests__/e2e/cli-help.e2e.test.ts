/** Complete built-CLI navigation coverage derived from the registered command tree. */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { HELP_GROUPS } from "../../src/lib/cli-help-content.js";
import { scanCommanderSource } from "../../src/lib/command-input/source-scanner.js";
import { runCli } from "../helpers/run-cli.js";

describe("built CLI navigation", () => {
  it.each(["", "review", "user", "errand", "release", "delivery"])("covers every child exactly once in %s help", async (path) => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-inventory-help-"));
    try {
      const result = await runCli([...path.split(" ").filter(Boolean), "--help"], { cwd });
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.split("\n").every((line) => line.length <= 80)).toBe(true);
      const groups = [...(HELP_GROUPS[path] ?? []), ["Help:", ["help"]] as const];
      const listed: (string | undefined)[] = [];
      let previous = -1;
      for (const [heading, members] of groups) {
        expect(result.stdout.indexOf(heading), heading).toBeGreaterThan(previous);
        previous = result.stdout.indexOf(heading);
        const section = result.stdout.split(`${heading}\n`)[1]?.split(/\n\S/u)[0] ?? "";
        const names = [...section.matchAll(/^ {2}([a-z][a-z0-9-]*)/gmu)].map((match) => match[1]);
        expect(names, heading).toEqual(members);
        listed.push(...names);
      }
      const source = await readFile(resolve(import.meta.dirname, "../../src/cli.ts"), "utf8");
      const scan = scanCommanderSource({ file: "cli.ts", sourceText: source });
      const prefix = path === "" ? "" : `${path} `;
      const children = scan.commands.filter((command) => !command.hidden && command.path.startsWith(prefix)
        && !command.path.slice(prefix.length).includes(" ")).map((command) => command.path.slice(prefix.length));
      expect(listed.sort()).toEqual([...children, "help"].sort());
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("keeps deep command purposes, inherited flags, and structured-request discovery", async () => {
    const help = await runCli(["review", "local", "prepare", "--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("Derive and prepare one immutable local review as JSON");
    expect(help.stdout).toContain("--schema");
    expect(help.stdout).toContain("Global options:");
    expect(help.stdout).toContain("--no-input");
    expect(help.stdout).toContain("--version");
    expect(help.stdout.replace(/\s+/gu, " ")).toContain("Provide exactly one JSON request file, - for stdin, or --schema");
    expect(help.stdout).not.toMatch(/^\s+--json\s/mu);
    const delivery = await runCli(["delivery", "authoring", "locate", "--help"]);
    expect(delivery.exitCode).toBe(0);
    expect(delivery.stdout).toContain("<input>");
    expect(delivery.stdout.replace(/\s+/gu, " ")).toContain("Read one JSON request from a file or - for stdin");
    expect(delivery.stdout).toContain("The command result is JSON");
    expect(delivery.stdout).not.toContain("--schema");
    const errand = await runCli(["errand", "merge", "--help"]);
    expect(errand.exitCode).toBe(0);
    expect(errand.stdout.replace(/\s+/gu, " ")).toContain("Use --json for the typed result; otherwise render the terminal outcome");
  });
});
