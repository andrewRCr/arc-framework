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

  it("contains Actions spend while retaining explicit and bounded portability coverage", async () => {
    const workflow = await read("ci.yml");
    expect(workflow).toContain("push:\n    branches: [main]");
    expect(workflow).toContain("workflow_dispatch:");
    // Monthly (not weekly) cross-platform cron — macOS multiplier is the spend driver.
    expect(workflow).toContain("schedule:\n    - cron: '17 8 1 * *'");
    expect(workflow).toContain("os: [ubuntu-latest]");
    expect(workflow).toContain("os: [windows-latest, macos-latest]");
    expect(workflow).toContain("needs.classify.outputs.portability_target == 'true'");
    expect(workflow).toContain('echo "::error::portability classifier failed"');
    expect(workflow).toContain('echo "::error::invalid portability classifier output: $portability_target"');
    const targetedJob = workflow.slice(
      workflow.indexOf("  portability-cross-platform:"),
      workflow.indexOf("  ci_ok:"),
    );
    expect(targetedJob).not.toContain("needs.classify.outputs.weight");
  });

  it("keeps repository controller scripts outside the published CLI graph", async () => {
    const tsup = await readFile(resolve(root, "packages/arc-framework/tsup.config.ts"), "utf8");
    const manifest = JSON.parse(await readFile(resolve(root, "packages/arc-framework/package.json"), "utf8")) as {
      files: string[];
      scripts?: Record<string, string>;
    };
    expect(tsup).toContain('entry: ["src/cli.ts"]');
    expect(tsup).not.toContain("review-gate");
    expect(manifest.files).not.toContain("src");
    const rootManifest = JSON.parse(await readRepositoryFile("package.json")) as { scripts: Record<string, string> };
    expect(rootManifest.scripts["review-gate:await"]).toContain("run-await.ts");
    expect(manifest.scripts?.["review-gate:await"]).toBeUndefined();
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
    const projectGuard = "npm run review-gate:assert-head-mutable -- <hostRef> HEAD";

    expect(packageIntegration).toBe(instanceIntegration);
    expect(packageErrand).toBe(instanceErrand);
    expect(packageIntegration.match(new RegExp(genericGuard, "gu"))).toHaveLength(2);
    expect(packageIntegration).not.toContain("review-gate:assert-head-mutable");
    expect(packageIntegration.indexOf(genericGuard)).toBeGreaterThan(packageIntegration.indexOf("### 12) Final push"));
    expect(packageIntegration.slice(
      packageIntegration.indexOf("### 3) Open the PR"),
      packageIntegration.indexOf("### 4) Review iteration"),
    )).not.toContain(genericGuard);
    expect(packageIntegration).toContain("the outgoing local head");

    expect(packageErrand.match(new RegExp(genericGuard, "gu"))).toHaveLength(1);
    expect(packageErrand).not.toContain("review-gate:assert-head-mutable");
    expect(packageErrand).toContain("The initial pre-PR push has no `openedChangeRequest` and skips this query.");
    expect(coordination).toContain(projectGuard);
    expect(coordination.indexOf(projectGuard)).toBeLessThan(coordination.indexOf("and push."));
    expect(coordination).toMatch(/record the\s+authorized\s+`begin-fix` transition before invoking the guard/u);
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

  it("drives both integration safety windows through authoritative base drift", async () => {
    const [packageIntegration, instanceIntegration] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(packageIntegration).toBe(instanceIntegration);
    expect(packageIntegration.match(/arc base drift --json/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(packageIntegration).not.toContain("git fetch origin {base-branch}");
    expect(packageIntegration).not.toContain("rev-list --left-right --count");
    expect(packageIntegration).not.toContain("git merge --no-edit origin/{base-branch}");

    const gate = packageIntegration.slice(
      packageIntegration.indexOf("### 13) Behind-base reconcile gate and merge"),
      packageIntegration.indexOf("### 14) Post-merge worktree cleanup"),
    );
    expect(gate).toMatch(/`unavailable`, `skipped`, malformed, or unrecognized — stop/u);
    expect(gate).toContain("`reconcile` with a different `baseOid`");
    expect(gate).toContain("re-fire the reconcile");
    expect(gate).toContain("requires a new exact-head checkpoint plus integration approval");
    expect(gate).toContain(
      "arc base drift --json\ngit merge --no-edit {approved-baseOid}",
    );
    expect(gate).toContain(
      "arc base drift --json\ngh pr merge {pr-number} --merge",
    );
    expect(gate.indexOf("git merge --no-edit {approved-baseOid}")).toBeLessThan(
      gate.indexOf("run Tier 1 quality gates"),
    );
    expect(gate.lastIndexOf("arc base drift --json")).toBeLessThan(gate.indexOf("gh pr merge"));
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
