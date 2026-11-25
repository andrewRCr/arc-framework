/** In-repository status reads retain valid captures beside malformed inbox blocks. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { createSessionStatusContext, readUserInboxFromStore } from "../../src/handlers/status/session-context.js";
import { runInboxState } from "../../src/lib/session-init/inbox-state.js";
import { extractReminderEntries } from "../../src/lib/session-init/inbox-reminders.js";
import type { Store } from "../../src/lib/store/contract.js";

it("counts and reminds valid in-repository captures despite another malformed entry, then reads its repair", async () => {
  const cwd = await createTempRepo("arc-session-inbox-"); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd), raw = createExecaRawGitExec(cwd);
  await exec("git", ["config", "arc.identity", "alice"]);
  await exec("git", ["config", "arc.role", "maintainer"]);
  const personal = join(cwd, ".arc", "user", "alice"); await mkdir(personal, { recursive: true });
  const path = join(personal, "USER-INBOX.md");
  const content = "## Errand\n\n### **Valid capture**\n- _Created:_ `2026-10-16`\n- _Remind:_ `true`\n\nKeep this pending.\n\n### Missing bold title\n- _Created:_ `2026-10-16`\n- _Remind:_ `true`\n\nRepair this block.\n\n## Work Unit\n";
  await writeFile(path, content);
  const context = await createSessionStatusContext(cwd, exec, raw, raw);
  expect(context.store?.capabilities.stateOffBranch).toBe(false);
  const read = await context.readUserInbox("alice");
  expect(runInboxState({ content: read })).toMatchObject({ routableCount: 1, executeBoundCount: 0, housekeepNeeded: true });
  expect(extractReminderEntries({ content: read })).toEqual({ entries: [{ key: "Valid capture", created: "2026-10-16" }] });
  expect(read).toBe(content);
  if (!context.store) throw new Error("No selected Store");
  const offBranch = Object.create(context.store) as Store;
  Object.defineProperty(offBranch, "capabilities", { value: { ...context.store.capabilities, stateOffBranch: true } });
  await expect(readUserInboxFromStore(offBranch, "alice")).rejects.toThrow("missing bold title");
  const repaired = content.replace("### Missing bold title", "### **Repaired capture**");
  await writeFile(path, repaired);
  expect(await context.readUserInbox("alice")).toBe(repaired);
  expect(runInboxState({ content: await context.readUserInbox("alice") })).toMatchObject({ routableCount: 2, housekeepNeeded: true });
  expect(extractReminderEntries({ content: await context.readUserInbox("alice") }).entries.map(entry => entry.key)).toEqual(["Valid capture", "Repaired capture"]);
  expect(await readUserInboxFromStore(offBranch, "alice")).toBe(repaired);
});
