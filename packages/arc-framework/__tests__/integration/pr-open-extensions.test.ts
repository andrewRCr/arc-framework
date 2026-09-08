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

  it("places work-unit hooks on create, re-entry, and the ready checkpoint", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );
    const push = workflow.indexOf("Push the WU branch upstream");
    const preOpen = workflow.indexOf("Immediately before creation");
    const create = workflow.indexOf("gh pr create");
    const postOpen = workflow.indexOf("compose `openedChangeRequest");
    const checkpoint = workflow.indexOf("arc integrate checkpoint {name} --json");
    const finalHead = workflow.indexOf("payload.interlockSurface.machineEvidence.text", checkpoint);
    const preMerge = workflow.indexOf("**Extension report** · `#pre-merge`", finalHead);
    const mergeInterlock = workflow.indexOf("`integration-interlock`", preMerge);
    const merge = workflow.indexOf("arc integrate merge {name} --checkpoint", mergeInterlock);
    expect(push).toBeLessThan(preOpen);
    expect(preOpen).toBeLessThan(create);
    expect(create).toBeLessThan(postOpen);
    expect(checkpoint).toBeLessThan(finalHead);
    expect(finalHead).toBeLessThan(preMerge);
    expect(preMerge).toBeLessThan(mergeInterlock);
    expect(finalHead).toBeLessThan(mergeInterlock);
    expect(mergeInterlock).toBeLessThan(merge);
    expect(workflow.slice(finalHead, mergeInterlock)).toContain("No commit or push may occur after `ready`");
    expect(workflow.match(/\*\*Extension report\*\* · `#pre-merge`/gu)).toHaveLength(1);
    expect(workflow).toContain("`integrating`; `open`");
    expect(workflow).toContain("`post-pr-open` → review iteration");
  });

  it("schedules publication in preparation before the integration push", async () => {
    for (const base of [packageArc, projectArc]) {
      const prepare = await readFile(
        resolve(base, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"),
        "utf8",
      );
      const integrate = await readFile(
        resolve(base, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
        "utf8",
      );
      const publicationStep = prepare.indexOf("## 3) Schedule publication");
      const submit = prepare.indexOf("arc publish {name}", publicationStep);
      const commitInterlock = prepare.indexOf("`commit-interlock`", submit);
      const pushExtension = integrate.indexOf("#pre-push-review");
      const pushInterlock = integrate.indexOf("`push-interlock`", pushExtension);
      const push = integrate.indexOf("Push the WU branch upstream", pushInterlock);

      expect([publicationStep, submit, commitInterlock, pushExtension, pushInterlock, push]
        .every((index) => index >= 0)).toBe(true);
      expect(publicationStep).toBeLessThan(submit);
      expect(submit).toBeLessThan(commitInterlock);
      expect(pushExtension).toBeLessThan(pushInterlock);
      expect(pushInterlock).toBeLessThan(push);
      expect(prepare).not.toContain("#pre-push-review");
      const reconcileStep = integrate.indexOf("### 10) Behind-base reconcile gate and merge");
      const correctionPublish = integrate.indexOf("arc publish {name} --json", reconcileStep);
      expect(reconcileStep).toBeGreaterThan(-1);
      expect(correctionPublish).toBeGreaterThan(reconcileStep);
      expect(integrate.slice(0, reconcileStep)).not.toContain("arc publish {name}");
      expect(integrate).toContain("Step 1, from the idempotent **push** action");
    }
  });

  it("settles routed pre-publication lanes before submit and the final WU push", async () => {
    const [prepare, integrate] = await Promise.all([
      readFile(resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
      readFile(resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
    ]);
    const prePublication = prepare.indexOf("## 2) Settle pre-publication review");
    const resolveFrontline = prepare.indexOf("arc review frontline resolve -", prePublication);
    const submit = prepare.indexOf("arc publish {name}", resolveFrontline);
    const push = integrate.indexOf("Push the WU branch upstream");
    const preOpen = integrate.indexOf("Immediately before creation");
    const create = integrate.indexOf("gh pr create", preOpen);

    expect([prePublication, resolveFrontline, submit, push, preOpen, create]
      .every((index) => index >= 0)).toBe(true);
    expect(prePublication).toBeLessThan(resolveFrontline);
    expect(resolveFrontline).toBeLessThan(submit);
    expect(preOpen).toBeLessThan(create);

    const frontlineCycle = prepare.slice(resolveFrontline, submit);
    expect(frontlineCycle).toContain("review-response");
    expect(frontlineCycle).toMatch(/(?:recompose|produce)\s+(?:the\s+exact|a new)\s+target/u);
    expect(frontlineCycle).toContain("arc review frontline run -");
    expect(frontlineCycle).toContain("arc review local prepare -");
    expect(frontlineCycle).toContain("arc review local attest -");
    expect(frontlineCycle).toContain("arc review local resume -");
    expect(frontlineCycle).toContain("public typed actions");
    expect(frontlineCycle).not.toMatch(/ReviewOperationStateStore|invalid-request/u);
    expect(frontlineCycle.replace(/\s+/gu, " ")).toContain("Tier 1 gates");
  });

  it("resumes post-PR hosted review directly through public status", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );
    const openedChangeRequest = workflow.indexOf("compose `openedChangeRequest");
    const reservation = workflow.indexOf("integrationBoundary.reservation", openedChangeRequest);
    const deliveryResume = workflow.indexOf("`resolve-delivery-status`", reservation);
    const singletonResume = workflow.indexOf("`continue-pre-publication-review`", deliveryResume);
    const hostedRequest = workflow.indexOf("arc review hosted request -", reservation);

    expect([openedChangeRequest, reservation, deliveryResume, singletonResume, hostedRequest]
      .every((index) => index >= 0)).toBe(true);
    expect(openedChangeRequest).toBeLessThan(reservation);
    expect(reservation).toBeLessThan(hostedRequest);
    expect(workflow.slice(openedChangeRequest, hostedRequest)).not.toContain("arc review chunking resolve -");
    const publicDeliveryResume = workflow.slice(deliveryResume, singletonResume);
    expect(publicDeliveryResume).toContain("integrationBoundary.nextAction.command");
    expect(publicDeliveryResume).toContain("WU-scoped public status reducer");
    expect(publicDeliveryResume).not.toContain("arc review pre-publication");
    expect(publicDeliveryResume).not.toContain("policy.payload");
  });

  it("runs the same frontline cycle only for full-protection Errand publication", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/supplemental/run-errand.md"),
      "utf8",
    );
    const fullProtection = workflow.indexOf("### Ship — full protection");
    const push = workflow.indexOf("**Push** the errand branch upstream", fullProtection);
    const cycleStart = workflow.indexOf("Compose the immutable policy target", push);
    const resolveFrontline = workflow.indexOf("arc review frontline resolve -", push);
    const resolvePr = workflow.indexOf("**Resolve the Errand PR**", resolveFrontline);
    const partialProtection = workflow.indexOf("### Ship — partial protection", resolvePr);

    expect([fullProtection, push, cycleStart, resolveFrontline, resolvePr, partialProtection]
      .every((index) => index >= 0)).toBe(true);
    expect(push).toBeLessThan(resolveFrontline);
    expect(resolveFrontline).toBeLessThan(resolvePr);

    const frontlineCycle = workflow.slice(cycleStart, resolvePr);
    expect(frontlineCycle).toContain("review-response");
    expect(frontlineCycle.replace(/\s+/gu, " ")).toContain("not a routing input");
    expect(frontlineCycle).toMatch(/(?:recompose|create)\s+(?:the\s+exact|a new)\s+target/u);
    expect(frontlineCycle).toContain("arc review frontline run -");
    expect(frontlineCycle).toContain("arc review local prepare -");
    expect(frontlineCycle).toContain("arc review local attest -");
    expect(frontlineCycle).toContain("arc review local resume -");
    expect(frontlineCycle).toContain("typed `state` / `nextAction`");
    expect(frontlineCycle).not.toMatch(/ReviewOperationStateStore|invalid-request/u);
    expect(workflow.slice(partialProtection)).not.toContain("arc review frontline resolve -");
  });

  it("dispatches every Errand PR state through the exact-head resolver", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/supplemental/run-errand.md"),
      "utf8",
    );
    const resolution = workflow.slice(
      workflow.indexOf("3. **Resolve the Errand PR**"),
      workflow.indexOf("4. **Enter the open PR.**"),
    );
    expect(resolution).toContain(
      "arc review change-request resolve --head-ref <branch> --head-sha <head-sha> --json",
    );
    for (const disposition of [
      "`none / create-change-request`",
      "`open / reuse-change-request`",
      "`merged-at-head / complete`",
      "`closed-unmerged / reopen-change-request`",
      "`merged-stale-head / reconcile-head`",
      "`ambiguous | blocked / stop`",
    ]) expect(resolution).toContain(disposition);

    // Scoped to dispatch: the creation arm's pre-create race guard reads the remote head
    // legitimately, so a step-wide ban on remote reads would forbid a control obligation
    // rather than the hand-rolled resolution these assertions exist to prevent.
    const dispatch = resolution.slice(0, resolution.indexOf("The no-match creation arm"));
    expect(dispatch.length).toBeGreaterThan(0);
    expect(dispatch).not.toContain("gh api");
    expect(dispatch).not.toContain("--paginate --slurp");
    expect(dispatch).not.toContain("git ls-remote");
  });

  it("re-validates the remote head immediately before creating the Errand PR", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/supplemental/run-errand.md"),
      "utf8",
    );
    const creation = workflow.slice(
      workflow.indexOf("The no-match creation arm"),
      workflow.indexOf("4. **Enter the open PR.**"),
    );
    const hook = creation.indexOf("If `pre-pr-open` is active");
    const guard = creation.indexOf(
      "`arc review change-request resolve --head-ref <branch> --head-sha <head-sha> --require-remote --json`",
    );
    const create = creation.indexOf("gh pr create --base");

    expect([hook, guard, create].every((index) => index >= 0)).toBe(true);
    expect(hook).toBeLessThan(guard);
    expect(guard).toBeLessThan(create);
    expect(creation).toContain("pre-create validation requires the remote branch itself");
    // The typed resolver owns the head check; a hand-rolled remote parse here
    // would be a second implementation of what it already returns.
    expect(creation).not.toContain("git ls-remote");
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
      const preMerge = workflow.indexOf("**Extension report** · `#pre-merge`", openedChangeRequest);
      const integrationInterlock = workflow.indexOf("`integration-interlock`", openedChangeRequest);
      expect([proposedChangeRequest, prCreate, openedChangeRequest, preMerge, integrationInterlock]
        .every((index) => index >= 0)).toBe(true);
      expect(proposedChangeRequest).toBeLessThan(prCreate);
      expect(openedChangeRequest).toBeGreaterThan(prCreate);
      expect(preMerge).toBeLessThan(integrationInterlock);
      expect(workflow.toLowerCase()).toContain("halt before later actions");
    }
  });

  it("uses one workflow-wide WU push contract and one final pre-merge fire", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );

    expect(workflow.match(/#pre-push-review/gu)).toHaveLength(1);
    expect(workflow).toContain("Before every agent-managed push in this workflow");
    const preMerge = workflow.indexOf("**Extension report** · `#pre-merge`");
    const interlock = workflow.indexOf("`integration-interlock`", preMerge);
    expect(preMerge).toBeGreaterThan(-1);
    expect(interlock).toBeGreaterThan(preMerge);
    expect(workflow.match(/\*\*Extension report\*\* · `#pre-merge`/gu)).toHaveLength(1);
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

  it("composes frontline chunking as one bounded advisory pass", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/frontline-review.md"), "utf8");
      const normalized = method.replace(/\s+/gu, " ");
      expect(method).toContain("review-chunking");
      expect(normalized).toContain("one curated-scope-capable local carrier orchestration");
      expect(normalized).toContain("fresh bounded evaluator context for each closure chunk and the seam");
      expect(normalized).toContain("complete effective rubric");
      expect(normalized).toContain("fresh non-author aggregate context");
      expect(normalized).toContain("does not load every chunk body wholesale");
      expect(normalized).toContain("counts as one frontline pass");
      expect(normalized).toContain("no partial chunk or seam report completes the pass");
      expect(normalized).toContain("make the advisory result satisfying evidence");
    }
  });

  it("composes standard review chunking as one complete local-carrier pass", async () => {
    for (const base of [packageArc, projectArc]) {
      const standard = await readFile(resolve(base, "system/methods/standard-review.md"), "utf8");
      const adversarial = await readFile(resolve(base, "system/methods/adversarial-review.md"), "utf8");
      const normalizedStandard = standard.replace(/\s+/gu, " ");
      const normalizedAdversarial = adversarial.replace(/\s+/gu, " ");

      expect(standard).toContain("review-chunking");
      expect(normalizedStandard).toContain("one curated-scope-capable local carrier orchestration");
      expect(normalizedStandard).toContain("fresh bounded evaluator context for every closure chunk and the seam");
      expect(normalizedStandard).toContain("complete effective rubric");
      expect(normalizedStandard).toContain("fresh non-author aggregate context");
      expect(normalizedStandard).toContain("one aggregate whole-target standard-review result");
      expect(normalizedStandard).toContain("Hosted and whole-target-only local carriers are ineligible");
      expect(normalizedStandard).toContain("counts as one standard-review pass");
      expect(normalizedStandard).toContain("no partial report or evaluator call can settle the obligation");
      expect(normalizedAdversarial).toContain("bounded chunk-series carrier mode");
      expect(normalizedAdversarial).toContain("sequential attention isolation within one logical pass");
      expect(normalizedAdversarial).toContain("stable evaluator profile and complete rubric");
      expect(normalizedAdversarial).toContain("no standalone authority");
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
      expect(guidance).toContain("Host-side merge controls are distinct from agent-layer discipline");
      expect(guidance).toContain("required status check is fail-closed repo configuration");
      expect(guidance).toContain("draft-state lock");
      expect(guidance).toMatch(/[Nn]ever infer merge safety from/);
      expect(selfReview.replace(/^> ?/gmu, "").replace(/\s+/gu, " "))
        .toContain("does not structurally enforce merge safety");
      expect(frontline.replace(/^> ?/gmu, "").replace(/\s+/gu, " "))
        .toContain("does not structurally enforce merge safety");
      expect(independent.replace(/^> ?/gmu, "").replace(/\s+/gu, " "))
        .toContain("defines evidence eligibility, not merge enforcement");
    }

    const overview = await readFile(resolve(projectArc, "reference/TECHNICAL-OVERVIEW.md"), "utf8");
    expect(overview).toContain("one configured review loop through the shipped `arc review` command tree");
    expect(overview).toContain("The operating agent owns bounded judgment");
    expect(overview).toContain("Draft-state lock is a per-PR structural hold");
    expect(overview).toContain("merge.lock: draft");
    expect(overview).toMatch(/integration interlock remains the sole\s+merge authority/);
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

  it("keeps withstood advisory and applies claim-type verification proportionally", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/adversarial-review.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      const prompt = method.match(/\*\*Prompt template:\*\*\s+```text\s+([\s\S]*?)\s+```/u)?.[1];
      if (prompt === undefined) throw new Error("missing adversarial-review prompt template");
      const normalizedPrompt = prompt.toLowerCase().replace(/\s+/gu, " ");

      expect(normalized).toContain(
        "the reviewer examined this decision-relevant claim or region and has no finding to report",
      );
      expect(normalized).toContain("does not mean that the artifact is correct, complete, or cleared");
      expect(normalized).toContain("externally verifiable claims about source, behavior, or the diff");
      expect(normalized).toContain("are worth spot-checking");
      expect(normalized).toContain("internal judgments about what the reviewer considered convincing or coherent");
      expect(normalized).toContain("does not require independent verification of every attention entry");
      expect(normalized).toContain("the field stays freeform");
      expect(normalized).toContain(
        "`withstood` remains outside severity, disposition, convergence, and evidence attestation",
      );
      expect(normalizedPrompt).toContain("`withstood` records decision-relevant attention without a finding");
      expect(normalizedPrompt).toContain("does not mean the artifact is correct, complete, or cleared");
      expect(method).not.toContain("checked and cleared");
    }
  });

  it("separates advisory disposition completeness from pass convergence and bounded continuation", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/adversarial-review.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      const prompt = method.match(/\*\*Prompt template:\*\*\s+```text\s+([\s\S]*?)\s+```/u)?.[1];
      const frontmatter = method.match(/^---\n([\s\S]*?)\n---/u)?.[1];
      if (prompt === undefined) throw new Error("missing adversarial-review prompt template");
      if (frontmatter === undefined) throw new Error("missing adversarial-review frontmatter");

      expect(method).toContain("override-active: false");
      expect(method).toContain("[No override configured]");
      expect(frontmatter).not.toContain("review-triage");

      expect(normalized).toContain("completeness is a property of the disposition backlog");
      expect(normalized).toContain("every reported finding has one approved disposition");
      expect(normalized).toContain("including a `reject` disposition for an unsupported finding");
      expect(normalized).toContain("convergence is a property of the pass result");
      expect(normalized).toContain("a disposed confirmed `critical` or `major` finding still withholds convergence");
      expect(normalized).toContain("all-refuted and confirmed-minors-only passes converge");
      expect(normalized).toContain("a confirmed `minor` never authorizes another pass");
      expect(normalized).toContain("never raises its verified severity");
      expect(normalized).toContain("follow-up observation in the converged completion report");

      expect(method).toContain("`Pass N of M`");
      expect(normalized).toContain("converged, `cap-exhausted`, suspended, or owner-accepted");
      expect(normalized).toContain("stop before another evaluator invocation");
      expect(normalized).toContain("same turn as the complete disposition report");
      expect(normalized).toContain("a recommendation is not authorization");
      expect(normalized).toContain("names the activity and the next pass");
      expect(normalized).toContain("authorizes exactly one additional pass");
      expect(normalized).toContain("disposition approval alone authorizes no additional pass");

      expect(normalized).toContain("existing advisory evidence");
      expect(normalized).toContain("pending and unusable while any approved response remains incomplete");
      expect(normalized).toContain("withdrawal or supersession invalidates it");
      expect(normalized).toContain("consumes that permission");
      expect(normalized).toContain("replay cannot authorize another pass");
      expect(normalized).toContain("creates no lane-progress record");

      expect(prompt).not.toMatch(/pass-cap|Pass N of M|cap-exhausted/iu);
      expect(prompt.toLowerCase().replace(/\s+/gu, " ")).toContain(
        "do not decide loop state, continuation, or authorization",
      );
    }
  });

  it("keeps the advisory settlement protocol reachable at every direct planning and criteria caller", async () => {
    const callers = [
      ["system/workflows/arc/draft-design.md", "draft review evidence"],
      ["system/workflows/arc/create-spec.md", "spec review evidence"],
      ["system/workflows/arc/generate-tasks.template.md", "task-list review evidence"],
      ["system/methods/validate-criteria.md", "ordinary closing-task evidence"],
    ] as const;

    for (const base of [packageArc, projectArc]) {
      for (const [packagedPath, evidenceLocus] of callers) {
        const path = base === projectArc && packagedPath.endsWith("generate-tasks.template.md")
          ? "system/workflows/arc/generate-tasks.md"
          : packagedPath;
        const content = await readFile(resolve(base, path), "utf8");
        const normalized = content.toLowerCase().replace(/\s+/gu, " ");

        expect(content).toContain("    - adversarial-review");
        expect(content).toContain("adversarial-review:");
        expect(normalized).toContain("apply the method's complete-disposition and bounded-continuation protocol");
        expect(normalized).toContain(evidenceLocus);
        expect(normalized).toContain("creates no lane-progress record");
      }
    }

    const recipe = JSON.parse(
      await readFile(resolve(root, "packages/arc-framework/init-recipe.json"), "utf8"),
    ) as { include_files: string[] };
    for (const path of [
      "system/methods/adversarial-review.md",
      "system/methods/validate-criteria.md",
      "system/workflows/arc/draft-design.md",
      "system/workflows/arc/create-spec.md",
      "system/workflows/arc/generate-tasks.template.md",
    ]) {
      expect(recipe.include_files).toContain(path);
    }
  });

  it("retains a bounded contradicted-withstood exercise without claiming behavioral adherence", async () => {
    const fixtureRoot = resolve(
      root,
      "packages/arc-framework/__tests__/fixtures/adversarial-review/contradicted-withstood",
    );
    const [source, artifact, report, exercise, expected] = await Promise.all([
      readFile(resolve(fixtureRoot, "source.ts"), "utf8"),
      readFile(resolve(fixtureRoot, "artifact.md"), "utf8"),
      readFile(resolve(fixtureRoot, "review-report.md"), "utf8"),
      readFile(resolve(fixtureRoot, "exercise.md"), "utf8"),
      readFile(resolve(fixtureRoot, "expected.md"), "utf8"),
    ]);

    expect(source).toContain('return "manual"');
    expect(artifact).toContain("returns `automatic`");
    expect(report).toContain("withstood:");
    expect(report).toContain("defaultMode returns automatic");
    expect(exercise).toContain("packages/arc-framework/arc/system/methods/adversarial-review.md");
    expect(exercise).toContain("packages/arc-framework/arc/system/methods/validate-criteria.md");
    expect(exercise).toContain("Do not read `expected.md`");
    expect(expected).toContain("refuse to relay or credit the contradicted entry");
    expect(expected).toContain("only an attended fresh-context run supplies behavioral evidence");
  });

  it("retains bounded advisory-loop exercises without treating fixtures as behavioral proof", async () => {
    const fixtureRoot = resolve(root, "packages/arc-framework/__tests__/fixtures/adversarial-review");
    const cases = [
      ["unsupported-material", "all-refuted pass converges"],
      ["fixed-material", "settlement does not rewrite the original pass as converged"],
      ["over-cap", "stop before another evaluator invocation"],
      ["conditional-permission", "replay cannot authorize another pass"],
    ] as const;

    for (const [name, expectedSignal] of cases) {
      const caseRoot = resolve(fixtureRoot, name);
      const [scenario, exercise, expected] = await Promise.all([
        readFile(resolve(caseRoot, "scenario.md"), "utf8"),
        readFile(resolve(caseRoot, "exercise.md"), "utf8"),
        readFile(resolve(caseRoot, "expected.md"), "utf8"),
      ]);

      expect(scenario).toContain("Pass");
      expect(exercise).toContain("packages/arc-framework/arc/system/methods/adversarial-review.md");
      expect(exercise).toContain("Do not read `expected.md`");
      expect(expected.toLowerCase()).toContain(expectedSignal);
      expect(expected).toContain("only an attended fresh-context run supplies behavioral evidence");
    }
  });

  it("keeps review severity, disposition, and polish orthogonal", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/review-triage.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      expect(normalized).toContain("severity: `critical | major | minor`");
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

  it("keeps post-open and pre-merge as dormant extension seams", async () => {
    for (const name of ["post-pr-open", "pre-merge"]) {
      const project = await readFile(resolve(projectArc, `system/extensions/${name}.md`), "utf8");
      const packaged = await readFile(resolve(packageArc, `system/extensions/${name}.md`), "utf8");
      expect(project).toContain("active: false");
      expect(project).not.toMatch(/coordinate-pr-review|controller/iu);
      expect(project).toMatch(/1\. \*\*/u);
      expect(packaged).toContain("[No extension configured]");
      expect(packaged).not.toMatch(/coordinate-pr-review|controller/iu);
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
