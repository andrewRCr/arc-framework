import { codeReviewSection } from "../helpers/code-review-section.js";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { indexOfSoftWrappedProse, softWrappedPattern, softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const ROOT = resolve(import.meta.dirname, "../../../..");
const ROOTS = [
  resolve(ROOT, "packages/arc-framework/arc"),
  resolve(ROOT, ".arc"),
];

describe("prepublication workflow boundary", () => {
  it("keeps private review before publish and exact member fallback in integration", async () => {
    for (const root of ROOTS) {
      const integrate = await readFile(
        resolve(root, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
        "utf8",
      );

      expect(integrate).not.toContain("arc review pre-publication <wu>");
      expect(integrate).toContain("**When to use:** `active/meta-{name}.md` shows `**State:** Integrating`");
      expect(integrate).toContain("### 1) Push the branch and open the PR");
      const reviewIteration = integrate.indexOf("### 2) Review iteration");
      const memberLocalFallback = integrate.indexOf("arc review local prepare -");
      expect(reviewIteration).toBeGreaterThan(-1);
      expect(memberLocalFallback).toBeGreaterThan(reviewIteration);
      expect(integrate.slice(reviewIteration, memberLocalFallback))
        .toMatch(softWrappedProse("Pass its `action` unchanged as `deliveryAdmission`"));
      const reconcileStep = integrate.indexOf("### 10) Behind-base reconcile gate and merge");
      const correctionPublish = integrate.indexOf("arc publish {name} --json", reconcileStep);
      expect(reconcileStep).toBeGreaterThan(-1);
      expect(correctionPublish).toBeGreaterThan(reconcileStep);

      const prepare = await readFile(
        resolve(root, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"),
        "utf8",
      );
      expect(prepare).toContain("# Workflow: Prepare Work Unit for Publication");
      expect(prepare).toContain("arc review pre-publication <wu>");
      expect(prepare).toContain("arc review local prepare -");
      expect(prepare).toContain("arc publish {name} --json");
      expect(prepare).not.toContain("gh pr create");
      expect(prepare).not.toContain("arc integrate checkpoint");
    }
  });

  it("prepares canonical private member targets before composing pre-publication review", async () => {
    for (const root of ROOTS) {
      const [prepare, delivery] = await Promise.all([
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
      ]);
      const entry = prepare.indexOf("arc delivery entry inspect -");
      const privateCandidates = prepare.indexOf("Prepare private delivery candidates", entry);
      const review = prepare.indexOf("arc review pre-publication <wu>", privateCandidates);
      expect(entry).toBeGreaterThan(-1);
      expect(prepare).toContain('{"entryMode":"prepublication"}');
      expect(privateCandidates).toBeGreaterThan(entry);
      expect(review).toBeGreaterThan(privateCandidates);
      expect(prepare.slice(entry, review)).toMatch(
        /`not-applicable`[\s\S]*`validate-canonical`[\s\S]*`refused`/u,
      );
      expect(prepare.slice(entry, review)).toContain("planId");
      expect(prepare).toMatch(
        /approved fix changes the Candidate[\s\S]*rerun Step 1[\s\S]*Prepare private delivery candidates/iu,
      );

      const preparation = delivery.indexOf("## Prepare private delivery candidates");
      const locate = delivery.indexOf("arc delivery authoring locate -", preparation);
      const eligibilityPrepare = delivery.indexOf("arc delivery eligibility prepare -", locate);
      const eligibilityClose = delivery.indexOf("arc delivery eligibility close -", eligibilityPrepare);
      const publish = delivery.indexOf("arc delivery publish -", eligibilityClose);
      for (const position of [preparation, locate, eligibilityPrepare, eligibilityClose, publish]) {
        expect(position).toBeGreaterThan(-1);
      }
      expect(preparation).toBeLessThan(locate);
      expect(locate).toBeLessThan(eligibilityPrepare);
      expect(eligibilityPrepare).toBeLessThan(eligibilityClose);
      expect(eligibilityClose).toBeLessThan(publish);
    }
  });

  it("guards delivery-member scale before expensive verification and review", async () => {
    for (const root of ROOTS) {
      const [taskLoop, verification, delivery, preparation, integration] = await Promise.all([
        readFile(resolve(root, root === ROOTS[0]
          ? "system/workflows/arc/process-task-loop.template.md"
          : "system/workflows/arc/process-task-loop.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/verify-work-unit.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
      ]);

      expect(taskLoop).toContain("    - review-chunking");
      const memberBoundary = taskLoop.indexOf("3. **Delivery-member boundary (conditional):**");
      const memberScale = taskLoop.indexOf("arc review changeset resolve -", memberBoundary);
      const reportAndStop = taskLoop.indexOf("4. **Report and stop:**", memberBoundary);
      expect(memberScale).toBeGreaterThan(memberBoundary);
      expect(memberScale).toBeLessThan(reportAndStop);
      expect(taskLoop.slice(memberBoundary, reportAndStop))
        .toMatch(softWrappedProse("exact committed member span"));
      expect(taskLoop.slice(memberBoundary, reportAndStop)).toMatch(/explicit capable\s+whole-target choice/u);
      expect(taskLoop.slice(memberBoundary, reportAndStop))
        .toMatch(softWrappedProse("unbound coherent member re-cut remains an Owner decision"));
      expect(taskLoop.slice(memberBoundary, reportAndStop))
        .toMatch(softWrappedProse("metrics when the resolver supplies them"));
      expect(taskLoop.slice(memberBoundary, reportAndStop))
        .toMatch(softWrappedProse("approval does not authorize delivery-member advancement"));

      const recordedAttention = indexOfSoftWrappedProse(verification, "member-close scale-attention result");
      const mergeChecks = verification.indexOf("arc check gate merge --force");
      expect(recordedAttention).toBeGreaterThan(-1);
      expect(recordedAttention).toBeLessThan(mergeChecks);
      expect(verification).toContain("    - review-chunking");
      expect(verification.slice(recordedAttention, mergeChecks))
        .toMatch(softWrappedProse("metrics when the resolver supplies them"));

      const locate = delivery.indexOf("arc delivery authoring locate -");
      const materializedScale = delivery.indexOf("arc review changeset resolve -", locate);
      const pushChecks = delivery.indexOf("arc check gate push --all", locate);
      expect(materializedScale).toBeGreaterThan(locate);
      expect(materializedScale).toBeLessThan(pushChecks);
      expect(delivery).toContain("    - review-chunking");
      expect(delivery.slice(locate, pushChecks)).toMatch(softWrappedProse("materialized member scale recheck"));
      expect(delivery.slice(locate, pushChecks)).toMatch(softWrappedProse("No member push-gate request starts"));
      expect(delivery.slice(locate, pushChecks))
        .toMatch(softWrappedProse("whole-target choice closes the attention disposition"));

      const method = await readFile(resolve(root, "system/methods/code-review.md"), "utf8");
      for (const [workflow, carrierAction] of [
        [delivery, "`review-hosted-request` enters"],
        [preparation, "arc review frontline run -"],
        [integration, "`review-hosted-request` enters"],
      ] as const) {
        const scopeGuard = workflow.indexOf("[code-chunk-gate]");
        const carrier = workflow.indexOf(carrierAction, scopeGuard);
        expect(scopeGuard).toBeGreaterThan(-1);
        expect(carrier).toBeGreaterThan(scopeGuard);
        const gate = codeReviewSection(workflow, "chunk-gate", method).replace(/\s+/gu, " ");
        expect(gate).toContain("No carrier runs with unresolved exact-target attention");
        expect(gate).toContain("explicit capable whole-target choice closes attention");
        expect(gate).toContain("exact forced hosted whole-target invocation selected by the Owner");
        expect(gate).toContain("A stale or missing selection returns to the owning route before any carrier");
      }
    }
  });

  it("keeps packaged and project workflow copies identical", async () => {
    const [
      packagedPrepare,
      projectPrepare,
      packagedIntegrate,
      projectIntegrate,
      packagedTaskLoop,
      projectTaskLoop,
      packagedVerification,
      projectVerification,
      packagedDelivery,
      projectDelivery,
    ] = await Promise.all([
      readFile(resolve(ROOTS[0]!, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
      readFile(resolve(ROOTS[1]!, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
      readFile(resolve(ROOTS[0]!, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
      readFile(resolve(ROOTS[1]!, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
      readFile(resolve(ROOTS[0]!, "system/workflows/arc/process-task-loop.template.md"), "utf8"),
      readFile(resolve(ROOTS[1]!, "system/workflows/arc/process-task-loop.md"), "utf8"),
      readFile(resolve(ROOTS[0]!, "system/workflows/arc/work-unit-lifecycle/verify-work-unit.md"), "utf8"),
      readFile(resolve(ROOTS[1]!, "system/workflows/arc/work-unit-lifecycle/verify-work-unit.md"), "utf8"),
      readFile(resolve(ROOTS[0]!, "system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
      readFile(resolve(ROOTS[1]!, "system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
    ]);

    expect(projectPrepare).toBe(packagedPrepare);
    expect(projectIntegrate).toBe(packagedIntegrate);
    expect(projectTaskLoop).toBe(packagedTaskLoop);
    expect(projectVerification).toBe(packagedVerification);
    expect(projectDelivery).toBe(packagedDelivery);
  });

  it("ships the preparation workflow through the installation recipe", async () => {
    const recipe = JSON.parse(await readFile(resolve(ROOT, "packages/arc-framework/init-recipe.json"), "utf8")) as {
      include_files: string[];
    };

    expect(recipe.include_files)
      .toContain("system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md");
    expect(recipe.include_files)
      .toContain("system/methods/pull-request-format.md");
    expect(recipe.include_files).toContain("system/methods/validate-criteria.md");
  });

  it("routes scoped verification through the author check and independent companion", async () => {
    for (const root of ROOTS) {
      const [verification, taskLoop, validateCriteria, review] = await Promise.all([
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/verify-work-unit.md"), "utf8"),
        readFile(resolve(root, root === ROOTS[0]
          ? "system/workflows/arc/process-task-loop.template.md"
          : "system/workflows/arc/process-task-loop.md"), "utf8"),
        readFile(resolve(root, "system/methods/validate-criteria.md"), "utf8"),
        readFile(resolve(root, "system/methods/verification-review.md"), "utf8"),
      ]);

      expect(verification).toContain("    - verification-review");
      expect(verification).not.toContain("    - adversarial-review");
      expect(verification).toContain("verification-review:\n  scope:\n    kind: work-unit");
      expect(verification).toContain("Without a Delivery Plan:");
      expect(verification).toContain("criteria: task list's complete flat Success Criteria section");
      expect(validateCriteria).toMatch(softWrappedProse("open the upstream design/spec artifact"));
      expect(verification).toContain("With a Delivery Plan:");
      expect(verification).toContain("member-groups: recorded delivery-member criteria reports");
      expect(verification).toContain("seams: task list's Cross-member seams group");
      expect(verification).toMatch(softWrappedProse("At least one executable check fails"));
      expect(verification).toMatch(softWrappedProse("Present-tense architecture and completion claims distinguish"));
      expect(verification).toMatch(softWrappedProse("Every deferred part of original intent"));
      expect(verification).toMatch(softWrappedProse("member-scope verification tasks"));
      expect(verification).toMatch(softWrappedProse("sole terminal work-unit verification task"));
      expect(verification).not.toMatch(softWrappedProse("without becoming additional verification tasks"));
      expect(taskLoop).toContain("    - verification-review");
      expect(taskLoop).not.toContain("    - adversarial-review");
      expect(validateCriteria).not.toContain("    - adversarial-review");
      expect(validateCriteria).not.toContain("### Adversarial companion");
      expect(review).toContain("    - validate-criteria");
      expect(review).toContain("    - adversarial-review");
      expect(review).toContain("    - review-model");
      expect(review).toContain("validate-criteria:");
      expect(review).toMatch(softWrappedProse("decline proceeds normally"));
      expect(review).toMatch(softWrappedProse("Each finding names the exact criterion it fails"));
      for (const site of [verification, taskLoop]) {
        expect(site).not.toContain("adversarial-review:");
        expect(site).toContain("methods/verification-review.md#author-criteria-walk");
        expect(site).toContain("methods/verification-review.md#independent-companion");
      }
      expect(validateCriteria).toMatch(softWrappedProse("When none is present, open the upstream design/spec artifact"));
      expect(validateCriteria).toMatch(softWrappedProse("flat Success Criteria section against actual outcomes"));
      expect(validateCriteria).toMatch(softWrappedProse("When a Delivery Plan is present"));
      expect(review).toMatch(softWrappedProse("offer one fresh-context pass over the same selected scope"));
      const unresolvedStop = indexOfSoftWrappedProse(verification,
        "If the combined report contains any `[ ]` criterion, stop.");
      const attestationStep = verification.indexOf("## Step 3 — Attest the Candidate");
      expect(unresolvedStop).toBeGreaterThan(-1);
      expect(attestationStep).toBeGreaterThan(unresolvedStop);
      const coherentUnit = taskLoop.indexOf("2. **Coherent unit completion:**");
      const memberBoundary = taskLoop.indexOf("3. **Delivery-member boundary (conditional):**");
      const reportAndStop = taskLoop.indexOf("4. **Report and stop:**");
      expect(coherentUnit).toBeGreaterThan(-1);
      expect(memberBoundary).toBeGreaterThan(coherentUnit);
      expect(reportAndStop).toBeGreaterThan(memberBoundary);
      expect(taskLoop.slice(coherentUnit, memberBoundary))
        .toMatch(softWrappedProse("last task assigned to a delivery member"));
      const memberBoundarySection = taskLoop.slice(memberBoundary, reportAndStop);
      const criteriaWalk = indexOfSoftWrappedProse(memberBoundarySection, "member's criteria walk");
      const memberValidation = memberBoundarySection.indexOf("verification-review:");
      expect(criteriaWalk).toBeGreaterThan(-1);
      expect(memberBoundarySection).toMatch(/verification-review:\n\s+scope:\n\s+kind: delivery-member/u);
      expect(memberValidation).toBeGreaterThan(criteriaWalk);
      const unresolvedBranch = taskLoop.indexOf("**Unresolved member-report branch:**");
      const resolvedBranch = taskLoop.indexOf("**Resolved completion branch:**");
      expect(unresolvedBranch).toBeGreaterThan(memberBoundary);
      expect(resolvedBranch).toBeGreaterThan(unresolvedBranch);
      expect(taskLoop.slice(unresolvedBranch, resolvedBranch))
        .toMatch(softWrappedProse("leave the closing task `[ ]`"));
      expect(taskLoop.slice(unresolvedBranch, resolvedBranch)).not.toMatch(softWrappedProse("Mark the task `[x]`"));
      expect(validateCriteria).toMatch(softWrappedPattern(/do\s+not\s+re-derive\s+member\s+criteria/u));
      expect(validateCriteria).toMatch(softWrappedPattern(/walk\s+the\s+seam\s+group\s+and\s+union\s+coherence/u));
      expect(validateCriteria).toMatch(
        /criteria-slice:[\s\S]*?span:[\s\S]*?diff:[\s\S]*?reachability:[\s\S]*?boundary-order-deviation:[\s\S]*?criteria:[\s\S]*?- locus:[\s\S]*?criterion-digest:/u,
      );
      expect(validateCriteria).not.toContain("- text:");
      expect(validateCriteria).toMatch(/criterion digest[\s\S]*?(?:insertion|reorder)[\s\S]*?unresolved/u);
    }
  });

  it("loads one policy for terminal and non-terminal delivery presentations", async () => {
    for (const root of ROOTS) {
      const delivery = await readFile(resolve(root, "system/workflows/arc/supplemental/deliver-stack.md"), "utf8");
      const publication = delivery.slice(delivery.indexOf("## Validate and publish"), delivery.indexOf("arc delivery publish -"));
      expect(publication).toContain("load [pull-request-format][pull-request-format]");
      const input = JSON.parse(publication.match(/```json\n([\s\S]*?)```/u)?.[1] ?? "{}") as {
        presentations: Record<string, unknown>[]; terminalPresentation: Record<string, unknown>;
      };
      expect(input.presentations[0]).toHaveProperty("deliverableId");
      expect(input.presentations[0]).toHaveProperty("summary");
      expect(input.presentations[0]).toHaveProperty("changes");
      expect(input.presentations[0]).not.toHaveProperty("designReference");
      expect(Object.keys(input.terminalPresentation).sort()).toEqual(["body", "title"]);
      expect(publication).toMatch(softWrappedProse("Do not supply `designReference`"));
      expect(publication).toContain("multi-member");
      expect(publication).toContain("one-member");
      expect(delivery).toMatch(softWrappedProse("scope is the work-unit ID"));
    }
  });

  it("retires the old template from both copies, installation, and shipped references", async () => {
    const legacy = "reference/templates/arc/work-unit/template-pull-request.md";
    for (const root of ROOTS) {
      await expect(readFile(resolve(root, legacy), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    }
    const recipe = JSON.parse(await readFile(resolve(ROOT, "packages/arc-framework/init-recipe.json"), "utf8")) as {
      include_files: string[];
    };
    expect(recipe.include_files).not.toContain(legacy);
    const packageRoot = ROOTS[0]!;
    for (const file of await readdir(packageRoot, { recursive: true })) {
      if (!file.endsWith(".md")) continue;
      expect(await readFile(resolve(packageRoot, file), "utf8"), file).not.toContain("template-pull-request.md");
    }
    for (const path of ["system/methods/pull-request-format.md",
      "system/workflows/arc/supplemental/run-errand.md",
      "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"]) {
      const document = await readFile(resolve(packageRoot, path), "utf8");
      const content = path.includes("integrate-work-unit") ? document.slice(0, document.indexOf("## Phase 2:")) : document;
      expect(content, path).not.toContain("**Design:**");
      expect(content, path).not.toContain("**Local review:**");
      expect(content, path).not.toContain("## Decisions");
      expect(content, path).not.toContain("## Follow-Up Work");
    }
  });

  it("ships every pull-request method reference at its resolved installed path", async () => {
    const arcRoot = resolve(ROOT, "packages/arc-framework/arc");
    const methodPath = resolve(arcRoot, "system/methods/pull-request-format.md");
    const [method, recipeText] = await Promise.all([
      readFile(methodPath, "utf8"),
      readFile(resolve(ROOT, "packages/arc-framework/init-recipe.json"), "utf8"),
    ]);
    const recipe = JSON.parse(recipeText) as { include_files: string[] };
    const targets = [...method.matchAll(/^\[[^\]]+\]:\s+([^#\s]+)(?:#\S+)?$/gmu)]
      .map((match) => match[1])
      .filter((target): target is string => target !== undefined);

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const installedPath = resolve(dirname(methodPath), target);
      await expect(readFile(installedPath, "utf8")).resolves.not.toBe("");
      expect(recipe.include_files).toContain(relative(arcRoot, installedPath));
    }
  });

  it("closes verification before attestation and hands execution off to preparation", async () => {
    for (const root of ROOTS) {
      const [verification, preparation, integration, taskLoop] = await Promise.all([
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/verify-work-unit.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
        readFile(resolve(root, root === ROOTS[0]
          ? "system/workflows/arc/process-task-loop.template.md"
          : "system/workflows/arc/process-task-loop.md"), "utf8"),
      ]);

      const cleanup = indexOfSoftWrappedProse(verification, "Before the Candidate exists, clean the WU content");
      const selfReview = verification.indexOf("[code-author-check]");
      const mergeChecks = verification.indexOf("arc check gate merge --force");
      const attest = verification.indexOf("arc attest {name} --json");
      const reRoot = verification.indexOf("`blocked / establish-new-root`");
      expect(cleanup).toBeGreaterThan(-1);
      expect(selfReview).toBeGreaterThan(cleanup);
      expect(mergeChecks).toBeGreaterThan(selfReview);
      expect(attest).toBeGreaterThan(mergeChecks);
      expect(reRoot).toBeGreaterThan(attest);
      expect(verification).toMatch(softWrappedProse("execute its exact `continuation.argv`"));
      expect(verification).toContain("`attested / re-root`");
      expect(preparation).toContain("For `run-self-review`, run [code-review's author check]");
      const method = await readFile(resolve(root, "system/methods/code-review.md"), "utf8");
      const author = codeReviewSection(verification, "author-check", method);
      expect(author).toMatch(softWrappedProse("aggregate diff against the base branch"));
      expect(author).toContain("standalone non-producer report");
      expect(author).toContain("Do not invoke the producer-backed response command");
      expect(integration).not.toMatch(softWrappedProse("After settlement, clean the WU content"));

      expect(indexOfSoftWrappedProse(verification, "mark the single verification task `[x]`")).toBeGreaterThan(-1);
      expect(attest)
        .toBeGreaterThan(indexOfSoftWrappedProse(verification, "mark the single verification task `[x]`"));
      expect(taskLoop).toMatch(softWrappedProse("to prepare-work-unit` (verification complete — execution end)"));
      expect(taskLoop).toMatch(softWrappedProse("prepare-work-unit are all valid retargets"));
      expect(taskLoop).not.toMatch(softWrappedProse("integrate are all valid retargets"));
      expect(taskLoop).toMatch(softWrappedPattern(/When\s+all\s+tasks\s+are\s+marked\s+complete[\s\S]*proceed\s+to\s+Candidate\s+preparation/iu));
    }
  });

  it("restarts checkpointing after reconcile and returns inline archival to the final push", async () => {
    for (const root of ROOTS) {
      const [integrate, archive] = await Promise.all([
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/archive-work-unit.md"), "utf8"),
      ]);

      const cleanContinuation = indexOfSoftWrappedProse(integrate, "`clean` continues to the checkpoint below");
      const appliedRestart = indexOfSoftWrappedProse(integrate, "Restart this step. The correction changed the head");
      const readyCheckpoint = indexOfSoftWrappedProse(integrate, "On `ready / request-approval`");
      expect(cleanContinuation).toBeGreaterThan(-1);
      expect(appliedRestart).toBeGreaterThan(cleanContinuation);
      expect(readyCheckpoint).toBeGreaterThan(appliedRestart);
      expect(integrate).toContain("Context: meta-{name}.md (integration)");
      expect(integrate).not.toContain("Context: meta-{name}.md (integration reconcile)");
      expect(archive).toMatch(softWrappedProse("per `integrate-work-unit.md` Steps 5–7"));
      expect(archive).toMatch(softWrappedProse("Step 9 — the final integration push"));
      expect(archive).not.toMatch(softWrappedProse("Step 10 — the final integration push"));
    }
  });

  it("distinguishes review-fix and lifecycle-ceremony context footers", async () => {
    for (const root of ROOTS) {
      const [footer, selfReview] = await Promise.all([
        readFile(resolve(root, "system/methods/commit-footer.md"), "utf8"),
        readFile(resolve(root, "system/methods/code-review-author.md"), "utf8"),
      ]);

      expect(footer).toContain("meta-[name].md (prepublication)");
      expect(footer).toContain("meta-[name].md (integration)");
      const method = await readFile(resolve(root, "system/methods/code-review.md"), "utf8");
      expect(selfReview).toContain("code-review.md#author-check");
      expect(method).toMatch(softWrappedProse("Commit with the caller's canonical `(code review)` context"));
      expect(method).toMatch(softWrappedProse("reserving lifecycle footers for ceremony commits"));
      expect(method).not.toMatch(/finding-driven fixes[\s\S]{0,120}`\(prepublication\)`/u);
    }
  });
});
