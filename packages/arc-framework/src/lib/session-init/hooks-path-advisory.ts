/**
 * Session-init advisory for the entering checkout's hooks path.
 *
 * When `core.hooksPath` names a directory the checkout lacks, Git runs no
 * hooks and a raw `git commit` succeeds with every commit gate skipped. Git
 * has no setting that fails closed there, so session entry names the gap
 * before any commit is attempted. The advisory is read-only and never gates.
 *
 * @module
 */

import { z } from "zod";

import {
  resolveHooksPathVerdict,
  type HooksPathGitExec,
  type HooksPathVerdict,
} from "../git/hooks-path.js";

/** Runtime authority for the session-init hooks-path advisory slot. */
export const HooksPathSessionAdvisorySchema = z.discriminatedUnion("recommendedAction", [
  z.strictObject({ recommendedAction: z.literal("none") }),
  z.strictObject({
    recommendedAction: z.literal("surface"),
    configured: z.string().nullable(),
    resolvedPath: z.string(),
    recommendedPromptText: z.string().min(1),
  }),
]);

/** Session-init slot payload for the hooks-path advisory. */
export type HooksPathSessionAdvisory = z.infer<typeof HooksPathSessionAdvisorySchema>;

/** Inputs for the hooks-path advisory probe. */
export interface RunHooksPathSessionAdvisoryOptions {
  /** Entering checkout root. */
  cwd: string;
  /** Git executor bound to the entering checkout. */
  exec: HooksPathGitExec;
  /** Optional existence probe; defaults to the filesystem. */
  pathExists?: (path: string) => boolean;
}

/**
 * Resolve whether session entry should name a missing hooks path.
 * @param options - Entering checkout, Git executor, and optional existence probe.
 * @returns A surfaced advisory when Git would run no hooks, otherwise silence.
 */
export async function runHooksPathSessionAdvisory(
  options: RunHooksPathSessionAdvisoryOptions,
): Promise<HooksPathSessionAdvisory> {
  const verdict = await resolveHooksPathVerdict(options.cwd, options.exec, options.pathExists);
  if (verdict.kind === "ok") return { recommendedAction: "none" };
  return {
    recommendedAction: "surface",
    configured: verdict.configured,
    resolvedPath: verdict.resolvedPath,
    recommendedPromptText: composePromptText(verdict),
  };
}

function composePromptText(verdict: Extract<HooksPathVerdict, { kind: "missing" }>): string {
  const configured = verdict.configured?.trim() ?? "";
  const subject = configured === ""
    ? `Git's hooks directory '${verdict.resolvedPath}' does not exist`
    : `core.hooksPath '${configured}' does not exist at '${verdict.resolvedPath}'`;
  return `${subject} in this checkout, so Git runs no hooks here: a raw \`git commit\` `
    + "would skip every commit gate. Provision this checkout's hooks (run the hook manager's "
    + "install here) or correct core.hooksPath before committing.";
}
