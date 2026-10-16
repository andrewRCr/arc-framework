/** Ambient context, executor binding, and reporting shared by lifecycle command adapters. */

import { readFile, readdir } from "node:fs/promises";
import type { Remedy } from "../lib/store/refusal.js";
import type { StoreRefusal } from "../lib/store/refusal.js";
import { quoteShellArgument } from "../lib/release/commit-message-retry.js";
import { createStore } from "../lib/store/create.js";
import { createDefaultStorePorts } from "../lib/store/default-ports.js";
import type { LocusPorts } from "../lib/work-unit/locus-ports.js";
import type { Store } from "../lib/store/contract.js";
import type { GitExec } from "../lib/git/exec.js";
import * as p from "../lib/terminal.js";
import { z } from "zod";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { createUserIOContext } from "../lib/io-context.js";
import { materializeArcPath, resolveArcPath } from "../lib/layout/index.js";
import { getInternalTemplatePath, resolveArcRoot } from "../lib/paths.js";
import { buildExecutorContext } from "../lib/work-unit/executor-context.js";
import type { TransitionOutcome } from "../lib/work-unit/lifecycle-executor.js";
import { type LifecycleIndexFs } from "../lib/work-unit/lifecycle-index.js";
import { spineRemedy, SpineRemedySchema, type SpineRemedy } from "../scripts/integration/spine-refusal.js";
import { isHandledError, requireArcProjectRoot, resolveUserIdentity } from "./shared.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { type InteractionContext } from "../lib/command-input/interaction-context.js";

/** The production filesystem seam for the lifecycle-index scan (mirrors `start`). */
export const lifecycleFs: LifecycleIndexFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, "utf8"),
};

/**
 * Project the active metadata path for one work unit.
 * @param slugValue - Work-unit slug to validate and project.
 * @returns The canonical managed metadata path.
 */
export function projectActiveMetaPath(slugValue: string): ReturnType<typeof resolveArcPath> {
  return resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: SlugSchema.parse(slugValue),
    artifact: "meta",
  });
}

/**
 * Materialize an active metadata path in its checkout.
 * @param cwd - Checkout root.
 * @param slugValue - Work-unit slug.
 * @returns The absolute metadata path.
 */
export function materializeActiveMetaPath(cwd: string, slugValue: string): string {
  return materializeArcPath(cwd, projectActiveMetaPath(slugValue));
}

/** The ambient context every verb handler resolves once. */
export interface VerbBase {
  /** Locus claim ports passed to the production binder. */
  locusPorts?: LocusPorts;
  /** Optional store injection preserved through executor binding. */
  store?: Store;
  /** Ephemeral provenance of this exact default instance; replacing it preserves injection. */
  defaultStoreBinding?: { store: Store; reopen: (cwd: string, exec: GitExec) => Store };
  identity: string;
  cwd: string;
  io: ReturnType<typeof createUserIOContext>;
}

/**
 * Resolve identity, repo root, and the I/O context.
 * @param context - Optional interaction and subprocess context.
 * @param json - Whether refusals use machine-readable output.
 * @returns The ambient context, or null when a guard already reported.
 */
export async function resolveVerbBase(context?: InteractionContext, json = false): Promise<VerbBase | null> {
  const io = createUserIOContext(context?.subprocess);
  if (json) {
    const cwd = resolveArcRoot();
    if (cwd === null) {
      refuseWithRemedy(
        "Not inside an ARC project (no .arc/ directory found walking up from cwd).",
        spineRemedy(
          "Lifecycle commands require an ARC project root.",
          "Enter an ARC project, then inspect its lifecycle state",
          ["arc", "status", "--json"],
        ),
        true,
      );
      return null;
    }
    try {
      const identity = await resolveUserIdentity(io.exec);
      return bindDefaultVerbStore({ identity, cwd, io });
    } catch {
      refuseWithRemedy(
        "No identity configured.",
        spineRemedy(
          "Lifecycle commands require a configured ARC identity.",
          "Initialize the project identity",
          ["arc", "init"],
        ),
        true,
      );
      return null;
    }
  }
  let identity: string;
  try {
    identity = await resolveUserIdentity(io.exec);
  } catch (err) {
    if (isHandledError(err)) return null;
    throw err;
  }
  const cwd = requireArcProjectRoot();
  if (!cwd) return null;
  return bindDefaultVerbStore({ identity, cwd, io });
}
function openDefaultStore(cwd: string, exec: GitExec): Store {
  return createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }));
}
function bindDefaultVerbStore(base: Pick<VerbBase, "identity" | "cwd" | "io">): VerbBase {
  const store = openDefaultStore(base.cwd, base.io.exec);
  return { ...base, store, defaultStoreBinding: { store, reopen: openDefaultStore } };
}

/**
 * Read configuration and bind the production lifecycle executor.
 * @param base - Resolved checkout, identity, and I/O.
 * @returns The executor and the configuration used to construct it.
 */
export async function buildExecutor(base: VerbBase) {
  const { settings } = await readConfigSettings(base.cwd);
  const defaultBinding = base.defaultStoreBinding;
  const reopenStore = defaultBinding?.store === base.store ? defaultBinding?.reopen : undefined;
  const executor = buildExecutorContext({
    cwd: base.cwd,
    ...(base.locusPorts === undefined ? {} : { locusPorts: base.locusPorts }),
    ...(base.store === undefined ? {} : { store: base.store }),
    ...(reopenStore === undefined ? {} : { reopenStore }),
    io: base.io,
    identity: base.identity,
    teamMode: settings["team.mode"] === "true",
    baseBranch: settings["branch.base"],
    internalTemplateDir: getInternalTemplatePath(),
  });
  return { executor, settings };
}

/**
 * Surface a transition's success note and side-effect advisories.
 * @param label - Success note title.
 * @param lines - Success note content.
 * @param outcome - Transition side-effect result.
 * @returns Nothing.
 */
export function reportOutcome(label: string, lines: string[], outcome: TransitionOutcome): void {
  p.note(lines.join("\n"), label);
  if (outcome.status === "ok") {
    for (const advisory of outcome.advisories) p.log.info(advisory);
    if (outcome.continuation !== undefined) {
      const pending = outcome.continuation;
      const command = pending.argv.map((value) => /^[A-Za-z0-9_./:@+-]+$/u.test(value) ? value : quoteShellArgument(value)).join(" ");
      p.log.warn(`Records saved; physical step \`${pending.step}\` remains: ${pending.reason}\n${command}`);
      p.outro("Physical continuation required.");
      process.exitCode = 1;
      return;
    }
  }
  p.outro("Done.");
}

/**
 * Report a refusal and set a non-zero exit code.
 * @param reason - Refusal diagnostic.
 * @returns Nothing.
 */
export function refuse(reason: string, refusal?: StoreRefusal, remedy?: Remedy): void {
  const recovery = refusal?.remedy ?? remedy;
  const details = `${refusal === undefined ? "" : `${refusal.code}: `}${reason}${recovery === undefined ? "" : `\n${recovery.text}`}`;
  const command = recovery?.argv?.map((value) => /^[A-Za-z0-9_./:@+-]+$/u.test(value) ? value : quoteShellArgument(value)).join(" ");
  p.log.error(command === undefined ? details : `${details}\n${command}`);
  process.exitCode = 1;
}

/** Refuse with the failed invariant and the one command that advances from it. */
export const LifecycleCommandRefusalSchema = z.strictObject({
  status: z.literal("rejected"),
  reason: z.string().min(1),
  remedy: SpineRemedySchema,
});

/**
 * Report a refusal with its recovery command.
 * @param reason - Refusal diagnostic.
 * @param remedy - Exact recovery guidance.
 * @param json - Whether to emit the canonical refusal as JSON.
 * @returns Nothing.
 */
export function refuseWithRemedy(reason: string, remedy: SpineRemedy | Remedy, json = false): void {
  const recovery = "invariant" in remedy ? remedy : spineRemedy(reason, remedy.text, remedy.argv ?? ["arc", "status", "--json"]);
  if (json) {
    const refusal = LifecycleCommandRefusalSchema.parse({ status: "rejected", reason, remedy: recovery });
    process.stdout.write(`${JSON.stringify(refusal)}\n`);
    process.exitCode = 1;
    return;
  }
  if ("invariant" in remedy) refuse(`${reason}\n${remedy.text}`);
  else refuse(reason, undefined, remedy);
}

/**
 * Validate command input and report an actionable refusal when it is invalid.
 * @param schema - Command-owned input schema.
 * @param value - Unvalidated command input.
 * @param command - Command path for usage recovery.
 * @param json - Whether validation refusals use machine-readable output.
 * @returns Validated input, or null after reporting a refusal.
 */
export function parseLifecycleCommand<T extends z.ZodType>(
  schema: T,
  value: unknown,
  command: readonly string[],
  json = false,
): z.output<T> | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  refuseWithRemedy(
    z.prettifyError(parsed.error),
    spineRemedy(
      "Command input must satisfy its registered schema.",
      "Review command usage",
      ["arc", ...command, "--help"],
    ),
    json,
  );
  return null;
}
