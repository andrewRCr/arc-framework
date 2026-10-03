/** Derived command-tree coverage and rendered namespace navigation contracts. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Command } from "commander";
import { beforeAll, describe, expect, it } from "vitest";

import { applyArcHelp, configureArcHelp } from "../../../src/lib/cli-help.js";
import { COMMAND_HELP, HELP_GROUPS } from "../../../src/lib/cli-help-content.js";
import { scanCommanderSource, type CommanderSourceScan } from "../../../src/lib/command-input/source-scanner.js";

const namespaces: Readonly<Record<string, readonly (readonly [string, readonly string[]])[]>> = {
  review: [
    ["Choose review work:", ["pre-publication", "resolve", "changeset"]],
    ["Run and respond:", ["frontline", "hosted", "local", "respond", "reduce", "terminus"]],
    ["Check readiness:", ["status", "readiness", "checks", "change-request", "merge-method"]],
    ["Clear planning changes:", ["planning-lane", "planning-grooming"]],
  ],
  user: [
    ["Inspect and synchronize:", ["status", "sync", "save", "load", "push", "fetch", "pull"]],
    ["Manage workspaces:", ["add", "open", "close"]],
    ["Maintain notes and inbox:", ["compact", "reconcile-references", "inbox-mark-execute-bound", "inbox-remove"]],
  ],
  errand: [
    ["Find and open work:", ["next", "check", "open", "link", "materialize"]],
    ["Pause and finish work:", ["leave", "merge", "close", "abandon", "promote"]],
  ],
  release: [
    ["Commit and push:", ["commit", "push"]],
    ["Configure and inspect:", ["status", "opt-in", "opt-out", "setup"]],
  ],
  delivery: [
    ["Prepare and transfer plans:", ["entry", "plan", "authoring", "eligibility", "compose", "transfer"]],
    ["Publish and inspect:", ["publish", "native", "position", "checks"]],
    ["Refresh and repair:", ["refresh", "review-fix", "reconcile", "rewrite", "rematerialize", "top-remedy"]],
    ["Land and clean up:", ["land", "teardown", "closeout"]],
  ],
};

function missingSummaries(scan: CommanderSourceScan): string[] {
  return scan.commands.filter((command) => !command.hidden && !COMMAND_HELP[command.path]?.summary?.trim())
    .map((command) => command.path);
}

function tree(scan: CommanderSourceScan): Map<string, Command> {
  const root = new Command().name("arc");
  configureArcHelp(root);
  const commands = new Map([["", root]]);
  const parentsFirst = [...scan.commands].sort((a, b) => a.path.split(" ").length - b.path.split(" ").length);
  for (const entry of parentsFirst) {
    const parts = entry.path.split(" ");
    const name = parts.pop() ?? "";
    const parent = commands.get(parts.join(" "));
    if (parent === undefined) throw new Error(`Missing parent for ${entry.path}`);
    commands.set(entry.path, parent.command(name, { hidden: entry.hidden }).description(`Purpose for ${entry.path}`));
  }
  applyArcHelp(root);
  return commands;
}

describe("help inventory", () => {
  let source: string;
  let scan: CommanderSourceScan;
  beforeAll(async () => {
    source = await readFile(resolve(import.meta.dirname, "../../../src/cli.ts"), "utf8");
    scan = scanCommanderSource({ file: "cli.ts", sourceText: source });
  });

  it("has intentional summaries for the entire visible registered tree", () => {
    expect(missingSummaries(scan)).toEqual([]);
    const visible = scan.commands.filter((command) => !command.hidden).map((command) => command.path).sort();
    expect(Object.keys(COMMAND_HELP).filter((path) => path !== "").sort()).toEqual(visible);
  });

  it("detects newly registered visible commands and excludes hidden commands", () => {
    const changed = scanCommanderSource({ file: "cli.ts", sourceText: source
      + '\nprogram.command("new-visible");\nprogram.command("new-hidden", { hidden: true });\n' });
    expect(missingSummaries(changed)).toEqual(["new-visible"]);
  });

  it("explains file/stdin and JSON output on registered request pages without copying schemas", () => {
    const requests = scan.commands.filter((command) => command.options.some((option) => option.flags === "--schema")
      || command.operands.some((operand) => operand.name === "input" && operand.required));
    expect(requests.length).toBeGreaterThan(0);
    for (const command of requests) {
      const page = COMMAND_HELP[command.path];
      const notes = [...(page?.notes ?? []), ...(page?.examples ?? [])].map(([, text]) => text).join(" ");
      expect(notes, command.path).toContain("stdin");
      expect(notes, command.path).toContain("JSON");
      if (command.options.some((option) => option.flags === "--schema")) expect(notes, command.path).toContain("--schema");
    }
  });

  it.each(["", ...Object.keys(namespaces)])("exactly covers immediate visible children of %s", (path) => {
    const members = HELP_GROUPS[path]?.flatMap(([, names]) => names) ?? [];
    const prefix = path === "" ? "" : `${path} `;
    const children = scan.commands.filter((command) => !command.hidden && command.path.startsWith(prefix)
      && !command.path.slice(prefix.length).includes(" ")).map((command) => command.path.slice(prefix.length));
    expect([...members].sort()).toEqual(children.sort());
    expect(new Set(members).size).toBe(members.length);
  });

  it.each(Object.entries(namespaces))("renders %s in the settled group and member order", (path, groups) => {
    const help = tree(scan).get(path)?.helpInformation() ?? "";
    let previous = -1;
    for (const [heading, members] of [...groups, ["Help:", ["help"]] as const]) {
      expect(help.indexOf(heading), heading).toBeGreaterThan(previous);
      previous = help.indexOf(heading);
      const section = help.split(`${heading}\n`)[1]?.split(/\n\S/u)[0] ?? "";
      const names = [...section.matchAll(/^ {2}([a-z][a-z0-9-]*)/gmu)].map((match) => match[1]);
      expect(names, heading).toEqual(members);
    }
  });
});
