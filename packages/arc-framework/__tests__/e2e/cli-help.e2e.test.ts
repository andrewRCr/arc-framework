/** Complete built-CLI navigation coverage derived from the registered command tree. */

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { HELP_GROUPS } from "../../src/lib/cli-help-content.js";
import { scanCommanderSource } from "../../src/lib/command-input/source-scanner.js";
import { runCli } from "../helpers/run-cli.js";

describe("built CLI navigation", () => {
  it("rejects the retired extension command and omits it from root help", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-retired-command-"));
    try {
      await mkdir(join(cwd, ".arc/system/extensions"), { recursive: true });
      await mkdir(join(cwd, ".arc/system/workflows"), { recursive: true });
      const removed = await runCli(["extensions", "status", "--json"], { cwd });
      expect(removed.exitCode).toBe(1);
      expect(removed.stderr).toContain("unknown command 'extensions'");
      const help = await runCli(["--help"], { cwd });
      expect(help.exitCode).toBe(0);
      expect(help.stdout).not.toMatch(/^ {2}extensions\b/mu);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

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

  it("explains when materialize --here switches branches and when it preserves HEAD", async () => {
    const help = await runCli(["materialize", "--help"]);
    expect(help.exitCode).toBe(0);
    const here = help.stdout.match(/^ +--here\b.*(?:\n {4,}\S.*)*/mu)?.[0].replace(/\s+/gu, " ");
    expect.soft(here).toMatch(/(?:checks? out|switch(?:es)? to).*linked branch|linked branch.*checked out/iu);
    expect.soft(here).toMatch(/(?:keep|preserv|leav)\w*.*HEAD|HEAD.*(?:unchanged|preserved)/iu);
  });

  it("lists store commands and keeps import out of migration help", async () => {
    const help = await runCli(["store", "--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stderr).toBe("");
    expect(help.stdout.split("\n").every((line) => line.length <= 80)).toBe(true);
    expect(help.stdout).toMatch(/^ {2}repair-review-roots\b[^\n]*\s+Preview or select\b/mu);
    expect(help.stdout).toMatch(/^ {2}conflict\b[^\n]*\s+Inspect or explicitly\b/mu);
    expect(help.stdout).toMatch(/^ {2}migrate\b[^\n]*\s+Move stored state\b/mu);
    expect(help.stdout).toMatch(/^ {2}remote\b[^\n]*\s+Inspect or set\b/mu);
    const migrate = await runCli(["store", "migrate", "--help"]);
    expect(migrate.exitCode).toBe(0);
    expect(migrate.stderr).toBe("");
    expect(migrate.stdout).toContain("--leave-source");
    expect(migrate.stdout).not.toContain("--import");
  });

  it("explains that partial close removes an inbox entry only if its recorded version or digest matches", async () => {
    const help = await runCli(["errand", "close", "--help"]);
    expect(help.exitCode).toBe(0);
    const purpose = help.stdout.split("\nOptions:")[0]?.replace(/\s+/gu, " ").trim();
    const partial = purpose?.match(/\bpartial\b[^.]+/iu)?.[0];
    expect(partial).toMatch(/remov\w*[^.]*\binbox\b[^.]*\bonly if\b/iu);
    const condition = partial?.split(/\bonly if\b/iu)[1];
    expect(condition).toMatch(/\bversion\b[^.]*\bor\b[^.]*\bdigest\b/iu);
    expect(condition).toMatch(/\bmatch\w*\b/iu);
  });

  it("distinguishes full-protection adoption by ID from inbox removal at close for a title", async () => {
    const help = await runCli(["errand", "close", "--help"], { env: { ARC_IN_REPO_STORE: "1" } });
    expect(help.exitCode).toBe(0);
    const purpose = help.stdout.split("\nOptions:")[0]?.replace(/\s+/gu, " ").trim();
    expect.soft(purpose).toMatch(/\bfull protection\b[^.]*\bmov\w*\b[^.]*\bdescription\b[^.]*\bopen\w*\b[^.]*\bID\b/iu);
    expect.soft(purpose).toMatch(/\bclose\b[^.]*\bremov\w*\b[^.]*\bopen\w*\b[^.]*\btitle\b/iu);
  });

  it("scopes title-based inbox removal at close and explains when import moves the capture", async () => {
    const help = await runCli(["errand", "close", "--help"]);
    expect(help.exitCode).toBe(0);
    const purpose = help.stdout.split("\nOptions:")[0]?.replace(/\s+/gu, " ").trim();
    expect.soft(purpose).toMatch(/\bbranch-backed\b[^.]*\bclose\b[^.]*\bremov\w*\b[^.]*\btitle\b[^.]*\binbox\b/iu);
    expect.soft(purpose).toMatch(/\bimport\b[^.]*\bmov\w*\b[^.]*\bunique\b[^.]*\btitle\b[^.]*\binbox\b[^.]*\bdescription\b/iu);
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
