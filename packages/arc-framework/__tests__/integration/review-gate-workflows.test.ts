import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { auditRepairWriterGraph } from "../../src/scripts/review-gate/hosts/github/repair-audit.js";

const root = resolve(import.meta.dirname, "../../../..");
const read = async (name: string): Promise<string> => readFile(resolve(root, ".github/workflows", name), "utf8");
const readRepositoryFile = async (path: string): Promise<string> => readFile(resolve(root, path), "utf8");

function jobValue(workflow: string, name: string): Record<string, unknown> {
  const parsed = load(workflow) as { jobs?: Record<string, unknown> };
  const job = parsed.jobs?.[name];
  if (typeof job !== "object" || job === null) throw new Error(`missing workflow job: ${name}`);
  return job as Record<string, unknown>;
}

function jobBlock(workflow: string, name: string): string {
  return JSON.stringify(jobValue(workflow, name));
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

describe("trusted review-gate workflows", () => {
  it("keeps the review relay secretless and checkout-free", async () => {
    const workflow = await read("review-gate-wakeup.yml");
    expect(workflow).toContain("permissions: {}");
    expect(workflow).not.toContain("actions/checkout");
    expect(workflow).not.toMatch(/secrets\.|private-key|GITHUB_TOKEN/u);
  });

  it("pins trusted code and actions without persisting credentials", async () => {
    const workflow = await read("review-gate.yml");
    expect(workflow).not.toMatch(/uses: [^\n]+@v\d/u);
    expect(workflow.match(/ref: \$\{\{ github\.workflow_sha \}\}/gu)).toHaveLength(2);
    expect(workflow.match(/persist-credentials: false/gu)).toHaveLength(2);
    expect(workflow).toContain("./node_modules/.bin/tsx");
    expect(workflow).not.toMatch(/npx\s+tsx|github\.event\.pull_request\.head/u);
  });

  it("separates discovery from the environment-bound App writer", async () => {
    const workflow = await read("review-gate.yml");
    const discovery = workflow.slice(workflow.indexOf("  discover:"), workflow.indexOf("  reconcile:"));
    expect(discovery).not.toMatch(/ARC_APP_TOKEN|private-key|environment:/u);
    expect(workflow).toContain("environment: review-gate");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("ARC_REVIEW_GATE_APP_CLIENT_ID");
    expect(workflow).toContain("ARC_REVIEW_GATE_APP_ID");
    expect(workflow).toContain("repositories: ${{ github.event.repository.name }}");
  });

  it("allows attestations only from the default ref through the same write lane", async () => {
    const workflow = await read("review-gate-attest.yml");
    expect(workflow).toContain("github.event.repository.default_branch");
    expect(workflow).toContain("environment: review-gate");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).not.toContain("fromJSON(inputs.payload)");
    expect(workflow).not.toMatch(/uses: [^\n]+@v\d/u);
  });

  it("routes deleted issue comments directly with their bounded payload", async () => {
    const workflow = await read("review-gate.yml");
    expect(workflow).toContain("types: [created, edited, deleted]");
    expect(workflow).toContain("ARC_TRIGGER_DELETION: ${{ toJSON(matrix.triggerDeletion) }}");
    expect(workflow).not.toMatch(/issue_comment:[\s\S]*Review Gate Wakeup/u);
  });

  it("covers every canonical wake-up transport and retains scheduled repair", async () => {
    const controller = await read("review-gate.yml");
    const proxy = await read("review-gate-wakeup.yml");
    expect(controller).toContain("review_requested, review_request_removed");
    expect(controller).toContain("check_run:\n    types: [created, completed, rerequested]");
    expect(controller).toContain("workflows: [CI, Review Gate Wakeup]");
    expect(controller).toContain("issue_comment:\n    types: [created, edited, deleted]");
    expect(controller).toContain("status:");
    expect(controller).toContain("schedule:");
    expect(controller).toContain("workflow_dispatch:");
    expect(proxy).toContain("pull_request_review:");
    expect(proxy).toContain("pull_request_review_comment:");
  });

  it("collapses hint-class event bursts without cancelling running work or deletion payloads", async () => {
    const controller = await read("review-gate.yml");
    const proxy = await read("review-gate-wakeup.yml");
    const controllerConcurrency = (load(controller) as { concurrency?: Record<string, unknown> }).concurrency;
    const proxyConcurrency = (load(proxy) as { concurrency?: Record<string, unknown> }).concurrency;
    // Both transports collapse pending bursts but never cancel a running run.
    expect(controllerConcurrency?.["cancel-in-progress"]).toBe(false);
    expect(proxyConcurrency?.["cancel-in-progress"]).toBe(false);
    expect(proxyConcurrency?.group).toContain("github.event.pull_request.number");
    // Deletion events carry a bounded payload canonical re-query cannot
    // recover; they and targeted dispatches must opt out of the shared group.
    expect(controllerConcurrency?.group).toContain("github.event_name == 'workflow_dispatch'");
    expect(controllerConcurrency?.group).toContain("github.event.action == 'deleted'");
    expect(controllerConcurrency?.group).toContain("github.run_id");
  });

  it("publishes independent CI truth and a thin compatibility alias", async () => {
    const workflow = await read("ci.yml");
    expect(workflow).toContain("  ci_ok:\n    name: ci-ok");
    // Shared setup is a required dependency so a failed install cannot roll up green
    // via skipped consumer legs.
    expect(workflow).toContain(
      "needs: [classify, setup, lint-typecheck, unit, integration, e2e, portability, portability-cross-platform]",
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
    for (const name of [
      "docs.yml",
      "review-gate.yml",
      "review-gate-attest.yml",
      "review-gate-qualify.yml",
      "review-gate-repair.yml",
      "review-gate-wakeup.yml",
    ]) {
      const hostedWorkflow = await read(name);
      const parsed = load(hostedWorkflow) as { jobs?: Record<string, Record<string, unknown>> };
      for (const [job, value] of Object.entries(parsed.jobs ?? {})) {
        expect(value["runs-on"], `${name}:${job}`).toBe("ubuntu-latest");
      }
    }
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
      "${{ (github.event_name == 'workflow_dispatch' && inputs.run_portability_pair) || " +
        "github.event_name == 'schedule' }}",
    );
    // The pair consumes no classify output, so it is dependency-free: a `needs`
    // paired with a custom `if` would let a failed classify start it anyway.
    expect(jobValue(workflow, "portability-cross-platform")).not.toHaveProperty("needs");
    const triggers = (load(workflow) as { on?: Record<string, unknown> }).on;
    expect(triggers?.workflow_dispatch).toMatchObject({
      inputs: { run_portability_pair: { type: "boolean", default: false } },
    });
    const targetedJob = workflow.slice(
      workflow.indexOf("  portability-cross-platform:"),
      workflow.indexOf("  ci_ok:"),
    );
    expect(targetedJob).not.toContain("needs.classify.outputs.weight");
    expect(targetedJob).not.toContain("github.event_name == 'pull_request'");
  });

  it("keeps repository controller scripts outside the published CLI graph", async () => {
    const tsup = await readFile(resolve(root, "packages/arc-framework/tsup.config.ts"), "utf8");
    const manifest = JSON.parse(await readFile(resolve(root, "packages/arc-framework/package.json"), "utf8")) as {
      files: string[];
      scripts?: Record<string, string>;
    };
    expect(tsup).toContain('entry: ["src/cli.ts"]');
    expect(tsup).toContain("registerReviewDomainSchemas");
    expect(tsup).not.toMatch(/entry:[^\n]*review-gate/u);
    expect(manifest.files).not.toContain("src");
    const rootManifest = JSON.parse(await readRepositoryFile("package.json")) as { scripts: Record<string, string> };
    expect(rootManifest.scripts["review-gate:await"]).toContain("run-await.ts");
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
      "vitest run --project integration framework-sync pr-open-extensions review-gate-workflows",
    );
    expect(rootManifest.scripts["test:arc-contracts"]).toBe(
      "npm run test:arc-contracts -w packages/arc-framework",
    );

    const workflow = await read("ci.yml");
    const lintSteps = jobValue(workflow, "lint-typecheck").steps;
    expect(Array.isArray(lintSteps)).toBe(true);
    const focused = (lintSteps as Array<Record<string, unknown>>)
      .filter((step) => step.run === "npm run test:arc-contracts");
    expect(focused).toEqual([{ if: "${{ needs.classify.outputs.weight == 'light' }}", run: "npm run test:arc-contracts" }]);

    const unitCondition = "${{ !cancelled() && github.event_name != 'schedule' && " +
      "needs.classify.result == 'success' && needs.classify.outputs.duplicate_push != 'true' && " +
      "needs.classify.outputs.weight != 'light' && needs.setup.result == 'success' }}";
    expect(jobValue(workflow, "unit").if).toBe(unitCondition);

    const broadSuiteCondition = "${{ !cancelled() && needs.setup.result == 'success' && " +
      "needs.classify.outputs.defer != 'true' && ((github.event_name == 'pull_request' && " +
      "needs.classify.outputs.lane == 'reviewed' && needs.classify.outputs.weight != 'light') || " +
      "github.event_name == 'workflow_dispatch') }}";
    for (const jobName of ["integration", "e2e", "portability"]) {
      expect(jobValue(workflow, jobName).if).toBe(broadSuiteCondition);
    }
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

  it("keeps CI and controller trust domains disjoint", async () => {
    const ci = await read("ci.yml");
    const controller = await read("review-gate.yml");
    expect(ci).not.toMatch(/ARC_APP_TOKEN|ARC_REVIEW_GATE_APP_PRIVATE_KEY|run-reconcile|run-attest/u);
    expect(controller).toContain("REVIEW_GATE_CONTEXT_MODE: ${{ vars.REVIEW_GATE_CONTEXT_MODE }}");
    expect(controller).toContain("github.workflow_sha");
    expect(controller).toContain("check_run:");
  });

  it("supplies the reconcile step its App slug and narrow git read token", async () => {
    const workflow = await read("review-gate.yml");
    const reconcile = jobBlock(workflow, "reconcile");
    expect(reconcile).toContain("ARC_APP_SLUG");
    expect(reconcile).toContain("steps.app-token.outputs.app-slug");
    expect(reconcile).toContain("GITHUB_TOKEN");
    expect(reconcile).toContain("github.token");
  });

  it("supplies the attest step its App slug and narrow canonical-read token", async () => {
    const workflow = await read("review-gate-attest.yml");
    const attest = jobBlock(workflow, "attest");
    expect(attest).toContain("ARC_APP_SLUG");
    expect(attest).toContain("steps.app-token.outputs.app-slug");
    expect(attest).toContain("GITHUB_TOKEN");
    expect(attest).toContain("github.token");
    expect(attest).toContain("ARC_DISPATCH_ACTOR_ID");
    expect(attest).toContain("github.actor_id");
  });

  it("gives discovery the App id to suppress self-checks and skips reconcile on an empty matrix", async () => {
    const workflow = await read("review-gate.yml");
    expect(stepValue(workflow, "discover", "discover").env).toMatchObject({
      ARC_REVIEW_GATE_APP_ID: "${{ vars.ARC_REVIEW_GATE_APP_ID }}",
    });
    expect(jobValue(workflow, "reconcile").if).toContain('needs.discover.outputs.matrix != \'{"include":[]}\'');
  });

  it("references existing repository scripts", async () => {
    const workflows = await Promise.all(["ci.yml", "review-gate.yml", "review-gate-attest.yml"]
      .map((name) => read(name)));
    const referenced = new Set<string>();
    for (const workflow of workflows) {
      for (const match of workflow.matchAll(/(?:bash |tsx )((?:packages|scripts)\/[A-Za-z0-9_./-]+)/gu)) {
        if (match[1] !== undefined) referenced.add(match[1]);
      }
    }
    for (const path of referenced) await expect(readFile(resolve(root, path)), path).resolves.toBeDefined();
  });

  it("guards only opened-change push sites with current and outgoing heads in order", async () => {
    const packageIntegrationPath = "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md";
    const instanceIntegrationPath = ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md";
    const packageErrandPath = "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md";
    const instanceErrandPath = ".arc/system/workflows/arc/supplemental/run-errand.md";
    const [packageIntegration, instanceIntegration, packageErrand, instanceErrand, coordination] = await Promise.all([
      readRepositoryFile(packageIntegrationPath),
      readRepositoryFile(instanceIntegrationPath),
      readRepositoryFile(packageErrandPath),
      readRepositoryFile(instanceErrandPath),
      readRepositoryFile(".arc/system/workflows/project/coordinate-pr-review.md"),
    ]);
    const genericGuard = "active project review coordinator's exact-head";

    expect(packageIntegration).toBe(instanceIntegration);
    expect(packageErrand).toBe(instanceErrand);
    expect(packageIntegration.match(new RegExp(genericGuard, "gu"))).toHaveLength(2);
    expect(packageIntegration).not.toContain("review-gate:assert-head-mutable");
    expect(packageIntegration.slice(
      packageIntegration.indexOf("### 6) Confirm review coordination"),
      packageIntegration.indexOf("### 7) Spec-presence + alignment checks"),
    ).match(new RegExp(genericGuard, "gu")) ?? []).toHaveLength(0);
    expect(packageIntegration.slice(
      packageIntegration.indexOf("### 12) Final push"),
      packageIntegration.indexOf("### 14) Post-merge worktree cleanup"),
    ).match(new RegExp(genericGuard, "gu"))).toHaveLength(2);
    expect(packageIntegration.slice(
      packageIntegration.indexOf("### 3) Open the PR"),
      packageIntegration.indexOf("### 4) Review iteration"),
    )).not.toContain(genericGuard);
    expect(packageIntegration).toContain("the outgoing local head");

    expect(packageErrand.match(new RegExp(genericGuard, "gu"))).toHaveLength(1);
    expect(packageErrand).not.toContain("review-gate:assert-head-mutable");
    expect(packageErrand).toContain("The initial pre-PR push has no `openedChangeRequest` and skips this query.");
    expect(coordination).not.toContain("review-gate:assert-head-mutable");
    expect(coordination).toMatch(/require the returned `FixAuthorization`[\s\S]*before applying any edit/u);
    expect(coordination).toMatch(/release the push interlock only after the consumption is canonical/u);
  });

  it("keeps exact-head review coordination paired across WU and errand callers", async () => {
    const [packageIntegration, instanceIntegration, packageErrand, instanceErrand, coordination] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/project/coordinate-pr-review.md"),
    ]);
    expect(packageIntegration).toBe(instanceIntegration);
    expect(packageErrand).toBe(instanceErrand);
    for (const workflow of [packageIntegration, packageErrand]) {
      expect(workflow).toMatch(/recompose\s+`openedChangeRequest` from the canonical current head/u);
      expect(workflow).toContain("exact-head contract");
    }
    expect(coordination).toMatch(/`next-action` → `perform-action` → `await` → canonical re-entry/u);
    expect(coordination).not.toMatch(/provider command|without polling/iu);
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

    const candidate = packaged.slice(
      packaged.indexOf("## Phase 2: Compose, sweep, ship"),
      packaged.indexOf("### 13) Behind-base reconcile gate and merge"),
    );
    expect(candidate).toContain("`review-settled`");
    expect(candidate).toContain("candidate-entry state");
    expect(candidate).toContain("never merge readiness");
    expect(candidate).toMatch(/raw local clean report[\s\S]*unattested/iu);
    expect(candidate).toMatch(/canonical settled WU change set[\s\S]*completed task outcomes/u);
    expect(candidate).toMatch(/spec intent and\s+non-goals[\s\S]*success-criteria disposition/u);
    expect(candidate).toContain("verification evidence");
    expect(candidate).toMatch(/alignment disagreement|failed quality gate|base conflict|unexpected state/u);
    expect(candidate).toContain("recompose the candidate after any correction");
    expect(candidate).toMatch(/pre-composition\s+direction[\s\S]*not\s+prospective merge authority/u);
    expect(candidate).not.toContain("Stop before composition begins");
    expect(candidate).not.toContain("proceed to commit + sweep + push");
  });

  it("keeps composition public and surfaces the complete candidate tail", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const releaseNotes = packaged.slice(
      packaged.indexOf("### 8) Compose Release Notes Entry"),
      packaged.indexOf("### 9) Compose Completion Notes"),
    );
    expect(releaseNotes).toMatch(/shipped reader\/operator-visible outcomes/u);
    expect(releaseNotes).toMatch(/WU names or slugs[\s\S]*task or phase references[\s\S]*branches/u);
    expect(releaseNotes).toMatch(/roadmap pointers[\s\S]*internal review or provider machinery/u);
    expect(releaseNotes).toContain("planned-but-unshipped work");
    expect(releaseNotes).toMatch(/publicly supported review concepts and configuration[\s\S]*shipped outcome/iu);
    expect(releaseNotes).toMatch(/\*\*Infrastructure\*\*[\s\S]*externally meaningful operational change/u);
    expect(releaseNotes).toMatch(/\*\*Breaking\s+Changes\*\*[\s\S]*affected stability contract[\s\S]*migration/u);

    const completionNotes = packaged.slice(
      packaged.indexOf("### 9) Compose Completion Notes"),
      packaged.indexOf("### 10) Commit completion content"),
    );
    expect(completionNotes).toMatch(/delivered scope[\s\S]*material deviations or supersessions/u);
    expect(completionNotes).toContain("verified evidence");
    expect(completionNotes).toMatch(/never repeat[\s\S]*(?:task list|git history)/iu);

    const finalGate = packaged.slice(
      packaged.indexOf("### 13) Behind-base reconcile gate and merge"),
      packaged.indexOf("### 14) Post-merge worktree cleanup"),
    );
    expect(finalGate).toMatch(/exact candidate-tail diff[\s\S]*not excerpts alone/u);
    expect(finalGate).toMatch(/task and notes cleanup[\s\S]*composition[\s\S]*cohort closeout/u);
    expect(finalGate).toMatch(/archive moves[\s\S]*readiness regeneration[\s\S]*reconcile commits/u);
  });

  it("keeps frontline publication operational, advisory, and provider-neutral", async () => {
    const paths = [
      "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      "system/workflows/arc/supplemental/run-errand.md",
    ];
    for (const path of paths) {
      const [packaged, project] = await Promise.all([
        readRepositoryFile(`packages/arc-framework/arc/${path}`),
        readRepositoryFile(`.arc/${path}`),
      ]);
      expect(project).toBe(packaged);
      expect(packaged).toContain("ReviewOperationStateStore");
      expect(packaged).toContain("advisory publication orientation");
      expect(packaged).toContain("never enters review receipts or gate reduction");
      expect(packaged).not.toMatch(/CodeRabbit|coderabbit|billing|credits?|quota|--agent|--plain/iu);
    }
  });

  it("routes Errand review through the shared vehicle-neutral cycle", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(project).toBe(packaged);
    expect(packaged).toMatch(/atomic determinacy[\s\S]*routing fact/iu);
    expect(packaged).toMatch(/source-neutral independent-analysis cycle[\s\S]*review-response/u);
    expect(packaged).toContain("vehicle-neutral response-state store");
    expect(packaged).toMatch(/review-suspension[\s\S]*`vehicle: errand`/u);
    expect(packaged).toMatch(/promoted watcher[\s\S]*bounded schedule[\s\S]*explicit human re-entry/u);
    expect(packaged).toMatch(/merge lane[\s\S]*downstream presentation/u);
    expect(packaged).toMatch(/never invent[\s\S]*WU meta[\s\S]*task-list state/iu);
  });

  it("settles the Errand exact head without importing WU products", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    const full = packaged.slice(
      packaged.indexOf("### Ship — full protection"),
      packaged.indexOf("### Ship — partial protection"),
    );
    expect(full).toContain("arc base drift --json");
    expect(full).toContain("typed applicability");
    expect(full).toMatch(/`carry`[\s\S]*prior exact scope[\s\S]*retrigger/u);
    expect(full).toMatch(/`vehicle: errand`[\s\S]*outside WU composition-product requirements/u);
    expect(full).toMatch(/never infer[\s\S]*absent or\s+malformed WU state/iu);
    expect(full).toContain("retain `openedChangeRequest.headSha` as `{approved-head-sha}`");

    const preMerge = full.lastIndexOf("`#pre-merge`");
    const interlock = full.lastIndexOf("`integration-interlock`");
    const autoMerge = full.lastIndexOf("gh pr merge <pr-number>");
    expect(preMerge).toBeLessThan(interlock);
    expect(interlock).toBeLessThan(autoMerge);
    expect(full).toMatch(/after approval[\s\S]*recompose[\s\S]*re-read PR status[\s\S]*base drift/u);
    expect(full).toContain("--match-head-commit {approved-head-sha}");

    const partial = packaged.slice(packaged.indexOf("### Ship — partial protection"), packaged.indexOf("### Complete"));
    expect(partial).toContain("direct base-branch commit");
    expect(partial).not.toContain("pre-merge");
    expect(partial).not.toContain("integration-interlock");
  });

  it("uses one late authoritative base-reconcile mutation site", async () => {
    const [packageIntegration, instanceIntegration] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(packageIntegration).toBe(instanceIntegration);
    expect(packageIntegration).not.toContain("git fetch origin {base-branch}");
    expect(packageIntegration).not.toContain("rev-list --left-right --count");
    expect(packageIntegration).not.toContain("git merge --no-edit origin/{base-branch}");

    const gate = packageIntegration.slice(
      packageIntegration.indexOf("### 13) Behind-base reconcile gate and merge"),
      packageIntegration.indexOf("### 14) Post-merge worktree cleanup"),
    );
    expect(packageIntegration.match(/arc base drift --json/gu)).toHaveLength(
      gate.match(/arc base drift --json/gu)?.length ?? 0,
    );
    expect(gate).toContain("candidate's final mutation site");
    expect(gate).toMatch(/`unavailable`[\s\S]*`skipped`[\s\S]*(?:malformed|unrecognized)[\s\S]*stop/u);
    expect(gate).toMatch(/typed[\s\S]*empty[\s\S]*substantivePaths/u);
    expect(gate).toMatch(/base conflict[\s\S]*analyzer\/host disagreement/u);
    expect(gate).toContain("typed applicability proof");
    expect(gate).toMatch(/reviewed WU delta is unchanged[\s\S]*carry/u);
    expect(gate).toMatch(/interacting[\s\S]*returns? to Step 4/u);
    expect(gate).toMatch(/push[\s\S]*CI and routing[\s\S]*`pre-merge`/u);
    expect(gate).toMatch(/base moves again[\s\S]*same Step 13/u);
    expect(gate).toContain("requires a new exact-head checkpoint plus integration approval");
    expect(gate).toContain("git merge --no-edit {baseOid}");
    expect(gate).toContain(
      "result = arc base drift --json\n"
      + "if <result is authoritative clean>:\n"
      + "    gh pr merge {pr-number} --merge --match-head-commit {approved-head-sha}",
    );
    expect(gate).toContain("retain `openedChangeRequest.headSha` as `{approved-head-sha}`");
    expect(gate).not.toContain("arc base drift --json\ngit merge");
    expect(gate).not.toContain("arc base drift --json\ngh pr merge");
    const approval = gate.indexOf("await explicit integration approval");
    const refreshedPr = gate.indexOf("re-read PR status", approval);
    const finalDrift = gate.lastIndexOf("result = arc base drift --json");
    expect(approval).toBeLessThan(refreshedPr);
    expect(refreshedPr).toBeLessThan(finalDrift);
    expect(gate.indexOf("git merge --no-edit {baseOid}")).toBeLessThan(
      gate.indexOf("run Tier 1 quality gates"),
    );
    expect(finalDrift).toBeLessThan(gate.lastIndexOf("gh pr merge {pr-number}"));
  });

  it("defers base reconciliation until after candidate composition", async () => {
    const [packageIntegration, instanceIntegration] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(packageIntegration).toBe(instanceIntegration);
    const reviewSettlement = packageIntegration.slice(
      packageIntegration.indexOf("### 6) Confirm review coordination"),
      packageIntegration.indexOf("### 7) Spec-presence + alignment checks"),
    );
    expect(reviewSettlement).not.toContain("arc base drift --json");
    expect(reviewSettlement).not.toContain("git merge");
    expect(reviewSettlement).toContain("`review-settled`");
    expect(packageIntegration.indexOf("arc base drift --json"))
      .toBeGreaterThan(packageIntegration.indexOf("### 12) Final push"));
  });

  it("preserves lifecycle readiness through an exact-head merge window", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const gate = packaged.slice(
      packaged.indexOf("### 13) Behind-base reconcile gate and merge"),
      packaged.indexOf("### 14) Post-merge worktree cleanup"),
    );
    expect(gate).toContain("arc status {name} --json");
    expect(gate).toMatch(/`with-integration`[\s\S]*`shipped`[\s\S]*`completed`/u);
    expect(gate).toMatch(/`manual`[\s\S]*`integrating`/u);
    expect(gate).toMatch(/Completion Notes[\s\S]*applicable Release Notes/u);
    expect(gate).toMatch(/No `gh pr merge`[\s\S]*auto-merge enablement[\s\S]*queued merge/u);
    expect(gate).toContain("integration-interlock is the sole merge authority");
    expect(gate).toMatch(/candidate mutation[\s\S]*invalidates[\s\S]*prospective authorization/u);

    const lifecycleReady = gate.indexOf("arc status {name} --json");
    const preMerge = gate.indexOf("fire `pre-merge`");
    const approval = gate.indexOf("await explicit integration approval");
    const refreshedHead = gate.indexOf("recompose `openedChangeRequest`", approval);
    const refreshedPr = gate.indexOf("re-read PR status", approval);
    const finalDrift = gate.lastIndexOf("result = arc base drift --json");
    const merge = gate.lastIndexOf("gh pr merge {pr-number}");
    expect(lifecycleReady).toBeLessThan(preMerge);
    expect(preMerge).toBeLessThan(approval);
    expect(approval).toBeLessThan(refreshedHead);
    expect(refreshedHead).toBeLessThan(refreshedPr);
    expect(refreshedPr).toBeLessThan(finalDrift);
    expect(finalDrift).toBeLessThan(merge);
  });

  it("resumes swept candidates and refires after append-only corrections", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const resume = packaged.slice(
      packaged.indexOf("#### Resume entry"),
      packaged.indexOf("### 2) Local diff preflight"),
    );
    expect(resume).toMatch(/resolver `state: shipped`[\s\S]*open[\s\S]*not merged[\s\S]*Step 13/iu);
    expect(resume).toMatch(/PR already merged[\s\S]*Verify Phase 2 products[\s\S]*Step 13 tail/u);
    expect(resume).toContain("first incomplete candidate-tail step");

    const gate = packaged.slice(
      packaged.indexOf("### 13) Behind-base reconcile gate and merge"),
      packaged.indexOf("### 14) Post-merge worktree cleanup"),
    );
    expect(gate).toContain("requested composition correction");
    expect(gate).toMatch(/Append[\s\S]*never amend/u);
    expect(gate).toMatch(/rerun affected gates and routing[\s\S]*push[\s\S]*refire the integration-interlock/u);
    expect(gate).toMatch(/post-composition failure[\s\S]*unmerged[\s\S]*first\s+incomplete candidate-tail step/u);
    expect(gate).toMatch(/headSha[\s\S]*differs[\s\S]*invalidate the approval/u);
  });

  it("dominates every work-unit lifecycle merge command with products and a final interlock", async () => {
    const directory = resolve(root, "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle");
    const requiredProduct = new Map([
      ["decompose-work-unit.md", "arc decompose"],
      ["integrate-work-unit.md", "arc status {name} --json"],
      ["park-work-unit.md", "arc park"],
      ["resume-work-unit.md", "arc resume"],
    ]);
    let commandCount = 0;
    for (const name of (await readdir(directory)).filter((entry) => entry.endsWith(".md"))) {
      const workflow = await readRepositoryFile(`packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/${name}`);
      for (const command of workflow.matchAll(/^\s*gh pr merge[^\n]*/gmu)) {
        commandCount += 1;
        const prefix = workflow.slice(0, command.index);
        const product = requiredProduct.get(name);
        expect(product, `unclassified merge workflow: ${name}`).toBeDefined();
        expect(prefix.lastIndexOf(product ?? "")).toBeGreaterThanOrEqual(0);
        expect(prefix.lastIndexOf("`integration-interlock`")).toBeGreaterThan(prefix.lastIndexOf(product ?? ""));
      }
    }
    expect(commandCount).toBe(4);
  });

  it("guards the post-merge tail on completion and archival products", async () => {
    const [packageIntegration, instanceIntegration] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(packageIntegration).toBe(instanceIntegration);
    const resumeEntry = packageIntegration.slice(
      packageIntegration.indexOf("#### Resume entry"),
      packageIntegration.indexOf("### 2) Local diff preflight"),
    );
    expect(resumeEntry).toContain("A merged PR proves only that the merge ran");
    expect(resumeEntry).toContain("Completion Notes");
    expect(resumeEntry).toContain("under `with-integration`, the resolver reports `shipped` in `completed`");
    expect(resumeEntry).toMatch(/do not\s+invoke `arc user close` or `arc teardown`/u);
    expect(resumeEntry).toContain("lifecycle-only repair change request");
  });

  it("proves the checked-in repair workflow is the sole closed status writer", async () => {
    const names = [
      "ci.yml", "docs.yml", "review-gate-attest.yml", "review-gate-qualify.yml", "review-gate-repair.yml",
      "review-gate-wakeup.yml", "review-gate.yml",
    ];
    const files = Object.fromEntries(await Promise.all(names.map(async (name) => [
      `.github/workflows/${name}`,
      await read(name),
    ])));
    const sha = "a".repeat(40);
    expect(auditRepairWriterGraph({
      files,
      repositoryDefaultPermission: "read",
      auditedSha: sha,
      liveDefaultBranchSha: sha,
      repairWorkflowPath: ".github/workflows/review-gate-repair.yml",
      repairEnvironment: "review-gate-repair",
      changedPaths: [],
      authorityPaths: [".github/workflows/review-gate-repair.yml"],
    })).toMatchObject({ ok: true, writer: { jobId: "write-status" } });
  });

  it("keeps token qualification on immutable protected code with sanitized output only", async () => {
    const qualify = await read("review-gate-qualify.yml");
    const workflow = load(qualify) as { on?: unknown };
    expect(workflow.on).toEqual({ repository_dispatch: { types: ["review-gate-qualify"] } });
    expect(qualify).toContain("environment: review-gate");
    expect(qualify).toContain("ref: ${{ github.workflow_sha }}");
    expect(qualify).toContain("persist-credentials: false");
    expect(qualify).toContain("ARC_REVIEW_GATE_APP_PRIVATE_KEY: ${{ secrets.ARC_REVIEW_GATE_APP_PRIVATE_KEY }}");
    expect(qualify).toContain("review-gate-token-qualification-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(qualify).not.toMatch(/echo.*(?:TOKEN|PRIVATE_KEY)|steps\..*\.outputs\.token/iu);
  });
});
