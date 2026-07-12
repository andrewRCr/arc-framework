import { describe, expect, it, vi } from "vitest";

import {
  auditRepairWriterGraph,
  GitHubRestRepairAuditFacts,
  validateRepairStatusSource,
} from "../../../../../../src/scripts/review-gate/hosts/github/repair-audit.js";
import type { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";

const SHA = "a".repeat(40);

function repairWorkflow(writerStep = `
      - name: Publish bounded repair status
        env:
          STATUS_CONTEXT: review-repair-ok
          VALIDATED_HEAD: \${{ needs.validate.outputs.head_sha }}
          PR_NUMBER: \${{ inputs.pull_request }}
        run: |
          live_head="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER" --jq .head.sha)"
          test "$live_head" = "$VALIDATED_HEAD"
          gh api "repos/$GITHUB_REPOSITORY/statuses/$VALIDATED_HEAD" \\
            -f state=success -f context="$STATUS_CONTEXT" -f target_url="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
`): string {
  return `
name: Repair
on:
  workflow_dispatch:
    inputs:
      pull_request: { required: true, type: number }
permissions: {}
jobs:
  validate:
    permissions:
      contents: read
      pull-requests: read
      actions: read
    runs-on: ubuntu-latest
    outputs:
      head_sha: \${{ steps.validate.outputs.head_sha }}
    steps:
      - uses: actions/checkout@${"b".repeat(40)}
        with: { persist-credentials: false }
      - id: validate
        run: npm run review-gate:validate-repair
  write-status:
    needs: validate
    if: \${{ needs.validate.result == 'success' }}
    environment: review-gate-repair
    permissions:
      contents: read
      pull-requests: read
      statuses: write
    runs-on: ubuntu-latest
    steps:${writerStep}
`;
}

function validFiles(): Record<string, string> {
  return {
    ".github/workflows/ci.yml": `
name: CI
on: [push]
permissions: { contents: read }
jobs:
  test:
    permissions: { contents: read }
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`,
    ".github/workflows/review-gate-repair.yml": repairWorkflow(),
  };
}

function audit(overrides: Record<string, unknown> = {}) {
  return auditRepairWriterGraph({
    files: validFiles(),
    repositoryDefaultPermission: "read",
    auditedSha: SHA,
    liveDefaultBranchSha: SHA,
    repairWorkflowPath: ".github/workflows/review-gate-repair.yml",
    repairEnvironment: "review-gate-repair",
    changedPaths: [],
    authorityPaths: [
      ".github/workflows/review-gate-repair.yml",
      "packages/arc-framework/src/scripts/review-gate/hosts/github/repair-audit.ts",
    ],
    ...overrides,
  });
}

describe("repair workflow exclusive-writer audit", () => {
  it("accepts one closed inline writer after a read-only validation job", () => {
    expect(audit()).toMatchObject({ ok: true, writer: {
      workflowPath: ".github/workflows/review-gate-repair.yml",
      jobId: "write-status",
    } });
  });

  it.each([
    ["repository default write", { repositoryDefaultPermission: "write" }],
    ["default branch graph drift", { liveDefaultBranchSha: "c".repeat(40) }],
    ["protected authority changed", { changedPaths: [".github/workflows/review-gate-repair.yml"] }],
    ["direct competing writer", { files: {
      ...validFiles(),
      ".github/workflows/other.yml": `
name: Other
on: [push]
permissions: {}
jobs:
  write:
    permissions: { statuses: write }
    runs-on: ubuntu-latest
    steps: [{ run: echo no }]
`,
    } }],
    ["reusable competing writer", { files: {
      ...validFiles(),
      ".github/workflows/caller.yml": `
name: Caller
on: [push]
permissions: {}
jobs:
  call:
    permissions: { statuses: write }
    uses: ./.github/workflows/reusable.yml
`,
      ".github/workflows/reusable.yml": `
name: Reusable
on: { workflow_call: {} }
permissions: {}
jobs:
  write:
    permissions: { statuses: write }
    runs-on: ubuntu-latest
    steps: [{ run: echo no }]
`,
    } }],
    ["second environment consumer", { files: {
      ...validFiles(),
      ".github/workflows/other.yml": `
name: Other
on: [push]
permissions: {}
jobs:
  use-environment:
    permissions: { contents: read }
    environment: review-gate-repair
    runs-on: ubuntu-latest
    steps: [{ run: echo no }]
`,
    } }],
    ["implicit job permissions", { files: {
      ...validFiles(),
      ".github/workflows/ci.yml": `
name: CI
on: [push]
permissions: { contents: read }
jobs:
  test:
    runs-on: ubuntu-latest
    steps: [{ run: npm test }]
`,
    } }],
    ["writer action", { files: {
      ...validFiles(),
      ".github/workflows/review-gate-repair.yml": repairWorkflow(`
      - uses: actions/checkout@${"b".repeat(40)}
`),
    } }],
    ["writer secret", { files: {
      ...validFiles(),
      ".github/workflows/review-gate-repair.yml": repairWorkflow(`
      - run: gh api /status
        env: { TOKEN: \${{ secrets.REPAIR_TOKEN }}, STATUS_CONTEXT: review-repair-ok }
`),
    } }],
    ["dynamic status context", { files: {
      ...validFiles(),
      ".github/workflows/review-gate-repair.yml": repairWorkflow(`
      - run: gh api /status
        env: { STATUS_CONTEXT: \${{ inputs.context }} }
`),
    } }],
  ])("rejects %s", (_name, overrides) => {
    expect(audit(overrides)).toMatchObject({ ok: false });
  });
});

describe("repair status source pin", () => {
  const observation = {
    context: "review-repair-ok",
    headSha: SHA,
    creatorAppId: "15368",
    state: "success" as const,
    targetUrl: "https://github.test/o/r/actions/runs/9001",
  };

  it("accepts only the exact GitHub Actions source, context, head, and run target", () => {
    expect(validateRepairStatusSource(observation, SHA, "https://github.test/o/r/actions/runs/9001")).toEqual([]);
    expect(validateRepairStatusSource({ ...observation, creatorAppId: "999" }, SHA, observation.targetUrl))
      .toContain("repair-status-source-app-mismatch");
    expect(validateRepairStatusSource({ ...observation, headSha: "b".repeat(40) }, SHA, observation.targetUrl))
      .toContain("repair-status-head-mismatch");
  });
});

describe("live repository audit facts", () => {
  it("reads repository default token permission and immutable default-branch head", async () => {
    const get = vi.fn(async (path: string) => {
      if (path.endsWith("/actions/permissions/workflow")) {
        return { kind: "ok" as const, status: 200, value: "read" as const };
      }
      if (path.endsWith("/branches/main")) return { kind: "ok" as const, status: 200, value: SHA };
      return { kind: "ok" as const, status: 200, value: "main" };
    });
    const rest = { get } as unknown as GitHubRestClient;
    await expect(new GitHubRestRepairAuditFacts(rest, "o", "r").read()).resolves.toEqual({
      repositoryDefaultPermission: "read",
      defaultBranch: "main",
      liveDefaultBranchSha: SHA,
    });
  });
});
