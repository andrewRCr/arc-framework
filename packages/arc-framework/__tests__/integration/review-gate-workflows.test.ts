import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

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

interface ClearanceStatusFixture {
  context: string;
  previousHead: string;
  replacementHead: string;
  statuses: Array<{
    context: string;
    sha: string;
    state: "success";
  }>;
}

function hasClearanceSuccess(
  fixture: ClearanceStatusFixture,
  sha: string,
): boolean {
  return fixture.statuses.some(
    (status) => status.context === fixture.context
      && status.sha === sha
      && status.state === "success",
  );
}

describe("trusted review-gate workflows", () => {
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
    for (const name of ["docs.yml", "arc-clearance.yml"]) {
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
    const targetedJob = sectionBetween(workflow, "  portability-cross-platform:", "  ci_ok:");
    expect(targetedJob).not.toContain("needs.classify.outputs.weight");
    expect(targetedJob).not.toContain("github.event_name == 'pull_request'");
  });

  it("keeps the public review CLI inside the published graph", async () => {
    const tsup = await readFile(resolve(root, "packages/arc-framework/tsup.config.ts"), "utf8");
    const manifest = JSON.parse(await readFile(resolve(root, "packages/arc-framework/package.json"), "utf8")) as {
      files: string[];
      scripts?: Record<string, string>;
    };
    expect(tsup).toContain('entry: ["src/cli.ts"]');
    expect(tsup).toContain("registerReviewDomainSchemas");
    expect(tsup).toContain("registerDeliveryDomainSchemas");
    expect(tsup).toContain(
      "registerDeliveryDomainSchemas(registerReviewDomainSchemas(createKernelRegistry()))",
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

  it("retains only the clearance workflow from the retired review-gate family", async () => {
    const names = (await readdir(resolve(root, ".github/workflows"))).filter((name) => /\.ya?ml$/u.test(name));
    expect(names.filter((name) => name.startsWith("review-gate"))).toEqual([]);
    expect(names).toContain("arc-clearance.yml");
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
      "### 13) Behind-base reconcile gate and merge",
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
    expect(candidate).not.toContain("proceed to commit + sweep + push");
  });

  it("keeps composition public and surfaces the complete candidate tail", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const releaseNotes = sectionBetween(
      packaged,
      "### 8) Compose Release Notes Entry",
      "### 9) Compose Completion Notes",
    );
    expect(releaseNotes).toMatch(/shipped reader\/operator-visible outcomes/u);
    expect(releaseNotes).toMatch(/WU names or slugs[\s\S]*task or phase references[\s\S]*branches/u);
    expect(releaseNotes).toMatch(/roadmap pointers[\s\S]*internal review or provider machinery/u);
    expect(releaseNotes).toContain("planned-but-unshipped work");
    expect(releaseNotes).toMatch(/publicly supported review concepts and configuration[\s\S]*shipped outcome/iu);
    expect(releaseNotes).toMatch(/\*\*Infrastructure\*\*[\s\S]*externally meaningful operational change/u);
    expect(releaseNotes).toMatch(/\*\*Breaking\s+Changes\*\*[\s\S]*affected stability contract[\s\S]*migration/u);

    const completionNotes = sectionBetween(
      packaged,
      "### 9) Compose Completion Notes",
      "### 10) Commit completion content",
    );
    expect(completionNotes).toMatch(/delivered scope[\s\S]*material deviations or supersessions/u);
    expect(completionNotes).toContain("verified evidence");
    expect(completionNotes).toMatch(/never repeat[\s\S]*(?:task list|git history)/iu);

    const finalGate = sectionBetween(
      packaged,
      "### 13) Behind-base reconcile gate and merge",
      "### 14) Post-merge worktree cleanup",
    );
    expect(finalGate).toMatch(/exact candidate-tail diff[\s\S]*not excerpts alone/u);
    expect(finalGate).toMatch(/task and notes cleanup[\s\S]*composition[\s\S]*cohort closeout/u);
    expect(finalGate).toMatch(/archive moves[\s\S]*readiness regeneration[\s\S]*reconcile commits/u);
  });

  it("routes frontline and local review through the public advisory command surface", async () => {
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
      for (const command of [
        "arc review frontline resolve -",
        "arc review frontline run -",
        "arc review local prepare -",
        "arc review local attest -",
        "arc review local resume -",
        "arc review respond -",
        "arc review reduce -",
      ]) {
        expect(packaged).toContain(command);
      }
      expect(packaged).toMatch(/runtime-owned bindings/iu);
      expect(packaged).toContain("`findings / respond`");
      expect(packaged).toContain("review applicability");
      expect(packaged).toContain("targeted verification");
      expect(packaged).toMatch(/command error\s+envelope/iu);
      expect(packaged).not.toMatch(/ReviewOperationStateStore|invalid-request/u);
      expect(packaged).not.toMatch(/review-suspension|promoted watcher|scheduled wakeup/iu);
      expect(packaged).not.toMatch(/project review coordinator|coordinate-pr-review/iu);
    }
  });

  it("routes Errand review and re-entry through the public command protocol", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(project).toBe(packaged);
    expect(packaged).toMatch(/atomic determinacy[\s\S]*routing fact/iu);
    expect(packaged).toMatch(/arc review resolve -[\s\S]*review-response/iu);
    expect(packaged).toMatch(/On interruption[\s\S]*typed `state` \/ `nextAction`/iu);
    expect(packaged).not.toMatch(/vehicle-neutral response-state store|review-suspension|promoted watcher/u);
    expect(packaged).toMatch(/merge lane[\s\S]*downstream presentation/u);
    expect(packaged).toMatch(/Never reconstruct review state[\s\S]*invent\s+WU state/iu);
  });

  it("settles the Errand exact head without importing WU products", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    const full = sectionBetween(packaged, "### Ship — full protection", "### Ship — partial protection");
    expect(full).toContain("arc base drift --json");
    expect(full).toContain("review applicability");
    expect(full).toMatch(/targeted verification[\s\S]*focused[\s\S]*complete review/u);
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

    const partial = sectionBetween(packaged, "### Ship — partial protection", "### Complete");
    expect(partial).toContain("direct base-branch commit");
    expect(partial).not.toContain("pre-merge");
    expect(partial).not.toContain("integration-interlock");
  });

  it("covers Errand review outcomes and exact-target re-entry", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    const frontline = sectionBetween(
      packaged,
      "Compose the immutable policy target",
      "3. **Resolve the Errand PR**",
    );
    expect(frontline).toContain("`findings / respond`");
    expect(frontline).toContain("`arc review respond -`");
    expect(frontline).toMatch(/Approved fixes[\s\S]*Tier 1 gates[\s\S]*new target/iu);
    expect(frontline).toMatch(/`stale-target \/ select-scope`[\s\S]*recompose[\s\S]*rerun chunking/iu);
    expect(frontline).toContain("`blocked | unavailable | invalid-override / stop`");

    const openPr = sectionBetween(
      packaged,
      "4. **Enter the open PR.**",
      "5. **Settle the final head.**",
    );
    expect(openPr).toMatch(/rate-limited \| transient-unavailable \/ try-next-source/iu);
    expect(openPr).toMatch(/ambiguous delivery[\s\S]*terminal failure stops/iu);
    expect(openPr).toMatch(/target movement[\s\S]*review applicability/iu);
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
    expect(prResolution).toMatch(/one merged match at the current head[\s\S]*skip review\/merge[\s\S]*Complete cleanup/iu);

    const lanes = sectionBetween(packaged, "6. Land per lane:", "### Ship — partial protection");
    expect(lanes).toMatch(/Auto-merge-lane[\s\S]*--auto <merge-flag>[\s\S]*--match-head-commit/iu);
    expect(lanes).toContain("arc review planning-lane <base-sha> {approved-head-sha}");
    expect(lanes).toMatch(/only literal `planning`[\s\S]*arm(?:ing)?[\s\S]*auto-merge/iu);
    expect(lanes).toMatch(/Reviewed-lane[\s\S]*owner review[\s\S]*head change restarts Step 4/iu);

    const complete = sectionBetween(packaged, "### Complete");
    expect(complete).toMatch(
      /arc errand close <slug> --json[\s\S]*finalizes the exact v3 identity tail[\s\S]*reaps refs[\s\S]*drops only its origin capture/iu,
    );
    expect(complete).toMatch(/nextOffer[\s\S]*exact file-ordered execute-bound sibling[\s\S]*Never scan the inbox/iu);
    expect(complete).toMatch(/Unattended merge[\s\S]*finalize pass[\s\S]*Exact replay is idempotent/iu);
  });

  it("keeps auto-merge arming on canonical classification without requiring ARC clearance", async () => {
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

    expect(documents.errand).toContain("arc review planning-lane <base-sha> {approved-head-sha}");
    expect(documents.errand).toMatch(/only literal `planning`[\s\S]*arm(?:ing)?[\s\S]*auto-merge/iu);
    expect(documents.drain).toMatch(
      /arc review planning-lane <base-sha> <head-sha>[\s\S]*only[\s\S]*`planning`[\s\S]*arm/iu,
    );
    expect(documents.setup).toMatch(/canonical\s+classifier/iu);
    expect(documents.setup).toMatch(/without\s+`arc-cleared`[\s\S]*procedural enforcement/iu);
    expect(documents.setup).toMatch(/when `arc-cleared`\s+is required[\s\S]*structural/iu);
    expect(documents.readme).toMatch(/without `arc-cleared`[\s\S]*canonical classifier/iu);
    expect(documents.codeowners).not.toContain("required arc-cleared");
    expect(documents.initial).toMatch(/planning auto-merge lane[\s\S]*canonical classifier/iu);
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

    const gate = sectionBetween(
      packageIntegration,
      "### 13) Behind-base reconcile gate and merge",
      "### 14) Post-merge worktree cleanup",
    );
    expect(packageIntegration.match(/arc base drift --json/gu)?.length ?? 0)
      .toBeGreaterThan(gate.match(/arc base drift --json/gu)?.length ?? 0);
    expect(gate).toContain("candidate's final mutation site");
    expect(gate).toMatch(/`unavailable`[\s\S]*`skipped`[\s\S]*(?:malformed|unrecognized)[\s\S]*stop/u);
    expect(gate).toMatch(/typed[\s\S]*empty[\s\S]*substantivePaths/u);
    expect(gate).toMatch(/base conflict[\s\S]*analyzer\/host disagreement/u);
    expect(gate).toContain("review applicability judgment");
    expect(gate).toMatch(/targeted verification[\s\S]*focused or\s+complete review/u);
    expect(gate).toMatch(/push[\s\S]*CI and routing[\s\S]*`pre-merge`/u);
    expect(gate).toMatch(/base moves again[\s\S]*same Step 13/u);
    expect(gate).toContain("requires a new exact-head checkpoint plus integration approval");
    expect(gate).toContain("git merge --no-edit {baseOid}");
    expect(gate).toContain(
      "result = arc base drift --json\n"
      + "if <result is authoritative clean>:\n"
      + "    gh pr merge {pr-number} --merge --match-head-commit {approved-head-sha}",
    );
    expect(gate).toMatch(/retain\s+`openedChangeRequest\.headSha` as `\{approved-head-sha\}`/iu);
    expect(gate).not.toContain("arc base drift --json\ngit merge");
    expect(gate).not.toContain("arc base drift --json\ngh pr merge");
    const approval = gate.indexOf("Approve (or redirect)?");
    const refreshedPr = gate.indexOf("re-read PR status", approval);
    const finalDrift = gate.lastIndexOf("result = arc base drift --json");
    expect(approval).toBeLessThan(refreshedPr);
    expect(refreshedPr).toBeLessThan(finalDrift);
    expect(gate.indexOf("git merge --no-edit {baseOid}")).toBeLessThan(
      gate.indexOf("run Tier 1 quality gates"),
    );
    expect(finalDrift).toBeLessThan(gate.lastIndexOf("gh pr merge {pr-number}"));
  });

  it("keeps early drift advisory separate from final authoritative reconciliation", async () => {
    const [packageIntegration, instanceIntegration] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(packageIntegration).toBe(instanceIntegration);
    const reviewSettlement = sectionBetween(
      packageIntegration,
      "### 6) Confirm review coordination",
      "### 7) Spec-presence + alignment checks",
    );
    expect(reviewSettlement).not.toContain("git merge");
    expect(reviewSettlement).toContain("`review-settled`");
    const advisory = packageIntegration.indexOf("Before spending a hosted pass");
    const finalGate = packageIntegration.indexOf("### 13) Behind-base reconcile gate and merge");
    expect(packageIntegration.indexOf("arc base drift --json", advisory)).toBeLessThan(finalGate);
    expect(packageIntegration.indexOf("git merge --no-edit {baseOid}")).toBeGreaterThan(finalGate);
  });

  it("preserves lifecycle readiness through an exact-head merge window", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    );
    const gate = sectionBetween(
      packaged,
      "### 13) Behind-base reconcile gate and merge",
      "### 14) Post-merge worktree cleanup",
    );
    expect(gate).toContain("arc status {name} --json");
    expect(gate).toMatch(/`with-integration`[\s\S]*`shipped`[\s\S]*`completed`/u);
    expect(gate).toMatch(/`manual`[\s\S]*`integrating`/u);
    expect(gate).toMatch(/Completion Notes[\s\S]*applicable Release Notes/u);
    expect(gate).toMatch(/No `gh pr merge`[\s\S]*auto-merge enablement[\s\S]*queued merge/u);
    expect(gate).toContain("integration-interlock is the sole merge authority");
    expect(gate).toMatch(/candidate mutation[\s\S]*invalidates[\s\S]*checkpoint/u);

    const lifecycleReady = gate.indexOf("arc status {name} --json");
    const preMerge = gate.indexOf("Fire `pre-merge`");
    const approval = gate.indexOf("Approve (or redirect)?");
    const refreshedHead = gate.indexOf("Immediately after approval", approval);
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
    const resume = sectionBetween(packaged, "#### Resume entry", "### 2) Local diff preflight");
    expect(resume).toMatch(/resolver `state: shipped`[\s\S]*open[\s\S]*not merged[\s\S]*Step 13/iu);
    expect(resume).toMatch(/PR already merged[\s\S]*Verify Phase 2 products[\s\S]*Step 13 tail/u);
    expect(resume).toContain("first incomplete candidate-tail step");

    const gate = sectionBetween(
      packaged,
      "### 13) Behind-base reconcile gate and merge",
      "### 14) Post-merge worktree cleanup",
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
    expect(commandCount).toBe(3);
  });

  it("gates full-protection decomposition merge after PR status", async () => {
    const decompose = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md",
    );
    const partial = sectionBetween(decompose, "### Partial protection", "### Full protection");
    const full = sectionBetween(decompose, "### Full protection", "## 8. Resolve the landed handoff");
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
      "#### Resume entry",
      "### 2) Local diff preflight",
    );
    expect(resumeEntry).toContain("A merged PR proves only that the merge ran");
    expect(resumeEntry).toContain("Completion Notes");
    expect(resumeEntry).toContain("under `with-integration`, the resolver reports `shipped` in `completed`");
    expect(resumeEntry).toMatch(/do not\s+invoke `arc user close` or `arc teardown`/u);
    expect(resumeEntry).toContain("lifecycle-only repair change request");
  });

  it("validates clearance with pinned code while treating the detached PR checkout only as data", async () => {
    const clearance = await read("arc-clearance.yml");
    const workflow = load(clearance) as {
      on?: unknown;
      permissions?: unknown;
    };
    expect(workflow.on).toEqual({
      pull_request_target: { types: ["opened", "reopened", "synchronize", "edited"] },
      repository_dispatch: { types: ["arc-clearance"] },
    });
    expect(workflow.permissions).toEqual({});

    const validation = jobValue(clearance, "validate");
    expect(validation.permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
    });
    expect(validation).not.toHaveProperty("environment");
    expect(validation).not.toHaveProperty("statuses");
    const target = stepValue(clearance, "validate", "target");
    expect(target.run).toContain(
      'test "$(jq -r .head.repo.full_name <<<"$pull_request")" = "$GITHUB_REPOSITORY"',
    );

    const trustedCheckout = stepValue(clearance, "validate", "trusted-checkout");
    expect(trustedCheckout.with).toMatchObject({
      ref: "${{ github.workflow_sha }}",
      "persist-credentials": false,
    });
    expect(trustedCheckout.with).not.toHaveProperty("path");

    const dataCheckout = stepValue(clearance, "validate", "data-checkout");
    expect(dataCheckout.with).toMatchObject({
      ref: "${{ steps.target.outputs.head_sha }}",
      path: "_arc_pr_data",
      "persist-credentials": false,
    });
    const readiness = stepValue(clearance, "validate", "readiness");
    expect(readiness.run).toContain(
      "./node_modules/.bin/tsx packages/arc-framework/src/cli.ts review readiness",
    );
    expect(readiness.run).toContain("treeRoot:$treeRoot");
    expect(readiness.run).toContain('test "$(jq -r .state <<<"$result")" = ready');

    const executableSteps = (validation.steps as Array<Record<string, unknown>>)
      .filter((step) => typeof step.run === "string");
    for (const step of executableSteps) {
      expect(step["working-directory"]).not.toBe("_arc_pr_data");
      expect(step.run).not.toMatch(/(?:bash|node|npm|npx|tsx)\s+_arc_pr_data\//u);
    }
    expect(clearance).not.toMatch(/(?:npm|npx|tsx).*(?:github\.event\.client_payload|_arc_pr_data\/)/u);
  });

  it("isolates clearance publication and binds success to the still-current full SHA", async () => {
    const clearance = await read("arc-clearance.yml");
    const writer = jobValue(clearance, "write-status");
    expect(writer.needs).toBe("validate");
    expect(writer.if).toBe("${{ needs.validate.result == 'success' }}");
    expect(writer.environment).toBe("arc-clearance");
    expect(writer.permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
      statuses: "write",
    });
    expect(writer).not.toHaveProperty("secrets");

    const steps = writer.steps;
    expect(Array.isArray(steps)).toBe(true);
    expect(steps).toHaveLength(2);
    const trustedCheckout = stepValue(clearance, "write-status", "live-pair-checkout");
    expect(trustedCheckout.with).toMatchObject({
      ref: "${{ github.workflow_sha }}",
      "persist-credentials": false,
    });
    const publish = (steps as Array<Record<string, unknown>>)[1] ?? {};
    expect(publish).not.toHaveProperty("uses");
    expect(publish.env).toMatchObject({
      PR_NUMBER: "${{ github.event.client_payload.pull_request }}",
      STATUS_CONTEXT: "arc-cleared",
      VALIDATED_BASE: "${{ needs.validate.outputs.base_sha }}",
      VALIDATED_BASE_REF: "${{ needs.validate.outputs.base_ref }}",
      VALIDATED_HEAD: "${{ needs.validate.outputs.head_sha }}",
      READINESS_JSON: "${{ needs.validate.outputs.readiness_json }}",
    });
    expect(publish.run).toContain('test "$(jq -r .state <<<"$READINESS_JSON")" = ready');
    expect(publish.run).toContain('test "$(jq -r .payload.target.headSha <<<"$READINESS_JSON")" = "$VALIDATED_HEAD"');
    expect(publish.run).toContain(
      'bash .arc/system/.internal/scripts/confirm-live-change-pair.sh "$GITHUB_REPOSITORY"',
    );
    expect(publish.run).toContain('gh api "repos/$GITHUB_REPOSITORY/statuses/$VALIDATED_HEAD"');
    expect(publish.run).not.toMatch(/statuses\/\$(?:HEAD_BRANCH|GITHUB_HEAD_REF)|refs\/pull|merge-ref/u);
    expect(JSON.stringify(writer)).not.toMatch(/_arc_pr_data|client_payload\.(?:slug|vehicle_kind|archive_cadence)/u);
  });

  it("does not inherit clearance across heads or let a stale unlock clear its replacement", async () => {
    const fixture = JSON.parse(await readRepositoryFile(
      "packages/arc-framework/__tests__/fixtures/review-gate/clearance-status-history.json",
    )) as ClearanceStatusFixture;
    expect(hasClearanceSuccess(fixture, fixture.previousHead)).toBe(true);
    expect(hasClearanceSuccess(fixture, fixture.replacementHead)).toBe(false);

    expect(fixture.previousHead).not.toBe(fixture.replacementHead);
    const statusesAfterStaleUnlock = [...fixture.statuses, {
      context: fixture.context,
      sha: fixture.previousHead,
      state: "success" as const,
    }];
    expect(hasClearanceSuccess({ ...fixture, statuses: statusesAfterStaleUnlock }, fixture.replacementHead)).toBe(false);
  });

  it("publishes planning clearance only from trusted pull-request-target code", async () => {
    const [ci, workflow] = await Promise.all([read("ci.yml"), read("arc-clearance.yml")]);
    const parsed = load(workflow) as { on?: Record<string, unknown> };
    const stamp = jobValue(workflow, "planning-clearance");

    expect(ci).not.toContain("planning-classify:");
    expect(ci).not.toContain("planning-clearance:");
    expect(parsed.on).toHaveProperty("pull_request_target");
    expect(parsed.on).not.toHaveProperty("pull_request");
    expect(stamp.if).toContain("github.event_name == 'pull_request_target'");
    expect(stamp.if).toContain("head.repo.full_name == github.repository");
    expect(stamp.permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
      statuses: "write",
    });
    expect(stamp["runs-on"]).toBe("ubuntu-latest");

    const trustedCheckout = stepValue(workflow, "planning-clearance", "planning-trusted-checkout");
    expect(trustedCheckout.with).toMatchObject({
      ref: "${{ github.workflow_sha }}",
      "persist-credentials": false,
    });
    const target = stepValue(workflow, "planning-clearance", "planning-target");
    expect(target.run).toContain('pull_request="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER")"');
    expect(target.run).toContain('test "$(jq -r .state <<<"$pull_request")" = open');
    expect(target.run).toContain('test "$(jq -r .base.repo.full_name <<<"$pull_request")" = "$GITHUB_REPOSITORY"');
    expect(target.run).toContain('test "$(jq -r .head.repo.full_name <<<"$pull_request")" = "$GITHUB_REPOSITORY"');

    const planningSteps = stamp.steps as Array<Record<string, unknown>>;
    const buildIndex = planningSteps.findIndex((step) => step.run === "npm run build");
    const targetIndex = planningSteps.findIndex((step) => step.id === "planning-target");
    const resetIndex = planningSteps.findIndex((step) => step.id === "planning-reset");
    const dataIndex = planningSteps.findIndex((step) => step.id === "planning-data");
    const publishIndex = planningSteps.findIndex((step) => step.id === "planning-status");
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(publishIndex).toBeGreaterThan(buildIndex);
    expect(resetIndex).toBeGreaterThan(targetIndex);
    expect(dataIndex).toBeGreaterThan(resetIndex);
    const reset = stepValue(workflow, "planning-clearance", "planning-reset");
    expect(reset.env).toMatchObject({
      HEAD_SHA: "${{ steps.planning-target.outputs.head_sha }}",
    });
    expect(reset.run).toContain('gh api "repos/$GITHUB_REPOSITORY/statuses/$HEAD_SHA"');
    expect(reset.run).toContain("-f state=pending -f context=arc-cleared");

    const dataCheckout = stepValue(workflow, "planning-clearance", "planning-data");
    expect(dataCheckout.with).toMatchObject({
      repository: "${{ steps.planning-target.outputs.head_repository }}",
      ref: "${{ steps.planning-target.outputs.head_sha }}",
      path: "_arc_change_data",
      "fetch-depth": 0,
      "persist-credentials": false,
    });
    expect(workflow).toContain(
      "Pull-request content is inert classification data; no command executes from this checkout.",
    );

    const publish = stepValue(workflow, "planning-clearance", "planning-status");
    expect(publish.run).toContain(
      'lane="$(node packages/arc-framework/dist/cli.js review planning-lane "$BASE_SHA" "$HEAD_SHA"',
    );
    expect(publish.run).not.toContain("npx arc");
    expect(publish.run).toContain('test "$lane" = planning || test "$lane" = reviewed');
    expect(publish.run).toContain('gh api "repos/$GITHUB_REPOSITORY/statuses/$HEAD_SHA"');
    expect(publish.run).toContain("-f context=arc-cleared");
    expect(publish.run).toContain(
      'bash .arc/system/.internal/scripts/confirm-live-change-pair.sh "$GITHUB_REPOSITORY"',
    );
    expect(publish.run).not.toMatch(/(?:bash|node|npm|npx|tsx)\s+_arc_change_data\//u);
  });

  it("resets prior clearance before either exact-head writer can publish success", async () => {
    const [ci, clearance, codeowners] = await Promise.all([
      read("ci.yml"),
      read("arc-clearance.yml"),
      readRepositoryFile(".github/CODEOWNERS"),
    ]);
    const writers = [ci, clearance].flatMap((workflow, workflowIndex) =>
      [...workflow.matchAll(/gh api "repos\/\$GITHUB_REPOSITORY\/statuses\/\$([A-Z_]+)"[\s\S]{0,180}?context="?(\$STATUS_CONTEXT|arc-cleared)"?/gu)]
        .map((match) => ({ workflowIndex, sha: match[1], context: match[2] })));
    expect(writers).toEqual([
      { workflowIndex: 1, sha: "HEAD_SHA", context: "arc-cleared" },
      { workflowIndex: 1, sha: "HEAD_SHA", context: "arc-cleared" },
      { workflowIndex: 1, sha: "VALIDATED_HEAD", context: "$STATUS_CONTEXT" },
    ]);
    expect(ci).not.toContain("statuses/$HEAD_SHA");
    expect(clearance).toContain('if [ "$lane" = planning ]; then');
    expect(clearance).toContain('test "$(jq -r .state <<<"$READINESS_JSON")" = ready');
    expect(codeowners).toContain("* @andrewRCr");
    expect(jobValue(ci, "ci_ok").name).toBe("ci-ok");
    expect(jobValue(ci, "merge-ok").name).toBe("merge-ok");
  });

  it("ships an installable clearance workflow pinned to the installed framework version", async () => {
    const templatePath = "packages/arc-framework/arc/reference/templates/arc/merge-gate/arc-clearance.yml";
    const setupPath = "packages/arc-framework/arc/system/workflows/arc/supplemental/setup-arc-clearance.md";
    const [template, setup, recipe, codeowners, recipeReadme] = await Promise.all([
      readRepositoryFile(templatePath),
      readRepositoryFile(setupPath),
      readRepositoryFile("packages/arc-framework/init-recipe.json"),
      readRepositoryFile("packages/arc-framework/arc/reference/templates/arc/merge-gate/CODEOWNERS"),
      readRepositoryFile("packages/arc-framework/arc/reference/templates/arc/merge-gate/README.md"),
    ]);
    const inventory = JSON.parse(recipe) as { include_files: string[] };
    const installedWorkflow = load(template) as {
      on?: Record<string, unknown>;
      jobs?: Record<string, unknown>;
    };

    expect(inventory.include_files).toContain("reference/templates/arc/merge-gate/README.md");
    expect(inventory.include_files).toContain("reference/templates/arc/merge-gate/arc-clearance.yml");
    expect(inventory.include_files).toContain("reference/templates/arc/merge-gate/CODEOWNERS");
    expect(inventory.include_files).toContain("system/workflows/arc/supplemental/setup-arc-clearance.md");
    expect(inventory.include_files).toContain("system/workflows/arc/supplemental/setup-merge-gate.md");
    expect(template).toContain("@arc-framework/cli@{{ARC_FRAMEWORK_VERSION}}");
    expect(template).toContain("npm exec --yes --package=");
    expect(installedWorkflow.on?.pull_request_target).toEqual({
      types: ["opened", "reopened", "synchronize", "edited"],
    });
    expect(installedWorkflow.on).not.toHaveProperty("pull_request");
    expect(installedWorkflow.on).toHaveProperty("repository_dispatch");
    expect(installedWorkflow.jobs).toHaveProperty("planning-clearance");
    expect(jobValue(template, "planning-clearance").if).toContain("head.repo.full_name == github.repository");
    expect(stepValue(template, "planning-clearance", "planning-trusted-checkout").with).toMatchObject({
      ref: "${{ github.workflow_sha }}",
      "persist-credentials": false,
    });
    expect(stepValue(template, "planning-clearance", "planning-target").run).toContain(
      'pull_request="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER")"',
    );
    const templateReset = stepValue(template, "planning-clearance", "planning-reset");
    expect(templateReset.env).toMatchObject({
      HEAD_SHA: "${{ steps.planning-target.outputs.head_sha }}",
    });
    expect(templateReset.run).toContain("-f state=pending -f context=arc-cleared");
    expect(stepValue(template, "planning-clearance", "planning-data").with).toMatchObject({
      repository: "${{ steps.planning-target.outputs.head_repository }}",
      ref: "${{ steps.planning-target.outputs.head_sha }}",
      path: "_arc_change_data",
      "fetch-depth": 0,
      "persist-credentials": false,
    });
    expect(stepValue(template, "planning-clearance", "planning-status").env).toMatchObject({
      BASE_REF: "${{ steps.planning-target.outputs.base_ref }}",
      BASE_SHA: "${{ steps.planning-target.outputs.base_sha }}",
      HEAD_SHA: "${{ steps.planning-target.outputs.head_sha }}",
    });
    expect(stepValue(template, "validate", "target").run).toContain(
      'test "$(jq -r .head.repo.full_name <<<"$pull_request")" = "$GITHUB_REPOSITORY"',
    );
    expect(template).toContain('arc review planning-lane "$BASE_SHA" "$HEAD_SHA"');
    expect(template).toContain(
      'bash .arc/system/.internal/scripts/confirm-live-change-pair.sh "$GITHUB_REPOSITORY"',
    );
    expect(inventory.include_files).toContain(
      "system/.internal/scripts/confirm-live-change-pair.sh",
    );
    expect(template.match(/@arc-framework\/cli@\{\{ARC_FRAMEWORK_VERSION\}\}/gu)).toHaveLength(2);
    expect(template).not.toMatch(/@(?:latest|next|beta)|node_modules\/.bin|packages\/arc-framework\/src/u);
    expect(template).toContain("path: _arc_pr_data");
    expect(template).toContain(
      "Fetch branch refs: exact decomposition source commits may sit outside the PR history.",
    );
    expect(template).not.toMatch(/working-directory: _arc_pr_data|(?:bash|node|npm|npx|tsx)\s+_arc_pr_data\//u);
    expect(codeowners).not.toContain("/.arc/backlog/**/");
    expect(codeowners).toContain("/.arc/backlog/planned/*/*/spec-*.md");
    expect(codeowners).toContain("/.arc/backlog/provisional/*/meta-*.md");
    expect(codeowners).not.toContain("/.arc/system/.internal/retirement-receipts/*.json");
    expect(recipeReadme).not.toContain("git diff --name-only");
    expect(recipeReadme).toContain('arc review planning-lane "$BASE_SHA" "$HEAD_SHA"');
    expect(recipeReadme).toContain('[ "$HEAD_REPOSITORY" = "$GITHUB_REPOSITORY" ]');
    expect(recipeReadme).toContain("classification checkout must fetch branch refs");
    expect(setup).toContain(".arc/system/.internal/manifest.json");
    expect(setup).toContain("arc --version");
    expect(setup).toContain("{{ARC_FRAMEWORK_VERSION}}");
    expect(setup).toContain("both fixed writers");
  });

  it("keeps clearance setup additive, idempotent, and fail-closed at protection settlement", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/supplemental/setup-arc-clearance.md",
      ),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/setup-arc-clearance.md"),
    ]);
    expect(project).toBe(packaged);
    expect(packaged).toMatch(/detect current state[\s\S]*workflow[\s\S]*environment[\s\S]*required context/iu);
    expect(packaged).toMatch(/workflow and delegated live-pair[\s\S]*are present on the default branch/iu);
    expect(packaged).toContain(".arc/system/.internal/scripts/confirm-live-change-pair.sh");
    expect(packaged).toMatch(/stop before changing required\s+checks/iu);
    expect(packaged).toContain("arc-clearance");
    expect(packaged).toContain("protected_branches");
    expect(packaged).toContain("custom_branch_policies");
    expect(packaged).toContain("reviewers");
    expect(packaged).toContain("total_count");
    expect(packaged).toContain('["arc-cleared"]');
    expect(packaged).toMatch(/add[\s\S]*without replacing/iu);
    expect(packaged).toMatch(/missing admin[\s\S]*guided-manual fallback/iu);
    expect(packaged).not.toMatch(/PATCH[\s\S]*branches\/.*\/protection(?!\/required_status_checks\/contexts)/u);
  });

  it("keeps every shipped host-policy asset byte-identical to its project mirror", async () => {
    const paths = [
      "reference/templates/arc/merge-gate/CODEOWNERS",
      "reference/templates/arc/merge-gate/README.md",
      "reference/templates/arc/merge-gate/arc-clearance.yml",
      "system/.internal/scripts/confirm-live-change-pair.sh",
      "system/workflows/arc/supplemental/setup-arc-clearance.md",
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

  it("offers review-source and merge-guard setup as independent default-off choices", async () => {
    const paths = [
      "packages/arc-framework/arc/system/workflows/arc/initial-setup/01_verify-and-configure.md",
      ".arc/system/workflows/arc/initial-setup/01_verify-and-configure.md",
    ];
    const [packaged, project] = await Promise.all(paths.map((path) => readRepositoryFile(path)));
    expect(project).toBe(packaged);
    expect(packaged).toContain("Optional: Choose Review Sources and Merge Guards");
    expect(packaged).toContain("Frontline sources");
    expect(packaged).toContain("Standard-review sources");
    expect(packaged).toContain("ARC merge guard");
    expect(packaged).not.toMatch(/planning-lane-ownership/iu);
    expect(packaged).toMatch(/independently[\s\S]*default off/iu);
    expect(packaged).toContain("setup-arc-clearance.md");
  });
});
