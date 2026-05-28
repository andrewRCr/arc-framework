/**
 * `arc start` command logic.
 *
 * Today this hosts the cold-start (`--here`) path only: scaffold a Planning
 * meta + SESSION-NOTES into the worktree the session is already in — one ARC
 * did not create (a tool-spawned or manual `git worktree add` checkout). It is
 * the invocable surface the `arc-session` skill reaches for on its cold-start
 * dispatch; the create-new modes (worktree creation + tier flags) layer onto
 * the same verb later.
 *
 * {@link runColdStart} is the testable core: it derives the WU name, refuses to
 * scaffold onto a protected base or to clobber a worktree that already holds an
 * active work unit, classifies the optional spec input, and delegates the writes to
 * {@link scaffoldIntoWorktree} with `createdByArc: false` (advisory marker — ARC
 * did not create this worktree). The handler resolves the ambient context (cwd,
 * branch, identity) and reports.
 *
 * @module
 */

import { parseSpecInput } from "../lib/active/spec-input-parser.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { isProtectedBranch } from "../lib/release/interlock-validation.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { branchToWorkUnitSlug } from "../lib/work-unit/completed-index.js";
import {
  scaffoldIntoWorktree,
  type SpawnWorktreeContext,
} from "../lib/git/worktree-scaffold.js";

/** Inputs for {@link runColdStart} — the ambient context the handler resolves. */
export interface ColdStartParams {
  /** The worktree root the session is in (contains `.arc/`). */
  worktreePath: string;
  /** The branch already checked out — becomes the meta `Branch`. */
  branch: string;
  /** Identity owning the WU — meta `Owner` and the user subdir. */
  identity: string;
  /** Explicit WU name; defaults to the branch-derived slug when omitted. */
  name?: string;
  /** Raw spec input (`--from`) — classified into `Origin` / `Design` / pass-through. */
  from?: string;
}

/** A spec input the parser passed through untouched, for the caller to assess. */
export interface ColdStartPassthrough {
  kind: "document" | "description";
  value: string;
}

/** Outcome detail of a successful cold-start. */
export interface ColdStartResult {
  /** The worktree scaffolded into. */
  worktreePath: string;
  /** The branch the meta records. */
  branch: string;
  /** The resolved WU name (meta filename / H1 / user subdir). */
  wuName: string;
  /** Parsed `Origin`, when the spec input was an issue reference. */
  origin?: string;
  /** Parsed `Design`, when the spec input was an ARC spec artifact. */
  design?: string;
  /** Spec input the parser left for assessment (no meta field set). */
  passthrough?: ColdStartPassthrough;
}

/** No-throw outcome — a refusal carries a reason instead of throwing. */
export type ColdStartOutcome =
  | { ok: true; value: ColdStartResult }
  | { ok: false; reason: string };

/**
 * Derive the cold-start WU name: an explicit name wins, else the branch's slug
 * (`feat/foo` → `foo`), else a prefixless branch verbatim (`foo` → `foo`).
 *
 * Returns `null` when the result is empty or not filename-safe (a multi-segment
 * branch like `team/sub/foo`), signaling the caller to require an explicit name.
 *
 * @param explicit - Operator-supplied name, if any.
 * @param branch - The current branch short-name.
 * @returns The WU name, or `null` when none can be cleanly derived.
 */
export function deriveColdStartWuName(
  explicit: string | undefined,
  branch: string,
): string | null {
  const candidate = (explicit ?? branchToWorkUnitSlug(branch) ?? branch).trim();
  if (candidate === "" || candidate.includes("/")) return null;
  return candidate;
}

/**
 * Scaffold a Planning meta + SESSION-NOTES into the current worktree
 * (use-existing / cold-start). Refuses, without writing, when the WU name
 * cannot be derived, the branch is the protected base under
 * `branch.protection: full`, or the worktree already holds an active work unit.
 *
 * @param ctx - I/O context and internal template directory.
 * @param params - Resolved ambient context plus optional name / spec input.
 * @returns A success outcome with the scaffold detail, or a refusal with a reason.
 */
export async function runColdStart(
  ctx: SpawnWorktreeContext,
  params: ColdStartParams,
): Promise<ColdStartOutcome> {
  const wuName = deriveColdStartWuName(params.name, params.branch);
  if (wuName === null) {
    return {
      ok: false,
      reason:
        `could not derive a clean work-unit name from branch '${params.branch}'; `
        + "pass an explicit name",
    };
  }

  // Guard: never scaffold onto the protected base. Under `branch.protection:
  // full`, direct work on the configured `branch.base` is refused — the same
  // rule the release wrappers apply. Config-only, so it runs ahead of the
  // active-WU scan; `partial` (the default) protects nothing.
  const { settings } = await readConfigSettings(params.worktreePath);
  if (isProtectedBranch(settings, params.branch)) {
    return {
      ok: false,
      reason:
        `cannot cold-start onto protected base '${params.branch}' under `
        + "`branch.protection: full`; switch to a feature branch",
    };
  }

  // Guard: cold-start is for a worktree with no ARC work unit. Refuse rather
  // than clobber an existing meta — the agent's dispatch decides resume vs.
  // cold-start, and this keeps the command safe under any caller.
  const active = await resolveActiveWu({ cwd: params.worktreePath });
  if (active.status === "resolved") {
    const existing = active.name || active.path;
    return {
      ok: false,
      reason:
        `worktree already has an active work unit (${existing}); `
        + "cold-start is for a worktree with no ARC work unit",
    };
  }

  let origin: string | undefined;
  let design: string | undefined;
  let passthrough: ColdStartPassthrough | undefined;
  const from = params.from?.trim();
  if (from) {
    const parsed = parseSpecInput(from);
    if (parsed.ok) {
      switch (parsed.value.kind) {
        case "issue":
          origin = parsed.value.origin;
          break;
        case "arc-spec":
          design = parsed.value.design;
          break;
        case "document":
          passthrough = { kind: "document", value: parsed.value.document };
          break;
        case "description":
          passthrough = { kind: "description", value: parsed.value.description };
          break;
      }
    }
  }

  await scaffoldIntoWorktree(ctx, {
    worktreePath: params.worktreePath,
    branch: params.branch,
    wuName,
    spawningIdentity: params.identity,
    createdByArc: false,
    origin,
    design,
  });

  return { ok: true, value: { worktreePath: params.worktreePath, branch: params.branch, wuName, origin, design, passthrough } };
}
