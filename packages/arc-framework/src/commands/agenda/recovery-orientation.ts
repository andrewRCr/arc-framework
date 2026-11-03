/** Held recovery guidance remains identical whichever recorded decision led there. */
import type { AgendaCompileInput } from "./compile-input.js";
import type { RecoveryDestination } from "./recovery-destinations.js";
import type { AgendaStep } from "./schema.js";

/** Render the incomplete recovery, occupied destinations, and published folder remedies. */
export function renderBranchGone(input: AgendaCompileInput, destinations: readonly RecoveryDestination[]): AgendaStep {
  const branch = input.envelope.worktree.ok ? input.envelope.worktree.value.branch : null;
  const lines = [`**Branch gone:** \`${branch}\`'s upstream was deleted on \`origin\`; recovery was not completed. `
    + "Re-run branch-gone recovery or pick a branch manually before sync, commit, or push."];
  const recovery = input.envelope.recovery;
  if (recovery?.ok && recovery.value.recommendedPromptText !== "") lines.push(recovery.value.recommendedPromptText);
  if (destinations.some(destination => destination.branch === "-")) {
    lines.push("Git treats `-` as checkout history; recover the literal branch `-` manually.");
  }
  for (const destination of destinations) if (destination.kind === "elsewhere") {
    lines.push(`Continue recovery in checkout \`${destination.checkoutPath}\`.`);
  }
  if (recovery?.ok) for (const folder of recovery.value.missingFolders ?? []) {
    lines.push(...folder.actions.map(action => action.text));
  }
  return { type: "render", surface: "branch-gone", text: lines.join("\n") };
}
