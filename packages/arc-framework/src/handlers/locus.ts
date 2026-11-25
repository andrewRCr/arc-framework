/** Handler boundary for the read-only `arc locus` command. */

import { formatLocusEnvelope, validateLocusEnvelope, type LocusEnvelope } from "../commands/locus.js";
import { resolveIdentity } from "../lib/git/index.js";
import { gitExec } from "../lib/io-context.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { requireArcProjectRoot } from "./shared.js";
import { runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";

export interface LocusCliOptions {
  json?: boolean;
}

/** The read-only command has no value-bearing operand or option registration. */
export const locusCommandInputRegistrations = [] as const satisfies readonly CommandInputRegistration[];

/** Machine-output policy owned by the locus command adapter. */
export const locusCommandInputPolicyDeclarations = [{
  commandPath: "locus",
  aliases: [],
  sites: [declareCliOptionSite("json", {
    acquisition: "machine-mode", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })],
}] satisfies readonly CommandInputDeclaration[];

export interface LocusCliOutput {
  stdout(text: string): void;
  stderr(text: string): void;
  exit(code: number): void;
}

export interface LocusCliDependencies {
  read(): Promise<LocusEnvelope>;
  output: LocusCliOutput;
}

/** Emit exactly one validated derived roster envelope or one human display. */
export async function runLocusCli(
  options: LocusCliOptions,
  dependencies: LocusCliDependencies,
): Promise<void> {
  const envelope = validateLocusEnvelope(await dependencies.read());
  if (options.json) dependencies.output.stdout(`${JSON.stringify(envelope)}\n`);
  else if (envelope.ok) dependencies.output.stdout(formatLocusEnvelope(envelope));
  else dependencies.output.stderr(`Error [${envelope.error.code}]: ${envelope.error.message}\n`);
  dependencies.output.exit(envelope.ok ? 0 : 1);
}

/** Bind the public reader to topology, marker, lifecycle, and identity evidence. */
export async function handleLocus(options: LocusCliOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const identity = await resolveIdentity({ exec: gitExec });
  const { settings } = await readConfigSettings(cwd);
  await runLocusCli(options, {
    read: async () => {
      if (identity === null) {
        return {
          mode: "locus",
          ok: false,
          error: { code: "identity-missing", message: "No ARC identity is configured." },
        };
      }
      try {
        return {
          mode: "locus",
          ok: true,
          ...await runDerivedLocusStateProbe({
            cwd,
            identity,
            baseBranch: settings["branch.base"],
            exec: gitExec,
          }),
        };
      } catch (error) {
        return {
          mode: "locus",
          ok: false,
          error: {
            code: "locus-read-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    output: {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      exit: (code) => { process.exitCode = code; },
    },
  });
}
