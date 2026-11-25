/** Native cold-start inspects a real unmanaged linked checkout before scaffolding. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty } from "./helpers.js";

const COLD_START_TIMEOUT_MS = 120_000;

describe("agenda cold-start", () => {
  let repository: string | undefined;
  let checkout: string | undefined;
  afterEach(async () => {
    if (repository !== undefined && checkout !== undefined) {
      await git(repository, ["worktree", "remove", "--force", checkout]).catch(() => cleanupTempDir(checkout!));
    }
    if (repository !== undefined) await cleanupTempDir(repository);
    repository = checkout = undefined;
  });

  async function setup() {
    repository = await createTempRepo("arc-agenda-cold-");
    const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "agenda", "--tools", ""], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "chore: initialize cold-start fixture"]);
    checkout = `${repository}.cold`;
    await git(repository, ["worktree", "add", "-b", "feat/cold", checkout]);
    return { repository, checkout };
  }

  it("offers a shipped advisory and literal issue-seeded scaffold without changing the checkout", async () => {
    const { checkout } = await setup();
    const head = await git(checkout, ["rev-parse", "HEAD"]), refs = await git(checkout, ["show-ref"]);
    const result = await runArcNoTty(["agenda", "session-init", "--json", "#42"], checkout, { env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const agenda: unknown = JSON.parse(result.stdout); assertSessionInitAgenda(agenda);
    const advisory = agenda.steps[0];
    expect(advisory).toMatchObject({ type: "fragment", target: { kind: "workflow", path: expect.stringContaining("in-flight-scope-check.md") } });
    if (advisory?.type !== "fragment" || advisory.target.kind !== "workflow") throw Error("Expected scope workflow");
    expect(await readFile(join(checkout, advisory.target.path), "utf8")).toContain("# Workflow: In-Flight Scope Check");
    expect(agenda.steps[1]).toMatchObject({ type: "offer", id: "cold-start:scaffold", text: expect.stringContaining("Origin"),
      choices: [{ kind: "actions", actions: [{ argv: ["arc", "start", "--here", "--from", "#42"] }] }, { kind: "bare", decline: true }] });
    expect(await git(checkout, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(checkout, ["show-ref"])).toBe(refs);
    expect(await git(checkout, ["status", "--porcelain"])).toBe("");
  }, COLD_START_TIMEOUT_MS);

  it("recompiles an accepted scaffold as a work-unit resume", async () => {
    const { checkout } = await setup();
    const first = await runArcNoTty(["agenda", "session-init", "--json", "#42"], checkout);
    expect(first.exitCode, first.stdout + first.stderr).toBe(0);
    const agenda: unknown = JSON.parse(first.stdout); assertSessionInitAgenda(agenda);
    const offer = agenda.steps[1];
    if (offer?.type !== "offer") throw Error("Expected scaffold offer");
    const accept = offer.choices[0];
    if (accept?.kind !== "actions" || accept.then?.kind !== "recompile") throw Error("Expected scaffold action");
    const action = accept.actions[0];
    if (action === undefined) throw Error("Missing scaffold command");
    const started = await runArcNoTty(["--no-input", ...action.argv.slice(1), "--yes"], checkout);
    expect(started.exitCode, started.stdout + started.stderr).toBe(0);
    const resumed = await runArcNoTty(accept.then.argv.slice(1), checkout);
    expect(resumed.exitCode, resumed.stdout + resumed.stderr).toBe(0);
    const next: unknown = JSON.parse(resumed.stdout); assertSessionInitAgenda(next);
    expect(next.signals.seed).toBeUndefined();
    expect(next.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: false });
    expect(next.steps).toContainEqual(expect.objectContaining({ type: "read", path: expect.stringContaining("meta-cold.md") }));
    expect(next.steps.some(step => step.type === "offer" && step.id === "cold-start:scaffold")).toBe(false);
    expect(await readFile(join(checkout, ".arc/active/meta-cold.md"), "utf8")).toContain("#42");
  }, COLD_START_TIMEOUT_MS);
});
