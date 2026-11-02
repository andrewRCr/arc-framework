/** Native Errand entry reads the legacy inbox without opening or changing a checkout. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

describe("agenda Errand entry", () => {
  let repository: string | undefined;
  afterEach(async () => {
    if (repository !== undefined) await cleanupTempDir(repository);
    repository = undefined;
  });

  it.each(["seed", "pick", "queue"])("compiles %s through its real inbox reader without launch", async mode => {
    repository = await createTempRepo("arc-agenda-errand-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize Errand fixture"]);
    const inboxPath = join(repository, ".arc/user/agenda/USER-INBOX.md");
    await mkdir(join(repository, ".arc/user/agenda"), { recursive: true });
    const content = "# User Inbox\n\n## Errand\n\n### `[ ]` **Captured concern**\n\n"
      + "- _Disposition:_ `execute-bound`\n- _Created:_ `2026-11-01`\n- _Hold:_ `true`\n\nBody\n";
    await writeFile(inboxPath, content);
    const head = await git(repository, ["rev-parse", "HEAD"]);
    const refs = await git(repository, ["show-ref"]);
    const worktrees = await git(repository, ["worktree", "list", "--porcelain"]);

    const flags = mode === "seed" ? ["--errand", "Captured concern", "--isolate"]
      : mode === "queue" ? ["--errand", "--next"] : ["--errand"];
    const result = await runArcNoTty(["agenda", "session-init", ...flags, "--json"], repository,
      { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const agenda: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(agenda);
    if (mode === "pick") {
      expect(agenda.steps.at(-1)).toMatchObject({ type: "offer", id: "errand:pick", choices: expect.arrayContaining([
        expect.objectContaining({ kind: "signal", value: "Captured concern" }),
      ]) });
    } else {
      expect(agenda.steps.at(-1), JSON.stringify(agenda.steps.filter(step => step.type === "render" && step.surface === "errand-next")))
        .toMatchObject({ type: "fragment", target: {
        kind: "workflow", path: ".arc/system/workflows/arc/run-errand.md",
      }, args: { mode: "launch", fromInbox: "Captured concern", isolate: mode === "seed" } });
    }
    expect(await readFile(inboxPath, "utf8")).toBe(content);
    expect(await git(repository, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(repository, ["show-ref"])).toBe(refs);
    expect(await git(repository, ["worktree", "list", "--porcelain"])).toBe(worktrees);
    expect(await git(repository, ["status", "--porcelain"])).toBe("");
  }, 120_000);
});
