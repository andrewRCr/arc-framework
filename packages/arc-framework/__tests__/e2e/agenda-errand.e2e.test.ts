/** Native Errand entry reads the person's stored inbox and queue without opening or changing a checkout. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { renderQueueSet } from "../../src/lib/inbox/queue-storage.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { seedStore } from "../helpers/store/seed-store.js";
import { success } from "../helpers/store/suite-tools.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./store-default.js";

const person = OwnerIdentitySchema.parse({ type: "person", name: "agenda" });
const inbox = recordReferences["personal/inbox"](person), queue = recordReferences["personal/errand-queue"](person);
const id = "0a1b2c3d", key = `personal:${id}`;
const content = "# User Inbox\n\n## Errand\n\n### `[ ]` **Captured concern**\n\n"
  + `- _Id:_ \`${id}\`\n- _Created:_ \`2026-11-01\`\n- _Hold:_ \`true\`\n\nBody\n`;

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
    const store = selectStore(createDefaultStorePorts({ checkoutRoot: repository }), {});
    const installed = success(await store.read({ reference: inbox })).version;
    const queued = renderQueueSet({ reference: queue, saved: null, members: [] }, [{ inbox: "personal", id }],
      new Map([[key, "Captured concern"]])).content;
    const [seeded] = await seedStore(repository, SlugSchema.parse("agenda"), [{ reference: inbox, content, expected: installed },
      ...(mode === "queue" ? [{ reference: queue, content: queued }] : [])]);
    const head = await git(repository, ["rev-parse", "HEAD"]);
    const refs = await git(repository, ["show-ref"]);
    const worktrees = await git(repository, ["worktree", "list", "--porcelain"]);

    const compile = async (flags: string[]) => {
      const result = await runArcNoTty(["agenda", "session-init", ...flags, "--json"], repository!,
        { env: { FORCE_COLOR: undefined } });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const compiled: unknown = JSON.parse(result.stdout);
      assertSessionInitAgenda(compiled);
      return compiled;
    };
    const agenda = await compile(mode === "seed" ? ["--errand", key, "--isolate"]
      : mode === "queue" ? ["--errand", "--next"] : ["--errand"]);
    for (const step of agenda.steps) {
      if (step.type === "fragment" && step.target.kind === "workflow") {
        expect(await readFile(join(repository, step.target.path), "utf8")).toContain("# Workflow:");
      }
    }
    if (mode === "pick") {
      expect(agenda.steps.at(-1)).toMatchObject({ type: "offer", id: "errand:pick", choices: expect.arrayContaining([
        expect.objectContaining({ kind: "signal", label: `Captured concern (${key})`, value: key }),
      ]) });
    } else {
      expect(agenda.steps.at(-1), JSON.stringify(agenda.steps.filter(step => step.type === "render" && step.surface === "errand-next")))
        .toMatchObject({ type: "fragment", target: {
        kind: "workflow", path: ".arc/system/workflows/arc/supplemental/run-errand.md",
      }, args: { mode: "launch", fromInbox: key, isolate: mode === "seed" } });
    }
    if (mode === "seed") {
      // A capture is named by its qualified ID; a title seed launches a new concern carrying no capture.
      const titled = (await compile(["--errand", "Captured concern", "--isolate"])).steps.at(-1);
      expect(titled).toMatchObject({ type: "fragment", args: { mode: "launch", seed: "Captured concern", isolate: true } });
      expect(titled?.type === "fragment" ? titled.args : {}).not.toHaveProperty("fromInbox");
    }
    expect(success(await store.read({ reference: inbox }))).toMatchObject({ content, version: seeded?.version });
    expect(await git(repository, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(repository, ["show-ref"])).toBe(refs);
    expect(await git(repository, ["worktree", "list", "--porcelain"])).toBe(worktrees);
    expect(await git(repository, ["status", "--porcelain"])).toBe("");
  }, 120_000);
});
