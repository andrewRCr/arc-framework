/** Singleton prepublication exposes a runnable continuation for an admitted, unstarted frontline review. */
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FrontlineResolveRequestSchema } from "../../src/scripts/review-gate/policy/frontline-command-schema.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";

const RECOVERY_TIMEOUT_MS = 120_000;
const TASKS = "# Task List: Example\n\n- [x] Verification complete\n";
const META = (slug: string) => ({ owner: "test-user", branch: `feat/${slug}`, workClass: "Light" as const,
  taskList: `tasks-${slug}.md`, lastCompleted: "verification", nextAction: "verification complete" });

/** A repository whose `example` work unit is attested at the head `other`'s branch shares, with the checkout from which
 * `other` would carry the frontline request. */
interface SharedHead { readonly root: string; enterOther(): Promise<string>; leaveOther(): Promise<void> }

async function installFrontline(root: string): Promise<void> {
  const initialized = await runArc(["init", "--yes", "--name", "example"], root);
  expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
  const configPath = join(root, ".arc", "system", "arc-config.yml");
  await writeFile(configPath, (await readFile(configPath, "utf8"))
    .replace("review.frontline_sources: []", "review.frontline_sources: [coderabbit-cli]"));
  const methodPath = join(root, ".arc", "system", "methods", "code-review-frontline.md");
  await writeFile(methodPath, (await readFile(methodPath, "utf8")).replace("active: false", "active: true"));
  await git(root, ["add", ".arc", ".gitignore", ".ignore"]);
  await git(root, ["commit", "-m", "install ARC"]);
  await git(root, ["switch", "-c", "feat/example"]);
  await mkdir(join(root, "src"));
}

/** Both work units' metas and task lists are tracked files, and `other`'s checkout is the primary on its branch. */
async function inRepoSharedHead(root: string): Promise<SharedHead> {
  await installFrontline(root);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(join(root, ".arc", "active", "meta-example.md"), makeMetaFixture("example", META("example")));
  await writeFile(join(root, ".arc", "active", "tasks-example.md"), TASKS);
  await writeFile(join(root, ".arc", "active", "meta-other.md"), makeMetaFixture("other", META("other")));
  await writeFile(join(root, ".arc", "active", "tasks-other.md"), TASKS.replace("Example", "Other"));
  await writeFile(join(root, "src", "example.ts"), "export const example = true;\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "implementation"]);
  const attested = await runArc(["attest", "example", "--json"], root);
  expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
  await git(root, ["commit", "-m", "verification"]);
  await git(root, ["branch", "feat/other", "HEAD"]);
  return { root,
    enterOther: async () => { await git(root, ["switch", "feat/other"]); return root; },
    leaveOther: async () => { await git(root, ["switch", "feat/example"]); } };
}

/** Both work units are held in the store, each bound to its own checkout on its branch. */
async function storeSharedHead(root: string, onCleanup: (path: string) => void): Promise<SharedHead> {
  await installFrontline(root);
  await seedWorkUnit(root, "example", { identity: "test-user", branch: "feat/example", bind: root,
    meta: META("example"), taskList: TASKS });
  await writeFile(join(root, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
  await writeFile(join(root, "src", "example.ts"), "export const example = true;\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "implementation"]);
  const attested = await runArc(["attest", "example", "--json"], root);
  expect(attested.exitCode, JSON.stringify(attested)).toBe(0);
  await git(root, ["branch", "feat/other", "HEAD"]);
  const parent = await mkdtemp(join(tmpdir(), "arc-frontline-other-"));
  onCleanup(parent);
  const other = join(parent, "other");
  await git(root, ["worktree", "add", other, "feat/other"]);
  await seedWorkUnit(root, "other", { identity: "test-user", branch: "feat/other", bind: other,
    meta: META("other"), taskList: TASKS.replace("Example", "Other") });
  return { root, enterOther: async () => other, leaveOther: async () => undefined };
}

async function directsSameHeadWorkUnits(fixture: SharedHead): Promise<void> {
  const { root } = fixture;
  const sharedHead = (await git(root, ["rev-parse", "HEAD"])).trim();
  const remote = join(root, ".git", "fixture-origin.git"), bin = join(root, ".git", "fixture-bin");
  await git(root, ["init", "--bare", remote]);
  const origin = "https://arc-fixture.example/arc-framework/example.git";
  await git(root, ["remote", "add", "origin", origin]);
  await git(root, ["config", `url.file://${remote}.insteadOf`, origin]);
  await mkdir(bin);
  await writeFile(join(bin, "gh"), "#!/bin/sh\nprintf '[]\\n'\n");
  await chmod(join(bin, "gh"), 0o755);
  const env = { GIT_TERMINAL_PROMPT: "0", PATH: `${bin}:${process.env.PATH ?? ""}` };
  const facts = join(root, ".git", "change-set.json"), lanes = join(root, ".git", "lanes.json");
  await writeFile(facts, JSON.stringify({ changeSetState: "known", contentKind: "code-bearing", reviewRisk: "sensitive",
    changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" }));
  const judgments = { frontline: { scopeMode: "whole-target" },
    standard: { scopeMode: "whole-target", terminus: { mode: "owner-accepted" } } };
  await writeFile(lanes, JSON.stringify(judgments));
  const prepublish = () => runArc(["review", "pre-publication", "example", "--self-review", "settled",
    "--change-set", facts, "--lanes", lanes], root, { env });
  const offered = await prepublish();
  expect(offered.exitCode, JSON.stringify(offered)).toBe(0);
  const action = JSON.parse(offered.stdout).nextAction as { command: string; request: unknown; resumeCommand?: string };
  expect(action.command).toBe("arc review frontline resolve -");
  const request = FrontlineResolveRequestSchema.parse(action.request);
  const invoke = (input: unknown, cwd = root) => runArcWithStdin(["review", "frontline", "resolve", "-"], cwd,
    JSON.stringify(input), { env });
  const ready = await invoke(request);
  expect(ready.exitCode, JSON.stringify(ready)).toBe(0);
  const admission = JSON.parse(ready.stdout).payload.admission as { operationId: string; logicalPass: number };
  expect(admission.logicalPass).toBe(1);
  await writeFile(lanes, JSON.stringify({ ...judgments, frontline: { scopeMode: "whole-target", invocation: { mode: "skip" } } }));
  const refused = await prepublish();
  expect(refused.exitCode, JSON.stringify(refused)).toBe(1);
  const refusal = JSON.parse(refused.stdout) as { error: { code: string }; remedy: { argv: string[]; stdin?: unknown; text: string } };
  expect(refusal, JSON.stringify(refusal)).toMatchObject({ error: { code: "review-in-progress" },
    remedy: { argv: ["arc", "review", "frontline", "resolve", "-"], stdin: request } });
  const carried = FrontlineResolveRequestSchema.parse(refusal.remedy.stdin);
  const otherCheckout = await fixture.enterOther();
  expect((await git(otherCheckout, ["rev-parse", "HEAD"])).trim()).toBe(sharedHead);
  const wrongCheckout = await invoke(carried, otherCheckout);
  expect(wrongCheckout.exitCode, JSON.stringify(wrongCheckout)).toBe(1);
  expect(refusal.remedy.text).toContain("From work unit `example`'s owning checkout");
  await fixture.leaveOther();
  expect((await git(root, ["rev-parse", "HEAD"])).trim()).toBe(sharedHead);
  const resumed = await invoke(carried);
  expect(resumed.exitCode, JSON.stringify(resumed)).toBe(0);
  expect(JSON.parse(resumed.stdout)).toMatchObject({ state: "ready", payload: { admission } });
  const skipped = await invoke({ ...carried, invocation: { mode: "skip" } });
  expect(skipped.exitCode, JSON.stringify(skipped)).toBe(0);
  expect(JSON.parse(skipped.stdout)).toMatchObject({ state: "skipped", nextAction: "none" });
  const resumeCommand = action.resumeCommand;
  expect(resumeCommand).toMatch(/^arc review pre-publication example --resume [A-Za-z0-9_-]+$/u);
  if (resumeCommand === undefined) throw new Error("Expected the original opaque continuation");
  const recovered = await runArc(resumeCommand.split(" ").slice(1), root, { env });
  expect(recovered.exitCode, JSON.stringify(recovered)).toBe(0);
  expect(JSON.parse(recovered.stdout)).toMatchObject({ locus: "candidate-publish-ready" });
}

// The in-repo store keeps both metas and the Candidate evidence as tracked files and selects a checkout's work unit by
// its branch; the store holds them as records and selects by the checkout's marker.
describe("frontline admission pending at a shared head", () => {
  useInRepoStoreForEach();

  it("directs same-head work units to the owning checkout and preserves the original admission through replay and skip", async ({ onTestFinished }) => {
    const root = await createTempRepo("arc-frontline-pending-");
    onTestFinished(() => cleanupTempDir(root));
    await directsSameHeadWorkUnits(await inRepoSharedHead(root));
  }, RECOVERY_TIMEOUT_MS);
});

describe("frontline admission pending at a shared head on the store", () => {
  it("directs same-head work units to the owning checkout and preserves the original admission through replay and skip", async ({ onTestFinished }) => {
    const root = await createTempRepo("arc-frontline-pending-store-");
    onTestFinished(() => cleanupTempDir(root));
    await directsSameHeadWorkUnits(await storeSharedHead(root, (path) => {
      onTestFinished(async () => {
        await git(root, ["worktree", "prune"]).catch(() => undefined);
        await cleanupTempDir(path);
      });
    }));
  }, RECOVERY_TIMEOUT_MS);
});
