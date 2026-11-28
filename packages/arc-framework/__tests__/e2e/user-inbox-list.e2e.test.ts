import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";

describe("arc user inbox-list", () => {
  // The title-keyed listing is the in-repo store's: the store refuses it and names its successor,
  // `arc inbox personal --target`, which the store's inbox suites cover.
  useInRepoStoreForEach();
  let tmpDir: string;
  let inboxPath: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    const inboxDir = join(tmpDir, ".arc", "user", "test-user");
    inboxPath = join(inboxDir, "USER-INBOX.md");
    await mkdir(inboxDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("lists held and unheld captures naming the target, and nothing else", async () => {
    await writeFile(inboxPath, `# User Inbox

## Errand

### \`[ ]\` **Unrelated errand**

- _Observation:_ no target.

## Work Unit

### \`[ ]\` **Held for adoption**

- _Hold:_ \`true\`
- _Created:_ \`2026-10-11\`

- \`WU_Target: payments\`

### \`[ ]\` **Arrived during execution**

- _WU_Target:_ \`payments\`

### \`[ ]\` **Another work unit**

- WU_Target: payments-audit
`, "utf8");

    const result = await runArc(["user", "inbox-list", "--target", "payments", "--json"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      mode: "user-inbox-list",
      state: "named",
      nextAction: "route-captures",
      target: "payments",
      entries: [
        { title: "Held for adoption", section: "Work Unit", held: true },
        { title: "Arrived during execution", section: "Work Unit", held: false },
      ],
    });
  });

  it("reports clear when no capture names the target", async () => {
    await writeFile(inboxPath, "# User Inbox\n\n## Errand\n\n## Work Unit\n\n### `[ ]` **Other**\n\n- WU_Target: other\n");

    const result = await runArc(["user", "inbox-list", "--target", "payments", "--json"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ state: "clear", nextAction: "none", entries: [] });
  });

  it("checks both verification inboxes through the reported remedy while listing remains unsupported", async () => {
    await writeFile(inboxPath, "# User Inbox\n\n## Work Unit\n\n### `[ ]` **Pending**\n\n- WU_Target: payments\n");
    const list = async (selector: string[]) => {
      const result = await runArc(["inbox", ...selector, "--json"], tmpDir);
      expect(result.exitCode).toBe(1);
      const refusal = JSON.parse(result.stdout) as { remedy: { text: string } };
      expect(refusal).toMatchObject({ state: "refused", code: "unsupported" });
      const command = refusal.remedy.text.match(/Run arc (user inbox-list --target [\w-]+)/u)?.[1]?.split(/\s+/u);
      expect(command).toEqual(["user", "inbox-list", "--target", "payments"]);
      if (command === undefined) throw new Error("Inbox check remedy is missing");
      const check = await runArc([...command, "--json"], tmpDir);
      expect(check.exitCode).toBe(0);
      return JSON.parse(check.stdout) as unknown;
    };
    for (const selector of [["personal", "--target", "payments"], ["payments"]]) {
      expect(await list(selector)).toMatchObject({ state: "named", entries: [{ title: "Pending" }] });
    }
    await writeFile(inboxPath, "# User Inbox\n\n## Work Unit\n");
    for (const selector of [["personal", "--target", "payments"], ["payments"]]) {
      expect(await list(selector)).toMatchObject({ state: "clear", entries: [] });
    }
  });

  it("refuses while an unreadable entry could name the target", async () => {
    await writeFile(inboxPath, "# User Inbox\n\n## Work Unit\n\n### `[ ]` no bold title\n\n- WU_Target: payments\n");

    const result = await runArc(["user", "inbox-list", "--target", "payments", "--json"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      state: "refused",
      nextAction: "stop",
      remedy: "Repair the reported inbox entries, then retry.",
    });
  });

  it("refuses a target that is not a work-unit slug", async () => {
    const result = await runArc(["user", "inbox-list", "--target", "Not A Slug", "--json"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ state: "refused", nextAction: "stop" });
  });
});
