/** Every newly introduced verb refuses at the capability boundary with its serving path. */
import { describe, expect, it } from "vitest";
import { runDormantStoreCommand, type DormantStoreCommand } from "../../src/commands/store-command-support.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { inRepoStore } from "../helpers/store/in-repo-ports.js";
import { cohortCloseStep, cohortRemoveStep, errandQueueStep, handoffWriteStep, inboxListStep, routeStep } from "../../src/lib/store/pre-flip-steps.js";

const cases: [DormantStoreCommand, string][] = [
  ["inbox", inboxListStep("personal")], ["route", routeStep()],
  ["locus release", "arc park"], ["errand queue", errandQueueStep("read")],
  ["errand queue set", errandQueueStep("set")], ["handoff write", handoffWriteStep()],
  ["cohort close", cohortCloseStep()], ["cohort remove", cohortRemoveStep()],
];
describe("dormant store command capability boundary", () => {
  it.each(cases)("refuses %s over the in-repo backend", (command, serving) => {
    const store = inRepoStore(createDefaultStorePorts({ checkoutRoot: "/project" }));
    expect(runDormantStoreCommand(command, store)).toMatchObject({ status: "refused", refusal: { code: "unsupported", remedy: { text: expect.stringContaining(serving) } } });
  });
  it.each([
    { list: "personal", target: undefined }, { list: "personal", target: "example" },
    { list: "project", target: undefined }, { list: "example", target: undefined },
  ])("names inbox $list's pre-flip step (target $target)", ({ list, target }) => {
    const store = inRepoStore(createDefaultStorePorts({ checkoutRoot: "/project" }));
    expect(runDormantStoreCommand("inbox", store, { list, ...(target === undefined ? {} : { target }) }))
      .toMatchObject({ refusal: { code: "unsupported", remedy: { text: inboxListStep(list, target) } } });
  });
  it.each(cases)("keeps the %s off-branch arm dormant until its implementation lands", (command, serving) => {
    expect(runDormantStoreCommand(command, createReferenceFixture().store)).toMatchObject({ status: "refused", refusal: { code: "unsupported", remedy: { text: expect.stringContaining(serving) } } });
  });
});
