import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const read = async (name: string): Promise<string> => readFile(resolve(root, ".github/workflows", name), "utf8");

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

  it("publishes independent CI truth and a thin compatibility alias", async () => {
    const workflow = await read("ci.yml");
    expect(workflow).toContain("  ci_ok:\n    name: ci-ok");
    expect(workflow).toContain("needs: [classify, lint-typecheck-unit, integration-e2e, portability]");
    expect(workflow).toContain("  merge-ok:\n    name: merge-ok\n    needs: ci_ok");
    expect(workflow).toContain("scripts/classify-change.sh lane --stdin0");
    expect(workflow).toContain("git diff --name-only -z");
    expect(workflow).not.toContain("changed_all=");
  });

  it("keeps repository controller scripts outside the published CLI graph", async () => {
    const tsup = await readFile(resolve(root, "packages/arc-framework/tsup.config.ts"), "utf8");
    const manifest = JSON.parse(await readFile(resolve(root, "packages/arc-framework/package.json"), "utf8")) as {
      files: string[];
    };
    expect(tsup).toContain('entry: ["src/cli.ts"]');
    expect(tsup).not.toContain("review-gate");
    expect(manifest.files).not.toContain("src");
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
    const reconcileStep = workflow.slice(workflow.indexOf("  reconcile:"));
    expect(reconcileStep).toContain("ARC_APP_SLUG: ${{ steps.app-token.outputs.app-slug }}");
    expect(reconcileStep).toContain("GITHUB_TOKEN: ${{ github.token }}");
  });

  it("gives discovery the App id to suppress self-checks and skips reconcile on an empty matrix", async () => {
    const workflow = await read("review-gate.yml");
    const discovery = workflow.slice(workflow.indexOf("  discover:"), workflow.indexOf("  reconcile:"));
    expect(discovery).toContain("ARC_REVIEW_GATE_APP_ID: ${{ vars.ARC_REVIEW_GATE_APP_ID }}");
    expect(workflow).toContain('needs.discover.outputs.matrix != \'{"include":[]}\'');
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
});
