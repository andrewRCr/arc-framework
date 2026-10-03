/**
 * Smoke test for the subprocess CLI invocation helper.
 *
 * Confirms `runCli` spawns the built CLI, captures stdout/stderr/exitCode, and
 * resolves cleanly. The full subprocess-purity contract (stdout JSON purity
 * across representative cells) lives in subsequent tests that consume this
 * helper.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { runCli } from "../helpers/run-cli.js";

describe("runCli", () => {
  it("renders complete task-grouped root help through every explicit help entry", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-root-help-"));
    const groups = [
      "Inspect work and context:", "Plan and organize work:", "Run and resume work:",
      "Review and land work:", "Run errands and synchronize:", "Set up and maintain ARC:", "Help:",
    ];
    try {
      for (const args of [["-h"], ["--help"], ["help"]]) {
        const result = await runCli(args, { cwd });
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("Plan, run, review, and land development work with ARC.");
        expect(result.stdout).toContain("arc status --project");
        expect(result.stdout).toContain("arc start my-work");
        expect(result.stdout).toContain("arc view tasks --current");
        expect(result.stdout).toContain("--no-input");
        expect(result.stdout).toContain("--version");
        let previous = -1;
        for (const heading of groups) {
          const position = result.stdout.indexOf(heading);
          expect(position, heading).toBeGreaterThan(previous);
          previous = position;
        }
        expect(result.stdout).toContain("arc <command> --help");
        expect(result.stdout).toContain("arc review <command> --help");
        expect(result.stdout).toContain("https://github.com/andrewRCr/arc-framework#readme");
        expect(result.stdout).toContain("https://github.com/andrewRCr/arc-framework/issues");
        expect(result.stdout).not.toContain("hook-remedy-roadmap-conflict");
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("returns exit 0 and stdout containing the program name for --help", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("arc");
  });

  it("keeps bare introduction, child help, and parser errors on their native channels outside a project", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-help-context-"));
    try {
      const bare = await runCli([], { cwd });
      expect(bare.exitCode).toBe(1);
      expect(bare.stdout).toBe("");
      expect(bare.stderr).toContain("More help:");
      expect(bare.stderr).toContain("arc --help");
      expect(bare.stderr).not.toContain("Inspect work and context:");
      const child = await runCli(["start", "--help"], { cwd });
      expect(child.exitCode).toBe(0);
      expect(child.stderr).toBe("");
      expect(child.stdout).toContain("Usage: arc start");
      expect(child.stdout).toContain("commits and pushes");
      const error = await runCli(["--unknown"], { cwd });
      expect(error.exitCode).toBe(1);
      expect(error.stdout).toBe("");
      expect(error.stderr).toContain("unknown option '--unknown'");
      expect(error.stderr).not.toContain("More help:");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("documents the slug-query --fetch upgrade separately from live-default views", async () => {
    const result = await runCli(["status", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--fetch");
    expect(result.stdout.replace(/\s+/gu, " ")).toContain("upgrade the local-default query");
    expect(result.stdout.replace(/\s+/gu, " ")).toContain("skip the live-default network read");
  });

  it("explains status modes, defaults, and write effects in ordered sections", async () => {
    const result = await runCli(["status", "--help"]);
    const help = result.stdout;
    expect(result.exitCode).toBe(0);
    const headings = ["Usage:", "Examples:", "Arguments:", "Work views:", "Session context:", "Refresh:",
      "Project rendering:", "Context writes:", "Options:", "Global options:", "Defaults:", "Choose one:"];
    let previous = -1;
    for (const heading of headings) {
      expect(help.indexOf(heading), heading).toBeGreaterThan(previous);
      previous = help.indexOf(heading);
    }
    expect(help).toContain("arc status my-work --json");
    expect(help).toContain("arc status --session-init --json");
    expect(help).toMatch(/--session-handoff\s+Select handoff context; requires --json/u);
    expect(help).toMatch(/--recover\s+Select recovery context; requires --json/u);
    expect(help).toMatch(/requires omitting\s+--json/u);
    expect(help).toMatch(/write the machine-local\s+compaction\s+recovery seed/u);
    expect(help).toMatch(/Session-init does not itself select\s+JSON/u);
    expect(help).toMatch(/modes are mutually exclusive/u);
    expect(help).toContain("--no-input");
    expect(help).toContain("--version");
  });

  it("documents review request input and preserves schema discovery outside a project", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-review-help-"));
    try {
      const result = await runCli(["review", "resolve", "--help"], { cwd });
      const help = result.stdout;
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(help).toContain("Usage: arc review resolve [file | -] [--schema]");
      const headings = ["Examples:", "Arguments:", "Options:", "Global options:", "Input and output:", "Related:"];
      let previous = -1;
      for (const heading of headings) {
        expect(help.indexOf(heading), heading).toBeGreaterThan(previous);
        previous = help.indexOf(heading);
      }
      expect(help.indexOf("arc review resolve --schema")).toBeLessThan(help.indexOf("arc review resolve request.json"));
      expect(help).toContain("cat request.json | arc review resolve -");
      expect(help.replace(/\s+/gu, " ")).toContain("required unless --schema is selected");
      expect(help.split("\n").every((line) => line.length <= 80)).toBe(true);
      expect(help).toMatch(/exactly one request source or --schema/u);
      expect(help).toMatch(/actual review target and review state/u);
      expect(help).toMatch(/result is JSON\. --json is unsupported/u);
      expect(help).not.toMatch(/^\s+--json\s/mu);
      expect(help).toContain("arc review --help");
      const schema = await runCli(["review", "resolve", "--schema"], { cwd });
      expect(schema.exitCode).toBe(0);
      expect(schema.stderr).toBe("");
      expect(JSON.parse(schema.stdout)).toMatchObject({ rootId: "review-resolve-request.schema.json" });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("documents directly composable hosted-review and merge-lock JSON inputs", async () => {
    const hostedRequest = await runCli(["review", "hosted", "request", "--help"]);
    const hostedAwait = await runCli(["review", "hosted", "await", "--help"]);
    const terminus = await runCli(["review", "terminus", "accept", "--help"]);
    const lockResolve = await runCli(["merge", "lock", "resolve", "--help"]);
    const lockRelease = await runCli(["merge", "lock", "release", "--help"]);

    for (const result of [hostedRequest, hostedAwait, terminus, lockResolve, lockRelease]) {
      expect(result.exitCode).toBe(0);
    }
    expect(hostedRequest.stdout).toContain("emitted action unchanged");
    expect(hostedAwait.stdout).toContain("emitted action unchanged");
    expect(terminus.stdout).toContain('"judgment":{"mode":"owner-accepted"}');
    expect(lockResolve.stdout).toContain('{"schemaVersion":1,"treeRoot":"/absolute/checkout"}');
    expect(lockRelease.stdout).toContain('"vehicle":{"kind":"errand","slug":"example"}');
  });

  it("reserves bare integrate for procedures and points publication scheduling to publish", async () => {
    const result = await runCli(["integrate"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("`arc integrate` is a procedure namespace");
    expect(result.stderr).toContain("use `arc publish` to schedule publication");
    expect(result.stderr).toContain("Available subcommands:");
    expect(result.stderr).toContain("arc integrate checkpoint");
  });

  it("emits typed missing-project refusals for integration mutators and rejects `--json`", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-integration-cli-outside-"));
    const oid = "a".repeat(40);
    const checkpoint = `checkpoint-v1:${oid}:sha256:${"b".repeat(64)}`;
    try {
      for (const args of [
        ["integrate", "checkpoint", "example"],
        ["integrate", "merge", "example", "--checkpoint", checkpoint],
        ["base", "merge", "--expected-base", oid, "--expected-head", oid],
      ]) {
        const result = await runCli(args, { cwd });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(result.stdout)).toMatchObject({ state: "blocked", nextAction: "stop" });
      }

      // These verbs always emit their typed result, so the retired flag is no longer accepted.
      for (const args of [
        ["integrate", "checkpoint", "example", "--json"],
        ["integrate", "merge", "example", "--checkpoint", checkpoint, "--json"],
        ["base", "merge", "--expected-base", oid, "--expected-head", oid, "--json"],
      ]) {
        const result = await runCli(args, { cwd });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("unknown option '--json'");
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
