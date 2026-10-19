/** Start's in-place prompt and report follow its selected storage capability. */
import type { Store } from "../lib/store/contract.js";
import type { LocusPorts } from "../lib/work-unit/locus-ports.js";
import type { UserIOContext } from "../commands/user/types.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { StartOptions } from "./start.js";
import { runColdStart, deriveColdStartWuName } from "../commands/start.js";
import { usesOffBranchState } from "../lib/store/lifecycle-write.js";
import { workItemArtifactPath } from "../lib/store/lifecycle-storage.js";
import { getInternalTemplatePath } from "../lib/paths.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { isProtectedBranch } from "../lib/release/interlock-validation.js";
import { prompt } from "../lib/command-input/prompter.js";
import { coldStartPromptSite } from "./start-prompt-sites.js";
import { resolveCurrentBranchName, runWithInteractionProgress } from "./shared.js";
import * as p from "../lib/terminal.js";
interface ColdStartArmContext {
  store?: Store; locusPorts?: LocusPorts; io: UserIOContext; cwd: string; identity: string; interaction: InteractionContext;
}

/** Cold-start arm (`--here`) — scaffold a Planning meta into the current worktree. */
export async function runColdStartArm(
  name: string | undefined,
  opts: StartOptions,
  ctx: ColdStartArmContext,
): Promise<void> {
  const offBranch = usesOffBranchState(ctx.store);
  const currentBranch = await resolveCurrentBranchName(ctx.io.exec);
  const branch = currentBranch ?? "";
  if (!branch && !offBranch) {
    p.log.error(
      "Cannot resolve the current branch (detached HEAD?). Check out a branch before cold-starting.",
    );
    process.exitCode = 1;
    return;
  }

  // On a protected base, cold-start cuts `plan/<name>` rather than scaffolding
  // onto the base — word the offer for it.
  const { settings } = await readConfigSettings(ctx.cwd);
  const onProtectedBase = !offBranch && isProtectedBranch(settings, branch);

  const previewName = deriveColdStartWuName(name, branch) ?? "(name from branch)";
  const prompt = offBranch ? `Cold-start work unit "${previewName}" in checkout ${ctx.cwd}?` : onProtectedBase
    ? `Protected base '${branch}' — cut plan/${previewName} and cold-start "${previewName}" onto it?`
    : `Cold-start work unit "${previewName}" on branch ${branch} in this worktree?`;
  const confirmation = await promptForColdStart(ctx.interaction, prompt);
  if (confirmation.kind !== "answered" || !confirmation.value) {
    p.log.info("Cold-start cancelled.");
    return;
  }

  const outcome = await runWithInteractionProgress(ctx.interaction,
    "Scaffolding planning meta...",
    "Cold-start scaffold complete.",
    () => runColdStart(
      { io: ctx.io, store: ctx.store, locusPorts: ctx.locusPorts, internalTemplateDir: getInternalTemplatePath() },
      { worktreePath: ctx.cwd, branch, identity: ctx.identity, name, from: opts.from },
    ),
    (r) => r.ok,
    "Cold-start failed.",
  );
  if (!outcome.ok) {
    p.log.error(outcome.reason);
    process.exitCode = 1;
    return;
  }

  const r = outcome.value;
  const lines = offBranch ? [`Work unit: ${r.wuName}`, `Checkout:  ${r.worktreePath}`] : [
    `Work unit: ${r.wuName}`,
    `Branch:    ${r.branch}${r.cutFromBase ? ` (cut off protected base ${r.cutFromBase})` : ""}`,
    `Meta:      ${workItemArtifactPath(r.wuName, "meta", { kind: "active" }, null)}`,
  ];
  if (r.origin) lines.push(`Origin:    ${r.origin}`);
  if (r.passthrough) {
    lines.push(
      `Spec input (${r.passthrough.kind}): ${r.passthrough.value}`,
      "  → read as input to the work unit’s own draft during planning",
    );
  }
  p.note(lines.join("\n"), "Cold-started");
  p.outro("Done.");
}


async function promptForColdStart(context: InteractionContext, message: string) {
  return prompt(coldStartPromptSite, context, { message, initialValue: true });
}
