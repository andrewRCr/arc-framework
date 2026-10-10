import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { indexOfSoftWrappedProse, softWrappedProse } from "../helpers/soft-wrapped-prose.js";

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
        .toMatch(/metrics when the resolver\s+supplies them/u);

      const locate = delivery.indexOf("arc delivery authoring locate -");
      const materializedScale = delivery.indexOf("arc review changeset resolve -", locate);
      const tierTwo = delivery.indexOf("complete Tier 2 command set", locate);
      expect(materializedScale).toBeGreaterThan(locate);
      expect(materializedScale).toBeLessThan(tierTwo);
      expect(delivery).toContain("    - review-chunking");
      expect(delivery.slice(locate, tierTwo)).toMatch(softWrappedProse("materialized member scale recheck"));
      expect(delivery.slice(locate, tierTwo)).toMatch(softWrappedProse("No Tier 2 command starts"));
      expect(delivery.slice(locate, tierTwo))
        .toMatch(softWrappedProse("whole-target choice closes the attention disposition"));

      for (const [workflow, carrierCommand] of [
        [delivery, "arc review hosted request -"],
        [preparation, "arc review frontline run -"],
        [integration, "arc review hosted request -"],
      ] as const) {
        const scopeGuard = indexOfSoftWrappedProse(workflow, "No review carrier may run while");
        const hostedCarrier = workflow.indexOf(carrierCommand, scopeGuard);
        expect(scopeGuard).toBeGreaterThan(-1);
        expect(hostedCarrier).toBeGreaterThan(scopeGuard);
        expect(workflow.slice(scopeGuard, hostedCarrier))
          .toMatch(/exact-target(?:\s+chunked)?\s+scope\s+selection/u);
        expect(workflow.slice(scopeGuard, hostedCarrier)).toContain("unresolved");
        expect(workflow.slice(scopeGuard, hostedCarrier))
          .toMatch(softWrappedProse("capable whole-target choice"));
      }
      for (const workflow of [delivery, integration]) {
        expect(workflow).toMatch(softWrappedProse("exact-target forced hosted invocation"));
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
      .toContain("reference/templates/arc/work-unit/template-pull-request.md");
    expect(recipe.include_files).toContain("system/methods/validate-criteria.md");
  });

  it("fires validate-criteria directly at work-unit and delivery-member boundaries", async () => {
    for (const root of ROOTS) {
      const [verification, taskLoop, validateCriteria] = await Promise.all([
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/verify-work-unit.md"), "utf8"),
        readFile(resolve(root, root === ROOTS[0]
          ? "system/workflows/arc/process-task-loop.template.md"
          : "system/workflows/arc/process-task-loop.md"), "utf8"),
        readFile(resolve(root, "system/methods/validate-criteria.md"), "utf8"),
      ]);

      expect(verification).toContain("    - validate-criteria");
      expect(verification).not.toContain("    - adversarial-review");
      expect(verification).toContain("validate-criteria:\n  scope:\n    kind: work-unit");
      expect(verification).toContain("Without a Delivery Plan:");
      expect(verification).toContain("criteria: task list's complete flat Success Criteria section");
      expect(verification).toMatch(softWrappedProse("open the upstream design/spec artifact"));
      expect(verification).toContain("With a Delivery Plan:");
      expect(verification).toContain("member-groups: recorded delivery-member criteria reports");
      expect(verification).toContain("seams: task list's Cross-member seams group");
      expect(verification).toMatch(softWrappedProse("At least one executable check fails"));
      expect(verification).toMatch(softWrappedProse("Present-tense architecture and completion claims distinguish"));
      expect(verification).toMatch(softWrappedProse("Every deferred part of original intent"));
      expect(verification).toMatch(softWrappedProse("member-scope verification tasks"));
      expect(verification).toMatch(softWrappedProse("sole terminal work-unit verification task"));
      expect(verification).not.toMatch(softWrappedProse("without becoming additional verification tasks"));
      expect(taskLoop).toContain("    - validate-criteria");
      expect(taskLoop).not.toContain("    - adversarial-review");
      expect(validateCriteria).toContain("arc:\n  methods:\n    - adversarial-review");
      expect(validateCriteria).toMatch(softWrappedProse("When none is present, open the upstream design/spec artifact"));
      expect(validateCriteria).toMatch(softWrappedProse("flat Success Criteria section against actual outcomes"));
      expect(validateCriteria).toMatch(softWrappedProse("When a Delivery Plan is present"));
      expect(validateCriteria).toMatch(softWrappedProse("offer one fresh-context pass over the same selected scope"));
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
      const criteriaWalk = memberBoundarySection.indexOf("member's criteria walk");
      const memberValidation = memberBoundarySection.indexOf("validate-criteria:");
      expect(criteriaWalk).toBeGreaterThan(-1);
      expect(memberBoundarySection).toMatch(/validate-criteria:\n\s+scope:\n\s+kind: delivery-member/u);
      expect(memberValidation).toBeGreaterThan(criteriaWalk);
      const unresolvedBranch = taskLoop.indexOf("**Unresolved member-report branch:**");
      const resolvedBranch = taskLoop.indexOf("**Resolved completion branch:**");
      expect(unresolvedBranch).toBeGreaterThan(memberBoundary);
      expect(resolvedBranch).toBeGreaterThan(unresolvedBranch);
      expect(taskLoop.slice(unresolvedBranch, resolvedBranch))
        .toMatch(softWrappedProse("leave the closing task `[ ]`"));
      expect(taskLoop.slice(unresolvedBranch, resolvedBranch)).not.toContain("Mark the task `[x]`");
      expect(validateCriteria).toMatch(/do not re-derive member\s+criteria/u);
      expect(validateCriteria).toMatch(/walk the seam group\s+and union coherence/u);
      expect(validateCriteria).toMatch(
        /criteria-slice:[\s\S]*?span:[\s\S]*?diff:[\s\S]*?reachability:[\s\S]*?boundary-order-deviation:[\s\S]*?criteria:[\s\S]*?- locus:[\s\S]*?criterion-digest:/u,
      );
      expect(validateCriteria).not.toContain("- text:");
      expect(validateCriteria).toMatch(/criterion digest[\s\S]*?(?:insertion|reorder)[\s\S]*?unresolved/u);
    }
  });

  it("ships every pull-request template reference at its resolved installed path", async () => {
    const arcRoot = resolve(ROOT, "packages/arc-framework/arc");
    const templatePath = resolve(arcRoot, "reference/templates/arc/work-unit/template-pull-request.md");
    const [template, recipeText] = await Promise.all([
      readFile(templatePath, "utf8"),
      readFile(resolve(ROOT, "packages/arc-framework/init-recipe.json"), "utf8"),
    ]);
    const recipe = JSON.parse(recipeText) as { include_files: string[] };
    const targets = [...template.matchAll(/^\[[^\]]+\]:\s+([^#\s]+)(?:#\S+)?$/gmu)]
      .map((match) => match[1])
      .filter((target): target is string => target !== undefined);

    expect(targets).toHaveLength(4);
    for (const target of targets) {
      const installedPath = resolve(dirname(templatePath), target);
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
      const selfReview = indexOfSoftWrappedProse(verification, "execute it against the local aggregate diff");
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
      expect(preparation).not.toMatch(softWrappedProse("execute it against the local aggregate diff"));
      expect(integration).not.toMatch(softWrappedProse("After settlement, clean the WU content"));

      expect(verification.indexOf("mark the single verification task `[x]`")).toBeGreaterThan(-1);
      expect(attest)
        .toBeGreaterThan(verification.indexOf("mark the single verification task `[x]`"));
      expect(taskLoop).toContain("to prepare-work-unit` (verification complete — execution end)");
      expect(taskLoop).toContain("prepare-work-unit are all valid retargets");
      expect(taskLoop).not.toContain("integrate are all valid retargets");
      expect(taskLoop).toMatch(/When all tasks are marked complete[\s\S]*proceed to Candidate preparation/iu);
    }
  });

  it("restarts checkpointing after reconcile and returns inline archival to the final push", async () => {
    for (const root of ROOTS) {
      const [integrate, archive] = await Promise.all([
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/archive-work-unit.md"), "utf8"),
      ]);

      const cleanContinuation = integrate.indexOf("`clean` continues to the checkpoint below");
      const appliedRestart = integrate.indexOf("Restart this step. The correction changed the head");
      const readyCheckpoint = integrate.indexOf("On `ready / request-approval`");
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
        readFile(resolve(root, "system/methods/self-review.md"), "utf8"),
      ]);

      expect(footer).toContain("meta-[name].md (prepublication)");
      expect(footer).toContain("meta-[name].md (integration)");
      expect(selfReview).toMatch(softWrappedProse("finding-driven fixes with the canonical `(code review)` context footer"));
      expect(selfReview).not.toMatch(/finding-driven fixes[\s\S]{0,120}`\(prepublication\)`/u);
    }
  });
});
