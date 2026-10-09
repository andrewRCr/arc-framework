/** Commander and process boundary for declared check requests. */
import { z } from "zod";
import { execa } from "execa";
import { readFile } from "node:fs/promises";
import { atomicCreateFile } from "../../lib/fs.js";
import { checkRecordDirectory, createCheckPassStore } from "../../lib/checks/record.js";
import { CheckDeclarationSchema } from "../../lib/checks/declaration.js";
import { readTypedProjectFile } from "../../lib/config/typed-file-reader.js";
import { createGitExec } from "../../lib/io-context.js";
import { createExecaGitExecInput, environmentForGitCwd } from "../../lib/git/process-executor.js";
import type { InteractionContext } from "../../lib/command-input/interaction-context.js";
import { declareCliOptionSite, declareInteractionSite, type CommandInputDeclaration } from "../../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../../lib/command-input/registry.js";
import { runCheckIncrement, type RunDeclaredChecksResult } from "./run.js";
import { renderDeclaredChecks } from "./run-output.js";

/** Public syntax of an increment-boundary check request. */
export const CheckIncrementInputSchema = z.strictObject({ json: z.boolean().optional(), force: z.boolean().optional() });
export type CheckIncrementOptions = z.infer<typeof CheckIncrementInputSchema>;

/** Input registration owned by the check adapter. */
export const checkIncrementInputRegistration = {
  commandPath: "check increment", schema: CheckIncrementInputSchema,
  schemaFields: { "option.json": "json", "option.force": "force" },
} satisfies CommandInputRegistration;

/** Explicit machine and subprocess policies for the check command. */
export const checkIncrementInputPolicyDeclarations = [{
  commandPath: "check increment", aliases: [], sites: [
    declareCliOptionSite("json", {
      acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json", cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection", subprocess: "none",
    }),
    declareCliOptionSite("force", {
      acquisition: "optional", schemaOwnership: "owned", schemaField: "force", cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--force"], acceptedSyntax: [] },
      mutationBoundary: "declared check execution", subprocess: "none",
    }),
    ...([1, 3] as const).map(occurrence => declareInteractionSite(
      { file: "lib/git/process-executor.ts", kind: "subprocess", callee: "execa", occurrence },
      {
        acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "disable-terminal-input", flags: [], acceptedSyntax: [] },
        mutationBoundary: "check repository snapshot", subprocess: "terminal-prompts",
      },
    )),
    declareInteractionSite(
      { file: "handlers/check/run-cli.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
      {
        acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "same", flags: [], acceptedSyntax: [] },
        mutationBoundary: "declared check execution", subprocess: "close-stdin",
      },
    ),
  ],
}] satisfies readonly CommandInputDeclaration[];

/**
 * Execute an increment request through real repository I/O.
 * @param options - Commander output options
 * @param interaction - Invocation-bound process policy
 * @returns Resolves after writing output and assigning process exit state
 */
export async function handleCheckIncrement(options: CheckIncrementOptions, interaction: InteractionContext): Promise<void> {
  const input = CheckIncrementInputSchema.parse(options);
  const git = createGitExec(interaction.subprocess);
  let outcome: RunDeclaredChecksResult;
  try {
    const root = (await git("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })).stdout;
    outcome = await runCheckIncrement(root, {
      git, gitInput: createExecaGitExecInput(undefined, interaction.subprocess),
      passes: createCheckPassStore({ directory: () => checkRecordDirectory(git, root),
        readFile: path => readFile(path, "utf8"), createFile: atomicCreateFile }),
      readDeclaration: repository => readTypedProjectFile(repository, "check-declaration", CheckDeclarationSchema),
      execute: async (command, cwd) => {
        const result = await execa(command[0] ?? "", command.slice(1), {
          cwd, env: environmentForGitCwd(cwd), extendEnv: false, stdin: "ignore", reject: false,
        });
        return { exitCode: result.exitCode ?? 1, output: [result.stdout, result.stderr].filter(Boolean).join("\n") };
      },
    }, input);
  } catch (error) {
    outcome = { kind: "error", exitCode: 2, error: { kind: "refused", message: String(error) } };
  }
  const rendered = renderDeclaredChecks(outcome, input.json === true);
  if (outcome.kind === "error" && !input.json) process.stderr.write(rendered);
  else process.stdout.write(rendered);
  process.exitCode = outcome.exitCode;
}
