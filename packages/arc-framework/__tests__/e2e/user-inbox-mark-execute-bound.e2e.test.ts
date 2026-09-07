import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, runArc, runArcWithStdin } from "./helpers.js";

describe("arc user inbox-mark-execute-bound", () => {
  let tmpDir: string;
  let inboxPath: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    inboxPath = join(inboxDir, "USER-INBOX.md");
    await mkdir(inboxDir, { recursive: true });
    await writeFile(inboxPath, `# User Inbox

## Errand

### \`[ ]\` **First \`arc\` errand**

- _Observation:_ first.

### \`[ ]\` **Second $(queued) errand**

- _Observation:_ second.

## Work Unit

### \`[ ]\` **Leave this byte-stable**

- WU_Target: later
`, "utf8");
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("marks and orders an exact batch supplied through a versioned stdin request", async () => {
    const result = await runArcWithStdin(
      ["user", "inbox-mark-execute-bound", "-"],
      tmpDir,
      JSON.stringify({
        schemaVersion: 1,
        orderedTitles: ["Second $(queued) errand", "First `arc` errand"],
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      mode: "user-inbox-mark-execute-bound",
      state: "applied",
      nextAction: "none",
      payload: { changed: true },
    });
    const content = await readFile(inboxPath, "utf8");
    expect(content.indexOf("Second $(queued) errand")).toBeLessThan(content.indexOf("First `arc` errand"));
    expect(content.match(/- _Disposition:_ `execute-bound`/gu)).toHaveLength(2);
    expect(content).toContain("### `[ ]` **Leave this byte-stable**\n\n- WU_Target: later");
  });

  it("refuses a missing title without applying the rest of the batch", async () => {
    const before = await readFile(inboxPath, "utf8");

    const result = await runArcWithStdin(
      ["user", "inbox-mark-execute-bound", "-"],
      tmpDir,
      JSON.stringify({
        schemaVersion: 1,
        orderedTitles: ["First `arc` errand", "Missing errand"],
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      state: "refused",
      nextAction: "stop",
      diagnostics: [expect.stringContaining("Missing USER-INBOX entry 'Missing errand'")],
    });
    expect(await readFile(inboxPath, "utf8")).toBe(before);
  });

  it("refuses a duplicate live title without changing the inbox", async () => {
    const duplicate = (await readFile(inboxPath, "utf8"))
      .replace("Leave this byte-stable", "First `arc` errand");
    await writeFile(inboxPath, duplicate, "utf8");

    const result = await runArcWithStdin(
      ["user", "inbox-mark-execute-bound", "-"],
      tmpDir,
      JSON.stringify({
        schemaVersion: 1,
        orderedTitles: ["First `arc` errand", "Second $(queued) errand"],
      }),
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      state: "refused",
      nextAction: "stop",
      diagnostics: [expect.stringContaining("Duplicate USER-INBOX entry title 'First `arc` errand'")],
    });
    expect(await readFile(inboxPath, "utf8")).toBe(duplicate);
  });

  it("refuses an order that omits an already execute-bound entry", async () => {
    const marked = (await readFile(inboxPath, "utf8")).replace(
      "### `[ ]` **First `arc` errand**",
      "### `[ ]` **First `arc` errand**\n\n- _Disposition:_ `execute-bound`",
    );
    await writeFile(inboxPath, marked, "utf8");

    const result = await runArcWithStdin(
      ["user", "inbox-mark-execute-bound", "-"],
      tmpDir,
      JSON.stringify({ schemaVersion: 1, orderedTitles: ["Second $(queued) errand"] }),
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      state: "refused",
      diagnostics: [expect.stringContaining("absent from the requested order")],
    });
    expect(await readFile(inboxPath, "utf8")).toBe(marked);
  });
});
