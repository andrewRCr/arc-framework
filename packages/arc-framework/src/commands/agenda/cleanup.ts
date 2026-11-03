/** Cleanup orientation with report-specific authorization and checkout boundaries. */
import { quoteShellArgument } from "../../lib/release/commit-message-retry.js";
import type { SessionAction } from "../../lib/session-init/actions.js";
import type { OrphanBranchReport } from "../../lib/session-init/orphan-branch-sweep.js";
import type { StaleWorktreeSweepResult } from "../../lib/session-init/stale-worktree-sweep.js";
import { workUnitTeardownAction } from "../../lib/session-init/actions.js";
import { agendaQuestionKey, buildAgendaArgv } from "./argv.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { OrientationSurface } from "./orientation.js";
import type { AgendaStep, OfferChoice } from "./schema.js";

/** Compile cleanup narration and standing choices without executing any remedy. */
export function compileCleanupOrientation(input: AgendaCompileInput): OrientationSurface[] {
  const husk = currentHuskSurface(input);
  const retirement = retirementSurface(input);
  const renames = renameMovesSurface(input);
  const worktrees = staleWorktreeSurface(input);
  const missing = missingFoldersSurface(input);
  const orphans = orphanBranchesSurface(input);
  const residues = linkedResiduesSurface(input);
  return [husk, retirement, renames, worktrees, missing, orphans, residues].filter(surface => surface !== null);
}

function currentHuskSurface(input: AgendaCompileInput): OrientationSurface | null {
  const slot = input.envelope.currentHusk;
  if (!slot?.ok || slot.value === null) return null;
  const { subject, branch, stamp, worktreePath } = slot.value;
  if (stamp.kind === "manual-only") return { id: "husk", steps: [{ type: "render", surface: "husk", text: `**Husk:** ${stamp.reason}` }] };
  const argv = ["arc", "teardown", subject.name, "--husk", worktreePath];
  const command = `${workUnitTeardownAction(subject.name).text} --husk ${quoteShellArgument(worktreePath)}`;
  const authorization = stamp.kind === "legacy"
    ? "merged-preserved (legacy stamp; remote absence revalidated by teardown)" : stamp.authorization;
  const remote = stamp.kind === "current" ? stamp.remoteRef?.disposition ?? "absent" : "absent";
  const steps: AgendaStep[] = [{ type: "render", surface: "husk",
    text: `**Husk:** \`${subject.name}\` (\`${branch}\`) — ${authorization}; remote \`${remote}\`; pending physical teardown. From outside this worktree run \`${command}\`.` }];
  const frame = input.envelope.derivedLocusState;
  const checkout = frame.ok ? frame.value.primaryAvailability.checkoutPath : null;
  if (checkout !== null) steps.push({ type: "offer", id: agendaQuestionKey("husk", "teardown", subject.name), ask: "orientation",
    text: "Clean up this husk?", choices: [cleanupChoice(input, { text: command, argv, checkout }, true)] });
  return { id: "husk", steps };
}


type PublishedCommand = Omit<SessionAction, "argv"> & { argv: readonly string[] };

function cleanupChoice(input: AgendaCompileInput, action: PublishedCommand, handoff = false): OfferChoice {
  return { kind: "actions", label: action.text, accepts: [], actions: [{ ...action, argv: [...action.argv] }],
    then: handoff ? { kind: "handoff" } : { kind: "recompile", argv: buildAgendaArgv(input.signals, input.answers, { dropNext: true }) } };
}

function cleanupSurface(surface: string, text: string, choices: OfferChoice[]): OrientationSurface {
  const steps: AgendaStep[] = [{ type: "render", surface, text }];
  if (choices.length > 0) steps.push({ type: "offer", id: agendaQuestionKey(surface, "cleanup"), ask: "orientation",
    text: "Choose a cleanup action when ready.", choices });
  return { id: surface, steps };
}

function retirementSurface(input: AgendaCompileInput): OrientationSurface | null {
  const slot = input.envelope.sweep;
  if (!slot?.ok || slot.value.retirements.length === 0) return null;
  const reports = slot.value.retirements;
  const lines = [`**Landed retirement cleanup:** ${reports.length} work unit(s) have authoritative cleanup residue:`];
  const choices: OfferChoice[] = [];
  for (const report of reports) {
    if (report.status === "blocked") {
      lines.push(`- \`${report.subject.slug}\` (\`${report.subject.branch}\`) — ${report.reason}; surfaced without an action`);
      continue;
    }
    const { subject, successorReadiness } = report.lifecycle;
    lines.push(`- \`${subject.slug}\` (\`${subject.branch}\`) → clean up? \`${report.teardown.text}\``);
    choices.push(cleanupChoice(input, report.teardown));
    if (successorReadiness.remedy !== null) {
      lines.push(`  - Ready successor: \`${successorReadiness.remedy.text}\``);
      choices.push(cleanupChoice(input, successorReadiness.remedy, true));
    } else if (successorReadiness.candidates.length > 0) {
      lines.push(`  - Ready successors: ${successorReadiness.candidates.map(name => `\`${name}\``).join(", ")}; no default selected`);
    }
  }
  return cleanupSurface("retirements", lines.join("\n"), choices);
}


function renameMovesSurface(input: AgendaCompileInput): OrientationSurface | null {
  const slot = input.envelope.sweep;
  if (!slot?.ok || slot.value.renameMoves.length === 0) return null;
  const frame = input.envelope.derivedLocusState;
  const checkout = frame.ok && frame.value.entering.kind === "selected" ? frame.value.entering.row.checkout.path : null;
  const moves = slot.value.renameMoves;
  const lines = [`**Deferred rename moves:** ${moves.length} renamed worktree path(s) lag:`];
  const choices: OfferChoice[] = [];
  for (const move of moves) {
    lines.push(`- \`${move.from}\` → \`${move.to}\`; ${move.remedy.text}`);
    if (checkout !== null && checkout !== move.from) choices.push(cleanupChoice(input, { ...move.remedy, checkout }));
  }
  return cleanupSurface("rename-moves", lines.join("\n"), choices);
}


type WorktreeReport = StaleWorktreeSweepResult["worktrees"][number];

function enteringCheckout(input: AgendaCompileInput): { path: string; primary: boolean } | null {
  const frame = input.envelope.derivedLocusState;
  return frame.ok && frame.value.entering.kind === "selected" ? frame.value.entering.row.checkout : null;
}

function staleWorktreeSurface(input: AgendaCompileInput): OrientationSurface | null {
  const slot = input.envelope.sweep;
  if (!enteringCheckout(input)?.primary || !slot?.ok || slot.value.worktrees.length === 0) return null;
  const reports = slot.value.worktrees;
  const lines = [`**Stale worktrees:** ${reports.length} shipped worktree(s) or stamped husk(s) linger:`];
  const choices: OfferChoice[] = [];
  for (const report of reports) {
    lines.push(worktreeReportLine(report));
    choices.push(...worktreeCommands(report, false).map(action => cleanupChoice(input, action)));
  }
  return cleanupSurface("stale-worktrees", lines.join("\n"), choices);
}

function worktreeRemedies(report: WorktreeReport): readonly { text: string; argv?: readonly string[]; checkout?: string }[] {
  return report.kind !== "husk" && report.teardown !== undefined ? [report.teardown] : report.actions ?? [];
}

function worktreeCommands(report: WorktreeReport, linked: boolean): PublishedCommand[] {
  if (report.decision.action !== "removable") return [];
  if (report.kind === "husk" && (report.stamp.kind === "manual-only" || report.subject.kind === "errand"
    || (linked && report.subject.kind === "branch"))) return [];
  return worktreeRemedies(report).flatMap(action => action.argv === undefined ? [] : [{ ...action, argv: action.argv }]);
}

function worktreeReportLine(report: WorktreeReport, linked = false): string {
  const remedies = worktreeRemedies(report).map(action => `\`${action.text}\``).join("; ");
  const label = linked ? `\`${report.worktreePath}\` — ${worktreeLabel(report)}` : worktreeLabel(report);
  return `- ${label} — ${worktreeDisposition(report, linked)}${remedies === "" ? "" : `; ${remedies}`}`;
}

function worktreeLabel(report: WorktreeReport): string {
  switch (report.kind) {
    case "branched": return `\`${report.branch}\``;
    case "detached": return `\`work unit ${report.workUnit}\` at \`${report.worktreePath}\``;
    case "husk": return huskLabel(report);
  }
}

function huskLabel(report: Extract<WorktreeReport, { kind: "husk" }>): string {
  if (report.completedWorkUnit !== null) return `\`work unit ${report.completedWorkUnit}\``;
  switch (report.subject.kind) {
    case "work-unit": return `\`work unit ${report.subject.name}\``;
    case "branch": return `\`branch husk ${report.subject.ref}\``;
    case "errand": return `\`errand husk ${report.subject.slug}\``;
  }
}

function worktreeDisposition(report: WorktreeReport, linked: boolean): string {
  if (report.kind === "husk" && report.stamp.kind === "manual-only") return `${report.stamp.reason}; cleanup requires a manual decision`;
  if (report.kind === "husk" && report.subject.kind === "errand") return "no shipped cleanup driver; surfaced for manual-only cleanup";
  if (linked && report.kind === "husk" && report.subject.kind === "branch") return "no exact husk cleanup driver, manual-only";
  const decision = report.decision;
  switch (decision.action) {
    case "removable": return removableWorktreeDisposition(report, linked);
    case "blocked": return `${blockedReasonText(decision.reason, report.kind === "husk")}; surfaced, not removed`;
    case "external": return "externally-managed (no ARC marker); remove manually if desired";
    case "outside": return "untrusted terminal evidence; surfaced for manual-only cleanup";
  }
}


function missingFoldersSurface(input: AgendaCompileInput): OrientationSurface | null {
  const slot = input.envelope.sweep;
  if (!enteringCheckout(input)?.primary || !slot?.ok || slot.value.missingFolders.length === 0) return null;
  const reports = slot.value.missingFolders;
  const lines = [`**Missing worktree folders:** ${reports.length} registration(s) have no folder:`];
  for (const report of reports) {
    lines.push(`- \`${report.worktreePath}\` (${report.outcome}): ${report.actions.map(action => action.text).join("\n  ")}`);
  }
  return cleanupSurface("missing-folders", lines.join("\n"), []);
}


function orphanBranchesSurface(input: AgendaCompileInput): OrientationSurface | null {
  const slot = input.envelope.orphanBranchSweep;
  if (!enteringCheckout(input)?.primary || !slot?.ok || slot.value.orphans.length === 0) return null;
  const reports = slot.value.orphans;
  return cleanupSurface("branch-orphans", [`**Branch orphans:** ${reports.length} stale local branch(es) with a deleted upstream linger:`,
    ...reports.map(orphanReportLine)].join("\n"), reports.flatMap(report => orphanCommands(report).map(action => cleanupChoice(input, action))));
}

function orphanRemedies(report: OrphanBranchReport): readonly { text: string; argv?: readonly string[]; checkout?: string }[] {
  if (report.merged === null) return [];
  return report.shippedWorkUnit !== null && report.teardown !== undefined ? [report.teardown] : report.actions ?? [];
}

function orphanCommands(report: OrphanBranchReport): PublishedCommand[] {
  if (report.merged !== true && report.shippedWorkUnit === null) return [];
  return orphanRemedies(report).flatMap(action => action.argv === undefined ? [] : [{ ...action, argv: action.argv }]);
}

function orphanReportLine(report: OrphanBranchReport): string {
  const disposition = report.shippedWorkUnit !== null ? "work unit shipped → clean up?"
    : report.merged === true ? "merged to base → remove?" : report.merged === null
      ? "remote evidence unavailable; no cleanup authority" : "not merged; surfaced, not removed (never -D)";
  const remedies = orphanRemedies(report).map(action => `\`${action.text}\``).join("; ");
  return `- \`${report.branch}\` — ${disposition}${remedies === "" ? "" : `; ${remedies}`}`;
}


function huskProof(report: Extract<WorktreeReport, { kind: "husk" }>): string {
  const stamp = report.stamp;
  if (stamp.kind === "manual-only") return stamp.reason;
  const remote = stamp.kind === "current" ? stamp.remoteRef?.disposition ?? "absent" : "absent";
  return `${stamp.authorization}; remote ${remote}`;
}

function linkedResiduesSurface(input: AgendaCompileInput): OrientationSurface | null {
  const checkout = enteringCheckout(input);
  if (checkout === null || checkout.primary) return null;
  const sweep = input.envelope.sweep, orphanSweep = input.envelope.orphanBranchSweep;
  const reports = sweep?.ok ? sweep.value.worktrees : [];
  const orphans = orphanSweep?.ok ? orphanSweep.value.orphans : [];
  const count = reports.length + orphans.length;
  if (count === 0) return null;
  const lines = [`**Cleanup residues:** ${count} sibling husk(s) or orphan ref(s) linger:`,
    ...reports.map(report => worktreeReportLine(report, true)), ...orphans.map(orphanReportLine)];
  const commands = [...reports.flatMap(report => worktreeCommands(report, true)), ...orphans.flatMap(orphanCommands)];
  return cleanupSurface("cleanup-residues", lines.join("\n"), commands.map(action => cleanupChoice(input, action)));
}


function removableWorktreeDisposition(report: WorktreeReport, linked: boolean): string {
  switch (report.kind) {
    case "branched": return "clean & merged → clean up?";
    case "detached": return "ended & detached, clean & merged → clean up?";
    case "husk": return `stamped husk, clean & exact HEAD${linked ? ` (${huskProof(report)})` : ""} → clean up?`;
  }
}

function blockedReasonText(reason: string, husk: boolean): string {
  if (husk && reason === "uncommitted") return "dirty";
  if (reason === "user-surfaces") return "user surfaces not reconciled";
  if (reason === "head-moved") return "HEAD moved";
  return reason;
}
