/** Every newly introduced verb refuses at the capability boundary with its serving path. */
import { describe, expect, it } from "vitest";
import { runDormantStoreCommand, type DormantStoreCommand } from "../../src/commands/store-command-support.js";
import { createStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";

const cases: [DormantStoreCommand, string][] = [
  ["inbox", "arc user inbox-list --target"], ["route", "Binding: carrying out outcomes"],
  ["locus release", "arc park"], ["errand queue", "arc user inbox-mark-execute-bound"],
  ["errand queue set", "arc user inbox-mark-execute-bound"], ["handoff write", "SESSION-NOTES"],
];
describe("dormant store command capability boundary", () => {
  it.each(cases)("refuses %s over the in-repo backend", (command, serving) => {
    const store = createStore(createDefaultStorePorts({ checkoutRoot: "/project" }));
    expect(runDormantStoreCommand(command, store)).toMatchObject({ status: "refused", refusal: { code: "unsupported", remedy: { text: expect.stringContaining(serving) } } });
  });
  it.each(cases)("keeps the %s off-branch arm dormant until its implementation lands", (command, serving) => {
    expect(runDormantStoreCommand(command, createReferenceFixture().store)).toMatchObject({ status: "refused", refusal: { code: "unsupported", remedy: { text: expect.stringContaining(serving) } } });
  });
});
