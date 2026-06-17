/**
 * Handler for the `arc plan` subcommands.
 *
 * `check` is the mechanical preflight `arc-plan` runs before `draft-design`: it
 * resolves the live planning-entry context — the branch-vs-base write context,
 * protection mode, the active work unit's phase/branch, and whether a draft
 * already exists — and classifies the two-layer route so the workflow routes a
 * draft mechanically rather than by prose. `--json` emits the route shape the
 * skill consumes; the human path words the verdict and exits non-zero on a
 * redirect so the guard reads as a guard.
 *
 * Layer 1 (committable → proceed) is resolved here; the layer-2 leg choice
 * (start / stub / errand by WU-worthiness) stays the workflow's judgment — this
 * handler carries the facts, never fabricates the choice.
 *
 * `arc plan` is a noun with no default action, mirroring `arc errand` /
 * `arc housekeep` — keeping the read (`check`, a query) distinct and the CLI
 * surface unmistakable next to the `arc-plan` skill.
 *
 * @module
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { parseMetaFile } from "../lib/active/meta-reader.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  classifyPlanningEntry,
  resolveWriteContext,
  type PlanningEntryRoute,
  type ProtectionMode,
} from "../lib/git/write-context.js";
import { gitExec } from "../lib/io-context.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { requireArcProjectRoot } from "./shared.js";

import * as p from "@clack/prompts";

/** Meta `**State:**` phases for which a work unit occupies its worktree. */
const OCCUPYING_PHASES: ReadonlySet<string> = new Set(["Planning", "Active", "Integrating"]);

export interface PlanCheckOptions {
  /** The design's WU-name slug — gates the draft-presence check (`draft-<name>.md`). */
  name?: string;
  /** Emit the planning-entry route as JSON (for skill consumption). */
  json?: boolean;
}

export async function handlePlanCheck(opts: PlanCheckOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  const baseBranch = settings["branch.base"];
  // Unknown / unset `branch.protection` degrades to `partial` — the fail-safe floor.
  const protection: ProtectionMode = settings["branch.protection"] === "full" ? "full" : "partial";

  const writeContext = await resolveWriteContext({ exec: gitExec, baseBranch });
  const { onPlanningBranch, activeWorkUnit } = await resolveActiveWorkUnitFacts(
    cwd,
    writeContext.currentBranch,
  );
  const draftPresent = await resolveDraftPresent(cwd, opts.name);

  const route = classifyPlanningEntry({
    writeContext,
    protection,
    onPlanningBranch,
    draftPresent,
    activeWorkUnit,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(route)}\n`);
    return;
  }
  renderHuman(route);
}

/**
 * Resolve the active work unit in this worktree and project the two facts the
 * classifier needs: whether HEAD sits on an active `Planning` WU's branch (the
 * full-mode committability signal) and whether any occupying WU is present.
 */
async function resolveActiveWorkUnitFacts(
  cwd: string,
  currentBranch: string | null,
): Promise<{ onPlanningBranch: boolean; activeWorkUnit: boolean }> {
  const active = await resolveActiveWu({ cwd });
  if (active.status !== "resolved") {
    return { onPlanningBranch: false, activeWorkUnit: false };
  }

  let fields;
  try {
    fields = parseMetaFile(await readFile(join(cwd, active.path), "utf8"));
  } catch {
    // An unreadable / malformed active meta resolves to no committable signal —
    // the gate redirects rather than trusting a half-resolved state.
    return { onPlanningBranch: false, activeWorkUnit: false };
  }

  const activeWorkUnit = fields.state !== null && OCCUPYING_PHASES.has(fields.state);
  const onPlanningBranch =
    fields.state === "Planning" && currentBranch !== null && fields.branch === currentBranch;
  return { onPlanningBranch, activeWorkUnit };
}

/** Whether a `draft-<name>.md` already exists under `active/` — `false` when unnamed. */
async function resolveDraftPresent(cwd: string, name: string | undefined): Promise<boolean> {
  const slug = name?.trim();
  if (!slug) return false;
  try {
    return (await stat(join(cwd, ".arc", "active", `draft-${slug}.md`))).isFile();
  } catch {
    return false;
  }
}

/** Word the planning-entry route for a human, exiting non-zero on a redirect. */
function renderHuman(route: PlanningEntryRoute): void {
  p.intro("arc plan check");
  if (route.route === "proceed") {
    p.note(
      `Committable drafting context (\`${route.currentBranch}\`, ${route.protection}) — proceed with the draft.`,
      "Planning entry",
    );
    p.outro("Done.");
    return;
  }

  const reasonLine = redirectReasonLine(route);
  p.note(
    `${reasonLine} Route via start / stub / errand by WU-worthiness`
    + `${route.draftPresent ? " (a draft is present — the stub leg folds it in)" : ""}.`,
    "Planning entry — redirect",
  );
  process.exitCode = 1;
  p.outro("Done.");
}

/** Human wording for each redirect reason. */
function redirectReasonLine(route: Extract<PlanningEntryRoute, { route: "redirect" }>): string {
  switch (route.reason) {
    case "protected-base":
      return `On the protected base branch \`${route.currentBranch}\` under full protection — a draft can't commit here.`;
    case "work-unit-branch":
      return `On work-unit branch \`${route.currentBranch}\` — drafting here would tangle its PR.`;
    case "detached-head":
      return "Detached HEAD — no branch to draft from.";
    case "no-base":
      return "No base branch resolved (`branch.base` unset) — cannot determine a safe drafting context.";
  }
}
