/** The default policy command keeps native opening-window diagnostics behind composition. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { localOutcome } from "../fixtures/review-outcome.js";
import { handleReviewResolve } from "../../src/handlers/review.js";

it("reports the native closed-window diagnostic through the default policy handler", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", branch = "topic/opaque";
  await h.reference.seedProject(projectId);
  await h.reference.seedMeta("example", { owner: "andrew", branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.frontline_sources: [coderabbit-cli]\n");
  await git("add", ".");
  await git("commit", "-m", "Configure review window");
  await git("switch", "-c", branch);
  const headSha = await git("rev-parse", "HEAD");
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = localOutcome().requirement;
  const request = { schemaVersion: 1, lane: "frontline", frontlineActive: true,
    target: { repository: "owner/repo", pullRequest: 42, headSha }, completedPasses: 0, attempts: [],
    standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } };
  let output = "";
  const exits: number[] = [];
  await handleReviewResolve("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(request),
    write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined,
  { store: h.reference.store, projectId: h.reference.projectId });
  expect(exits, output).toEqual([]);
  expect(JSON.parse(output)).toMatchObject({ state: "skipped", payload: { reason: "phase-closed" },
    diagnostics: [{ code: "frontline-window-closed" }] });
}, 30_000);
