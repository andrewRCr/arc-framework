/** A separate store failure leaves an authorized code push and a combined audit outcome. */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { handleSync } from "../../src/handlers/sync.js";
import { AuditEntrySchema } from "../../src/lib/release/schema.js";
import { makeCommit } from "../helpers/integration.js";
import { makeInteractionContext } from "../helpers/interaction-context.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";

it("pushes the code branch and reports both legs when the separate store pull throws", async () => {
  const { a, remote } = await refSyncFixture("separate");
  await mkdir(join(a.root, ".arc", "system"), { recursive: true });
  await writeFile(join(a.root, ".arc", "system", "arc-config.yml"), "");
  await a.exec("git", ["add", ".arc/system/arc-config.yml"]);
  await a.exec("git", ["config", "arc.pushInterlock", "on-sync"]);
  const localTip = await makeCommit(a.root, "Local code change");
  const config = join(a.root, ".git", "arc", "store", "config");
  const originalConfig = await readFile(config, "utf8");
  await appendFile(config, "\n[unterminated\n");
  await a.exec("git", ["push", "--dry-run", "origin", "main"]);

  const cwd = process.cwd();
  const exitCode = process.exitCode;
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  try {
    process.chdir(a.root);
    const context = makeInteractionContext({ machineReadable: true });
    const error = await handleSync({ json: true }, undefined, context, a.store).catch(String);
    const remoteTip = (await remote("git", ["rev-parse", "refs/heads/main"])).stdout.trim();
    const json = stdout.mock.calls.map(([chunk]) => String(chunk)).join("");

    expect({ error, remoteTip, outcome: json ? JSON.parse(json) : null }).toMatchObject({
      error: undefined,
      remoteTip: localTip,
      outcome: {
        exitCode: 1,
        worktree: { action: "push", result: "success" },
        state: { pull: { result: "failed", detail: expect.stringContaining("config") }, push: { result: "blocked" } },
      },
    });
    expect(process.exitCode).toBe(1);
    const audit = await readFile(join(a.root, ".arc/user/andrew/.internal/.audit-log.jsonl"), "utf8");
    expect(AuditEntrySchema.parse(JSON.parse(audit)).outcome).toMatchObject({
      worktree: "push:success", state: expect.stringMatching(/pull:failed:.*config.* \| push:blocked:/u), exitCode: 1,
    });

    await writeFile(config, originalConfig);
    stdout.mockClear();
    process.exitCode = undefined;
    await handleSync({ json: true }, undefined, context, a.store);
    expect(JSON.parse(stdout.mock.calls.map(([chunk]) => String(chunk)).join(""))).toMatchObject({
      exitCode: 0, state: { pull: { result: expect.stringMatching(/success|noop/u) }, push: { result: "noop" } },
    });
  } finally {
    stdout.mockRestore();
    process.chdir(cwd);
    process.exitCode = exitCode;
  }
});
