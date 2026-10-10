import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../helpers/schema-assertion.js";

import type { BaseMergeResult } from "../../src/scripts/base/merge.js";
import { RespondVerifiedFixSchema } from "../../src/scripts/review-gate/runtime/respond-command.js";
import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const root = resolve(import.meta.dirname, "../../../..");
const read = async (name: string): Promise<string> => readFile(resolve(root, ".github/workflows", name), "utf8");
const readRepositoryFile = async (path: string): Promise<string> => readFile(resolve(root, path), "utf8");

function jobValue(workflow: string, name: string): Record<string, unknown> {
  const parsed = load(workflow) as { jobs?: Record<string, unknown> };
  const job = parsed.jobs?.[name];
  if (typeof job !== "object" || job === null) throw new Error(`missing workflow job: ${name}`);
  return job as Record<string, unknown>;
}

function stepValue(workflow: string, jobName: string, stepId: string): Record<string, unknown> {
  const steps = jobValue(workflow, jobName).steps;
  if (!Array.isArray(steps)) throw new Error(`missing workflow steps: ${jobName}`);
  const step = steps.find((candidate) => typeof candidate === "object"
    && candidate !== null
    && "id" in candidate
    && candidate.id === stepId);
  if (typeof step !== "object" || step === null) throw new Error(`missing workflow step: ${jobName}.${stepId}`);
  return step as Record<string, unknown>;
}

function sectionBetween(content: string, start: string, end?: string): string {
  const startIndex = content.indexOf(start);
  if (startIndex === -1) throw new Error(`missing section start: ${start}`);
  if (end === undefined) return content.slice(startIndex);
  const endIndex = content.indexOf(end, startIndex + start.length);
  if (endIndex === -1) throw new Error(`missing section end after "${start}": ${end}`);
  return content.slice(startIndex, endIndex);
}

function expectProducerBackedResponseOrder(content: string, start: string, end: string): void {
  const response = sectionBetween(content, start, end);
  const triage = response.indexOf("[`review-triage`]");
  const gatingPolicy = response.indexOf("proposal.severityGatingPolicy", triage);
  const proposalCall = response.indexOf("arc review respond -", gatingPolicy);
  const report = response.indexOf("payload.dispositionReportText", proposalCall);
  const approval = response.indexOf("complete-set approval", report);
  const approvedCall = response.indexOf("arc review respond -", proposalCall + 1);
  const performance = response.indexOf("[`review-response`]", approvedCall);

  expect(triage).toBeGreaterThanOrEqual(0);
  expect(gatingPolicy).toBeGreaterThan(triage);
  expect(proposalCall).toBeGreaterThan(triage);
  expect(report).toBeGreaterThan(proposalCall);
  expect(approval).toBeGreaterThan(report);
  expect(approvedCall).toBeGreaterThan(approval);
  expect(performance).toBeGreaterThan(approvedCall);
}

describe("trusted review-gate workflows", () => {
  it("publishes independent CI truth and a thin compatibility alias", async () => {
    const workflow = await read("ci.yml");
    expect(workflow).toContain("  ci_ok:\n    name: ci-ok");
    // Shared setup is a required dependency so a failed install cannot roll up green
    // via skipped consumer legs.
    expect(workflow).toContain(
      "needs: [classify, setup, build, lint-typecheck, unit, integration, e2e, portability, portability-cross-platform]",
    );
    expect(workflow).toMatch(/ {2}merge-ok:\n {4}name: merge-ok\n {4}permissions: \{\}\n {4}needs: ci_ok/u);
    expect(workflow).toContain("scripts/classify-change.sh lane --stdin0");
    expect(workflow).toContain("scripts/classify-change.sh portability --stdin0");
    expect(workflow).toContain("git diff --name-only -z");
    expect(workflow).not.toContain("changed_all=");
  });

  it("routes only the Linux CI graph through the fail-safe repository variable", async () => {
    const workflow = await read("ci.yml");
    const linuxRunner = "${{ vars.ARC_CI_LINUX_RUNNER || 'ubuntu-latest' }}";
    const linuxJobs = [
      "classify",
      "setup",
      "build",
      "lint-typecheck",
      "unit",
      "integration",
      "e2e",
      "portability",
      "ci_ok",
      "merge-ok",
    ];
    for (const job of linuxJobs) expect(jobValue(workflow, job)["runs-on"], job).toBe(linuxRunner);

    expect(jobValue(workflow, "portability-cross-platform")["runs-on"]).toBe("${{ matrix.os }}");
    for (const name of ["docs.yml", "arc-lane-attestation.yml"]) {
      const hostedWorkflow = await read(name);
      const parsed = load(hostedWorkflow) as { jobs?: Record<string, Record<string, unknown>> };
      for (const [job, value] of Object.entries(parsed.jobs ?? {})) {
        expect(value["runs-on"], `${name}:${job}`).toBe("ubuntu-latest");
      }
    }
  });

  it("sizes Vitest for the selected Linux runner capacity", async () => {
    const workflow = await read("ci.yml");
    const parsed = load(workflow) as {
      env?: Record<string, unknown>;
      jobs?: Record<string, { env?: Record<string, unknown> }>;
    };
    expect(parsed.env?.VITEST_MAX_WORKERS).toBe(
      "${{ vars.ARC_CI_VITEST_MAX_WORKERS || (vars.ARC_CI_LINUX_RUNNER && '1') || '' }}",
    );
    expect(parsed.jobs?.["portability-cross-platform"]?.env?.VITEST_MAX_WORKERS).toBe("");
  });

  it("times each CI test job and reports its advisory budget after the tests", async () => {
    const workflow = await read("ci.yml");
    const jobs = [
      ["unit", "unit", "unit", "unit-${{ matrix.shard }}"],
      ["integration", "integration", "integration", "integration-${{ matrix.shard }}"],
      ["e2e", "e2e", "e2e", "e2e-${{ matrix.shard }}"],
    ] as const;

    for (const [jobName, tier, projectSet, ciJob] of jobs) {
      const steps = jobValue(workflow, jobName).steps;
      expect(Array.isArray(steps)).toBe(true);
      const ordered = steps as Array<Record<string, unknown>>;
      expect(ordered.at(0)?.name, jobName).toBe("Start test budget clock");
      expect(ordered.at(0)?.run, jobName).toContain("$(date +%s)");
      expect(ordered.at(0)?.run, jobName).not.toContain("%N");
      const report = ordered.at(-1);
      expect(report?.name, jobName).toBe("Report test budget");
      expect(report?.run, jobName).toContain(`--tier ${tier}`);
      expect(report?.run, jobName).toContain(`--project-set ${projectSet}`);
      expect(report?.run, jobName).toContain(`--ci-job "${ciJob}"`);
      expect(report?.run, jobName).toContain("--started-at-seconds");
    }
  });

  it("retains unit durations and timeout metadata even when tests fail", async () => {
    const unit = jobValue(await read("ci.yml"), "unit");
    expect(unit.permissions).toMatchObject({ contents: "read", actions: "write" });
    const steps = unit.steps as Array<Record<string, unknown>>;
    const test = steps.find((step) => step.id === "test");
    expect(test?.run).toContain("--reporter=default");
    expect(test?.run).toContain("--reporter=github-actions");
    expect(test?.run).toContain("--reporter=json");
    expect(test?.run).toContain("--outputFile=unit-test-report.json");
    const upload = steps.find((step) => step.name === "Upload unit test report");
    expect(upload?.uses).toMatch(/^actions\/upload-artifact@/u);
    expect(upload?.if).toBe("${{ !cancelled() }}");
    expect(upload?.with).toMatchObject({
      name: "unit-test-report-${{ matrix.shard }}",
      path: "packages/arc-framework/unit-test-report.json",
      "if-no-files-found": "error",
    });
    expect(steps.at(-1)?.name).toBe("Report test budget");
  });

  it("runs four E2E shards from the declaration forecast", async () => {
    const workflow = await read("ci.yml");
    const e2e = jobValue(workflow, "e2e");
    expect(e2e.name).toBe("E2E Tests (${{ matrix.shard }})");
    expect(e2e.strategy).toEqual({ "fail-fast": false, matrix: { shard: [1, 2, 3, 4] } });
    const steps = e2e.steps as Array<Record<string, unknown>>;
    const runs = steps.map((step) => step.run)
      .filter((run): run is string => typeof run === "string" && run.includes("run-ci-checks.mjs run e2e test"));
    expect(runs).toEqual(["node --import tsx scripts/run-ci-checks.mjs run e2e test --shard ${{ matrix.shard }}"]);
    expect(steps.some((step) => typeof step.run === "string" && step.run.includes("--exclude"))).toBe(false);
  });

  it("runs four integration shards from the declaration forecast", async () => {
    const workflow = await read("ci.yml");
    const integration = jobValue(workflow, "integration");

    expect(integration.name).toBe("Integration Tests (${{ matrix.shard }})");
    expect(integration.strategy).toEqual({ "fail-fast": false, matrix: { shard: [1, 2, 3, 4] } });

    const steps = integration.steps;
    expect(Array.isArray(steps)).toBe(true);
    const runs = (steps as Array<Record<string, unknown>>)
      .map((step) => step.run)
      .filter((run): run is string => typeof run === "string" && run.includes("run-ci-checks.mjs run integration test"));
    expect(runs).toEqual(["node --import tsx scripts/run-ci-checks.mjs run integration test --shard ${{ matrix.shard }}"]);
  });

  it("provisions Node before the classifier hashes the code tree", async () => {
    const workflow = await read("ci.yml");
    const classifySteps = jobValue(workflow, "classify").steps;
    expect(Array.isArray(classifySteps)).toBe(true);

    const steps = classifySteps as Array<Record<string, unknown>>;
    const setupNodeIndex = steps.findIndex(
      (step) => typeof step.uses === "string" && step.uses.startsWith("actions/setup-node@"),
    );
    const classifierIndex = steps.findIndex((step) => step.id === "c");

    expect(setupNodeIndex).toBeGreaterThanOrEqual(0);
    expect(classifierIndex).toBeGreaterThan(setupNodeIndex);
  });

  it("gives recorded integration field runs complete repository history", async () => {
    const workflow = await read("ci.yml");
    const integrationSteps = jobValue(workflow, "integration").steps;
    expect(Array.isArray(integrationSteps)).toBe(true);

    const checkout = (integrationSteps as Array<Record<string, unknown>>).find(
      (step) => typeof step.uses === "string" && step.uses.startsWith("actions/checkout@"),
    );
    expect(checkout).toMatchObject({
      with: {
        "fetch-depth": 0,
        "persist-credentials": false,
      },
    });
  });

  it("keeps the Linux portability check executor-neutral and non-matrix", async () => {
    const workflow = await read("ci.yml");
    const portability = jobValue(workflow, "portability");
    expect(portability.name).toBe("Portability (concurrency guards) (linux)");
    expect(portability).not.toHaveProperty("strategy");

    const crossPlatform = jobValue(workflow, "portability-cross-platform");
    expect(crossPlatform.strategy).toMatchObject({
      matrix: { os: ["windows-latest", "macos-latest"] },
    });
  });

  it("contains Actions spend while retaining explicit and bounded portability coverage", async () => {
    const workflow = await read("ci.yml");
    expect(workflow).toContain("push:\n    branches: [main]");
    // Weekly cross-platform cron — a post-merge backstop now that PR runs never
    // fire the hosted Windows/macOS pair, so the multiplier cost is negligible.
    expect(workflow).toContain("schedule:\n    - cron: '17 8 * * 1'");
    expect(workflow).toContain("os: [windows-latest, macos-latest]");
    // The relevance classifier stays live (fail-safe machinery included) even
    // though pull-request runs no longer fire the hosted Windows/macOS pair.
    expect(workflow).toContain('echo "::error::portability classifier failed"');
    expect(workflow).toContain('echo "::error::invalid portability classifier output: $portability_target"');
    // The pair fires only on the weekly schedule or an explicit dispatch
    // opt-in, so PR synchronizes never bill hosted-runner multipliers.
    expect(jobValue(workflow, "portability-cross-platform").if).toBe(
      "${{ needs.setup.result == 'success' && ((github.event_name == 'workflow_dispatch' && inputs.run_portability_pair) || " +
        "github.event_name == 'schedule') }}",
    );
    expect(jobValue(workflow, "portability-cross-platform").needs).toBe("setup");
    const triggers = (load(workflow) as { on?: Record<string, unknown> }).on;
    expect(triggers?.workflow_dispatch).toMatchObject({
      inputs: { run_portability_pair: { type: "boolean", default: false } },
    });
    const targetedJob = sectionBetween(workflow, "  portability-cross-platform:", "  ci_ok:");
    expect(targetedJob).not.toContain("needs.classify.outputs.weight");
    expect(targetedJob).not.toContain("github.event_name == 'pull_request'");
  });

  it("keeps the public review CLI inside the published graph", async () => {
    const tsup = await readFile(resolve(root, "packages/arc-framework/tsup.config.ts"), "utf8");
    const productionRegistry = await readFile(
      resolve(root, "packages/arc-framework/src/production-schema-registry.ts"),
      "utf8",
    );
    const manifest = JSON.parse(await readFile(resolve(root, "packages/arc-framework/package.json"), "utf8")) as {
      files: string[];
      scripts?: Record<string, string>;
    };
    expect(tsup).toContain('entry: ["src/cli.ts"]');
    expect(productionRegistry).toContain("registerReviewDomainSchemas");
    expect(productionRegistry).toContain("registerDeliveryDomainSchemas");
    expect(productionRegistry).toContain("registerDeliveryAuthoringSchemas");
    expect(productionRegistry).toContain("registerSessionEnvelopeSchemas");
    expect(productionRegistry).toContain("registerDecomposeSchemas");
    const compactRegistry = productionRegistry.replace(/\s+/gu, " ");
    expect(compactRegistry).toContain(
      "return registerCheckDeclarationSchemas(registerSchemaCommandSchemas(registerDecomposeSchemas(registerSessionEnvelopeSchemas(registerDeliveryAuthoringSchemas( "
      + "registerDeliveryDomainSchemas(registerReviewDomainSchemas(createKernelRegistry())), )))));",
    );
    expect(tsup).not.toMatch(/entry:[^\n]*review-gate/u);
    expect(manifest.files).not.toContain("src");
    const rootManifest = JSON.parse(await readRepositoryFile("package.json")) as { scripts: Record<string, string> };
    expect(Object.keys(rootManifest.scripts).some((name) => name.startsWith("review-gate:"))).toBe(false);
    expect(manifest.scripts?.["review-gate:await"]).toBeUndefined();
  });

  it("pins the focused ARC contract slice and light-only CI invocation", async () => {
    const packageManifest = JSON.parse(await readRepositoryFile("packages/arc-framework/package.json")) as {
      scripts: Record<string, string>;
    };
    const rootManifest = JSON.parse(await readRepositoryFile("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(packageManifest.scripts["test:arc-contracts"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts arc-contracts",
    );
    expect(rootManifest.scripts["test:arc-contracts"]).toBe(
      "npm run test:arc-contracts -w packages/arc-framework --",
    );

    const workflow = await read("ci.yml");
    const lintSteps = jobValue(workflow, "lint-typecheck").steps;
    expect(Array.isArray(lintSteps)).toBe(true);
    const focused = (lintSteps as Array<Record<string, unknown>>)
      .filter((step) => step.id === "arc-contracts");
    expect(focused).toEqual([{ id: "arc-contracts", if: "${{ needs.classify.outputs.weight == 'light' }}",
      run: "node --import tsx scripts/run-ci-checks.mjs run lint-typecheck arc-contracts" }]);

    const unitCondition = "${{ !cancelled() && needs.classify.result == 'success' && " +
      "needs.classify.outputs.duplicate_push != 'true' && (needs.classify.outputs.weight != 'light' || " +
      "github.event_name == 'workflow_dispatch' || github.event_name == 'schedule') && needs.setup.result == 'success' }}";
    expect(jobValue(workflow, "unit").if).toBe(unitCondition);
    const broadSuiteCondition = "${{ !cancelled() && needs.setup.result == 'success' && needs.build.result == 'success' && " +
      "((github.event_name == 'pull_request' && needs.classify.outputs.lane == 'reviewed' && " +
      "needs.classify.outputs.weight != 'light') || github.event_name == 'workflow_dispatch' || github.event_name == 'schedule') }}";
    for (const jobName of ["integration", "e2e"]) expect(jobValue(workflow, jobName).if).toBe(broadSuiteCondition);
    expect(jobValue(workflow, "portability").if).toBe(broadSuiteCondition.replace(" || github.event_name == 'schedule'", ""));
  });

  it("parses every workflow and pins every external action", async () => {
    const names = (await readdir(resolve(root, ".github/workflows"))).filter((name) => /\.ya?ml$/u.test(name));
    for (const name of names) {
      const workflow = await read(name);
      expect(() => load(workflow), name).not.toThrow();
      for (const action of workflow.matchAll(/^\s*-\s+uses:\s+([^\s#]+)/gmu)) {
        if (action[1]?.startsWith("./")) continue;
        expect(action[1], `${name}: ${action[1]}`).toMatch(/@[0-9a-f]{40}$/u);
      }
    }
  });

  it("retains only the lane attestation from the retired review-gate family", async () => {
    const names = (await readdir(resolve(root, ".github/workflows"))).filter((name) => /\.ya?ml$/u.test(name));
    expect(names.filter((name) => name.startsWith("review-gate"))).toEqual([]);
    expect(names).toContain("arc-lane-attestation.yml");
    // The clearance producer and its required status retired together — a surviving
    // producer with no requirement is harmless, but a requirement with no producer
    // blocks every pull request permanently.
    expect(names).not.toContain("arc-clearance.yml");
  });

  it("assembles a provisional candidate only after authoritative review settlement", async () => {
    const [packaged, project, packagedRules, projectRules] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile("packages/arc-framework/arc/system/rules/DEV-RULES.ARC.md"),
      readRepositoryFile(".arc/system/rules/DEV-RULES.ARC.md"),
    ]);
    expect(project).toBe(packaged);
    expect(projectRules).toBe(packagedRules);
    expect(packagedRules).toMatch(/sole bounded exception[\s\S]*provisional integration candidate/iu);
    expect(packagedRules).toMatch(/implementation or finding-driven fix[\s\S]*structured approval gate/iu);
    expect(packagedRules).toMatch(/exact-head integration authorization/iu);

    const candidate = sectionBetween(
      packaged,
      "## Phase 2: Compose, sweep, ship",
      "### 10) Behind-base reconcile gate and merge",
    );
    expect(candidate).toContain("`review-settled`");
    expect(candidate).toContain("candidate-entry state");
    expect(candidate).toContain("never merge readiness");
    expect(candidate).toMatch(/raw local clean report[\s\S]*unattested/iu);
    expect(candidate).toMatch(/canonical settled WU change set[\s\S]*completed task outcomes/u);
    expect(candidate).toMatch(/spec intent and\s+non-goals[\s\S]*success-criteria disposition/u);
    expect(candidate).toContain("verification evidence");
    expect(candidate).toMatch(/alignment disagreement|failed quality gate|base conflict|unexpected state/u);
    expect(candidate).toContain("Recompose its exact target");
    expect(candidate).toMatch(/pre-composition\s+direction[\s\S]*not\s+prospective merge authority/u);
    expect(candidate).not.toContain("Stop before composition begins");
    expect(candidate).not.toMatch(softWrappedProse("proceed to commit + sweep + push"));
  });

  it("keeps composition public and delegates final evidence rendering to the checkpoint", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const releaseNotes = sectionBetween(
      packaged,
      "### 5) Compose Release Notes Entry",
      "### 6) Compose Completion Notes",
    );
    expect(releaseNotes).toMatch(/shipped reader\/operator-visible outcomes/u);
    expect(releaseNotes).toMatch(/WU names or slugs[\s\S]*task or phase references[\s\S]*branches/u);
    expect(releaseNotes).toMatch(/roadmap pointers[\s\S]*internal review or provider machinery/u);
    expect(releaseNotes).toContain("planned-but-unshipped work");
    expect(releaseNotes).toMatch(/publicly supported review concepts and configuration[\s\S]*shipped outcome/iu);
    expect(releaseNotes).toContain("`### <Category>`");
    expect(releaseNotes).toMatch(/dash and one space[\s\S]*continuation lines at least two spaces/u);
    expect(releaseNotes).toMatch(/Infrastructure[\s\S]*externally meaningful[\s\S]*operational change/u);
    expect(releaseNotes).toMatch(/`### Breaking Changes`[\s\S]*affected stability contract[\s\S]*migration/u);

    const completionNotes = sectionBetween(
      packaged,
      "### 6) Compose Completion Notes",
      "### 7) Commit completion content",
    );
    expect(completionNotes).toMatch(/delivered scope[\s\S]*material deviations or supersessions/u);
    expect(completionNotes).toContain("verified evidence");
    expect(completionNotes).toMatch(/never repeat[\s\S]*(?:task list|git history)/iu);

    const finalGate = sectionBetween(
      packaged,
      "### 10) Behind-base reconcile gate and merge",
      "### 11) Post-merge worktree cleanup",
    );
    expect(finalGate).toContain("payload.interlockSurface.machineEvidence.text");
    expect(finalGate).toContain("**Extension report** · `#pre-merge`");
    expect(finalGate).toMatch(/approved responses[\s\S]*already performed[\s\S]*not re-approved/iu);
    expect(finalGate).not.toContain("exact candidate-tail diff");
  });

  it("discloses the applicability calls, dispositions, and narrowed tail diff at the merge stop", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      ),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(project).toBe(packaged);

    const finalGate = sectionBetween(
      packaged,
      "### 10) Behind-base reconcile gate and merge",
      "### 11) Post-merge worktree cleanup",
    );
    const interlock = finalGate.slice(finalGate.lastIndexOf("`integration-interlock`"));
    expect(interlock).toMatch(/candidate-tail diff[\s\S]*Release Notes entry and Completion Notes/u);
    expect(interlock).toContain("named rather than diffed");
    expect(interlock).toMatch(softWrappedProse("review applicability calls and targeted verification"));
    expect(interlock).toMatch(softWrappedProse("approved responses already performed there and the final dispositions carried by the checkpointed settlement plan"));
    expect(interlock).not.toContain("proposed final dispositions");
    expect(interlock).not.toContain("applies final dispositions");
    expect(finalGate).toMatch(softWrappedProse("Re-enter status once over the checkpointed head, in Step 2's status scope, and surface its `hostReview`"));
    expect(interlock).toMatch(softWrappedProse("the Owner direction obtained for any `hostReview` blocker"));

    const reviewCoordination = sectionBetween(
      packaged,
      "### 3) Confirm review coordination",
      "### 4) Spec-presence + alignment checks",
    );
    expect(reviewCoordination).toContain("approved no-action record-only set");
    expect(reviewCoordination).toContain("cannot remain merely proposed");
  });

  it("routes frontline and local review through the public advisory command surface", async () => {
    const paths = [
      ["system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md", /targeted[\s\S]*focused[\s\S]*full/iu],
      ["system/workflows/arc/supplemental/run-errand.md", /supplemental[\s\S]*fresh/iu],
    ] as const;
    for (const [path, applicabilityPattern] of paths) {
      const [packaged, project] = await Promise.all([
        readRepositoryFile(`packages/arc-framework/arc/${path}`),
        readRepositoryFile(`.arc/${path}`),
      ]);
      expect(project).toBe(packaged);
      for (const command of [
        "arc review frontline run -",
        "arc review local prepare -",
        "arc review local attest -",
        "arc review local resume -",
        "arc review respond -",
        "arc review reduce -",
      ]) {
        expect(packaged).toContain(command);
      }
      if (path.includes("prepare-work-unit")) {
        expect(packaged).toContain("`nextAction.command`");
        expect(packaged).toContain("`nextAction.request`");
        expect(packaged).toContain("`nextAction.authorizationRequest`");
        expect(packaged).toContain("`nextAction.resumeCommand`");
        expect(packaged).toMatch(/JSON stdin/iu);
        expect(packaged).toMatch(/offered \/ obtain-authorization[\s\S]*Approve \(or redirect\)\?/u);
      } else {
        expect(packaged).toContain("arc review frontline resolve -");
      }
      expect(packaged).toMatch(/runtime-owned bindings/iu);
      expect(packaged).toContain("`findings / respond`");
      expect(packaged).toContain("approvedVerification");
      expect(packaged).toMatch(/does not select fewer checks/iu);
      expect(packaged).toMatch(/review applicability|applicability from the exact delta/u);
      expect(packaged).toMatch(applicabilityPattern);
      expect(packaged).toMatch(/command error\s+envelope/iu);
      expect(packaged).not.toMatch(/ReviewOperationStateStore|invalid-request/u);
      expect(packaged).not.toMatch(/review-suspension|promoted watcher|scheduled wakeup/iu);
      expect(packaged).not.toMatch(/project review coordinator|coordinate-pr-review/iu);
    }
  });

  it("settles a verified Candidate fix before Candidate re-root", async () => {
    const path = "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md";
    const [packaged, project] = await Promise.all([
      readRepositoryFile(`packages/arc-framework/arc/${path}`),
      readRepositoryFile(`.arc/${path}`),
    ]);
    expect(project).toBe(packaged);

    const responseSection = sectionBetween(
      packaged,
      "For every durable producer finding, run",
      "Proceed only from `candidate-publish-ready`",
    );
    const compactResponse = responseSection.replace(/\s+/gu, " ");
    const fixCommit = compactResponse.indexOf("commit atomically");
    const verifiedResponse = compactResponse.indexOf("`verifiedFix`");
    const responseCommit = compactResponse.indexOf("commit its staged Candidate response");
    const candidateReroot = compactResponse.indexOf("rerun Step 1");

    expect(fixCommit).toBeGreaterThanOrEqual(0);
    expect(verifiedResponse).toBeGreaterThan(fixCommit);
    expect(responseCommit).toBeGreaterThan(verifiedResponse);
    expect(candidateReroot).toBeGreaterThan(responseCommit);
    expect(responseSection).toMatch(
      /candidate-advanced \/ continue-review[\s\S]*candidate-current \/ continue-review/iu,
    );
  });

  it("keeps convergence projections staged through returned prepublication re-entry", async () => {
    const preparePath = "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md";
    const verifyPath = "system/workflows/arc/work-unit-lifecycle/verify-work-unit.md";
    const [packagedPrepare, projectPrepare, packagedVerify, projectVerify] = await Promise.all([
      readRepositoryFile(`packages/arc-framework/arc/${preparePath}`),
      readRepositoryFile(`.arc/${preparePath}`),
      readRepositoryFile(`packages/arc-framework/arc/${verifyPath}`),
      readRepositoryFile(`.arc/${verifyPath}`),
    ]);
    expect(projectPrepare).toBe(packagedPrepare);
    expect(projectVerify).toBe(packagedVerify);

    const convergence = sectionBetween(
      packagedPrepare,
      "A null `policy` means no lane operation is open",
      "Proceed only from `candidate-publish-ready`",
    );
    expect(convergence).toMatch(/run-convergence-verification[\s\S]*nextAction\.attestArgv/iu);
    expect(convergence).toMatch(/keep (?:every )?projection staged[\s\S]*`candidate-publish-ready`/iu);
    expect(convergence).not.toMatch(/commit (?:the )?convergence/iu);
    expect(packagedVerify).toMatch(/initial Candidate attestation[\s\S]*convergence\s+attestation/iu);
  });

  it("routes Errand review and re-entry through the public command protocol", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(project).toBe(packaged);
    const prePrExemption = packaged.indexOf("arc review planning-grooming resolve -");
    const openedPr = packaged.indexOf("4. **Enter the open PR.**");
    const openedTargetExemption = packaged.indexOf("arc review planning-grooming resolve -", openedPr);
    const finalHead = packaged.indexOf("5. **Settle the final head.**");
    const integrationInterlock = packaged.indexOf("`integration-interlock`", finalHead);
    expect(prePrExemption).toBeGreaterThanOrEqual(0);
    expect(openedTargetExemption).toBeGreaterThan(openedPr);
    expect(finalHead).toBeGreaterThan(openedTargetExemption);
    expect(integrationInterlock).toBeGreaterThan(finalHead);
    expect(packaged).toMatch(/`exempt \/ none`[\s\S]*both review lanes/iu);
    expect(packaged).toMatch(/`review-required \/ continue-review`[\s\S]*ordinary review/iu);
    expect(packaged).toMatch(/`not-eligible \/ continue-review`[\s\S]*ordinary review/iu);
    expect(packaged).toMatch(/caller-owned[^.]*content kind[^.]*surface authority/iu);
    expect(packaged).toMatch(/never infer[^.]*planning-lane/iu);
    expect(packaged).toMatch(/atomic determinacy[\s\S]*routing fact/iu);
    expect(packaged).toMatch(/arc review resolve -[\s\S]*review-response/iu);
    expect(packaged).toMatch(/On interruption[\s\S]*typed `state` \/ `nextAction`/iu);
    expect(packaged).not.toMatch(/vehicle-neutral response-state store|review-suspension|promoted watcher/u);
    expect(packaged).toMatch(/merge lane[\s\S]*downstream presentation/u);
    expect(packaged).toMatch(/Never reconstruct review state[\s\S]*invent\s+WU state/iu);
    expect(packaged).toMatch(/head movement[^.]*invalidates[^.]*exemption[^.]*return/iu);
    expect(packaged.slice(finalHead, integrationInterlock)).toMatch(
      /adapter target[^.]*match it/iu,
    );
  });

  it("resolves routing-only grooming exemption before opening a housekeeping PR", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/drain-inbox.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/drain-inbox.md"),
    ]);
    expect(project).toBe(packaged);
    const fullProtection = sectionBetween(packaged, "- **Fully protected**", "- **Partially protected**");
    const exemption = fullProtection.indexOf("arc review planning-grooming resolve -");
    const prCreation = fullProtection.indexOf("arc merge lock resolve -");
    const openedTargetResolution = fullProtection.indexOf(
      "arc review planning-grooming resolve -",
      prCreation,
    );
    const integrationInterlock = fullProtection.indexOf("`integration-interlock`", openedTargetResolution);
    const laneClassification = fullProtection.indexOf(
      "arc review planning-lane <base-sha> <head-sha>",
      integrationInterlock,
    );
    const mergeMethodResolution = fullProtection.indexOf(
      "arc review merge-method resolve",
      laneClassification,
    );
    const lockRelease = fullProtection.indexOf("arc merge lock release -", mergeMethodResolution);
    const autoMerge = fullProtection.indexOf(
      "gh pr merge <pr-number> --auto --<method> --match-head-commit <head-sha>",
      lockRelease,
    );
    expect(exemption).toBeGreaterThanOrEqual(0);
    expect(prCreation).toBeGreaterThan(exemption);
    expect(openedTargetResolution).toBeGreaterThan(prCreation);
    expect(integrationInterlock).toBeGreaterThan(openedTargetResolution);
    expect(laneClassification).toBeGreaterThan(integrationInterlock);
    expect(mergeMethodResolution).toBeGreaterThan(laneClassification);
    expect(lockRelease).toBeGreaterThan(mergeMethodResolution);
    expect(autoMerge).toBeGreaterThan(lockRelease);
    expect(fullProtection).toMatch(/`exempt \/ none`[\s\S]*skip[^.]*review/iu);
    expect(fullProtection).toMatch(/continue-review[\s\S]*reviewed-lane/iu);
    expect(fullProtection).toMatch(/never infer[^.]*planning-lane/iu);
    expect(fullProtection).toMatch(/head movement[^.]*invalidates[^.]*exemption[^.]*return/iu);
    expect(fullProtection).toMatch(
      /after approval[\s\S]*head differs[^.]*return[^.]*adapter[^.]*integration\s+interlock/iu,
    );
    expect(fullProtection.slice(mergeMethodResolution, lockRelease)).toMatch(
      /validated \/ use-method[\s\S]*returned `method`[\s\S]*sole/iu,
    );
  });

  it("surfaces exact-head CI failures while a hosted review remains pending", async () => {
    const paths = [
      "system/workflows/arc/supplemental/run-errand.md",
      "system/workflows/arc/supplemental/deliver-stack.md",
      "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    ];
    for (const path of paths) {
      const [packaged, project] = await Promise.all([
        readRepositoryFile(`packages/arc-framework/arc/${path}`),
        readRepositoryFile(`.arc/${path}`),
      ]);
      expect(project).toBe(packaged);
      const hostedAwait = packaged.indexOf("arc review hosted await -");
      const checksAwait = packaged.indexOf("arc review checks await", hostedAwait);
      expect(hostedAwait).toBeGreaterThanOrEqual(0);
      expect(checksAwait).toBeGreaterThan(hostedAwait);
      const pendingInspection = packaged.slice(hostedAwait, checksAwait + 1_500);
      expect(pendingInspection).toContain("--timeout-ms 10000");
      expect(pendingInspection).toContain("--poll-interval-ms 10000");
      expect(pendingInspection).toContain("diagnosticFailures");
      expect(pendingInspection).toContain("failureLogs.logs[].path");
      expect(pendingInspection).toContain("failureLogs.failures");
      expect(pendingInspection).toContain("`unavailable / retry`");
      expect(pendingInspection).toContain("`cause`");
      expect(pendingInspection).toContain("`detail`");
      expect(pendingInspection).toMatch(/read-only diagnos/iu);
      expect(pendingInspection).toMatch(/inspect-or-extend[\s\S]{0,250}diagnostic below, then stop/iu);
      expect(pendingInspection).toContain("continueAfterAttention: true");
      expect(pendingInspection).toMatch(/same hosted[^.]*action/iu);
      expect(pendingInspection).toMatch(/exact head[^.]*draft lock/iu);
      expect(pendingInspection).toMatch(/does\s+not[^.]*review settlement/iu);
    }
  });

  it("continues an Errand hosted await until its typed attention boundary", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(project).toBe(packaged);
    const pendingAwait = sectionBetween(
      packaged,
      "- `pending / await`",
      "- `pending / inspect-or-extend`",
    );
    expect(pendingAwait).toMatch(
      /retain[^.]*action[^.]*diagnostic[^.]*pass it unchanged[^.]*arc review hosted await[^.]*one more bounded call/iu,
    );
    expect(pendingAwait).toMatch(/repeat[^.]*inspect-or-extend[^.]*terminal outcome/iu);
  });

  it("executes mixed hosted settlement phases in the command-projected order", async () => {
    const paths = [
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    ];
    for (const path of paths) {
      const workflow = await readRepositoryFile(path);
      expect(workflow).toContain("payload.hostedSettlementPlan");
      expect(workflow).toContain("payload.hostedSettlementPlan.actorIdentity");
      expect(workflow).toMatch(
        /beforeFixFindingIds[\s\S]*before any\s+approved fix changes the head[\s\S]*afterFixFindingIds/iu,
      );
      expect(workflow).toMatch(
        /settlement: not-applicable[\s\S]*never invoke[\s\S]*hosted settle[\s\S]*post a reply[\s\S]*resolve anything/iu,
      );
      expect(workflow).toMatch(/already-settled[\s\S]*exact approved reply[\s\S]*no host\s+mutation/iu);
    }
  });

  it("publishes the canonical approved-disposition supersession choreography", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/methods/review-response.md"),
      readRepositoryFile(".arc/system/methods/review-response.md"),
    ]);
    expect(project).toBe(packaged);
    expect(packaged).toMatch(/two-call supersession.*proposal call.*approval call/isu);
    expect(packaged).toContain("predecessorDispositionSetId");
    expect(packaged).toContain("expectedFixPaths");
    expect(packaged).toMatch(/carriedFindingIds.*reopenedFindingIds/isu);
    expect(packaged).toMatch(/supersession-refused.*do not edit.*Git-common/isu);
  });

  it("re-enters retained hosted findings without spending a replacement review", async () => {
    const paths = [
      "packages/arc-framework/arc/system/workflows/arc/supplemental/deliver-stack.md",
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    ];
    for (const path of paths) {
      const workflow = await readRepositoryFile(path);
      expectProducerBackedResponseOrder(
        workflow,
        "`respond-to-findings` uses",
        path.includes("deliver-stack") ? "On `requested / await`" : "`delivery-correction-required",
      );
      expect(workflow).toMatch(/never requests another hosted review/iu);
    }
  });

  it("keeps producer-backed response choreography in every default caller", async () => {
    const [prepare, errand] = await Promise.all([
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md",
      ),
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);

    expectProducerBackedResponseOrder(prepare, "For every durable producer finding", "Proceed only from");
    expectProducerBackedResponseOrder(errand, "   - `findings / respond`", "   - `approval-required");
    expectProducerBackedResponseOrder(errand, "   - `findings / triage`", "   - `rate-limited");
  });

  it("keeps author self-review on the direct non-producer triage path", async () => {
    const [selfReview, verification] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/methods/self-review.md"),
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md",
      ),
    ]);

    expect(selfReview).toMatch(/arc:[\s\S]*methods:[\s\S]*- review-triage/u);
    expect(selfReview).toMatch(/author self-review[\s\S]*standalone[\s\S]*complete-set approval/iu);
    expect(selfReview).not.toContain("arc review respond -");
    expect(verification).toMatch(/self-review[\s\S]*review-triage[\s\S]*non-producer/iu);
    expect(verification).not.toContain("arc review respond -");
  });

  it("routes approved delivery-member fixes through the exact driver-owned authoring locus", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      ),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(project).toBe(packaged);
    expect(packaged).toMatch(
      /delivery-correction-required \/ continue-delivery-correction[\s\S]*payload\.correctionAction[\s\S]*authoring-required/iu,
    );
    expect(packaged).toMatch(
      /authoring\.checkoutPath[\s\S]*authoring\.ref[\s\S]*authoringAuthorization[\s\S]*resumeAction/iu,
    );
    expect(packaged).toMatch(/ready-to-fix \/ apply-fix[\s\S]*ordinary singleton route/iu);
  });

  it("carries an explicit standard-review provider through both review lifecycles", async () => {
    const [prepare, errand, integrate] = await Promise.all([
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md",
      ),
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      ),
    ]);

    expect(prepare).toMatch(/standard\.invocation:\s*\{ mode: "force", sourceId: "<source-id>" \}/u);
    expect(prepare).toMatch(
      /After every lane operation,[\s\S]*typed pre-publication[\s\S]*nextAction\.command[\s\S]*nextAction\.resumeCommand[\s\S]*opaque resume carries judgment/u,
    );
    expect(errand).toMatch(/invocation:\s*\{ mode: "force", sourceId: "<source-id>" \}/u);
    expect(errand).toMatch(/every policy call for that target/u);
    expect(integrate).toMatch(
      /publication-pending \/ continue-publication[\s\S]*arc review status --target[\s\S]*complete hosted request action[\s\S]*arc review hosted request -/u,
    );
  });

  it("settles the Errand exact head without importing WU products", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    const full = sectionBetween(packaged, "### Ship — full protection", "### Ship — partial protection");
    expect(full).toContain("arc base drift --json");
    expect(full).toContain("review applicability");
    expect(full).toMatch(/applicability-judgment-required[\s\S]*supplemental[\s\S]*fresh/u);
    expect(full).toMatch(
      /When gated local review ran,[\s\S]*include `\*\*Local review:\*\* \{carrier identity\}`/u,
    );
    expect(full).toMatch(/otherwise omit the field entirely/u);
    expect(full).toMatch(/`vehicle: errand`[\s\S]*outside WU composition-product requirements/u);
    expect(full).toMatch(/never infer[\s\S]*absent or\s+malformed WU state/iu);
    expect(full).toMatch(/strict Errand record[\s\S]*exact PR/iu);

    const preMerge = full.lastIndexOf("**Extension report** · `#pre-merge`");
    const interlock = full.lastIndexOf("`integration-interlock`");
    const terminalMerge = full.lastIndexOf("arc errand merge <slug> - --json");
    expect(preMerge).toBeLessThan(interlock);
    expect(interlock).toBeLessThan(terminalMerge);
    expect(full.match(/\*\*Extension report\*\* · `#pre-merge`/gu)).toHaveLength(1);
    const interlockText = full.slice(interlock, terminalMerge);
    const pinnedInterlockText = interlockText.replace(/^>\s?/gmu, "").replace(/\s+/gu, " ");
    expect(pinnedInterlockText).toContain("Surface the request");
    expect(pinnedInterlockText).toContain("proposed final dispositions");
    expect(pinnedInterlockText).toContain("authorizes the exact-head merge");
    expect(pinnedInterlockText).toMatch(/redirect[\s\S]*release-only/iu);
    expect(full).not.toContain("## Review");
    expect(full).not.toMatch(/`Local`, `Hosted PR`, and `Triage`|`Coverage`/u);
    expect(full).not.toMatch(softWrappedProse("authorizes the lane action only if"));
    expect(full).not.toMatch(/changed head[\s\S]*invalidates approval/iu);
    expect(full).not.toContain("gh pr merge");

    const partial = sectionBetween(packaged, "### Ship — partial protection", "### Complete");
    expect(partial).toContain("direct base-branch commit");
    expect(partial).not.toContain("pre-merge");
    expect(partial).not.toContain("integration-interlock");
  });

  it("carries explicit Errand review-risk acceptance through the protected merge path", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(project).toBe(packaged);

    const review = sectionBetween(packaged, "4. **Enter the open PR.**", "5. **Settle the final head.**");
    const compactReview = review.replace(/\s+/gu, " ");
    expect(review.indexOf("stop before source dispatch")).toBeLessThan(
      review.indexOf("`arc review hosted request -`"),
    );
    expect(compactReview).toContain("`ready / local-prepare`");
    expect(compactReview).toContain("Owner-directed review stop (open PR only)");
    expect(compactReview).toContain("arc review status --target <targetRef>");
    expect(compactReview).toContain("at least one completed same-claim standard-review pass");
    expect(compactReview).toContain("an authorized fix remains unfinished");
    expect(compactReview).toContain("`review-required`: this is Owner acceptance");
    expect(compactReview).toContain("Do not submit a fabricated `clean` attempt, `terminus`, or `ceilingOverride`");
    expect(compactReview).toContain("obtain it again");
    expect(compactReview).toContain("the exact Owner-directed review stop above is approved");
    expect(compactReview).toContain("An Owner-directed review stop always selects the reviewed-lane");
    expect(compactReview).toContain("declines at a disposition turn the pass a fix triggers");
    expect(compactReview).toContain(
      "from `ready / hosted-request`, present the Owner-directed review stop offer below instead of requesting the pass",
    );
    const preRequest = sectionBetween(packaged, "Compose the immutable policy target", "3. **Resolve the Errand PR**")
      .replace(/\s+/gu, " ");
    expect(preRequest).toContain(
      "`ready / local-prepare` — if the Owner declined the pass a fix triggers, prepare nothing; continue to Step 3 "
        + "and offer the Owner-directed review stop at the open PR. Otherwise invoke `arc review local prepare -`",
    );

    const triage = (await readRepositoryFile("packages/arc-framework/arc/system/methods/review-triage.md"))
      .replace(/\s+/gu, " ");
    expect(triage).toContain(
      "When the pass line says a fix triggers another pass, the recommendation also covers that pass",
    );
    expect(triage).toContain("the line names the pass the fixed head then needs with its expected coverage");
    expect(triage).toContain("as spend the approver may decline");
    expect(triage).toContain("confirmed there once before any pass is dispatched");

    const landing = sectionBetween(packaged, "5. **Settle the final head.**", "7. **Leave");
    const compactLanding = landing.replace(/\s+/gu, " ");
    expect(compactLanding).toContain("`review-required` remains expected");
    expect(compactLanding).toContain("A changed coordinate (including base OID or Errand claim)");
    expect(compactLanding).toContain(
      "Read `arc review status --target <targetRef>` once for the final head and surface its `hostReview`",
    );
    expect(compactLanding).toContain("neither settled review nor an Owner-directed stop clears it");
    expect(compactLanding).toContain("Inspect the PR's unresolved conversations as well");
    expect(compactLanding).toContain("Owner acceptance never satisfies a required check");
    expect(compactLanding).toContain("obtain separate Owner direction for any dismissal or thread action");
    expect(compactLanding).toContain("pass `errandMergeRequest` unchanged exactly once");
    expect(compactLanding).toContain("arc errand merge <slug> - --json");
  });

  it("covers Errand review outcomes and exact-target re-entry", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    expect(packaged).not.toContain("arc review changeset resolve");
    const frontline = sectionBetween(
      packaged,
      "Compose the immutable policy target",
      "3. **Resolve the Errand PR**",
    );
    expect(frontline).toMatch(/Errand atomicity[\s\S]*whole-target/iu);
    expect(frontline).toContain("`findings / respond`");
    expect(frontline).toContain("`arc review respond -`");
    expect(frontline).toMatch(/Approved fixes[\s\S]*arc check increment[\s\S]*new target/iu);
    expect(frontline).not.toContain("`chunk-pending / continue-chunks`");
    expect(frontline).toMatch(/`stale-target \/ select-scope`[\s\S]*recompose[\s\S]*whole-target/iu);
    expect(frontline).toContain("`blocked | unavailable | invalid-override / stop`");
    expect(frontline).toMatch(/complete no-action record-only set[\s\S]*approved for its exact\s+target/iu);

    const openPr = sectionBetween(
      packaged,
      "4. **Enter the open PR.**",
      "5. **Settle the final head.**",
    );
    expect(openPr).toMatch(/opened target[\s\S]*whole-target/iu);
    expect(openPr).toMatch(/rate-limited \| transient-unavailable \/ try-next-source/iu);
    expect(openPr).toMatch(/ambiguous delivery[\s\S]*terminal failure stops/iu);
    expect(openPr).toMatch(/target movement[\s\S]*routed review action[\s\S]*typed continuation/iu);
    expect(openPr).toMatch(/On interruption[\s\S]*typed `state` \/ `nextAction`/iu);
    expect(openPr).not.toMatch(/review-suspension|promoted watcher|bounded schedule/u);

  });

  it("covers Errand merge lanes and already-merged cleanup", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    const prResolution = sectionBetween(
      packaged,
      "3. **Resolve the Errand PR**",
      "4. **Enter the open PR.**",
    );
    expect(prResolution).toContain("arc review change-request resolve --head-ref");
    expect(prResolution).toMatch(/`merged-at-head \/ complete`[\s\S]*Complete/u);
    expect(prResolution).toContain("`closed-unmerged / reopen-change-request`");

    const terminal = sectionBetween(packaged, "5. **Settle the final head.**", "7. **Leave");
    expect(terminal.match(/arc errand merge <slug> - --json/gu)).toHaveLength(1);
    expect(terminal).toMatch(/errandMergeRequest[\s\S]*integration-interlock[\s\S]*arc errand merge/iu);
    expect(terminal).toMatch(/approval authorizes[\s\S]*bounded exact-head wait/iu);
    expect(terminal).toMatch(/green \| not-required \/ complete[\s\S]*pass `errandMergeRequest` unchanged/iu);
    expect(terminal).toMatch(/pending \/ await[\s\S]*exact\s+`errandMergeRequest`/iu);
    expect(terminal).toMatch(/awaiting-checks \/ retry[\s\S]*exact continuation/iu);
    expect(terminal).toMatch(/reconcile-base[\s\S]*reconcile-regenerable[\s\S]*supplied\s+remedy/iu);
    expect(terminal).toMatch(/applicability-judgment-required[\s\S]*fresh integration approval/iu);
    expect(terminal).toMatch(/arc merge lock release -[\s\S]*separate operation authorizes no merge/iu);
    expect(terminal).not.toContain("gh pr merge");
    expect(terminal.match(/arc review checks await/gu)).toHaveLength(1);
    expect(terminal).toContain("--repository <approvedTarget.repository>");
    expect(terminal).toContain("--pull-request <approvedTarget.pullRequest>");
    expect(terminal).toContain("--head-sha <approvedTarget.headSha>");
    expect(terminal).not.toContain("--timeout-ms");
    expect(terminal).not.toContain("arc merge lock hold");

    const complete = sectionBetween(packaged, "### Complete");
    expect(complete).toMatch(
      /arc errand close <slug> --json[\s\S]*finalizes the exact v3 identity tail[\s\S]*reaps refs[\s\S]*drops only its origin capture/iu,
    );
    expect(complete).toMatch(
      /conversation[\s\S]*exact next Errand[\s\S]*takes precedence over\s+`nextOffer`[\s\S]*no additional completion offer/iu,
    );
    expect(complete).toContain("**Post-leave merge.**");
    expect(complete).toMatch(softWrappedProse("identity's owning open or materialize driver"));
    expect(complete).toContain("Exact replay is");

    const leave = sectionBetween(packaged, "7. **Leave", "### Ship — partial protection");
    expect(packaged.match(/arc errand leave <slug>/gu)).toHaveLength(1);
    expect(terminal).not.toContain("arc errand leave <slug>");
    expect(leave).toMatch(/session is ending[\s\S]*moving machines/iu);
    expect(leave).toMatch(
      /Do not leave[\s\S]*change request is open[\s\S]*ordinary next-Errand queue advancement/iu,
    );
    expect(leave).toMatch(
      /another Errand must land before the current one can complete[\s\S]*restoration checkout[\s\S]*Never open a different Errand from an active transient/iu,
    );
  });

  it("keeps auto-merge arming on canonical classification", async () => {
    const paths = {
      errand: "system/workflows/arc/supplemental/run-errand.md",
      drain: "system/workflows/arc/supplemental/drain-inbox.md",
      setup: "system/workflows/arc/supplemental/setup-merge-gate.md",
      readme: "reference/templates/arc/merge-gate/README.md",
      codeowners: "reference/templates/arc/merge-gate/CODEOWNERS",
      initial: "system/workflows/arc/initial-setup/01_verify-and-configure.md",
      strategy: "reference/strategies/arc/strategy-work-organization.md",
    };
    const entries = await Promise.all(Object.entries(paths).map(async ([name, path]) => {
      const packaged = await readRepositoryFile(`packages/arc-framework/arc/${path}`);
      const project = await readRepositoryFile(`.arc/${path}`);
      expect(project, name).toBe(packaged);
      return [name, packaged] as const;
    }));
    const documents = Object.fromEntries(entries);

    expect(documents.errand).toContain("arc review planning-lane <base-sha> <head-sha>");
    expect(documents.errand).toMatch(/Only literal `planning`[\s\S]*auto-merge-lane/iu);
    expect(documents.errand).toContain("arc errand merge <slug> - --json");
    expect(documents.errand).not.toContain("gh pr merge");
    expect(documents.drain).toMatch(
      /arc review planning-lane <base-sha> <head-sha>[\s\S]*only[\s\S]*`planning`[\s\S]*arm/iu,
    );
    expect(documents.setup).toMatch(/canonical\s+classifier/iu);
    expect(documents.setup).toMatch(/procedural boundary[\s\S]*never infer merge safety/iu);
    expect(documents.readme).toMatch(/canonical classifier/iu);
    expect(documents.initial).toMatch(/planning auto-merge lane[\s\S]*canonical classifier/iu);
    expect(documents.initial).toMatch(/Draft-state merge lock[\s\S]*merge\.lock:\s*draft/iu);
    expect(documents.strategy).toMatch(/merge\.lock:\s*draft/iu);
    expect(documents.strategy).toMatch(/never infer merge safety from agent-layer discipline alone/iu);
  });

  it("uses typed procedures for the late authoritative base-reconcile mutation site", async () => {
    const [packageIntegration, instanceIntegration] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(packageIntegration).toBe(instanceIntegration);
    expect(packageIntegration).not.toContain("git fetch origin {base-branch}");
    expect(packageIntegration).not.toContain("rev-list --left-right --count");
    expect(packageIntegration).not.toContain("git merge --no-edit origin/{base-branch}");

    const gate = sectionBetween(
      packageIntegration,
      "### 10) Behind-base reconcile gate and merge",
      "### 11) Post-merge worktree cleanup",
    );
    expect(packageIntegration.match(/arc base drift --json/gu)?.length ?? 0)
      .toBeGreaterThan(gate.match(/arc base drift --json/gu)?.length ?? 0);
    const checkpoint = gate.indexOf("arc integrate checkpoint {name}");
    const baseMerge = gate.indexOf("checkpoint's supplied `remedy.argv` unchanged");
    const reconcile = gate.indexOf("arc wu reconcile {name} --apply --json");
    const merge = gate.indexOf("arc integrate merge {name} --checkpoint {payload.checkpointHandle}");
    expect(reconcile).toBeGreaterThan(-1);
    expect(checkpoint).toBeGreaterThan(reconcile);
    expect(baseMerge).toBeGreaterThan(checkpoint);
    expect(merge).toBeGreaterThan(baseMerge);
    expect(gate).not.toContain("arc review status --target '{targetRef}'");
    expect(gate).toMatch(/checkpoint now owns Candidate applicability,[\s\S]*review status/u);
    expect(gate).toContain("`base-moved / rerun-checkpoint`");
    expect(gate).not.toContain("arc review checks await");
    expect(gate).toMatch(softWrappedProse("keeps the checkpoint and draft lock"));
    expect(gate).toContain("`payload.observationKind`");
    expect(gate).toContain("`payload.diagnosticFailures`");
    expect(gate).toContain("`payload.detail`");
    expect(gate).toContain("`payload.retry.argv`");
    expect(gate).toContain("Do not re-invoke recursively");
    expect(gate).not.toContain("re-invokes this same command immediately");
    expect(gate).not.toContain("payload.elapsedMs");
    expect(gate).not.toContain("returned deadline");
    expect(gate).not.toContain("otherwise render `None`");
    expect(gate).not.toContain("exact-head mutability action");
    expect(gate).toMatch(/no applicability or review\s+judgment before the checkpoint classifies/iu);
    expect(gate).not.toContain("git merge --no-edit");
    expect(gate).not.toContain("gh pr merge");
  });

  it("dispatches every exact-base merge result before a later fire point", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const gate = sectionBetween(
      packaged,
      "### 10) Behind-base reconcile gate and merge",
      "### 11) Post-merge worktree cleanup",
    );
    const actions = {
      merged: "run-quality-gates",
      "skipped-clean": "continue-reconcile",
      "base-moved": "rerun-checkpoint",
      "head-moved": "rerun-checkpoint",
      "head-contained-by-base": "rerun-checkpoint",
      conflict: "stop",
      "regenerable-refused": "stop",
      blocked: "stop",
    } satisfies Record<BaseMergeResult["state"], BaseMergeResult["nextAction"]>;

    for (const [state, nextAction] of Object.entries(actions)) {
      expect(gate).toContain(`\`${state} / ${nextAction}\``);
    }
    const stop = gate.search(
      /`blocked \/ stop`, `conflict \/ stop`, and `regenerable-refused \/ stop` stop before every later\s+fire point/u,
    );
    expect(stop).toBeGreaterThan(-1);
    expect(gate.indexOf("`push-interlock`", stop)).toBeGreaterThan(stop);
  });

  it("gates and pushes only a successfully merged Errand reconcile", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    const terminal = sectionBetween(packaged, "6. **Run the approved terminal operation.", "7. **Leave");
    const actions = {
      merged: "run-quality-gates",
      "skipped-clean": "continue-reconcile",
      "base-moved": "rerun-checkpoint",
      "head-moved": "rerun-checkpoint",
      "head-contained-by-base": "rerun-checkpoint",
      conflict: "stop",
      "regenerable-refused": "stop",
      blocked: "stop",
    } satisfies Record<BaseMergeResult["state"], BaseMergeResult["nextAction"]>;

    for (const [state, nextAction] of Object.entries(actions)) {
      expect(terminal).toContain(`\`${state} / ${nextAction}\``);
    }
    expect(terminal).toMatch(/merged \/ run-quality-gates`[\s\S]*arc check new-head --from <pre-merge head>[\s\S]*pushes[\s\S]*Step 4/iu);
    expect(terminal).toMatch(/skipped-clean \/ continue-reconcile[\s\S]*without gates or push/iu);
    expect(terminal).toMatch(/conflict \/ stop[\s\S]*blocked \/ stop[\s\S]*explanation and stop/iu);
  });

  it("passes the exact approved Errand target to release-only lock transition", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    const releaseOnly = sectionBetween(
      packaged,
      "After approval, apply the approved final dispositions and channel settlements.",
      "6. **Run the approved terminal operation.",
    );
    expect(releaseOnly).toContain("`schemaVersion: 1`");
    expect(releaseOnly).toContain("`treeRoot`");
    expect(releaseOnly).toContain("`target: { repository, pullRequest, headSha }`");
    expect(releaseOnly).toContain('`vehicle: { kind: "errand", slug }`');
    expect(releaseOnly).toMatch(softWrappedProse("Pass `releaseRequest` as JSON stdin to `arc merge lock release -`"));
  });

  it("keeps verification applicability vocabulary aligned with the typed input schema", () => {
    for (const applicability of ["targeted", "focused", "full"] as const) {
      assertSchemaAccepts(RespondVerifiedFixSchema, {
        applicability,
        verificationEvidenceRefs: ["verification://evidence"],
      });
    }
    assertSchemaRefuses(RespondVerifiedFixSchema, {
      applicability: "complete",
      verificationEvidenceRefs: ["verification://evidence"],
    });
  });

  it("limits session-notes overrides to discretionary planning and execution phases", async () => {
    for (const name of ["session-init", "session-handoff"] as const) {
      const [packaged, instance] = await Promise.all([
        readRepositoryFile(
          `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/${name}.template.md`,
        ),
        readRepositoryFile(`.arc/system/workflows/arc/session-lifecycle/${name}.md`),
      ]);
      for (const content of [packaged, instance]) {
        expect(content).toMatch(/planning \| execution/u);
        expect(content).toMatch(
          /prepublication\/integration phases cannot be overridden|prepublication` and `integration` are\s+state-determined/iu,
        );
      }
    }
  });

  it("keeps early drift advisory separate from final authoritative reconciliation", async () => {
    const [packageIntegration, instanceIntegration, packageErrand, instanceErrand] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(packageIntegration).toBe(instanceIntegration);
    expect(packageErrand).toBe(instanceErrand);
    const reviewSettlement = sectionBetween(
      packageIntegration,
      "### 3) Confirm review coordination",
      "### 4) Spec-presence + alignment checks",
    );
    expect(reviewSettlement).not.toContain("git merge");
    expect(reviewSettlement).toContain("`review-settled`");
    const advisory = packageIntegration.indexOf("Before spending a hosted pass");
    const finalGate = packageIntegration.indexOf("### 10) Behind-base reconcile gate and merge");
    expect(packageIntegration.indexOf("arc base drift --json", advisory)).toBeLessThan(finalGate);
    const advisoryText = packageIntegration.slice(advisory, finalGate);
    expect(advisoryText).toMatch(softWrappedProse("authorizes no merge, commit, push, or target recomposition"));
    expect(advisoryText).not.toContain("use an append-only merge");
    expect(packageIntegration.indexOf(
      "checkpoint's supplied `remedy.argv` unchanged",
      finalGate,
    )).toBeGreaterThan(finalGate);
    expect(packageIntegration.indexOf("git merge --no-edit {baseOid}")).toBe(-1);

    const errandAdvisoryText = sectionBetween(
      packageErrand,
      "4. **Enter the open PR.**",
      "5. **Settle the final head.**",
    );
    expect(errandAdvisoryText).toMatch(softWrappedProse("authorizes no merge, commit, push, or target recomposition"));
    expect(errandAdvisoryText).not.toContain("use an append-only merge");
  });

  it("preserves checkpoint readiness through an exact-head merge window", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const gate = sectionBetween(
      packaged,
      "### 10) Behind-base reconcile gate and merge",
      "### 11) Post-merge worktree cleanup",
    );
    expect(gate).toContain("payload.interlockSurface.machineEvidence.text");
    expect(gate).toMatch(softWrappedProse("The integration interlock is the sole merge authority"));
    expect(gate).toMatch(softWrappedProse(
      "not an instruction to invoke merge this turn while those checks are pending",
    ));
    expect(gate).toMatch(
      /surfaced required checks as not green[\s\S]*do not invoke merge this turn/iu,
    );
    expect(gate).toMatch(softWrappedProse("No commit or push may occur after `ready`"));
    expect(gate).not.toMatch(softWrappedProse("head mutation returns to the checkpoint"));

    const lifecycleReady = gate.indexOf("payload.interlockSurface.machineEvidence.text");
    const preMerge = gate.indexOf("**Extension report** · `#pre-merge`");
    const approval = gate.indexOf("Approve (or redirect)?");
    const merge = gate.lastIndexOf("arc integrate merge {name} --checkpoint");
    expect(lifecycleReady).toBeLessThan(preMerge);
    expect(preMerge).toBeLessThan(approval);
    expect(approval).toBeLessThan(merge);
  });

  it("resumes swept candidates and refires after append-only corrections", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const resume = sectionBetween(packaged, "### 1) Push the branch and open the PR", "**Push extension contract**");
    expect(resume).toMatch(/`shipped` in `completed`; `open`[\s\S]*Step 10/u);
    expect(resume).toMatch(/`merged-at-head`[\s\S]*Verify Phase 2 products[\s\S]*Step 10 tail/u);
    expect(resume).toContain("`closed-unmerged`");
    expect(resume).toContain("`merged-stale-head`, `ambiguous`, or `blocked`");
    expect(resume).toMatch(/`ambiguous`[\s\S]*emitted remedy text/iu);
    expect(resume).toContain("first incomplete candidate-tail step");

    const creation = sectionBetween(
      packaged,
      "Invoke `arc review change-request resolve --head-ref",
      "### 2) Review iteration",
    );
    const resolver = creation.indexOf("arc review change-request resolve --head-ref");
    const proposedTarget = creation.indexOf("proposedChangeRequest =");
    const create = creation.indexOf("gh pr create --base");
    expect(resolver).toBeGreaterThan(-1);
    expect(proposedTarget).toBeGreaterThan(resolver);
    expect(create).toBeGreaterThan(proposedTarget);
    expect(creation).toMatch(softWrappedProse("`closed-unmerged / reopen-change-request`"));
    expect(creation).toContain("pre-create exact-head validation");
    expect(creation).toMatch(/`Local review` field names the carrier[\s\S]*omit it\s+when none ran/u);

    const gate = sectionBetween(
      packaged,
      "### 10) Behind-base reconcile gate and merge",
      "### 11) Post-merge worktree cleanup",
    );
    expect(gate).toContain("requested composition correction");
    expect(gate).toMatch(/Append[\s\S]*never amend/u);
    expect(gate).toMatch(/rerun affected gates and routing[\s\S]*push[\s\S]*rebuild the checkpoint/u);
    expect(gate).toMatch(softWrappedProse("`invalidated / checkpoint` returns to the checkpoint"));
    expect(gate).not.toMatch(softWrappedProse("Any candidate mutation or review action invalidates the checkpoint"));
    expect(gate).not.toContain("authorizes merge only if");
    expect(gate).not.toContain("If its `headSha` differs");
  });

  it("dominates every work-unit lifecycle merge command with products and a final interlock", async () => {
    const directory = resolve(root, "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle");
    const requiredProduct = new Map([
      ["integrate-work-unit.md", "arc integrate checkpoint {name}"],
      ["park-work-unit.md", "arc park"],
      ["resume-work-unit.md", "arc resume"],
    ]);
    let commandCount = 0;
    for (const name of (await readdir(directory)).filter((entry) => entry.endsWith(".md"))) {
      const workflow = await readRepositoryFile(`packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/${name}`);
      for (const command of workflow.matchAll(/^\s*(?:gh pr merge|arc integrate merge)[^\n]*/gmu)) {
        commandCount += 1;
        const prefix = workflow.slice(0, command.index);
        const product = requiredProduct.get(name);
        expect(product, `unclassified merge workflow: ${name}`).toBeDefined();
        expect(prefix.lastIndexOf(product ?? "")).toBeGreaterThanOrEqual(0);
        expect(prefix.lastIndexOf("`integration-interlock`")).toBeGreaterThan(prefix.lastIndexOf(product ?? ""));
      }
    }
    expect(commandCount).toBe(3);
  });

  it("gates full-protection decomposition merge after PR status", async () => {
    const decompose = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md",
    );
    const partial = sectionBetween(decompose, "### Partial protection", "### Full protection");
    const full = sectionBetween(
      decompose,
      "### Full protection",
      "## 7. Confirm lifecycle readiness and finish",
    );
    const status = full.indexOf("Surface PR status");
    const interlock = full.indexOf("`integration-interlock`");
    const merge = full.indexOf("merge according to project policy");

    expect(decompose).not.toMatch(/^\s*gh pr merge[^\n]*/gmu);
    expect(partial).not.toContain("`integration-interlock`");
    expect(status).toBeGreaterThan(-1);
    expect(interlock).toBeGreaterThan(status);
    expect(merge).toBeGreaterThan(interlock);
  });

  it("guards the post-merge tail on completion and archival products", async () => {
    const [packageIntegration, instanceIntegration] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(packageIntegration).toBe(instanceIntegration);
    const resumeEntry = sectionBetween(
      packageIntegration,
      "### 1) Push the branch and open the PR",
      "**Push extension contract**",
    );
    expect(resumeEntry).toMatch(softWrappedProse("A merged PR proves only that the merge ran"));
    expect(resumeEntry).toContain("Completion Notes");
    expect(resumeEntry).toMatch(/under `with-integration`, the resolver reports `shipped` in `completed`/iu);
    expect(resumeEntry).toMatch(/do not\s+invoke `arc user close` or `arc teardown`/u);
    expect(resumeEntry).toContain("lifecycle-only repair change request");
  });

  it("attests the lane only from trusted pull-request-target code", async () => {
    const [ci, workflow] = await Promise.all([read("ci.yml"), read("arc-lane-attestation.yml")]);
    const parsed = load(workflow) as { on?: Record<string, unknown>; permissions?: unknown };
    const stamp = jobValue(workflow, "lane-attestation");

    expect(ci).not.toContain("planning-classify:");
    expect(ci).not.toContain("lane-attestation:");
    expect(parsed.on).toEqual({
      pull_request_target: { types: ["opened", "reopened", "synchronize", "edited"] },
    });
    // The dispatch producer retired with the required status; a surviving trigger
    // would be a second entry point into a job that now only observes.
    expect(parsed.on).not.toHaveProperty("repository_dispatch");
    expect(parsed.on).not.toHaveProperty("pull_request");
    expect(parsed.permissions).toEqual({});
    expect(stamp.if).toContain("head.repo.full_name == github.repository");
    // Review projections are stacked draft pull requests that never merge, so they spend no attestation run.
    expect(stamp.if).toContain("!startsWith(github.event.pull_request.head.ref, 'review-projection/')");
    expect(stamp.permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
      statuses: "write",
    });
    expect(stamp["runs-on"]).toBe("ubuntu-latest");

    const trustedCheckout = stepValue(workflow, "lane-attestation", "lane-trusted-checkout");
    expect(trustedCheckout.with).toMatchObject({
      ref: "${{ github.workflow_sha }}",
      "persist-credentials": false,
    });
    expect(trustedCheckout.with).not.toHaveProperty("path");
    const target = stepValue(workflow, "lane-attestation", "lane-target");
    expect(target.run).toContain('pull_request="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER")"');
    expect(target.run).toContain('test "$(jq -r .state <<<"$pull_request")" = open');
    expect(target.run).toContain('test "$(jq -r .base.repo.full_name <<<"$pull_request")" = "$GITHUB_REPOSITORY"');
    expect(target.run).toContain('test "$(jq -r .head.repo.full_name <<<"$pull_request")" = "$GITHUB_REPOSITORY"');

    const steps = stamp.steps as Array<Record<string, unknown>>;
    const buildIndex = steps.findIndex((step) => step.run === "npm run build");
    const targetIndex = steps.findIndex((step) => step.id === "lane-target");
    const resetIndex = steps.findIndex((step) => step.id === "lane-reset");
    const dataIndex = steps.findIndex((step) => step.id === "lane-data");
    const publishIndex = steps.findIndex((step) => step.id === "lane-status");
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(publishIndex).toBeGreaterThan(buildIndex);
    expect(resetIndex).toBeGreaterThan(targetIndex);
    expect(dataIndex).toBeGreaterThan(resetIndex);
    const reset = stepValue(workflow, "lane-attestation", "lane-reset");
    expect(reset.env).toMatchObject({
      HEAD_SHA: "${{ steps.lane-target.outputs.head_sha }}",
    });
    expect(reset.run).toContain('gh api "repos/$GITHUB_REPOSITORY/statuses/$HEAD_SHA"');
    expect(reset.run).toContain("-f state=pending -f context=arc-lane");

    const dataCheckout = stepValue(workflow, "lane-attestation", "lane-data");
    expect(dataCheckout.with).toMatchObject({
      repository: "${{ steps.lane-target.outputs.head_repository }}",
      ref: "${{ steps.lane-target.outputs.head_sha }}",
      path: ".cache/arc-lane-change-data",
      "fetch-depth": 0,
      "persist-credentials": false,
    });
    expect(workflow).toContain(
      "# Pull-request content is inert classification data; no command executes from this checkout.",
    );

    const publish = stepValue(workflow, "lane-attestation", "lane-status");
    expect(publish.run).toContain(
      'lane="$(node packages/arc-framework/dist/cli.js review planning-lane "$BASE_SHA" "$HEAD_SHA"',
    );
    expect(publish.run).toContain('--repository "$GITHUB_WORKSPACE/.cache/arc-lane-change-data")"');
    expect(publish.run).not.toContain("npx arc");
    expect(publish.run).toContain('test "$lane" = planning || test "$lane" = reviewed');
    expect(publish.run).toContain('gh api "repos/$GITHUB_REPOSITORY/statuses/$HEAD_SHA"');
    expect(publish.run).toContain("-f context=arc-lane");
    expect(publish.run).toContain(
      'bash .arc/system/.internal/scripts/confirm-live-change-pair.sh "$GITHUB_REPOSITORY"',
    );

    for (const step of steps.filter((candidate) => typeof candidate.run === "string")) {
      expect(step["working-directory"]).not.toBe(".cache/arc-lane-change-data");
      expect(step.run).not.toMatch(/(?:bash|node|npm|npx|tsx)\s+\.cache\/arc-lane-change-data\//u);
    }
  });

  it("records a terminal verdict on both classifier arms without vetoing either", async () => {
    const [ci, attestation, codeowners] = await Promise.all([
      read("ci.yml"),
      read("arc-lane-attestation.yml"),
      readRepositoryFile(".github/CODEOWNERS"),
    ]);
    const writers = [ci, attestation].flatMap((workflow, workflowIndex) =>
      [...workflow.matchAll(/gh api "repos\/\$GITHUB_REPOSITORY\/statuses\/\$([A-Z_]+)"[\s\\]+-f state=(\w+) -f context=([\w-]+)/gu)]
        .map((match) => ({ workflowIndex, sha: match[1], state: match[2], context: match[3] })));
    // One pending reset and one terminal write, both on the same exact head. The
    // attestation never publishes a failing state: it is not a required check, so a
    // red verdict on an ordinary reviewed-lane change would report a problem that
    // does not exist.
    expect(writers).toEqual([
      { workflowIndex: 1, sha: "HEAD_SHA", state: "pending", context: "arc-lane" },
      { workflowIndex: 1, sha: "HEAD_SHA", state: "success", context: "arc-lane" },
    ]);
    expect(ci).not.toContain("statuses/$HEAD_SHA");

    // Both arms reach the single terminal write; only the eligible one confirms the
    // live pair, and the description is where the verdict survives.
    const publish = stepValue(attestation, "lane-attestation", "lane-status");
    expect(publish.run).toContain('if [ "$lane" = planning ]; then');
    expect(publish.run).toMatch(/description='planning lane; live pull-request pair confirmed/u);
    expect(publish.run).toMatch(/else\s+description='reviewed lane;/u);
    expect(publish.run).toContain('-f description="$description"');

    expect(codeowners).toContain("* @andrewRCr");
    expect(jobValue(ci, "ci_ok").name).toBe("ci-ok");
    expect(jobValue(ci, "merge-ok").name).toBe("merge-ok");
  });

  it("ships the merge-gate host-policy inventory with live-pair support", async () => {
    const [recipe, codeowners, recipeReadme, livePairScript] = await Promise.all([
      readRepositoryFile("packages/arc-framework/init-recipe.json"),
      readRepositoryFile("packages/arc-framework/arc/reference/templates/arc/merge-gate/CODEOWNERS"),
      readRepositoryFile("packages/arc-framework/arc/reference/templates/arc/merge-gate/README.md"),
      readRepositoryFile(
        "packages/arc-framework/arc/system/.internal/scripts/confirm-live-change-pair.sh",
      ),
    ]);
    const inventory = JSON.parse(recipe) as { include_files: string[] };
    const mergeGateShipped = [
      "reference/templates/arc/merge-gate/README.md",
      "reference/templates/arc/merge-gate/CODEOWNERS",
      "system/workflows/arc/supplemental/setup-merge-gate.md",
      "system/.internal/scripts/confirm-live-change-pair.sh",
    ];

    for (const path of mergeGateShipped) {
      expect(inventory.include_files).toContain(path);
    }
    expect(livePairScript.length).toBeGreaterThan(0);
    expect(codeowners).toContain("/.arc/backlog/planned/*/*/spec-*.md");
    expect(codeowners).toContain("/.arc/backlog/provisional/*/meta-*.md");
    expect(recipeReadme).toContain('arc review planning-lane "$BASE_SHA" "$HEAD_SHA"');
    expect(recipeReadme).toContain('[ "$HEAD_REPOSITORY" = "$GITHUB_REPOSITORY" ]');
    expect(recipeReadme).toMatch(softWrappedProse("classification checkout must fetch branch refs"));
  });

  it("keeps every shipped host-policy asset byte-identical to its project mirror", async () => {
    const paths = [
      "reference/templates/arc/merge-gate/CODEOWNERS",
      "reference/templates/arc/merge-gate/README.md",
      "system/.internal/scripts/confirm-live-change-pair.sh",
      "system/workflows/arc/supplemental/setup-merge-gate.md",
      "system/workflows/arc/initial-setup/01_verify-and-configure.md",
    ];

    for (const path of paths) {
      const [packaged, project] = await Promise.all([
        readRepositoryFile(`packages/arc-framework/arc/${path}`),
        readRepositoryFile(`.arc/${path}`),
      ]);
      expect(project, path).toBe(packaged);
    }
  });

  it("keeps authoritative transition history review-owned across merge-gate surfaces", async () => {
    const [repositoryOwners, templateOwners, readme, setup] = await Promise.all([
      readRepositoryFile(".github/CODEOWNERS"),
      readRepositoryFile("packages/arc-framework/arc/reference/templates/arc/merge-gate/CODEOWNERS"),
      readRepositoryFile("packages/arc-framework/arc/reference/templates/arc/merge-gate/README.md"),
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/setup-merge-gate.md"),
    ]);

    for (const owners of [repositoryOwners, templateOwners]) {
      expect(owners).not.toContain("/.arc/system/.internal/transitions/*.json");
    }
    expect(readme).toMatch(/transition-record namespace remains review-owned/iu);
    expect(setup).toMatch(/transition-record namespace owned/iu);
  });

  it("offers review-source and merge-lock setup as independent default-off choices", async () => {
    const paths = [
      "packages/arc-framework/arc/system/workflows/arc/initial-setup/01_verify-and-configure.md",
      ".arc/system/workflows/arc/initial-setup/01_verify-and-configure.md",
    ];
    const [packaged, project] = await Promise.all(paths.map((path) => readRepositoryFile(path)));
    expect(project).toBe(packaged);
    expect(packaged).toContain("### Optional: Choose Review Sources and Merge Guards");
    expect(packaged).toContain("Frontline sources");
    expect(packaged).toContain("Standard-review sources");
    expect(packaged).toContain("Draft-state merge lock");
    expect(packaged).toMatch(/merge\.lock:\s*draft/iu);
    expect(packaged).toMatch(/independently[\s\S]*default off/iu);
  });
});
