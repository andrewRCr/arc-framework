/** Exact dispatch sibling continuation. */

import { describe, expect, it } from "vitest";

import { resolveDispatchNextOffer } from "../../../src/lib/housekeep/dispatch-offer.js";
import { inboxEntrySourceDigest, mutateInboxEntries } from "../../../src/lib/user-sync/inbox-writer.js";

const inbox = `# User Inbox

## Errand

### \`[ ]\` **First**

- _Observation:_ first.

### \`[ ]\` **Second**

- _Observation:_ second.
`;

function marked(): string {
  return mutateInboxEntries(inbox, ["First", "Second"].map((title) => ({
    kind: "mark" as const,
    title,
    sourceDigest: inboxEntrySourceDigest(inbox, title),
    dispatchId: "dispatch-7",
  }))).content;
}

describe("dispatch next offer", () => {
  it("selects the stable first sibling with its warm or cold parent", () => {
    expect(resolveDispatchNextOffer({
      content: marked(), dispatchId: "dispatch-7", completedTitle: null, parentCheckoutPath: "/repo-wu",
    })).toMatchObject({
      kind: "resolved",
      nextOffer: { key: "First", dispatchId: "dispatch-7", parentCheckoutPath: "/repo-wu" },
    });
    expect(resolveDispatchNextOffer({
      content: marked(), dispatchId: "dispatch-8", completedTitle: null, parentCheckoutPath: null,
    })).toEqual({ kind: "resolved", nextOffer: null });
  });

  it("refuses a completed subject that remains bound and malformed group state", () => {
    expect(resolveDispatchNextOffer({
      content: marked(), dispatchId: "dispatch-7", completedTitle: "First", parentCheckoutPath: null,
    })).toMatchObject({ kind: "refused", reason: expect.stringContaining("remains") });
    expect(resolveDispatchNextOffer({
      content: marked().replace("- _Dispatch:_ `dispatch-7`", "- _Dispatch:_ broken"),
      dispatchId: "dispatch-7", completedTitle: null, parentCheckoutPath: null,
    })).toMatchObject({ kind: "refused", reason: expect.stringContaining("Malformed") });
  });
});
