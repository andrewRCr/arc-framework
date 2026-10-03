/** Help context and native Commander formatting contracts. */

import { Command, Option } from "commander";
import { describe, expect, it } from "vitest";

import { applyArcHelp, configureArcHelp } from "../../../src/lib/cli-help.js";

function program(): Command {
  const command = new Command().name("arc").option("--no-input", "Forbid ambient input").version("1.0.0");
  configureArcHelp(command);
  return command;
}

describe("ARC help", () => {
  it("groups status options in task order without changing registration order", () => {
    const root = program();
    const status = root.command("status [slug]");
    for (const flag of ["--session-init", "--session-handoff", "--recover", "--user", "--project", "--fetch", "--local",
      "--no-fetch", "--staged", "--write", "--write-compaction-seed", "--json"]) status.option(flag, flag);
    const order = status.options.map((option) => option.flags);
    applyArcHelp(root);
    const help = status.helpInformation();
    const headings = ["Examples:", "Work views:", "Session context:", "Refresh:", "Project rendering:",
      "Context writes:", "Options:", "Global options:", "Defaults:", "Choose one:"];
    for (let index = 1; index < headings.length; index += 1) {
      expect(help.indexOf(headings[index] ?? "")).toBeGreaterThan(help.indexOf(headings[index - 1] ?? ""));
    }
    expect(help).toMatch(/Work views:\n\s+--project[^]*--user/u);
    expect(status.options.map((option) => option.flags)).toEqual(order);
  });

  it("shows a concise introduction only for bare error help without running actions", async () => {
    const root = program();
    let stdout = "";
    let stderr = "";
    root.configureOutput({ writeOut: (text) => { stdout += text; }, writeErr: (text) => { stderr += text; } });
    root.exitOverride();
    root.command("status").description("Inspect state").action(() => { throw new Error("Operational action reached"); });
    root.hook("preAction", () => { throw new Error("Operational hook reached"); });
    applyArcHelp(root);
    await expect(root.parseAsync([], { from: "user" })).rejects.toMatchObject({ code: "commander.help", exitCode: 1 });
    expect(stdout).toBe("");
    expect(stderr).toContain("More help:");
    expect(stderr).toContain("arc status --project");
    expect(stderr).not.toContain("Inspect work and context:");
    expect(stderr).not.toContain("Learn more:");
  });

  it("keeps explicit help complete and native syntax while sorting only its display", () => {
    const root = program();
    root.command("review").description("Resolve review work");
    root.command("view [kind]").description("Display work");
    root.command("status <slug>").option("--json", "Emit JSON");
    root.command("secret", { hidden: true });
    const registrationOrder = root.commands.map((command) => command.name());
    applyArcHelp(root);
    const help = root.helpInformation();
    expect(help).toContain("Inspect work and context:");
    expect(help).toContain("status [options] <slug>");
    expect(help.indexOf("status [options]")).toBeLessThan(help.indexOf("view [kind]"));
    expect(help.indexOf("view [kind]")).toBeLessThan(help.indexOf("Review and land work:"));
    expect(help).toContain("Help:");
    expect(help).not.toContain("secret");
    expect(root.commands.map((command) => command.name())).toEqual(registrationOrder);
  });

  it("shows inherited options, local defaults and hidden visibility through native helpers at 80 columns", () => {
    const root = program();
    const child = root.command("archive <slug>").description(
      "Archive a shipped work unit while preserving its dated artifact path and recorded integration evidence.",
    );
    child.option("--mode <name>", "Select archival mode", "manual");
    child.addOption(new Option("--private", "Hidden option").hideHelp());
    applyArcHelp(root);
    const help = child.helpInformation();
    expect(help).toContain("Global options:");
    expect(help).toContain("--no-input");
    expect(help).toContain("--version");
    expect(help).toContain('(default: "manual")');
    expect(help).not.toContain("--private");
    expect(help).toMatch(/recorded integration\s+evidence/u);
    expect(help.split("\n").every((line) => line.length <= 80)).toBe(true);
  });

  it("keeps ordinary parser errors out of the bare introduction", async () => {
    const root = program();
    let stderr = "";
    root.configureOutput({ writeErr: (text) => { stderr += text; } });
    root.exitOverride().showHelpAfterError();
    root.command("status");
    applyArcHelp(root);
    await expect(root.parseAsync(["--unknown"], { from: "user" })).rejects.toMatchObject({ code: "commander.unknownOption" });
    expect(stderr).toContain("unknown option '--unknown'");
    expect(stderr).toContain("Inspect work and context:");
    expect(stderr).not.toContain("More help:");
  });

  it("keeps long stdin examples from disabling native option wrapping at 80 columns", () => {
    const root = program();
    const resolve = root.command("review").command("resolve");
    resolve.argument("[input]", "Versioned JSON request file, or - for stdin; required unless --schema is selected");
    resolve.option("--schema", "Print the request schema and referenced definitions; use without request input");
    applyArcHelp(root);
    const help = resolve.helpInformation();
    expect(help).toContain("cat request.json | arc review resolve -");
    expect(help.split("\n").every((line) => line.length <= 80)).toBe(true);
    expect(help.replace(/\s+/gu, " ")).toContain("referenced definitions; use without request input");
  });
});
