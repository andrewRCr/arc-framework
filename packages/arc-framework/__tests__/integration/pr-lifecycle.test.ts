import { codeReviewSection } from "../helpers/code-review-section.js";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const root = resolve(import.meta.dirname, "../../../..");
const packageArc = resolve(root, "packages/arc-framework/arc");
const projectArc = resolve(root, ".arc");

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true });
  return entries.filter((entry) => entry.endsWith(".md")).map((entry) => resolve(directory, entry));
}

describe("PR lifecycle and review contracts", () => {
  it("omits retired dispatch from PR workflows while retaining resolver binding", async () => {
    for (const base of [packageArc, projectArc]) {
      for (const path of ["work-unit-lifecycle/integrate-work-unit.md", "supplemental/run-errand.md"]) {
        const workflow = await readFile(resolve(base, "system/workflows/arc", path), "utf8");
        expect(workflow).not.toContain("proposedChangeRequest");
        expect(workflow).not.toMatch(/#(?:pre-pr-open|post-pr-open|pre-push-review)/u);
      }
    }
  });

  it("retains exact opened-target authority across Errand head movement", async () => {
    for (const base of [packageArc, projectArc]) {
      const workflow = (await readFile(resolve(base, "system/workflows/arc/supplemental/run-errand.md"), "utf8"))
        .replace(/\s+/gu, " ");
      expect(workflow).toContain("openedChangeRequest = { repositoryRef, hostRef, headSha }");
      expect(workflow).toContain("recompose `openedChangeRequest` from the canonical current head before re-entry");
      expect(workflow).toContain("Continue only when `openedChangeRequest` and the adapter target name the same exact head");
      expect(workflow).toContain("No review-authored commit or push may occur after this checkpoint");
    }
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

  it("orders work-unit creation, review binding, and the ready checkpoint", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );
    const push = workflow.indexOf("Push the WU branch upstream");
    const preOpen = workflow.indexOf("--require-remote");
    const create = workflow.indexOf("gh pr create");
    const postOpen = workflow.indexOf("Bind the open PR");
    const checkpoint = workflow.indexOf("arc integrate checkpoint {name}");
    const finalHead = workflow.indexOf("payload.interlockSurface.machineEvidence.text", checkpoint);
    const mergeInterlock = workflow.indexOf("`integration-interlock`", finalHead);
    const merge = workflow.indexOf("arc integrate merge {name} --checkpoint", mergeInterlock);
    expect(push).toBeLessThan(preOpen);
    expect(preOpen).toBeLessThan(create);
    expect(create).toBeLessThan(postOpen);
    expect(checkpoint).toBeLessThan(finalHead);
    expect(finalHead).toBeLessThan(mergeInterlock);
    expect(mergeInterlock).toBeLessThan(merge);
    expect(workflow.slice(finalHead, mergeInterlock)).toMatch(softWrappedProse("No commit or push may occur after `ready`"));
    expect(workflow).toContain("`integrating`; `open`");
    expect(workflow).toContain("Step 2 (review iteration)");
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
      const pushInterlock = integrate.indexOf("`push-interlock`");
      const push = integrate.indexOf("Push the WU branch upstream", pushInterlock);

      expect([publicationStep, submit, commitInterlock, pushInterlock, push]
        .every((index) => index >= 0)).toBe(true);
      expect(publicationStep).toBeLessThan(submit);
      expect(submit).toBeLessThan(commitInterlock);
      expect(pushInterlock).toBeLessThan(push);
      expect(prepare).not.toContain("#pre-push-review");
      const reconcileStep = integrate.indexOf("### 10) Behind-base reconcile gate and merge");
      const correctionPublish = integrate.indexOf("arc publish {name} --json", reconcileStep);
      expect(reconcileStep).toBeGreaterThan(-1);
      expect(correctionPublish).toBeGreaterThan(reconcileStep);
      expect(integrate.slice(0, reconcileStep)).not.toContain("arc publish {name}");
      expect(integrate).toMatch(softWrappedProse("Step 1, from the idempotent **push** action"));
    }
  });

  it("settles routed pre-publication lanes before submit and the final WU push", async () => {
    const [prepare, integrate] = await Promise.all([
      readFile(resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
      readFile(resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
    ]);
    const prePublication = prepare.indexOf("## 2) Settle pre-publication review");
    const resolveFrontline = prepare.indexOf("`nextAction.command`", prePublication);
    const resumeFrontline = prepare.indexOf("`nextAction.resumeCommand`", resolveFrontline);
    const submit = prepare.indexOf("arc publish {name}", resolveFrontline);
    const push = integrate.indexOf("Push the WU branch upstream");
    const preOpen = integrate.indexOf("Immediately before creation");
    const create = integrate.indexOf("gh pr create", preOpen);

    expect([prePublication, resolveFrontline, resumeFrontline, submit, push, preOpen, create]
      .every((index) => index >= 0)).toBe(true);
    expect(prePublication).toBeLessThan(resolveFrontline);
    expect(resolveFrontline).toBeLessThan(resumeFrontline);
    expect(resolveFrontline).toBeLessThan(submit);
    expect(preOpen).toBeLessThan(create);

    const frontlineCycle = prepare.slice(resolveFrontline, submit);
    const method = await readFile(resolve(packageArc, "system/methods/code-review.md"), "utf8");
    const response = codeReviewSection(prepare, "findings-round", method);
    const operation = codeReviewSection(prepare, "local-operation", method);
    expect(frontlineCycle).toContain("[code-findings-round]");
    expect(response).toContain("[review-response]");
    expect(frontlineCycle).toContain("candidate-advanced / continue-review");
    expect(frontlineCycle).toContain("arc review frontline run -");
    expect(frontlineCycle).toContain("arc review local prepare -");
    expect(operation).toContain("arc review local attest -");
    expect(operation).toContain("arc review local resume -");
    expect(operation).toContain("public typed result");
    expect(frontlineCycle).not.toMatch(/ReviewOperationStateStore|invalid-request/u);
    expect(frontlineCycle.replace(/\s+/gu, " ")).toContain("arc check gate commit");
  });

  it("resumes post-PR hosted review directly through public status", async () => {
    const workflow = await readFile(
      resolve(packageArc, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
      "utf8",
    );
    const openedChangeRequest = workflow.indexOf("Bind the open PR");
    const reservation = workflow.indexOf("integrationBoundary.reservation", openedChangeRequest);
    const deliveryResume = workflow.indexOf("`resolve-delivery-status`", reservation);
    const publishedSingleton = workflow.indexOf("For an ordinary singleton with a carried reservation", deliveryResume);
    const singletonResume = workflow.indexOf("`continue-pre-publication-review`", deliveryResume);
    const hostedRequest = workflow.indexOf("arc review hosted request -", reservation);

    expect([openedChangeRequest, reservation, deliveryResume, singletonResume, hostedRequest]
      .every((index) => index >= 0)).toBe(true);
    expect(openedChangeRequest).toBeLessThan(reservation);
    expect(reservation).toBeLessThan(hostedRequest);
    expect(deliveryResume).toBeLessThan(publishedSingleton);
    expect(publishedSingleton).toBeLessThan(singletonResume);
    expect(workflow.slice(publishedSingleton, singletonResume)).toContain("publication-pending / continue-publication");
    expect(workflow.slice(publishedSingleton, singletonResume)).toContain("arc review status --target");
    expect(workflow.slice(openedChangeRequest, hostedRequest)).not.toContain("arc review changeset resolve -");
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
    const method = await readFile(resolve(packageArc, "system/methods/code-review.md"), "utf8");
    const response = codeReviewSection(workflow, "findings-round", method);
    const operation = codeReviewSection(workflow, "local-operation", method);
    expect(frontlineCycle).toContain("[code-findings-round]");
    expect(response).toContain("[review-response]");
    expect(frontlineCycle.replace(/\s+/gu, " ")).toContain("not a routing input");
    expect(frontlineCycle).toMatch(/(?:recompose|create)\s+(?:the\s+exact|a new)\s+target/u);
    expect(frontlineCycle).toContain("arc review frontline run -");
    expect(frontlineCycle).toContain("arc review local prepare -");
    expect(operation).toContain("arc review local attest -");
    expect(operation).toContain("arc review local resume -");
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
      "arc review change-request resolve --head-ref <branch> --head-sha <head-sha>",
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
      workflow.indexOf("3. **Resolve the Errand PR**"),
      workflow.indexOf("4. **Enter the open PR.**"),
    );
    const guard = creation.indexOf(
      "`arc review change-request resolve --head-ref <branch> --head-sha <head-sha> --require-remote`",
    );
    const create = creation.indexOf("gh pr create --base");

    expect([guard, create].every((index) => index >= 0)).toBe(true);
    expect(guard).toBeLessThan(create);
    expect(creation).toMatch(softWrappedProse("pre-create validation requires the remote branch itself"));
    // The typed resolver owns the head check; a hand-rolled remote parse here
    // would be a second implementation of what it already returns.
    expect(creation).not.toContain("git ls-remote");
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
      expect(normalizedStandard).toContain("counts toward the standard ceiling only with complete coverage");
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

      expect(guidance).toContain("Agent-side review methods are best-effort ergonomics");
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
    expect(overview).toMatch(softWrappedProse("one configured review loop through the shipped `arc review` command tree"));
    expect(overview).toMatch(softWrappedProse("The operating agent owns bounded judgment"));
    expect(overview).toMatch(softWrappedProse("Draft-state lock is a per-PR structural hold"));
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
      expect(normalized).toContain("converges unless its approved dispositions fix a triage-confirmed finding above");
      expect(normalized).toContain("approved as `defer` or `reject` converges too");
      expect(normalized).toContain("approved fix of a confirmed `critical` or `major` finding withholds convergence");
      expect(normalized).toContain("all-refuted and confirmed-minors-only passes converge");
      expect(normalized).toContain("a confirmed `minor` never authorizes another pass");
      expect(normalized).toContain("never raises its verified severity");
      expect(normalized).toContain("follow-up observation in the converged completion report");

      expect(method).toContain("`Pass N of M`");
      expect(normalized).toContain("converged, `cap-exhausted`, suspended, re-entered, or owner-accepted");
      expect(normalized).toContain("stop before another evaluator invocation");
      expect(normalized).toContain("same turn as the complete disposition report");
      expect(normalized).toContain("a recommendation is not authorization");
      expect(normalized).toContain("names the activity and the next pass");
      expect(normalized).toContain("authorizes exactly one additional pass");
      expect(normalized).toContain("disposition approval alone authorizes no additional pass");

      expect(normalized).toContain("the caller's advisory evidence");
      expect(normalized).toContain("`adversarial-passes.md` in the work unit's personal workspace");
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
    const callers = ["draft-design.md", "create-spec.md", "generate-tasks.template.md"];
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/planning-review.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      expect(method).toContain("    - adversarial-review");
      expect(method).toContain("adversarial-review:");
      expect(normalized).toContain("complete-disposition and continuation protocol");
      expect(normalized).toContain("`adversarial-passes.md` in the work unit's personal workspace");
      expect(normalized).toContain("later passes take their history from that record");
      expect(normalized).toContain("a stub groomed before it starts has no workspace");
      expect(normalized).toContain("creates no lane-progress record");
      for (const packagedPath of callers) {
        const path = base === projectArc ? packagedPath.replace(".template.md", ".md") : packagedPath;
        const content = await readFile(resolve(base, "system/workflows/arc", path), "utf8");
        expect(content).toContain("    - planning-review");
        expect(content).toContain("planning-review:");
        for (const section of ["author-checks", "independent-offer", "findings-and-pass-record", "post-settle-reread"]) {
          expect(content).toContain(`methods/planning-review.md#${section}`);
        }
        expect(content).not.toContain("adversarial-review:");
      }
      const verificationReview = await readFile(resolve(base, "system/methods/verification-review.md"), "utf8");
      expect(verificationReview).toContain("adversarial-review:");
      expect(verificationReview).toContain("ordinary closing-task evidence");
    }

    // The amendment passes its depth and recorded history to the same review home.
    for (const base of [packageArc, projectArc]) {
      const amendment = await readFile(resolve(base, "system/workflows/arc/supplemental/amend-design.md"), "utf8");
      expect(amendment).toContain("planning-review:");
      expect(amendment).toContain("artifact: amendment");
      expect(amendment).toContain("  depth:");
      expect(amendment).toContain("  class:");
      expect(amendment).toContain("prior-findings:  # recorded planning findings");
      expect(amendment).toContain("methods/planning-review.md#post-settle-reread");
    }

    const recipe = JSON.parse(
      await readFile(resolve(root, "packages/arc-framework/init-recipe.json"), "utf8"),
    ) as { include_files: string[] };
    for (const path of [
      "system/methods/adversarial-review.md",
      "system/methods/planning-review.md",
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
      ["local-correction-majors", "not offer the re-entry valve on the count of majors"],
      ["sustained-nonconvergence", "offer the re-entry valve rather than another pass"],
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

  it("reads fold tags beside severity for the successor look and the re-entry offer", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/adversarial-review.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      expect(normalized).toContain("severity decides whether a fix needs a successor look");
      expect(normalized).toContain("the tags decide which look and whether design is still open");
      expect(normalized).toContain("never on a count of majors whose folds are local corrections");
      expect(normalized).toContain("shows the design running deeper than the stage's level assumed — never on the tag alone");
      expect(normalized).toContain("a scale signal — a correction whose surface runs wider than the stage's level assumed — is its own reason to offer the valve, whatever the tag");
      expect(normalized).toContain("a new-design fold, a scale signal, or design the loop has not settled holds the stage");
      expect(normalized).toContain("calls for another fix-check round, not re-entry");
      expect(normalized).toContain("weigh severity and the fold tags together");
      expect(normalized).toContain("whether a planning stage may close is the caller's call, and it asks whether the design holds");
      expect(normalized).toContain("task generation has no later planning stage to absorb a correction");
    }
  });

  it("names review that keeps authoring its own design as a re-entry signal, not cap exhaustion", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/adversarial-review.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      expect(normalized).toContain("most of a pass's material findings originate in an earlier pass's or round's new-design fold, and their approved fixes are new design again");
      expect(normalized).toContain("another pass extends that chain instead of closing it");
      expect(normalized).toContain("a floor-raising derivation signal at any pass count");
      expect(normalized).toContain("[assess-boundary-fit][assess-boundary-fit] as well when the design written in folds spans concerns that could stand apart");
      expect(normalized).toContain("material findings whose fixes are local corrections do not raise it, whatever their origin");
      expect(normalized).toContain("so a stop at the cap never reads as the cap running out");
      expect(normalized).toContain("an owner-accepted risk with the signal named, never the design holding");
      expect(normalized).toContain("there the re-entry offer comes before another pass");
      expect(normalized).toContain("and for the offer under sustained non-convergence, where another pass would review the last one's design");
      expect(normalized).toContain("any re-entry or boundary offer with the owner's settlement");
      expect(normalized).toContain("the re-entry and boundary offers in this gate belong to planning stages");
      expect(normalized).toContain("re-entered records an accepted re-entry offer, at any pass: the loop ends there, and the caller's re-entry owns what follows");
      expect(normalized).toContain("routes the same signals through its own depth read and its ceiling, never a planning-workflow re-entry");

      const declared = method.match(/^arc:\n {2}methods:\n((?: {4}- .+\n)+)/mu)?.[1];
      if (declared === undefined) throw new Error("missing adversarial-review arc.methods");
      expect(declared).toContain("- assess-boundary-fit");
    }
  });

  it("grounds an unchanged-behavior premise per caller and sweeps past the artifact's own file list", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/source-grounding.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      expect(normalized).toContain("the target bounds which claims are checked; for each claim inside it, the sweep's reach comes from source — the importers and callers of the symbols it names");
      expect(normalized).toContain("never from the artifact's own scope or file list, which is itself a claim under check");
      expect(normalized).toContain("where the design or a proposed repair removes or changes an invariant — a required field, a file's presence, an enum value — inventory that invariant's readers in source");
      expect(normalized).toContain("an inherited premise that behavior stays unchanged is a claim about the implementation it relies on");
      expect(normalized).toContain("ground it per class of caller — those that read, write, or list through it — tracing each class's path on its own");
      expect(normalized).toContain("since a premise can hold for writes and fail for reads");
    }
  });

  it("keeps review severity, disposition, and polish orthogonal", async () => {
    for (const base of [packageArc, projectArc]) {
      const method = await readFile(resolve(base, "system/methods/review-triage.md"), "utf8");
      const normalized = method.toLowerCase().replace(/\s+/gu, " ");
      expect(normalized).toContain("`reportedseverity` and optional `reportednit`");
      expect(normalized).toContain("explicit nullable `verifiedseverity`");
      expect(normalized).toContain("disposition: `fix | defer | reject`");
      expect(normalized).toContain("`reportednit` and `verifiednit` are legal only with their respective `minor` grades");
      expect(normalized).toContain("a verified nit is always record-only");
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

  it("ships the Errand review workflow", async () => {
    const recipe = await readFile(resolve(root, "packages/arc-framework/init-recipe.json"), "utf8");
    expect(recipe).toContain('"system/workflows/arc/supplemental/run-errand.md"');
  });

});
