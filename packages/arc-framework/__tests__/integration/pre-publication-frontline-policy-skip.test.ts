/** Routed frontline skips survive native resolution and opaque pre-publication replay. */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleAttest } from "../../src/handlers/lifecycle-delivery-review.js";
import { handleReviewFrontlineResolve, handleReviewPrePublication } from "../../src/handlers/review.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import { readSubmissionBoundaryVersioned } from "../../src/lib/work-unit/submission-boundary-store.js";
import {
  createPrePublicationCompositionDependencies,
} from "../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { composePrePublicationReviewRequest } from "../../src/scripts/review-gate/policy/pre-publication-request.js";
import { PrePublicationReviewEnvelopeSchema } from "../../src/scripts/review-gate/policy/pre-publication-procedure.js";
import { runHandlerAt } from "../helpers/handler.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { cleanupTempDir, DEFAULT_PROMPTS, execFileAsync, initInTempRepo, makeGitExec } from "../helpers/integration.js";

const roots: string[] = [];
const workUnit = "example";
const branch = `feat/${workUnit}`;
const machine = () => resolveProcessInteractionContext({ noInput: false, machineReadable: true, yes: "absent" });

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function git(root: string, args: string[]): Promise<string> {
  return (await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root })).stdout.trim();
}

async function candidate() {
  const root = await initInTempRepo(DEFAULT_PROMPTS);
  roots.push(root);
  const configPath = join(root, ".arc", "system", "arc-config.yml");
  const config = (await readFile(configPath, "utf8"))
    .replace(/^review.frontline_sources:.*$/mu, "review.frontline_sources: [coderabbit-cli]")
    .replace(/^review.standard_sources:.*$/mu, "review.standard_sources: [delegated-agent]");
  await writeFile(configPath, config);
  const methodPath = join(root, ".arc", "system", "methods", "frontline-review.md");
  await writeFile(methodPath, (await readFile(methodPath, "utf8")).replace(/^active:.*$/mu, "active: true"));
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "initialize"]);
  await git(root, ["remote", "add", "origin", "https://github.com/owner/repository.git"]);
  await git(root, ["switch", "-c", branch]);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(join(root, ".arc", "active", `meta-${workUnit}.md`), makeMetaFixture(workUnit, {
    owner: "test-user", branch, workClass: "Light", taskList: `tasks-${workUnit}.md`,
    lastCompleted: "verification", nextTask: "Verification complete", nextAction: "prepare publication",
  }));
  await writeFile(join(root, "README.md"), "# Design\n\nA settled design.\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "write design"]);
  await writeFile(join(root, ".arc", "active", `tasks-${workUnit}.md`),
    "# Task List: Example\n\n## **Phase 1:** Verification\n\n### `[x]` **1.1 Verification complete**\n");
  await git(root, ["add", `.arc/active/tasks-${workUnit}.md`]);
  const attested = await runHandlerAt(root, () => handleAttest(workUnit, { json: true }, machine()));
  expect(attested.exitCode, attested.stdout + attested.stderr).toBe(0);
  const bin = join(root, ".arc-fixture", "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(root, ".git", "info", "exclude"), ".arc-fixture/\n", { flag: "a" });
  const host = join(bin, "gh");
  await writeFile(host, ["#!/bin/sh", 'case "$1:$2" in',
    `repo:view) printf '%s\\n' '{"nameWithOwner":"owner/repository"}' ;;`,
    "pr:list) printf '%s\\n' '[]' ;;",
    '*) echo "unexpected host invocation: $*" >&2; exit 1 ;;', "esac", ""].join("\n"));
  await chmod(host, 0o755);
  return { root, env: { PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` } };
}

describe("pre-publication frontline policy skip", () => {
  it.each(["design-authority", "constitutional"] as const)(
    "reaches required standard review after resolving and resuming a %s skip", async (surfaceAuthority) => {
      const fixture = await candidate();
      const facts = { changeSetState: "known", contentKind: "documentation", reviewRisk: "routine",
        changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority };
      const factsPath = join(fixture.root, ".arc-fixture", "facts.json");
      await writeFile(factsPath, JSON.stringify(facts));
      const initial = await runHandlerAt(fixture.root, () => handleReviewPrePublication(workUnit,
        { selfReview: "settled", changeSet: factsPath }, {}, machine()), { env: fixture.env });
      expect(initial.exitCode, initial.stdout + initial.stderr).toBe(0);
      const offered = PrePublicationReviewEnvelopeSchema.parse(JSON.parse(initial.stdout));
      const resumeCommand = ("resumeCommand" in offered.nextAction ? offered.nextAction.resumeCommand : undefined)
        ?? offered.nextAction.command;
      const resume = resumeCommand.match(/--resume ([A-Za-z0-9_-]+)/u)?.[1];
      expect(resume).toBeDefined();
      const composed = await runHandlerAt(fixture.root, async () => {
        const composition = await composePrePublicationReviewRequest({ workUnit, selfReview: "settled", changeSet: facts },
          createPrePublicationCompositionDependencies({ cwd: fixture.root, exec: makeGitExec(fixture.root) }));
        if (composition.status !== "composed" || composition.request.target === null) throw new Error("target missing");
        const { request } = composition;
        expect(request.routingFacts.activity.frontlineReview).toBe(true);
        expect(request.standard.standardReview).toMatchObject({
          obligation: "required", reasons: expect.arrayContaining([
            surfaceAuthority === "constitutional" ? "constitutional-surface" : surfaceAuthority,
          ]),
        });
        const target = request.target;
        if (target === null) throw new Error("target missing");
        await handleReviewFrontlineResolve("-", { readText: async () => JSON.stringify({
          schemaVersion: 1, changeSet: request.routingFacts, invocation: { mode: "inherit", sourceId: "coderabbit-cli" },
          target: { kind: target.kind, baseRef: target.baseRef, diffBaseSha: target.diffBaseSha, headSha: target.headSha },
        }) }, machine());
      }, { env: fixture.env });
      expect(composed.exitCode, composed.stdout + composed.stderr).toBe(0);
      expect(JSON.parse(composed.stdout)).toMatchObject({ state: "skipped", nextAction: "none" });
      const resumed = await runHandlerAt(fixture.root, () => handleReviewPrePublication(workUnit,
        { resume }, {}, machine()), { env: fixture.env });
      expect(resumed.exitCode, resumed.stdout + resumed.stderr).toBe(0);
      expect(JSON.parse(resumed.stdout)).toMatchObject({
        locus: "candidate-review-pending", policy: { state: "ready", nextAction: "local-prepare" },
        nextAction: { command: expect.stringContaining("arc review pre-publication example --resume ") },
      });
      expect((await readSubmissionBoundaryVersioned(fixture.root, workUnit)).boundary)
        .toMatchObject({ locus: "candidate-review-pending" });
    },
  );
});
