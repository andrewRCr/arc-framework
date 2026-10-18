/** Content contracts for shared code-review procedures and their lifecycle dispatches. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { codeReviewSection } from "../helpers/code-review-section.js";
import { indexOfSoftWrappedProse, softWrappedPattern, softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const root = resolve(import.meta.dirname, "../../../..");
const readRepositoryFile = async (path: string): Promise<string> => readFile(resolve(root, path), "utf8");
const readCodeMethod = async (): Promise<string> => readRepositoryFile(
  "packages/arc-framework/arc/system/methods/code-review.md",
);

async function sharedSection(workflow: string, fragment: string): Promise<string> {
  return codeReviewSection(workflow, fragment, await readCodeMethod());
}

function sectionBetween(content: string, start: string, end?: string): string {
  const startIndex = start.startsWith("#")
    ? content.indexOf(start)
    : indexOfSoftWrappedProse(content, start);
  if (startIndex === -1) throw new Error(`missing section start: ${start}`);
  if (end === undefined) return content.slice(startIndex);
  const endIndex = end.startsWith("#")
    ? content.indexOf(end, startIndex + 1)
    : indexOfSoftWrappedProse(content, end, startIndex + 1);
  if (endIndex === -1) throw new Error(`missing section end after "${start}": ${end}`);
  return content.slice(startIndex, endIndex);
}

async function expectProducerBackedResponseOrder(content: string, start: string, end: string): Promise<void> {
  expect(sectionBetween(content, start, end)).toContain("[code-findings-round]");
  const response = (await sharedSection(content, "findings-round")).replace(/\s+/gu, " ");
  const triage = response.indexOf("[review-triage]");
  const gatingPolicy = response.indexOf("proposal.severityGatingPolicy", triage);
  const proposalCall = response.indexOf("arc review respond -", gatingPolicy);
  const report = response.indexOf("payload.dispositionReportText", proposalCall);
  const approval = response.indexOf("complete-set approval", report);
  const approvedCall = response.indexOf("the second call", approval);
  const performance = response.indexOf("[review-response]", approvedCall);
  const replay = response.indexOf("Once the fix is committed");
  const push = response.indexOf("`push-interlock`", replay);
  expect(triage).toBeGreaterThanOrEqual(0);
  expect(gatingPolicy).toBeGreaterThan(triage);
  expect(proposalCall).toBeGreaterThan(gatingPolicy);
  expect(report).toBeGreaterThan(proposalCall);
  expect(approval).toBeGreaterThan(report);
  expect(approvedCall).toBeGreaterThan(approval);
  expect(performance).toBeGreaterThan(approvedCall);
  expect(replay).toBeGreaterThan(performance);
  expect(push).toBeGreaterThan(replay);
}

async function expectPushedDescriptionUpkeep(workflow: string): Promise<string> {
  const round = await sharedSection(workflow, "findings-round");
  const settlement = await sharedSection(workflow, "hosted-settlement");
  const push = round.indexOf("`push-interlock` release");
  expect(push).toBeGreaterThan(round.indexOf("Once the fix is committed"));
  expect(round.lastIndexOf("[hosted-settlement]")).toBeGreaterThan(push);
  const upkeep = settlement.indexOf("load [pull-request-format][pull-request-format]");
  const afterFix = settlement.indexOf("Then settle every `afterFixFindingIds`");
  expect(upkeep).toBeGreaterThan(-1);
  expect(afterFix).toBeGreaterThan(upkeep);
  const description = settlement.slice(upkeep, afterFix).replace(/\s+/gu, " ");
  for (const command of ["git diff --quiet <pinned> HEAD -- <paths>", "git merge-base --is-ancestor <pinned> HEAD"]) {
    expect(description).toContain(command);
  }
  expect(description).toContain("every section and qualifying decision");
  expect(description).toContain("every linked path of a layered design");
  expect(description).toContain("when either test fails");
  expect(description).toContain("With no design link, skip those tests");
  return settlement;
}

describe("shared code-review workflow contracts", () => {
  it("routes frontline and local review through the public advisory command surface", async () => {
    const paths = [
      ["system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md", /targeted[\s\S]*focused[\s\S]*full/iu],
      ["system/workflows/arc/supplemental/run-errand.md", /supplemental[\s\S]*fresh/iu],
    ] as const;
    for (const [path, applicabilityPattern] of paths) {
      const [packaged, project] = await Promise.all([
        readRepositoryFile(`packages/arc-framework/arc/${path}`),
        readRepositoryFile(`.arc/${path}`),
      ]);
      expect(project).toBe(packaged);
      const operation = await sharedSection(packaged, "local-operation");
      const response = await sharedSection(packaged, "findings-round");
      expect(operation).toMatch(softWrappedProse("fresh ready resolution"));
      for (const command of [
        "arc review frontline run -",
        "arc review local prepare -",
        "arc review local attest -",
        "arc review local resume -",
        "arc review respond -",
        "arc review reduce -",
      ]) {
        const home = command === "arc review respond -" ? response
          : /local (?:attest|resume)|review reduce/u.test(command) ? operation : packaged;
        expect(home).toContain(command);
      }
      if (path.includes("prepare-work-unit")) {
        expect(packaged).toContain("`nextAction.command`");
        expect(packaged).toContain("`nextAction.request`");
        expect(packaged).toContain("`nextAction.authorizationRequest`");
        expect(packaged).toContain("`nextAction.resumeCommand`");
        expect(packaged).toMatch(softWrappedPattern(/JSON\s+stdin/iu));
        expect(packaged).toMatch(softWrappedPattern(/offered\s+\/\s+obtain-authorization[\s\S]*Approve\s+\(or\s+redirect\)\?/u));
      } else {
        expect(packaged).toContain("arc review frontline resolve -");
        const frontline = sectionBetween(packaged, "- `ready / run-frontline`", "- `ready / local-prepare`");
        expect(frontline).toMatch(softWrappedPattern(/offered\s+\/\s+obtain-authorization[\s\S]*Approve\s+\(or\s+redirect\)\?/u));
        expect(frontline).toMatch(softWrappedProse("On `offered / bind-source`, surface `payload.frontlineReview.promptText` and diagnostics"));
        expect(frontline).toMatch(softWrappedProse("ask the Owner to select an available source or skip"));
        expect(frontline).toMatch(softWrappedProse("`invocation.sourceId` set to the selected source, preserving `invocation.mode`"));
        expect(frontline).toMatch(softWrappedProse("re-invoke the same request"));
        expect(frontline).toMatch(softWrappedProse("`invocation.mode` set to `force`, preserving any `invocation.sourceId`"));
        expect(frontline).toMatch(softWrappedProse('on decline, replace `invocation` with `{ "mode": "skip" }`'));
        expect(frontline).toMatch(softWrappedProse("Dispatch the returned state again"));
        expect(frontline).toMatch(softWrappedProse("only from `ready / run-frontline`"));
      }
      expect(operation).toMatch(softWrappedPattern(/runtime-owned\s+bindings/iu));
      expect(packaged).toContain("`findings / respond`");
      expect(response).toContain("approvedVerification");
      expect(response).toMatch(softWrappedPattern(/scope\s+never\s+selects\s+fewer\s+checks/iu));
      expect(packaged).toMatch(softWrappedPattern(/review\s+applicability|applicability\s+from\s+the\s+actual\s+delta/u));
      expect(packaged).toMatch(applicabilityPattern);
      expect(operation).toMatch(softWrappedPattern(/command\s+error\s+carries\s+no\s+dispatchable\s+state/iu));
      expect(packaged).not.toMatch(/ReviewOperationStateStore|invalid-request/u);
      expect(packaged).not.toMatch(softWrappedPattern(/review-suspension|promoted\s+watcher|scheduled\s+wakeup/iu));
      expect(packaged).not.toMatch(softWrappedPattern(/project\s+review\s+coordinator|coordinate-pr-review/iu));
    }
  });

  it("settles a verified Candidate fix before Candidate re-root", async () => {
    const path = "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md";
    const [packaged, project] = await Promise.all([
      readRepositoryFile(`packages/arc-framework/arc/${path}`),
      readRepositoryFile(`.arc/${path}`),
    ]);
    expect(project).toBe(packaged);

    const responseSection = sectionBetween(
      packaged,
      "For every durable producer findings action",
      "Proceed only from `candidate-publish-ready`",
    );
    const compactResponse = responseSection.replace(/\s+/gu, " ");
    const round = (await sharedSection(packaged, "findings-round")).replace(/\s+/gu, " ");
    const fixCommit = round.indexOf("Commit the verified fixes atomically");
    const replay = round.indexOf("Once the fix is committed");
    const verifiedResponse = compactResponse.indexOf("The shared committed `verifiedFix` replay");
    const responseCommit = compactResponse.indexOf("Commit its staged Candidate response");
    const candidateReroot = compactResponse.indexOf("rerun Step 1");
    expect(fixCommit).toBeGreaterThanOrEqual(0);
    expect(replay).toBeGreaterThan(fixCommit);
    expect(verifiedResponse).toBeGreaterThanOrEqual(0);
    expect(responseCommit).toBeGreaterThan(verifiedResponse);
    expect(candidateReroot).toBeGreaterThan(responseCommit);
    expect(responseSection).toMatch(
      softWrappedPattern(/candidate-advanced\s+\/\s+continue-review[\s\S]*candidate-current\s+\/\s+continue-review/iu),
    );
  });

  it("keeps convergence projections staged through returned prepublication re-entry", async () => {
    const preparePath = "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md";
    const verifyPath = "system/workflows/arc/work-unit-lifecycle/verify-work-unit.md";
    const [packagedPrepare, projectPrepare, packagedVerify, projectVerify] = await Promise.all([
      readRepositoryFile(`packages/arc-framework/arc/${preparePath}`),
      readRepositoryFile(`.arc/${preparePath}`),
      readRepositoryFile(`packages/arc-framework/arc/${verifyPath}`),
      readRepositoryFile(`.arc/${verifyPath}`),
    ]);
    expect(projectPrepare).toBe(packagedPrepare);
    expect(projectVerify).toBe(packagedVerify);

    const convergence = sectionBetween(
      packagedPrepare,
      "A null `policy` means no lane operation is open",
      "Proceed only from `candidate-publish-ready`",
    );
    expect(convergence).toMatch(/run-convergence-verification[\s\S]*nextAction\.attestArgv/iu);
    expect(convergence).toMatch(softWrappedPattern(/keep\s+(?:every\s+)?projection\s+staged[\s\S]*`candidate-publish-ready`/iu));
    expect(convergence).not.toMatch(softWrappedPattern(/commit\s+(?:the\s+)?convergence/iu));
    expect(packagedVerify).toMatch(softWrappedPattern(/initial\s+Candidate\s+attestation[\s\S]*convergence\s+attestation/iu));
  });

  it("routes Errand review and re-entry through the public command protocol", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(project).toBe(packaged);
    const prePrExemption = packaged.indexOf("arc review planning-grooming resolve -");
    const openedPr = packaged.indexOf("4. **Enter the open PR.**");
    const openedTargetExemption = packaged.indexOf("arc review planning-grooming resolve -", openedPr);
    const finalHead = packaged.indexOf("5. **Settle the final head.**");
    const integrationInterlock = packaged.indexOf("`integration-interlock`", finalHead);
    expect(prePrExemption).toBeGreaterThanOrEqual(0);
    expect(openedTargetExemption).toBeGreaterThan(openedPr);
    expect(finalHead).toBeGreaterThan(openedTargetExemption);
    expect(integrationInterlock).toBeGreaterThan(finalHead);
    expect(packaged).toMatch(softWrappedPattern(/`exempt \/ none`[\s\S]*both\s+review\s+lanes/iu));
    expect(packaged).toMatch(softWrappedPattern(/`review-required \/ continue-review`[\s\S]*ordinary\s+review/iu));
    expect(packaged).toMatch(softWrappedPattern(/`not-eligible \/ continue-review`[\s\S]*ordinary\s+review/iu));
    expect(packaged).toMatch(softWrappedPattern(/caller-owned[^.]*content\s+kind[^.]*surface\s+authority/iu));
    expect(packaged).toMatch(softWrappedPattern(/never\s+infer[^.]*planning-lane/iu));
    expect(packaged).toMatch(softWrappedPattern(/atomic\s+determinacy[\s\S]*routing\s+fact/iu));
    expect(packaged).toMatch(/arc review resolve -[\s\S]*code-findings-round/iu);
    expect(packaged).toMatch(softWrappedPattern(/On\s+interruption[\s\S]*typed\s+`state`\s+\/\s+`nextAction`/iu));
    expect(packaged).not.toMatch(softWrappedPattern(/vehicle-neutral\s+response-state\s+store|review-suspension|promoted\s+watcher/u));
    expect(packaged).toMatch(softWrappedPattern(/merge\s+lane[\s\S]*downstream\s+presentation/u));
    expect(packaged).toMatch(softWrappedPattern(/Never\s+reconstruct\s+review\s+state[\s\S]*invent\s+WU\s+state/iu));
    expect(packaged).toMatch(softWrappedPattern(/head\s+movement[^.]*invalidates[^.]*exemption[^.]*return/iu));
    expect(packaged.slice(finalHead, integrationInterlock)).toMatch(
      softWrappedPattern(/adapter\s+target[^.]*match\s+it/iu),
    );
  });

  it("resolves routing-only grooming exemption before opening a housekeeping PR", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/drain-inbox.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/drain-inbox.md"),
    ]);
    expect(project).toBe(packaged);
    const fullProtection = sectionBetween(packaged, "- **Fully protected**", "- **Partially protected**");
    const exemption = fullProtection.indexOf("arc review planning-grooming resolve -");
    const prCreation = fullProtection.indexOf("arc merge lock resolve -");
    const openedTargetResolution = fullProtection.indexOf(
      "arc review planning-grooming resolve -",
      prCreation,
    );
    const integrationInterlock = fullProtection.indexOf("`integration-interlock`", openedTargetResolution);
    const laneClassification = fullProtection.indexOf(
      "arc review planning-lane <base-sha> <head-sha>",
      integrationInterlock,
    );
    const mergeMethodResolution = fullProtection.indexOf(
      "arc review merge-method resolve",
      laneClassification,
    );
    const lockRelease = fullProtection.indexOf("arc merge lock release -", mergeMethodResolution);
    const autoMerge = indexOfSoftWrappedProse(fullProtection,
      "gh pr merge <pr-number> --auto --<method> --match-head-commit <head-sha>",
      lockRelease,
    );
    expect(exemption).toBeGreaterThanOrEqual(0);
    expect(prCreation).toBeGreaterThan(exemption);
    expect(openedTargetResolution).toBeGreaterThan(prCreation);
    expect(integrationInterlock).toBeGreaterThan(openedTargetResolution);
    expect(laneClassification).toBeGreaterThan(integrationInterlock);
    expect(mergeMethodResolution).toBeGreaterThan(laneClassification);
    expect(lockRelease).toBeGreaterThan(mergeMethodResolution);
    expect(autoMerge).toBeGreaterThan(lockRelease);
    expect(fullProtection).toMatch(/`exempt \/ none`[\s\S]*skip[^.]*review/iu);
    expect(fullProtection).toMatch(/continue-review[\s\S]*reviewed-lane/iu);
    expect(fullProtection).toMatch(softWrappedPattern(/never\s+infer[^.]*planning-lane/iu));
    expect(fullProtection).toMatch(softWrappedPattern(/head\s+movement[^.]*invalidates[^.]*exemption[^.]*return/iu));
    expect(fullProtection).toMatch(
      softWrappedPattern(/after\s+approval[\s\S]*head\s+differs[^.]*return[^.]*adapter[^.]*integration\s+interlock/iu),
    );
    expect(fullProtection.slice(mergeMethodResolution, lockRelease)).toMatch(
      softWrappedPattern(/validated\s+\/\s+use-method[\s\S]*returned\s+`method`[\s\S]*sole/iu),
    );
  });

  it("surfaces exact-head CI failures while a hosted review remains pending", async () => {
    for (const path of [
      "system/workflows/arc/supplemental/run-errand.md",
      "system/workflows/arc/supplemental/deliver-stack.md",
      "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    ]) {
      const [packaged, project] = await Promise.all([
        readRepositoryFile(`packages/arc-framework/arc/${path}`), readRepositoryFile(`.arc/${path}`),
      ]);
      expect(project).toBe(packaged);
      const hosted = await sharedSection(packaged, "hosted-await-and-settlement");
      const hostedAwait = hosted.indexOf("arc review hosted await -");
      const checksAwait = hosted.indexOf("arc review checks await", hostedAwait);
      expect(hostedAwait).toBeGreaterThanOrEqual(0);
      expect(checksAwait).toBeGreaterThan(hostedAwait);
      for (const field of ["--timeout-ms 10000", "--poll-interval-ms 10000", "diagnosticFailures",
        "failureLogs.logs[].path", "failureLogs.failures", "`unavailable / retry`", "`cause`", "`detail`",
        "continueAfterAttention: true"]) expect(hosted).toContain(field);
      expect(hosted).toMatch(softWrappedPattern(/read-only\s+diagnos/iu));
      expect(hosted).toMatch(softWrappedPattern(/inspect-or-extend[\s\S]*diagnostic\s+below,\s+then\s+stop/iu));
      expect(hosted).toMatch(softWrappedPattern(/same\s+hosted\s+action/iu));
      const compact = hosted.replace(/\s+/gu, " ");
      expect(compact).toContain("neither settles review, feeds the driver, moves the head, nor releases the draft lock");
      const lock = hosted.indexOf("nor releases the draft lock");
      expect(lock).toBeGreaterThan(checksAwait);
      const pushRule = hosted.slice(lock, hosted.indexOf("Feed clean", lock)).replace(/\s+/gu, " ");
      expect(pushRule).toContain("Before any head-moving push while the action is pending, conclude hosted await");
      expect(pushRule).toContain("handle its findings so they join that push");
      expect(pushRule).toContain("only explicit Owner direction may push while giving up that result");
    }
  });

  it("continues an Errand hosted await until its typed attention boundary", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(project).toBe(packaged);
    const hosted = (await sharedSection(packaged, "hosted-await-and-settlement")).replace(/\s+/gu, " ");
    expect(hosted).toContain("retains the newly returned `action` unchanged for one more bounded call");
    expect(hosted).toContain("without an agent polling schedule");
    expect(hosted).toContain("Repeat only this typed continuation until `inspect-or-extend` or a terminal outcome");
  });

  it("executes mixed hosted settlement phases in the command-projected order", async () => {
    for (const path of [
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    ]) {
      const workflow = await readRepositoryFile(path);
      const settlement = await sharedSection(workflow, "hosted-settlement");
      expect(settlement).toContain("payload.hostedSettlementPlan.actorIdentity");
      expect(settlement).toMatch(softWrappedPattern(
        /beforeFixFindingIds[\s\S]*before\s+any\s+approved\s+fix\s+changes\s+the\s+head[\s\S]*afterFixFindingIds/iu,
      ));
      expect(settlement).toContain("fixTarget: null");
      expect(settlement).toMatch(softWrappedPattern(
        /not-applicable[\s\S]*no\s+hosted\s+settle,\s+reply,\s+resolution,\s+or\s+compensating\s+summary/iu,
      ));
      expect(settlement).toMatch(softWrappedPattern(
        /already-settled[\s\S]*exact\s+approved\s+reply,\s+actor,\s+comment,\s+and\s+resolved\s+thread\s+with\s+no\s+host\s+mutation/iu,
      ));
    }
  });

  it("publishes the canonical approved-disposition supersession choreography", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/methods/review-response.md"),
      readRepositoryFile(".arc/system/methods/review-response.md"),
    ]);
    expect(project).toBe(packaged);
    expect(packaged).toMatch(softWrappedPattern(/two-call\s+supersession.*proposal\s+call.*approval\s+call/isu));
    expect(packaged).toContain("predecessorDispositionSetId");
    expect(packaged).toContain("expectedFixPaths");
    expect(packaged).toMatch(/carriedFindingIds.*reopenedFindingIds/isu);
    expect(packaged).toMatch(softWrappedPattern(/supersession-refused.*do\s+not\s+edit.*Git-common/isu));
  });

  it("re-enters retained hosted findings without spending a replacement review", async () => {
    const paths = [
      "packages/arc-framework/arc/system/workflows/arc/supplemental/deliver-stack.md",
      "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    ];
    for (const path of paths) {
      const workflow = await readRepositoryFile(path);
      await expectProducerBackedResponseOrder(
        workflow,
        "`respond-to-findings` applies",
        path.includes("deliver-stack") ? "`resolve-review-applicability`" : "`delivery-correction-required",
      );
      expect((await sharedSection(workflow, "findings-round"))).toContain("never reapprove or replay a new producer");
    }
  });

  it("keeps producer-backed response choreography in every default caller", async () => {
    const [prepare, errand] = await Promise.all([
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md",
      ),
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);

    await expectProducerBackedResponseOrder(prepare, "For every durable producer findings action", "Proceed only from");
    await expectProducerBackedResponseOrder(errand, "   - `findings / respond`", "   - `approval-required");
    await expectProducerBackedResponseOrder(errand, "   - `findings / triage`", "   - `rate-limited");
  });

  it("keeps author self-review on the direct non-producer triage path", async () => {
    const [selfReview, verification, method] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/methods/code-review-author.md"),
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md"),
      readCodeMethod(),
    ]);
    expect(selfReview).toContain("code-review.md#author-check");
    expect(selfReview).not.toContain("arc review respond -");
    const author = codeReviewSection(verification, "author-check", method);
    expect(author).toContain("[review-triage]");
    expect(author).toMatch(softWrappedPattern(/standalone\s+non-producer\s+report[\s\S]*complete-set\s+approval/iu));
    expect(author).toContain("Do not invoke the producer-backed response command");
    expect(author).not.toContain("arc review respond -");
    expect(verification).not.toContain("arc review respond -");
  });

  it("routes approved delivery-member fixes through the exact driver-owned authoring locus", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      ),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);
    expect(project).toBe(packaged);
    expect(packaged).toMatch(
      softWrappedPattern(/delivery-correction-required\s+\/\s+continue-delivery-correction[\s\S]*payload\.correctionAction[\s\S]*authoring-required/iu),
    );
    expect(packaged).toMatch(
      /authoring\.checkoutPath[\s\S]*authoring\.ref[\s\S]*authoringAuthorization[\s\S]*resumeAction/iu,
    );
    expect(packaged).toMatch(softWrappedPattern(/ready-to-fix\s+\/\s+apply-fix[\s\S]*ordinary\s+singleton\s+route/iu));
  });

  it("carries an explicit standard-review provider through both review lifecycles", async () => {
    const [prepare, errand, integrate] = await Promise.all([
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md",
      ),
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      ),
    ]);

    expect(prepare).toMatch(/standard\.invocation:\s*\{ mode: "force", sourceId: "<source-id>" \}/u);
    expect(prepare).toMatch(
      softWrappedPattern(/After\s+every\s+lane\s+operation,[\s\S]*typed\s+pre-publication[\s\S]*nextAction\.command[\s\S]*nextAction\.resumeCommand[\s\S]*opaque\s+resume\s+carries\s+judgment/u),
    );
    expect(errand).toMatch(/invocation:\s*\{ mode: "force", sourceId: "<source-id>" \}/u);
    expect(errand).toMatch(softWrappedPattern(/every\s+policy\s+call\s+for\s+that\s+target/u));
    expect(integrate).toMatch(
      softWrappedPattern(/publication-pending\s+\/\s+continue-publication[\s\S]*arc review status --target[\s\S]*complete\s+hosted\s+request\s+action[\s\S]*arc review hosted request -/u),
    );
  });

  it("refreshes ordinary and terminal delivery descriptions before review re-entry", async () => {
    const integration = await readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md");
    expect(integration).toContain("    - pull-request-format");
    const review = sectionBetween(integration, "### 2) Review iteration", "## Phase 2:");
    expect(review).toContain("[code-hosted-settlement]");
    const settlement = await expectPushedDescriptionUpkeep(integration);
    expect(settlement).toMatch(softWrappedProse("terminal request after a delivery-owned pushed correction"));
    const delivery = await readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/deliver-stack.md");
    const correction = sectionBetween(delivery,
      "Before authoring or publishing any approved correction", "### Complete a review-fix verification continuation");
    const upkeepAfterResult = sectionBetween(correction, "After every continuation result", "- `dispatch / dispatch`");
    expect(upkeepAfterResult).toMatch(softWrappedProse("After the approved correction is pushed"));
    expect(upkeepAfterResult).toContain("effectLog");
    expect(upkeepAfterResult).toContain("[code-hosted-settlement]");
    expect(upkeepAfterResult).toContain("terminal request");
    expect(upkeepAfterResult).toMatch(softWrappedProse("canonical delivery bindings"));
    expect(upkeepAfterResult).toContain("published head");
    for (const result of ["review-status-required", "position"]) expect(upkeepAfterResult).toContain(`\`${result}\``);
    const authority = sectionBetween(correction,
      "- `authority-required / dispatch-authority-action`", "- `idle / continue-work-unit`");
    expect(authority).not.toContain("[code-hosted-settlement]");
    expect(settlement).toMatch(softWrappedProse("before its next action"));
  });

  it("refreshes Errand descriptions after pushed fixes and before settlement re-entry", async () => {
    const workflow = await readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md");
    const review = sectionBetween(workflow, "4. **Enter the open PR.**", "5. **Settle the final head.**");
    expect(review).toContain("[code-hosted-settlement]");
    await expectPushedDescriptionUpkeep(workflow);
  });

  it("settles the Errand exact head without importing WU products", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    const full = sectionBetween(packaged, "### Ship — full protection", "### Ship — partial protection");
    expect(full).toContain("arc base drift --json");
    expect(full).toContain("review applicability");
    expect(full).toMatch(/applicability-judgment-required[\s\S]*supplemental[\s\S]*fresh/u);
    expect(full).toMatch(/load \[pull-request-format\]\[pull-request-format\]/iu);
    expect(full).not.toContain("**Local review:**");
    expect(full).toMatch(softWrappedPattern(/`vehicle: errand`[\s\S]*outside\s+WU\s+composition-product\s+requirements/u));
    expect(full).toMatch(softWrappedPattern(/never\s+infer[\s\S]*absent\s+or\s+malformed\s+WU\s+state/iu));
    expect(full).toMatch(softWrappedPattern(/strict\s+Errand\s+record[\s\S]*exact\s+PR/iu));

    const interlock = full.lastIndexOf("`integration-interlock`");
    const terminalMerge = full.lastIndexOf("arc errand merge <slug> - --json");
    expect(interlock).toBeLessThan(terminalMerge);
    const interlockText = full.slice(interlock, terminalMerge);
    const pinnedInterlockText = interlockText.replace(/^>\s?/gmu, "").replace(/\s+/gu, " ");
    expect(pinnedInterlockText).toContain("Surface the request");
    expect(pinnedInterlockText).toContain("proposed final dispositions");
    expect(pinnedInterlockText).toContain("authorizes the exact-head merge");
    expect(pinnedInterlockText).toMatch(/redirect[\s\S]*release-only/iu);
    expect(full).not.toContain("## Review");
    expect(full).not.toMatch(softWrappedPattern(/`Local`,\s+`Hosted PR`,\s+and\s+`Triage`|`Coverage`/u));
    expect(full).not.toMatch(softWrappedProse("authorizes the lane action only if"));
    expect(full).not.toMatch(softWrappedPattern(/changed\s+head[\s\S]*invalidates\s+approval/iu));
    expect(full).not.toContain("gh pr merge");

    const partial = sectionBetween(packaged, "### Ship — partial protection", "### Complete");
    expect(partial).toMatch(softWrappedProse("direct base-branch commit"));
    expect(partial).not.toContain("pre-merge");
    expect(partial).not.toContain("integration-interlock");
  });

  it("carries explicit Errand review-risk acceptance through the protected merge path", async () => {
    const [packaged, project] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md"),
      readRepositoryFile(".arc/system/workflows/arc/supplemental/run-errand.md"),
    ]);
    expect(project).toBe(packaged);

    const review = sectionBetween(packaged, "4. **Enter the open PR.**", "5. **Settle the final head.**");
    const stop = (await sharedSection(packaged, "errand-stop")).replace(/\s+/gu, " ");
    const compactReview = review.replace(/\s+/gu, " ");
    const stopBeforeDispatch = indexOfSoftWrappedProse(review, "stop before source dispatch");
    expect(stopBeforeDispatch).toBeGreaterThan(-1);
    expect(stopBeforeDispatch).toBeLessThan(review.indexOf("`arc review hosted request -`"));
    expect(compactReview).toContain("`ready / local-prepare`");
    expect(compactReview).toContain("Owner-directed review stop (open PR only)");
    expect(compactReview).toContain("arc review status --target <targetRef>");
    expect(stop).toContain("at least one completed same-claim standard-review pass");
    expect(stop).toContain("an authorized fix remains unfinished");
    expect(stop).toContain("`review-required`: this is Owner acceptance");
    expect(stop).toContain("Do not submit a fabricated `clean` attempt, `terminus`, or `ceilingOverride`");
    expect(stop).toContain("obtain it again");
    expect(stop).toContain("A changed claim, PR, or head, or a new finding, voids this decision");
    expect(stop).toContain(
      "A base that alone moved keeps it under the disjoint-drift condition: the accepted base OID is an ancestor of "
        + "the new base OID, and `arc base drift --json` reads the exact accepted head with `movement: disjoint`.",
    );
    expect(stop).toContain("A rewound base or any other drift reading voids it.");
    expect(compactReview).toContain("[code-errand-stop]");
    expect(compactReview).toContain("requires a new exact offer describing the changed delta");
    expect(compactReview).toContain("the exact Owner-directed review stop above is approved");
    expect(compactReview).toContain("An Owner-directed review stop always selects the reviewed-lane");
    const preRequest = sectionBetween(packaged, "Compose the immutable policy target", "3. **Resolve the Errand PR**")
      .replace(/\s+/gu, " ");
    expect(preRequest).toContain(
      "`ready / local-prepare` — if the Owner declined the pass a fix triggers, prepare nothing; continue to Step 3 "
        + "and offer the Owner-directed review stop at the open PR. Otherwise invoke `arc review local prepare -`",
    );

    const triage = (await readRepositoryFile("packages/arc-framework/arc/system/methods/review-triage.md"))
      .replace(/\s+/gu, " ");
    expect(triage).toContain(
      "When the pass line says a fix requires a fix check or complete pass, the recommendation also covers that activity",
    );
    expect(triage).toContain("the line names the fix check or complete pass the fixed head then needs");
    expect(triage).toContain("as spend the approver may decline");
    expect(triage).toContain("confirmed there once before any pass is dispatched");

    const landing = sectionBetween(packaged, "5. **Settle the final head.**", "7. **Leave");
    const compactLanding = landing.replace(/\s+/gu, " ");
    expect(compactLanding).toContain("`review-required` remains expected");
    expect(compactLanding).toContain(
      "A changed coordinate (including the Errand claim), new finding, or unfinished fix returns to Step 4 for a new "
        + "exact offer; a base that alone moved follows Step 4's disjoint-drift condition.",
    );
    expect(compactLanding).toContain("the completion report names the new base OID");
    expect(compactLanding).not.toContain("including base OID");
    expect(compactLanding).toContain(
      "Read `arc review status --target <targetRef>` once for the final head and surface its `hostReview`",
    );
    expect(compactLanding).toContain("neither settled review nor an Owner-directed stop clears it");
    expect(compactLanding).toContain("Inspect the PR's unresolved conversations as well");
    expect(compactLanding).toContain("Owner acceptance never satisfies a required check");
    expect(compactLanding).toContain("obtain separate Owner direction for any dismissal or thread action");
    expect(compactLanding).toContain("pass `errandMergeRequest` unchanged exactly once");
    expect(compactLanding).toContain("arc errand merge <slug> - --json");
  });

  it("covers Errand review outcomes and exact-target re-entry", async () => {
    const packaged = await readRepositoryFile(
      "packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md",
    );
    expect(packaged).not.toContain("arc review changeset resolve");
    const frontline = sectionBetween(
      packaged,
      "Compose the immutable policy target",
      "3. **Resolve the Errand PR**",
    );
    expect(frontline).toMatch(softWrappedPattern(/Errand\s+atomicity[\s\S]*whole-target/iu));
    expect(frontline).toContain("`findings / respond`");
    expect(frontline).toContain("[code-findings-round]");
    const round = await sharedSection(packaged, "findings-round");
    expect(round).toContain("arc review respond -");
    expect(round).toContain("the caller's review-fix quality request");
    expect(frontline).toContain("Findings rounds use `arc check increment`");
    expect(round).toMatch(softWrappedPattern(/quality\s+request[\s\S]*actual\s+new\s+target/iu));
    expect(frontline).not.toContain("`chunk-pending / continue-chunks`");
    expect(frontline).toMatch(/`stale-target \/ select-scope`[\s\S]*recompose[\s\S]*whole-target/iu);
    expect(frontline).toContain("`blocked | unavailable | invalid-override / stop`");
    expect(round).toMatch(softWrappedPattern(/complete\s+no-action\s+record-only\s+set[\s\S]*approval\s+for\s+its\s+exact\s+target/iu));

    const openPr = sectionBetween(
      packaged,
      "4. **Enter the open PR.**",
      "5. **Settle the final head.**",
    );
    expect(openPr).toMatch(softWrappedPattern(/opened\s+target[\s\S]*whole-target/iu));
    expect(openPr).toMatch(softWrappedPattern(/rate-limited\s+\|\s+transient-unavailable\s+\/\s+try-next-source/iu));
    expect(openPr).toMatch(softWrappedPattern(/ambiguous\s+delivery[\s\S]*terminal\s+failure\s+stops/iu));
    expect(openPr).toMatch(softWrappedPattern(/target\s+movement[\s\S]*routed\s+review\s+action[\s\S]*typed\s+continuation/iu));
    expect(openPr).toMatch(softWrappedPattern(/On\s+interruption[\s\S]*typed\s+`state`\s+\/\s+`nextAction`/iu));
    expect(openPr).not.toMatch(softWrappedPattern(/review-suspension|promoted\s+watcher|bounded\s+schedule/u));

  });

});
