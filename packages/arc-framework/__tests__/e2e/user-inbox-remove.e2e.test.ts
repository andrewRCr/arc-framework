import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, runArc, runArcWithStdin } from "./helpers.js";

describe("arc user inbox-remove", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("removes a Markdown-bearing capture title supplied through a file", async () => {
    const title = "Remove `arc inbox` after $(capture)";
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const operandPath = join(tmpDir, "remove-entry-title.txt");
    const inbox = `# User Inbox\n\n## Errand\n\n### \`[ ]\` **${title}**\n\n- _Observation:_ remove safely.\n\n---\n`;
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf8");
    await writeFile(operandPath, `${title}\n`, "utf8");

    const result = await runArc(["user", "inbox-remove", "--inbox-entry-file", operandPath], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(await readFile(inboxPath, "utf8")).not.toContain(title);
  });

  it("removes a Markdown-bearing capture title supplied through stdin", async () => {
    const title = "Remove `arc inbox` after $(stdin)";
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const inbox = `# User Inbox\n\n## Errand\n\n### \`[ ]\` **${title}**\n\n- _Observation:_ remove safely.\n\n---\n`;
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, inbox, "utf8");

    const result = await runArcWithStdin(
      ["user", "inbox-remove", "--inbox-entry-file", "-"],
      tmpDir,
      `${title}\n`,
    );

    expect(result.exitCode).toBe(0);
    expect(await readFile(inboxPath, "utf8")).not.toContain(title);
  });
});
