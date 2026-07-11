import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
});
