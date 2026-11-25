/** Explicit native restoration instructions for an operator-selected terminal history repair. */
import { quoteShellArgument } from "../../release/commit-message-retry.js";
import type { OwnerIdentity } from "../identity.js";
import type { Remedy } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { codeCommitIdentityArgs } from "./repository-context.js";

/** Keep protected lineage while restoring an authentic same-owner tree as a descendant of the exact joined tip. */
export async function terminalEndRemedy(context: RefBackendContext, owner: OwnerIdentity, history: string, tip: string): Promise<Remedy> {
  const live = history.replace("refs/arc/history/", "refs/arc/");
  const git = ["git", ...context.repository?.gitDir ? [`--git-dir=${context.repository.gitDir}`] : []];
  const command = (args: string[]): string => [...git, ...args].map(quoteShellArgument).join(" ");
  const commit = command([...await codeCommitIdentityArgs(context.repository?.source ?? context), "commit-tree", "CHOSEN_SAME_OWNER_TREE",
    "-p", tip, "-m", `Restore ${owner.name} for explicit terminal-end repair`]);
  const update = command(["update-ref", "--stdin"]);
  return { text: `Retain and join both histories before repair; if necessary use the history-diverged notice's Merge both fetch and pull ${history} by name first. `
    + `Keep the chosen lineage record, including retiredBranches. Explicitly choose an authentic same-owner primary-and-metadata tree from the retained history; `
    + `verify its metadata UID and branch links preserve that lineage's retired branch authority. Replace CHOSEN_SAME_OWNER_TREE with its tree OID below. `
    + `Create a new restoration commit descending from the captured joined tip, and use its returned OID as RESTORED_COMMIT:\n${commit}\n`
    + `Atomically create the absent live ref and delete only the exact captured history tip. Run this command with the following stdin; a changed basis refuses, so recapture and reconsider before retrying:\n${update}\n`
    + `\`\`\`text\nstart\ncreate ${live} RESTORED_COMMIT\ndelete ${history} ${tip}\nprepare\ncommit\n\`\`\`\n`
    + `Re-read the restored primary through Store.read, then remove that reference through Store.write with its returned expected version. `
    + `Keep lineage and retiredBranches unchanged. The new retirement descends from both ends; publish it with an ordinary push and pull again.` };
}
