import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const packageArc = resolve(root, "packages/arc-framework/arc");
const projectArc = resolve(root, ".arc");

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true });
  return entries.filter((entry) => entry.endsWith(".md")).map((entry) => resolve(directory, entry));
}

describe("PR-open lifecycle extensions", () => {
  it.each([
    [packageArc, "system/extensions/pre-pr-open.md", "pre-pr-open", false, true],
    [packageArc, "system/extensions/post-pr-open.md", "post-pr-open", false, true],
    [projectArc, "system/extensions/pre-pr-open.md", "pre-pr-open", false, true],
    [projectArc, "system/extensions/post-pr-open.md", "post-pr-open", false, false],
  ])("registers the managed extension at %s/%s", async (base, relative, name, active, placeholder) => {
    const content = await readFile(resolve(base, relative), "utf8");
    expect(content).toContain(`name: ${name}`);
    expect(content).toContain(`active: ${active}`);
    expect(content.includes(`[No extension configured]`)).toBe(placeholder);
    expect(content.match(/^## .*\.actions$/gmu)).toHaveLength(1);
  });

  it("removes the legacy hook from live product surfaces", async () => {
    const files = [
      ...await markdownFiles(packageArc),
      ...await markdownFiles(resolve(projectArc, "system")),
      ...await markdownFiles(resolve(projectArc, "reference")),
    ];
    const matches: string[] = [];
    for (const file of files) {
      if ((await readFile(file, "utf8")).includes("pre-pr-review")) matches.push(file);
    }
    expect(matches).toEqual([]);
  });

  it("removes the old final-hook name from live package and project system surfaces", async () => {
    const files = [
      ...await markdownFiles(packageArc),
      ...await markdownFiles(resolve(projectArc, "system")),
    ];
    const matches: string[] = [];
    for (const file of files) {
      if ((await readFile(file, "utf8")).includes("pre-merge-review")) matches.push(file);
    }
    expect(matches).toEqual([]);
  });

  it("preserves independent Configurable update identities", async () => {
    const classification = await readFile(resolve(root, "packages/arc-framework/src/lib/classification.ts"), "utf8");
    expect(classification).toContain('"system/extensions/pre-pr-open.md"');
    expect(classification).toContain('"system/extensions/post-pr-open.md"');
    expect(classification).toContain('"system/extensions/pre-merge.md"');
  });

  it("places work-unit hooks on create, re-entry, and the stable final head", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );
    const push = workflow.indexOf("Push the WU branch upstream");
    const preOpen = workflow.indexOf("Immediately before creation");
    const create = workflow.indexOf("gh pr create");
    const postOpen = workflow.indexOf("compose `openedChangeRequest");
    const finalHead = workflow.indexOf("At the zero-behind final head");
    const mergeInterlock = workflow.indexOf("`integration-interlock`", finalHead);
    expect(push).toBeLessThan(preOpen);
    expect(preOpen).toBeLessThan(create);
    expect(create).toBeLessThan(postOpen);
    expect(finalHead).toBeLessThan(mergeInterlock);
    expect(workflow.slice(finalHead, mergeInterlock)).toContain("No lifecycle- or review-authored commit or push");
    expect(workflow).toContain("PR open, not merged");
    expect(workflow).toContain("`post-pr-open` → review iteration");
  });

  it("runs routed frontline review after the final WU push and before PR creation", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );
    const push = workflow.indexOf("Push the WU branch upstream");
    const resolveFrontline = workflow.indexOf("arc review frontline resolve -", push);
    const preOpen = workflow.indexOf("Immediately before creation", resolveFrontline);
    const create = workflow.indexOf("gh pr create", preOpen);

    expect([push, resolveFrontline, preOpen, create].every((index) => index >= 0)).toBe(true);
    expect(push).toBeLessThan(resolveFrontline);
    expect(resolveFrontline).toBeLessThan(preOpen);
    expect(preOpen).toBeLessThan(create);

    const frontlineCycle = workflow.slice(resolveFrontline, preOpen);
    expect(frontlineCycle).toContain("review-response");
    expect(frontlineCycle).toMatch(/recompose\s+the\s+exact target/u);
    expect(frontlineCycle).toContain("arc review frontline run -");
    expect(frontlineCycle).toContain("arc review local prepare -");
    expect(frontlineCycle).toContain("arc review local attest -");
    expect(frontlineCycle).toContain("arc review local resume -");
    expect(frontlineCycle).toContain("typed `state` / `nextAction`");
    expect(frontlineCycle).not.toMatch(/ReviewOperationStateStore|invalid-request/u);
    expect(frontlineCycle.replace(/\s+/gu, " ")).toContain("Tier 1 quality gates");
  });

  it("runs the same frontline cycle only for full-protection Errand publication", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/supplemental/run-errand.md"),
      "utf8",
    );
    const fullProtection = workflow.indexOf("### Ship — full protection");
    const push = workflow.indexOf("**Push** the errand branch upstream", fullProtection);
    const cycleStart = workflow.indexOf("From the pushed branch", push);
    const resolveFrontline = workflow.indexOf("arc review frontline resolve -", push);
    const resolvePr = workflow.indexOf("**Resolve the Errand PR**", resolveFrontline);
    const partialProtection = workflow.indexOf("### Ship — partial protection", resolvePr);

    expect([fullProtection, push, cycleStart, resolveFrontline, resolvePr, partialProtection]
      .every((index) => index >= 0)).toBe(true);
    expect(push).toBeLessThan(resolveFrontline);
    expect(resolveFrontline).toBeLessThan(resolvePr);

    const frontlineCycle = workflow.slice(cycleStart, resolvePr);
    expect(frontlineCycle).toContain("review-response");
    expect(frontlineCycle).toContain("not a routing input");
    expect(frontlineCycle).toMatch(/recompose\s+the\s+exact target/u);
    expect(frontlineCycle).toContain("arc review frontline run -");
    expect(frontlineCycle).toContain("arc review local prepare -");
    expect(frontlineCycle).toContain("arc review local attest -");
    expect(frontlineCycle).toContain("arc review local resume -");
    expect(frontlineCycle).toContain("typed `state` / `nextAction`");
    expect(frontlineCycle).not.toMatch(/ReviewOperationStateStore|invalid-request/u);
    expect(workflow.slice(partialProtection)).not.toContain("arc review frontline resolve -");
  });

  it("fails closed across every Errand PR lookup state", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/supplemental/run-errand.md"),
      "utf8",
    );
    for (const state of [
      "No match", "One open match", "One merged match at the current head", "Closed-unmerged",
      "multiple/conflicting matches", "lookup error", "incomplete enumeration",
    ]) expect(workflow).toContain(state);
    expect(workflow).toContain("--paginate --slurp");
    expect(workflow).toContain("state=all&base={base-branch}&head={owner}:{branch}");
    expect(workflow).toContain("git ls-remote --heads origin");
    expect(workflow).toContain("proposedChangeRequest.headSha");
  });

  it("keeps WU and Errand hook ordering symmetric", async () => {
    const workflows = await Promise.all([
      "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      "system/workflows/arc/supplemental/run-errand.md",
    ].map((path) => readFile(resolve(packageArc, path), "utf8")));
    for (const workflow of workflows) {
      const proposedChangeRequest = workflow.indexOf("proposedChangeRequest");
      const prCreate = workflow.indexOf("gh pr create");
      const openedChangeRequest = workflow.indexOf("openedChangeRequest =", prCreate);
      const preMerge = workflow.indexOf("pre-merge", openedChangeRequest);
      const integrationInterlock = workflow.indexOf("`integration-interlock`", openedChangeRequest);
      expect([proposedChangeRequest, prCreate, openedChangeRequest, preMerge, integrationInterlock]
        .every((index) => index >= 0)).toBe(true);
      expect(proposedChangeRequest).toBeLessThan(prCreate);
      expect(openedChangeRequest).toBeGreaterThan(prCreate);
      expect(preMerge).toBeLessThan(integrationInterlock);
      expect(workflow.toLowerCase()).toContain("halt before later actions");
    }
  });

  it("uses one workflow-wide WU push contract and retains final pre-merge settlement", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );

    expect(workflow.match(/#pre-push-review/gu)).toHaveLength(1);
    expect(workflow).toContain("Before every agent-managed push in this workflow");
    expect(workflow.indexOf("fire `pre-merge` when active"))
      .toBeLessThan(workflow.indexOf("`integration-interlock`", workflow.indexOf("fire `pre-merge` when active")));
  });

  it("keeps self-review author-side and provider-neutral", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/self-review.md"), "utf8");
      expect(method).toContain("author-side");
      expect(method).toContain("not peer/independent review evidence");
      expect(method).toContain("**Correctness**");
      expect(method).toContain("**Error paths**");
      expect(method.replace(/\s+/gu, " ")).toContain("invokes no external review provider by default");
      expect(method).not.toMatch(/coderabbit|copilot|claude/iu);
    }
  });

  it("ships one medium-neutral implementation audit rubric", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/implementation-audit.md"), "utf8");
      const normalized = method.toLowerCase();
      expect(normalized).toContain("intent and scope");
      expect(normalized).toContain("correctness and failure behavior");
      expect(normalized).toContain("trust boundaries and compatibility");
      expect(normalized).toContain("verification quality and missing cases");
      expect(normalized).toContain("coherence and maintainability");
      expect(method).toContain("code, configuration, or prose");
      expect(method).not.toMatch(/GitHub|CodeRabbit|provider command/iu);
    }
  });

  it("separates frontline advice from satisfying standard review", async () => {
    for (const base of [packageArc, projectArc]) {
      const frontline = await readFile(resolve(base, "system/methods/frontline-review.md"), "utf8");
      const independent = await readFile(resolve(base, "system/methods/standard-review.md"), "utf8");
      expect(frontline).toContain("active: false");
      expect(frontline).toContain("advisory pre-publication");
      expect(frontline).toContain("cannot satisfy");
      expect(frontline).toContain("adversarial-review");
      expect(frontline).toContain("implementation-audit");
      expect(independent).toContain("standard-review/v1");
      expect(independent).toContain("complete exact requested change set");
      expect(independent).toContain("non-author evaluator");
      expect(independent).toContain("all five rubric dimensions");
      expect(independent).toContain("stable locus");
      expect(independent.replace(/\s+/gu, " ")).toContain("typed contract and derived digest");
      expect(`${frontline}\n${independent}`).not.toMatch(/gh pr|GitHub|CodeRabbit|Codex|review\.frontline_source/iu);
    }
  });

  it("states the agent-ergonomics and host-enforcement boundary", async () => {
    for (const base of [packageArc, projectArc]) {
      const brief = await readFile(resolve(base, "reference/briefs/AGENT-BRIEF.ARC.md"), "utf8");
      const strategy = await readFile(
        resolve(base, "reference/strategies/arc/strategy-session-operations.md"),
        "utf8",
      );
      const selfReview = await readFile(resolve(base, "system/methods/self-review.md"), "utf8");
      const frontline = await readFile(resolve(base, "system/methods/frontline-review.md"), "utf8");
      const independent = await readFile(resolve(base, "system/methods/standard-review.md"), "utf8");
      const guidance = `${brief}\n${strategy}\n${selfReview}\n${frontline}\n${independent}`
        .replace(/\s+/gu, " ");

      expect(guidance).toContain("Agent-side review methods and extensions are best-effort ergonomics");
      expect(guidance).toContain("Only a configured required host-side check structurally enforces merge safety");
      expect(selfReview.replace(/^> ?/gmu, "").replace(/\s+/gu, " "))
        .toContain("does not structurally enforce merge safety");
      expect(frontline.replace(/^> ?/gmu, "").replace(/\s+/gu, " "))
        .toContain("does not structurally enforce merge safety");
      expect(independent.replace(/^> ?/gmu, "").replace(/\s+/gu, " "))
        .toContain("defines evidence eligibility, not merge enforcement");
    }

    const overview = await readFile(resolve(projectArc, "reference/TECHNICAL-OVERVIEW.md"), "utf8");
    expect(overview).toContain("The review controller is not operational merge authority");
    expect(overview).toContain("established manual integration path");
  });

  it("documents the native reviewer-guidance adapter boundary", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/standard-review.md"), "utf8");
      const strategy = await readFile(
        resolve(base, "reference/strategies/arc/strategy-configurability-architecture.md"),
        "utf8",
      );
      const normalized = `${method}\n${strategy}`.replaceAll("`", "").replace(/\s+/gu, " ");

      expect(normalized).toContain("native instruction or configuration surface");
      expect(normalized).toContain("validate the effective carrier content");
      expect(normalized).toContain("record its guidanceDigest");
      expect(normalized).toContain("projection is not rubric authority");
      expect(method).not.toMatch(/AGENTS\.md|GitHub|CodeRabbit|Codex|controller command/iu);
    }
  });

  it("keeps adversarial review launch-neutral and mutation-read-only", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/adversarial-review.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      expect(normalized).toContain("caller owns launch policy");
      expect(normalized).toContain("offer callout marks a discretionary invocation");
      expect(normalized).toContain("required invocation is unconditional");
      expect(normalized).toContain("reviewer never edits the target");
      expect(normalized).toContain("only an authorized adapter may attest a completed exact target");
      expect(method).toContain("implementation-audit");
      expect(method).toContain("frontline-review");
      expect(method).toContain("standard-review");
    }
  });

  it("keeps review severity, disposition, and polish orthogonal", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/review-triage.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      expect(normalized).toContain("severity: `blocker | major | minor`");
      expect(normalized).toContain("disposition: `fix | defer | reject`");
      expect(normalized).toContain("`nit` is valid only with `minor`");
      expect(normalized).toContain("verify every finding against source");
      expect(normalized).toContain("complete disposition set");
      expect(normalized).toContain("approval before any fix");
      expect(method).not.toMatch(/FIX NOW|MINOR FIX|SILENT FIX/u);
    }
  });

  it("anchors review finding verification before mutation in universal rules", async () => {
    for (const base of [packageArc, projectArc]) {
      const rules = await readFile(resolve(base, "system/rules/DEV-RULES.ARC.md"), "utf8");
      const normalized = rules.toLowerCase().replace(/\s+/gu, " ");
      expect(normalized).toContain("verify every review finding against source");
      expect(normalized).toContain("complete proposed disposition set");
      expect(normalized).toContain("approval before applying any finding-driven fix");
      expect(rules).not.toMatch(/GitHub|CodeRabbit|review-gate/iu);
    }
  });

  it("routes self-hosting actions through one controller workflow", async () => {
    const workflow = await readFile(resolve(projectArc, "system/workflows/project/coordinate-pr-review.md"), "utf8");
    expect(workflow).toContain("one caller-supplied `openedChangeRequest");
    expect(workflow).toContain("- review-response");
    expect(workflow).toContain("review-gate:next-action");
    expect(workflow).toContain("review-gate:perform-action");
    expect(workflow).toContain("review-gate:await");
    for (const state of [
      "awaiting-approval", "ready-to-fix", "ready-to-persist", "ready-to-close", "reroute", "blocked",
    ]) expect(workflow).toContain(`\`${state}\``);
    expect(workflow).not.toContain("review-gate:assert-head-mutable");
    expect(workflow).toContain("`FixAuthorization`");
    expect(workflow).toContain("consumption is canonical");
    expect(workflow).toContain("**Controller FIX:**");
    expect(workflow).toContain("**Controller DEFER or REJECT:**");
    expect(workflow).toContain("**Provider-owned closure:**");
    expect(workflow).not.toContain("Triage both paths");
    expect(workflow).not.toContain("/review-gate dismiss");
    expect(workflow).not.toMatch(/@coderabbit|resolveReviewThread/iu);
  });

  it("keeps controller findings distinct from provider-native review conversations", async () => {
    const workflow = await readFile(resolve(projectArc, "system/workflows/project/coordinate-pr-review.md"), "utf8");

    expect(workflow).toContain("controller-normalized findings");
    expect(workflow).toContain("provider-native conversations");
    expect(workflow).toContain("controller receipt handle");
    expect(workflow).toContain("provider reply, thread-state, and decisive-review handles");
    expect(workflow).toContain("explicit FIX, DEFER, or REJECT disposition");
    expect(workflow).toContain("same qualified source that issued the");
    expect(workflow).toContain("Thread resolution is a separate observation");
    expect(workflow).toContain("`CHANGES_REQUESTED` remains blocking");
    expect(workflow).toContain("Completion-check success only wakes a canonical re-read");
    expect(workflow).toContain("valid lifecycle-tail projection");
    expect(workflow).toContain("without requesting or recommending a refresh");
    expect(workflow).toContain("invalid or ambiguous tail");
  });

  it("recomposes review coordination after every authority-bearing scope change", async () => {
    const workflow = await readFile(resolve(projectArc, "system/workflows/project/coordinate-pr-review.md"), "utf8");
    for (const invalidator of [
      "approved fix", "base merge", "lifecycle-tail identity", "provider-event identity", "policy identity",
    ]) expect(workflow).toContain(invalidator);
    expect(workflow).toContain("typed applicability proof");
    expect(workflow).toContain("interacting reconcile");
    expect(workflow).toContain("discard the composition basis");
    for (const arm of ["stale", "exempt", "recommended", "required", "attention"]) {
      expect(workflow).toContain(`\`${arm}\``);
    }
  });

  it("coordinates source-neutral standard review for work units and errands", async () => {
    const workflow = await readFile(resolve(projectArc, "system/workflows/project/coordinate-pr-review.md"), "utf8");
    for (const method of ["adversarial-review", "standard-review", "implementation-audit", "review-response"]) {
      expect(workflow).toContain(`- ${method}`);
    }
    expect(workflow).toContain("`local | hosted | both`");
    expect(workflow).toContain("without author conclusions");
    expect(workflow).toContain("exact-head attestor");
    expect(workflow).toContain("Unavailable, partial, or failed");
    expect(workflow).toContain("required obligation blocks");
    expect(workflow).toContain("recommended obligation remains visible and non-blocking");
    expect(workflow).toContain("does not add a resident engine");

    for (const relative of [
      "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      "system/workflows/arc/supplemental/run-errand.md",
    ]) {
      for (const base of [packageArc, projectArc]) {
        const caller = await readFile(resolve(base, relative), "utf8");
        expect(caller).toContain("public `arc review` protocol");
        expect(caller).toContain("local and frontline transitions only through those commands");
        expect(caller).toContain("`local | hosted | both`");
      }
    }
  });

  it("keeps project actions populated but inactive until cutover", async () => {
    for (const name of ["post-pr-open", "pre-merge"]) {
      const project = await readFile(resolve(projectArc, `system/extensions/${name}.md`), "utf8");
      const packaged = await readFile(resolve(packageArc, `system/extensions/${name}.md`), "utf8");
      expect(project).toContain("active: false");
      expect(project).toContain("coordinate-pr-review.md");
      expect(project).toMatch(/1\. \*\*/u);
      expect(project).toMatch(/2\. \*\*/u);
      expect(packaged).toContain("[No extension configured]");
      expect(packaged).not.toContain("coordinate-pr-review");
    }
  });

  it("ships every packaged workflow referenced by the new extension family", async () => {
    const recipe = await readFile(resolve(root, "packages/arc-framework/init-recipe.json"), "utf8");
    expect(recipe).toContain('"system/workflows/arc/supplemental/run-errand.md"');
    const finalHook = await readFile(resolve(packageArc, "system/extensions/pre-merge.md"), "utf8");
    expect(finalHook).toContain("read-only, idempotent, or retry-safe");
  });

  it("keeps pre-pr-open action-neutral after frontline review moves to its method", async () => {
    const project = await readFile(resolve(projectArc, "system/extensions/pre-pr-open.md"), "utf8");
    const packaged = await readFile(resolve(packageArc, "system/extensions/pre-pr-open.md"), "utf8");

    expect(project).toBe(packaged);
    expect(project).not.toMatch(/CodeRabbit|review-triage|ci-defer-heavy|classify-change/iu);
  });
});
