/**
 * Handler for local base-branch operations.
 *
 * @module
 */

import * as p from "@clack/prompts";

import {
  createCurrentBaseDriftAdapters,
  workUnitPathTreatmentContext,
} from "../lib/base-drift/current-adapters.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { runBaseDrift, type BaseDriftResult } from "../lib/git/base-distance.js";
import { composeUnavailableRegister } from "../lib/git/base-drift-register.js";
import { syncLocalBase, type BaseSyncResult } from "../lib/git/base-sync.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { createGitExec } from "../lib/io-context.js";
import { resolveArcRoot } from "../lib/paths.js";
import { locusWorkUnitAtPath } from "../lib/session-init/locus-classification.js";
import { createBaseMergePort } from "../scripts/base/merge-composition.js";
import {
  BaseMergeInputSchema,
  BaseMergeResultSchema,
  mergeExpectedBase,
  type BaseMergeResult,
} from "../scripts/base/merge.js";
import { requireArcProjectRoot } from "./shared.js";
import { readIdentityPointers } from "./identity-pointers.js";
import { runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";

/** Options for `arc base sync`. */
export interface BaseSyncOptions {
  /** Emit the typed synchronization outcome as JSON. */
  json?: boolean;
}

/** Options for `arc base drift`. */
export interface BaseDriftOptions {
  /** Emit the complete typed analysis as JSON. */
  json?: boolean;
}

/** Options for `arc base merge`. */
export interface BaseMergeOptions {
  /** Exact freshly observed base revision the merge is allowed to append. */
  expectedBase: string;
  /** Exact checkpoint Candidate head the merge is allowed to extend. */
  expectedHead: string;
  /** Emit the typed merge outcome as JSON. */
  json?: boolean;
}

const baseJsonPolicy = declareCliOptionSite("json", {
  acquisition: "machine-mode", schemaOwnership: "none", cancellation: "not-applicable",
  automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
  mutationBoundary: "output selection", subprocess: "none",
});

/** Machine-output policies owned by the base command adapters. */
export const baseCommandInputPolicyDeclarations = [
  { commandPath: "base drift", aliases: [], sites: [baseJsonPolicy] },
  { commandPath: "base merge", aliases: [], sites: [baseJsonPolicy] },
  { commandPath: "base sync", aliases: [], sites: [baseJsonPolicy] },
] satisfies readonly CommandInputDeclaration[];

/** Command-owned schema registrations for base operations. */
export const baseCommandInputRegistrations = [{
  commandPath: "base merge",
  schema: BaseMergeInputSchema,
  schemaFields: {
    "option.expected-base": "expectedBase",
    "option.expected-head": "expectedHead",
  },
}] as const satisfies readonly CommandInputRegistration[];

export interface BaseMergeHandlerDependencies {
  resolveRoot(): string | null;
  merge(cwd: string, expectedBase: string, expectedHead: string): Promise<BaseMergeResult>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/** Run the exact-base append-only merge procedure. */
export async function handleBaseMerge(
  options: BaseMergeOptions,
  interaction?: InteractionContext,
  overrides: Partial<BaseMergeHandlerDependencies> = {},
): Promise<void> {
  const exec = createGitExec(interaction?.subprocess);
  const dependencies: BaseMergeHandlerDependencies = {
    resolveRoot: () => resolveArcRoot(),
    merge: async (root, expectedBase, expectedHead) => {
      const { settings, warnings } = await readConfigSettings(root);
      if (warnings.some((warning) => warning.startsWith("Unable to read arc-config.yml:"))) {
        throw new Error("The configured base branch is unavailable because arc-config.yml could not be read.");
      }
      return mergeExpectedBase(
        { expectedBase, expectedHead },
        createBaseMergePort({ cwd: root, baseBranch: settings["branch.base"], exec }),
      );
    },
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
  const parsed = BaseMergeInputSchema.safeParse({
    expectedBase: options.expectedBase,
    expectedHead: options.expectedHead,
  });
  if (!parsed.success) {
    dependencies.write(`${JSON.stringify(BaseMergeResultSchema.parse({
      schemaVersion: 1,
      mode: "base-merge",
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
      detail: parsed.error.issues.map(({ message }) => message).join("; "),
      expectedBase: null,
      expectedHead: null,
    }))}\n`);
    dependencies.setExitCode(64);
    return;
  }
  const cwd = dependencies.resolveRoot();
  if (cwd === null) {
    dependencies.write(`${JSON.stringify(BaseMergeResultSchema.parse({
      schemaVersion: 1,
      mode: "base-merge",
      state: "blocked",
      nextAction: "stop",
      reason: "operational-failure",
      detail: "Not inside an ARC project.",
      expectedBase: parsed.data.expectedBase,
      expectedHead: parsed.data.expectedHead,
    }))}\n`);
    dependencies.setExitCode(1);
    return;
  }
  let result: BaseMergeResult;
  try {
    result = await dependencies.merge(cwd, parsed.data.expectedBase, parsed.data.expectedHead);
  } catch (error) {
    result = {
      schemaVersion: 1,
      mode: "base-merge",
      state: "blocked",
      nextAction: "stop",
      reason: "operational-failure",
      detail: error instanceof Error ? error.message : String(error),
      expectedBase: parsed.data.expectedBase,
      expectedHead: parsed.data.expectedHead,
    };
  }
  dependencies.write(`${JSON.stringify(BaseMergeResultSchema.parse(result))}\n`);
  if (result.state === "blocked") dependencies.setExitCode(1);
}

/** Run the authoritative shared base-drift analyzer. */
export async function handleBaseDrift(opts: BaseDriftOptions, interaction?: InteractionContext): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const exec = createGitExec(interaction?.subprocess);

  const config = await readConfigSettings(cwd);
  const configUnavailable = config.warnings.some(
    (warning) => warning.startsWith("Unable to read arc-config.yml:"),
  );
  const result: BaseDriftResult = configUnavailable
    ? {
        mode: "authoritative",
        verdict: "unavailable",
        state: "remote-unavailable",
        ahead: 0,
        behind: 0,
        base: null,
        baseOid: null,
        unavailableReason: "config-unavailable",
        integrationEvidence: null,
        overlap: null,
        register: composeUnavailableRegister(null, "config-unavailable"),
        failureReason: "error",
      }
    : await (async () => {
        const { identity } = await readIdentityPointers(exec);
        let treatmentContext = {};
        if (identity !== null) {
          try {
            const frame = await runDerivedLocusStateProbe({
              cwd,
              identity,
              baseBranch: config.settings["branch.base"],
              exec,
            });
            const row = frame.entering.kind === "selected" ? frame.entering.row : null;
            const workUnit = row === null ? null : locusWorkUnitAtPath(frame.roster, row.checkout.path);
            treatmentContext = workUnit === null ? {} : workUnitPathTreatmentContext(workUnit.name);
          } catch {
            treatmentContext = {};
          }
        }
        return runBaseDrift({
          exec,
          baseBranch: config.settings["branch.base"],
          mode: "authoritative",
          ...createCurrentBaseDriftAdapters(
            exec,
            treatmentContext,
          ),
        });
      })();

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    p.intro("arc base drift");
    if (result.verdict === "clean") {
      p.note(
        `Base \`${result.base ?? "base"}\` is current at \`${result.baseOid ?? "unknown"}\`.`,
        "Base current",
      );
    } else if (result.register !== null) {
      const render = result.verdict === "unavailable" ? p.log.error : p.note;
      render(result.register.text, result.verdict === "reconcile" ? "Base reconciliation" : undefined);
    }
    p.outro(result.verdict === "unavailable" ? "Unavailable." : "Done.");
  }
  if (result.verdict === "unavailable") process.exitCode = 1;
}

function refusalMessage(result: Extract<BaseSyncResult, { status: "refused" }>): string {
  switch (result.reason) {
    case "no-remote":
      return "No `origin` remote is configured.";
    case "fetch-timeout":
      return `Fetching \`origin/${result.base}\` timed out; no local ref changed.`;
    case "fetch-failed":
      return `Could not fetch \`origin/${result.base}\`; no local ref changed.`;
    case "remote-base-missing":
      return `Remote base \`origin/${result.base}\` could not be resolved.`;
    case "distance-unavailable":
      return `Could not compare \`${result.base}\` with its remote; no local ref changed.`;
    case "local-ahead":
      return `Local base \`${result.base}\` is ahead of its remote; refusing to discard commits.`;
    case "diverged":
      return `Local base \`${result.base}\` has diverged from its remote; refusing a non-fast-forward update.`;
    case "worktree-list-failed":
      return "Could not determine whether the base is checked out; refusing an unsafe ref update.";
    case "dirty-base-worktree":
      return `Base worktree at \`${result.worktreePath}\` is dirty; commit or stash its changes first.`;
    case "base-moved":
      return `Local base \`${result.base}\` moved during synchronization; retry from fresh state.`;
    case "update-failed":
      return `Git refused the fast-forward of \`${result.base}\`; inspect the base worktree and retry.`;
  }
}

/** Run `arc base sync`. */
export async function handleBaseSync(opts: BaseSyncOptions, interaction?: InteractionContext): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const exec = createGitExec(interaction?.subprocess);

  const { settings } = await readConfigSettings(cwd);
  const result = await syncLocalBase({ exec, baseBranch: settings["branch.base"] });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status === "refused" || result.status === "cleanup-required") process.exitCode = 1;
    return;
  }

  p.intro("arc base sync");
  if (result.status === "updated") {
    const locus = result.method === "managed-worktree"
      ? "a temporary managed worktree"
      : `the clean worktree at \`${result.worktreePath}\``;
    p.note(
      `Fast-forwarded \`${result.base}\` from \`${result.from ?? "[missing]"}\` to \`${result.to}\` through ${locus}.`,
      "Base synchronized",
    );
  } else if (result.status === "unchanged") {
    p.note(`Local base \`${result.base}\` already matches \`origin/${result.base}\`.`, "Base already current");
  } else if (result.status === "cleanup-required") {
    const updateState = result.baseUpdated ? "was updated" : "was not updated";
    p.log.error(
      `Local base \`${result.base}\` ${updateState}, but the temporary worktree at `
      + `\`${result.worktreePath}\` could not be removed. Remove it with `
      + `\`git worktree remove --force --force ${result.worktreePath}\`.`,
    );
    process.exitCode = 1;
  } else {
    p.log.error(refusalMessage(result));
    process.exitCode = 1;
  }
  p.outro("Done.");
}
