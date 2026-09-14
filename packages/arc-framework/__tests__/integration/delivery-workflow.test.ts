import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyFile } from "../../src/lib/classification.js";

const root = resolve(import.meta.dirname, "../../../..");

function section(document: string, heading: string): string {
  const start = document.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`missing workflow section: ${heading}`);
  const end = document.indexOf("\n## ", start + 3);
  return document.slice(start, end < 0 ? undefined : end);
}

describe("packaged delivery workflow", () => {
  it("ships one framework-owned workflow with closed prepare/interlock/apply ordering", async () => {
    const [packaged, installed, recipe] = await Promise.all([
      readFile(resolve(root, "packages/arc-framework/arc/system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
      readFile(resolve(root, ".arc/system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
      readFile(resolve(root, "packages/arc-framework/init-recipe.json"), "utf8"),
    ]);
    expect(installed).toBe(packaged);
    expect(JSON.parse(recipe).include_files).toContain("system/workflows/arc/supplemental/deliver-stack.md");
    expect(classifyFile("system/workflows/arc/supplemental/deliver-stack.md")).toBe("Framework");
    expect(packaged).toContain("arc delivery eligibility prepare");
    expect(packaged).toContain("arc delivery authoring locate");
    expect(packaged).not.toContain("refs/arc/delivery-candidates/{planId}/{chunkKey}");
    expect(packaged).toMatch(/returned private candidate ref[\s\S]*returned[\s\S]*detached gate path/iu);
    expect(packaged).not.toContain("refs/heads/cut/");
    expect(packaged).not.toContain("arc delivery materialize");
    expect(packaged).toContain("arc delivery land prepare");
    expect(packaged).toContain("arc delivery land apply");
    expect(packaged).toContain("arc delivery reconcile");
    expect(packaged).toContain("arc delivery rematerialize");
    expect(packaged).not.toContain("arc delivery rewrite");
    expect(packaged).not.toContain("arc delivery terminal prepare");
    expect(packaged).toContain("arc delivery teardown");
    expect(packaged).toContain("arc delivery top-remedy");
    expect(packaged).toContain("arc delivery native link");
    expect(packaged).toContain("arc delivery native observe");
    expect(packaged).toContain("arc delivery native unlink");
    expect(packaged).toContain("arc delivery native land-select");
    expect(packaged).toContain("arc delivery native land-prepare");
    expect(packaged).toContain("arc delivery native land-submit");
    expect(packaged).toContain("arc delivery native land-status");
    expect(packaged).toContain("arc delivery refresh plan");
    expect(packaged).toContain("arc delivery refresh adopt");
    expect(packaged).toContain("arc delivery review-fix continue");
    expect(packaged).not.toContain("arc delivery review-fix plan");
    expect(packaged).toContain("arc delivery review-fix publish");
    expect(packaged).toContain("`review-fix-verification-required`");
    expect(packaged).toMatch(/opt-out `unlinked`\s+result makes zero native host calls/u);
    const materializeSection = section(packaged, "Validate and publish");
    const nativeSection = section(packaged, "Select and execute the native landing arm");
    const reviewSection = section(packaged, "Review and land the current member");
    expect(nativeSection).toMatch(/`member-discharged \/ continue-reconcile`[\s\S]*arc delivery native land-prepare/u);
    expect(reviewSection).toMatch(/`member-discharged \/ continue-reconcile`[\s\S]*arc delivery land prepare/u);
    const terminalSection = section(packaged, "Terminal handoff");
    const terminalTail = packaged.slice(packaged.indexOf("arc delivery teardown"));
    const recoveryStart = materializeSection.indexOf("After interruption");
    const recoveryEnd = materializeSection.indexOf("Only after every request ID exists");
    expect(recoveryStart).toBeGreaterThan(-1);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    const recoverySection = materializeSection.slice(
      recoveryStart,
      recoveryEnd,
    );
    expect(materializeSection).toMatch(/opt-out[\s\S]*zero native host calls/iu);
    expect(materializeSection).toContain("terminalPresentation");
    const tierTwoRun = packaged.indexOf("complete Tier 2 command set");
    const gateResults = packaged.indexOf("gateResults", tierTwoRun);
    const eligibilityClose = packaged.indexOf("arc delivery eligibility close", gateResults);
    expect(tierTwoRun).toBeGreaterThan(-1);
    expect(tierTwoRun).toBeLessThan(gateResults);
    expect(gateResults).toBeLessThan(eligibilityClose);
    expect(eligibilityClose).toBeLessThan(packaged.indexOf("arc delivery publish"));
    expect(materializeSection.indexOf("terminalPresentation")).toBeLessThan(
      materializeSection.indexOf("arc delivery publish"),
    );
    expect(materializeSection.indexOf("arc delivery publish")).toBeLessThan(
      materializeSection.indexOf("arc delivery native link"),
    );
    const disclosureRead = materializeSection.indexOf("arc delivery native link");
    const disclosure = materializeSection.indexOf("`decision-required`", disclosureRead);
    const optedRequest = materializeSection.indexOf("arc delivery native link", disclosureRead + 1);
    expect(disclosureRead).toBeGreaterThan(-1);
    expect(disclosure).toBeGreaterThan(-1);
    expect(optedRequest).toBeGreaterThan(-1);
    expect(disclosureRead).toBeLessThan(disclosure);
    expect(disclosure).toBeLessThan(optedRequest);
    expect(materializeSection).toContain("`recommendedOptInText`");
    expect(materializeSection).toContain("`recommendedOptOutText`");
    expect(materializeSection).toMatch(/initial `unlinked`[\s\S]*ordinary singleton/iu);
    expect(materializeSection).toMatch(/render both texts verbatim[\s\S]*set `optIn`/iu);
    expect(materializeSection).not.toContain("review applicability must be re-evaluated");
    expect(materializeSection).toMatch(/every member ref[\s\S]*before[\s\S]*request/iu);
    expect(nativeSection).toMatch(/native unlink[\s\S]*fresh `unlinked`[\s\S]*ordinary singleton/iu);
    expect(nativeSection).toMatch(
      /selector request carries only[\s\S]*no member coordinates or[\s\S]*position facts[\s\S]*handler freshly observes position[\s\S]*provider observation/iu,
    );
    expect(nativeSection).toMatch(
      /selected arm[\s\S]*never position facts[\s\S]*handler freshly reobserves position[\s\S]*native effect/iu,
    );
    expect(nativeSection).not.toContain("only the plan, request, and remote locators");
    expect(packaged).toContain("never enters the delivery plan or state");
    expect(packaged).toContain("integrate-work-unit.md");
    const prepare = packaged.indexOf("arc delivery land prepare");
    const interlock = packaged.indexOf("`integration-interlock`", prepare);
    const apply = packaged.indexOf("arc delivery land apply", interlock);
    expect(prepare).toBeLessThan(interlock);
    expect(interlock).toBeLessThan(apply);
    expect(reviewSection).toMatch(/retryable[\s\S]*prepare[\s\S]*new integration interlock/iu);
    const positionRequest = reviewSection.indexOf(
      '{"planId":"<planId>","repository":"<repositoryRef>","remote":"origin"}',
    );
    const positionRead = reviewSection.indexOf("arc delivery position - --json");
    expect(positionRequest).toBeGreaterThan(-1);
    expect(positionRequest).toBeLessThan(positionRead);
    expect(reviewSection.slice(positionRequest, positionRead)).not.toContain("facts");
    expect(reviewSection).toMatch(
      /position - --json[\s\S]*Dispatch only on its typed route[\s\S]*review-member[\s\S]*teardown-member[\s\S]*terminal-handoff/u,
    );
    const positionDispatch = reviewSection.slice(
      positionRead,
      reviewSection.indexOf("For `review-member`", positionRead),
    );
    expect(positionDispatch).toMatch(
      /operation-active[\s\S]*arc delivery reconcile - --json[\s\S]*Every other\s+refusal\s+stops/u,
    );
    expect(positionDispatch).toMatch(
      /review-fix-routing-required[\s\S]*review-fix continue[\s\S]*no member or operation selector[\s\S]*Every other\s+refusal\s+stops/iu,
    );
    expect(reviewSection).toMatch(
      /native-stack-required[\s\S]*delivery-native-land-select[\s\S]*mode: sequential[\s\S]*canonical remaining chain/iu,
    );
    expect(reviewSection).toMatch(
      /preparation request[\s\S]*no[\s\S]*position facts[\s\S]*handler freshly reobserves position[\s\S]*singleton effect/iu,
    );
    expect(reviewSection).toMatch(/native-stack-required` never enters[\s\S]*semantic native-selection transition/iu);
    expect(nativeSection).toMatch(/delivery-member[\s\S]*planId[\s\S]*deliverableId[\s\S]*workUnitSlug/u);
    expect(nativeSection).toMatch(
      /respond-to-findings[\s\S]*responsePlan[\s\S]*review-triage[\s\S]*review-response[\s\S]*arc review respond -/iu,
    );
    expect(nativeSection).toMatch(/never requests another hosted review/iu);
    expect(reviewSection).toMatch(/review-member[\s\S]*settle exact member review authority above/iu);
    const refreshPlan = reviewSection.indexOf("arc delivery refresh plan");
    const refreshExecute = reviewSection.indexOf("arc delivery refresh execute", refreshPlan);
    const refreshAdopt = reviewSection.indexOf("arc delivery refresh adopt", refreshPlan);
    const refreshTail = reviewSection.slice(refreshPlan, reviewSection.indexOf("arc delivery rematerialize"));
    expect(refreshPlan).toBeLessThan(refreshExecute);
    expect(refreshExecute).toBeLessThan(refreshAdopt);
    expect(refreshTail).toMatch(
      /provider-invoked[\s\S]*refresh execute[\s\S]*provider-refresh[\s\S]*bottom-up[\s\S]*terminal top/iu,
    );
    expect(refreshTail).toMatch(/contiguous requested prefix[\s\S]*untouched tail/iu);
    expect(refreshTail).toMatch(
      /blocked \/ reconcile[\s\S]*arc delivery reconcile[\s\S]*blocked \/ resolve-terminal-conflicts[\s\S]*paths[\s\S]*recommendedActionText/iu,
    );
    expect(refreshTail).toMatch(
      /workflow-interlock[\s\S]*resolve-terminal-conflicts[\s\S]*approval[\s\S]*attended terminal conflict resolution/iu,
    );
    expect(refreshTail).toMatch(
      /refusal before reservation[\s\S]*operator selects the external fallback[\s\S]*mechanics[\s\S]*operator-initiated/iu,
    );
    expect(refreshTail).toMatch(/external refresh is unreserved[\s\S]*no provider\s+mutation operation/iu);
    expect(refreshTail).toMatch(
      /Before reserving[\s\S]*observes the complete exact suffix[\s\S]*proves every changed contribution/iu,
    );
    expect(refreshTail).toMatch(
      /provider-adoption[\s\S]*reobserves and reproves[\s\S]*absorbs[\s\S]*lease-publishes[\s\S]*one final state/iu,
    );
    expect(refreshTail).toMatch(/never records suffix-only state/iu);
    expect(refreshTail).toMatch(
      /blocked result[\s\S]*retains it[\s\S]*delivery-refresh-adopt[\s\S]*exact `operationId`/iu,
    );
    expect(refreshTail).toMatch(/already-created local merge[\s\S]*already-published top/iu);
    expect(refreshTail).toMatch(
      /conflict-resolution-required[\s\S]*conflicts[\s\S]*externalRefRestorations[\s\S]*recommendedActionText/iu,
    );
    expect(refreshTail).toMatch(
      /workflow-interlock[\s\S]*exact conflict and restoration offer[\s\S]*approval[\s\S]*resolutionInput[\s\S]*conflictResolution/iu,
    );
    expect(refreshTail).toMatch(/decline[\s\S]*observedHead[\s\S]*restoreHead[\s\S]*exact Git lease/iu);
    const controller = reviewSection.indexOf("arc delivery review-fix continue - --json", refreshAdopt);
    const verification = reviewSection.indexOf("### Complete a review-fix verification continuation", controller);
    const teardown = reviewSection.indexOf("arc delivery teardown", verification);
    expect(controller).toBeGreaterThan(refreshAdopt);
    expect(controller).toBeLessThan(verification);
    expect(verification).toBeLessThan(teardown);
    const correctionTail = reviewSection.slice(controller, teardown);
    expect(correctionTail).toMatch(/request carries only[\s\S]*repository and remote identities/iu);
    expect(correctionTail).toMatch(/dispatch \/ dispatch[\s\S]*action\.argv[\s\S]*action\.input[\s\S]*re-enters/iu);
    expect(correctionTail).toMatch(
      /authoring-required \/ author-correction[\s\S]*verification-required \/ verify-review-fix[\s\S]*authority-required \/ dispatch-authority-action[\s\S]*idle \/ continue-work-unit/iu,
    );
    expect(correctionTail).toMatch(/does not create an orchestration record/iu);
    expect(correctionTail).toMatch(
      /applied \/ verify-review-fix[\s\S]*rematerialized \/ verify-review-fix[\s\S]*rebound \/ verify-review-fix[\s\S]*same exact verification\s+continuation/iu,
    );
    expect(correctionTail).toMatch(/memberDeliverableIds[\s\S]*contribution-equivalent[\s\S]*re-verifies nothing/iu);
    expect(correctionTail).toMatch(/tier1Reuse[\s\S]*existing passed result[\s\S]*targetTree/iu);
    expect(correctionTail).toMatch(/one resubmission shape[\s\S]*resumeAction[\s\S]*verificationResult/iu);
    expect(correctionTail).toMatch(/derivedFrom[\s\S]*open task[\s\S]*pending approved\s+review response/iu);
    expect(correctionTail).toMatch(/same finding-disposition approval/iu);
    expect(correctionTail).not.toContain("`integration-interlock`");
    const reviewStart = packaged.indexOf("## Review and land the current member");
    const terminalStart = packaged.indexOf("## Terminal handoff", reviewStart);
    const teardownInDocument = packaged.indexOf("arc delivery teardown", reviewStart);
    expect(reviewStart).toBeGreaterThanOrEqual(0);
    expect(teardownInDocument).toBeGreaterThan(reviewStart);
    expect(terminalStart).toBeGreaterThan(teardownInDocument);
    expect(terminalTail).toMatch(/terminal-checkpoint[\s\S]*integrate-work-unit\.md/iu);
    expect(terminalTail).toMatch(/retarget[\s\S]*reopen-and-retarget/iu);
    expect(terminalTail).toMatch(/explicit[\s\S]*arc delivery top-remedy[\s\S]*terminal-checkpoint/iu);
    expect(recoverySection).toMatch(
      /applied \/ teardown-member[\s\S]*selectedDeliverableId[\s\S]*arc delivery teardown[\s\S]*before[\s\S]*ordinary position/iu,
    );
    expect(recoverySection).toMatch(/applied \/ read-position[\s\S]*arc delivery position/iu);
    expect(recoverySection).not.toContain("retryable / read-position");
    for (const arm of [
      "retryable / cleared / delivery-publish` with `operationKind: materialize",
      "retryable / preserved / delivery-publish` with `operationKind: publish",
      "retryable / cleared / delivery-rematerialize` with `operationKind: rewrite` and `mode: review-fix",
      "retryable / cleared / delivery-review-fix-publish` with `operationKind: rewrite` and\n"
        + "  `mode: selected-change`",
      "retryable / preserved / delivery-refresh-adopt` with `operationKind: rewrite` and\n"
        + "  `mode: provider-adoption`",
      "retryable / preserved / delivery-refresh-execute` with `operationKind: rewrite` and\n"
        + "  `mode: provider-refresh`",
      "retryable / cleared / delivery-land-prepare` with `operationKind: land` and `mode: sequential",
      "retryable / cleared / delivery-native-land-select` with `operationKind: land` and `mode: native",
      "retryable / preserved / delivery-teardown` with `operationKind: teardown",
      "retryable / cleared / delivery-top-remedy` with `operationKind: top-remedy",
    ]) {
      expect(recoverySection).toContain(arm);
    }
    expect(recoverySection).toMatch(/provider-adoption[\s\S]*arc delivery refresh adopt/iu);
    expect(recoverySection).toMatch(/provider-refresh[\s\S]*arc delivery refresh execute/iu);
    expect(recoverySection).toMatch(
      /prepared \/ preserved \/ delivery-native-land-submit[\s\S]*presentation[\s\S]*exact member\/head[\s\S]*consequence[\s\S]*integration-interlock[\s\S]*submitAction[\s\S]*unchanged/iu,
    );
    expect(recoverySection).toMatch(
      /planId[\s\S]*operationId[\s\S]*affectedDeliverableIds[\s\S]*operationKind[\s\S]*narrow `mode`/u,
    );
    expect(recoverySection).toMatch(/workflow prose infers neither a selector nor a[\s\S]*recovery policy/iu);
    expect(recoverySection).toMatch(/unlisted action\/transition\/selector pairing[\s\S]*stops/iu);
    expect(reviewSection).toMatch(
      /teardown-member[\s\S]*selectedDeliverableId[\s\S]*arc delivery teardown[\s\S]*no position facts[\s\S]*handler freshly reobserves position/iu,
    );
    expect(terminalSection).not.toContain("`integration-interlock`");
    expect(packaged).not.toMatch(/if\s+.*(?:state|status)\s*==/iu);
    const nativeObserve = packaged.indexOf("arc delivery native observe");
    const nativeSelect = packaged.indexOf("arc delivery native land-select", nativeObserve);
    const nativeUnlink = packaged.indexOf("arc delivery native unlink", nativeSelect);
    const nativeReviewStatus = packaged.indexOf("arc review status", nativeSelect);
    const nativePrepare = packaged.indexOf("arc delivery native land-prepare", nativeSelect);
    const nativeInterlock = packaged.indexOf("`integration-interlock`", nativePrepare);
    const nativeSubmit = packaged.indexOf("arc delivery native land-submit", nativeInterlock);
    const nativeStatus = packaged.indexOf("arc delivery native land-status", nativeSubmit);
    expect(nativeObserve).toBeLessThan(nativeSelect);
    expect(nativeSelect).toBeLessThan(nativeUnlink);
    expect(nativeSection).toMatch(
      /native unlink[\s\S]*exact `planId`[\s\S]*current native member subject/iu,
    );
    expect(nativeSelect).toBeLessThan(nativeReviewStatus);
    expect(nativeReviewStatus).toBeLessThan(nativePrepare);
    expect(nativePrepare).toBeLessThan(nativeInterlock);
    expect(nativeInterlock).toBeLessThan(nativeSubmit);
    expect(nativeSubmit).toBeLessThan(nativeStatus);
    expect(nativeSection).toMatch(/exact member\/head set[\s\S]*residual race/iu);
    expect(nativeSection).toMatch(/ordinary polling[\s\S]*land-status/iu);
    expect(nativeSection).toMatch(
      /restart or interruption[\s\S]*delivery reconcile[\s\S]*prepared[\s\S]*same integration interlock[\s\S]*submitAction[\s\S]*unchanged/iu,
    );
    expect(nativeSection).toMatch(/suffix reconciliation[\s\S]*reservation[\s\S]*land-status/iu);
    expect(nativeSection).toMatch(/terminal `failed`[\s\S]*exact `none-landed`[\s\S]*new\s+interlock/iu);
    expect(nativeSection).toMatch(/partial-landed[\s\S]*stop/iu);
    expect(nativeSection).toMatch(/linked-single[\s\S]*contribution proof[\s\S]*new-head review/iu);
    expect(nativeSection).toMatch(/The terminal\s+member is never included/u);
  });

  it("routes persisted review-fix acknowledgment through the controller only after task closure", async () => {
    const [packaged, installed] = await Promise.all([
      readFile(
        resolve(root, "packages/arc-framework/arc/system/workflows/arc/process-task-loop.template.md"),
        "utf8",
      ),
      readFile(resolve(root, ".arc/system/workflows/arc/process-task-loop.md"), "utf8"),
    ]);

    for (const workflow of [packaged, installed]) {
      expect(workflow).toContain("`review-fix-verification-required`");
      expect(workflow).toContain("selector-free");
      expect(workflow).toContain("invoke its `resumeAction`");
      expect(workflow).not.toContain("arc delivery review-fix acknowledge - --json");
      const closeTask = workflow.indexOf("Mark the task `[x]`");
      const resume = workflow.indexOf("invoke its `resumeAction`", closeTask);
      const renew = workflow.indexOf("Candidate-renewal authority action", resume);
      const hosted = workflow.indexOf("retained hosted-review authority action", renew);
      const completionExtension = workflow.indexOf("#post-task-completion", closeTask);
      expect(closeTask).toBeGreaterThan(-1);
      expect(closeTask).toBeLessThan(resume);
      expect(resume).toBeLessThan(renew);
      expect(renew).toBeLessThan(hosted);
      expect(hosted).toBeLessThan(completionExtension);
      expect(workflow.slice(closeTask, completionExtension)).toMatch(
        /resumeAction[\s\S]*acknowledgment action[\s\S]*Candidate-renewal[\s\S]*unchanged[\s\S]*hosted-review[\s\S]*stops/iu,
      );
    }
  });
});
