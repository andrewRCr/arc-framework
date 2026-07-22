/** Global execute-bound continuation. */

import { describe, expect, it } from "vitest";

import { resolveExecutionNextOffer } from "../../../src/lib/housekeep/execution-offer.js";
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
  }))).content;
}

describe("execute-bound next offer", () => {
  it("selects the stable first sibling with its warm or cold parent", () => {
    expect(resolveExecutionNextOffer({
      content: marked(), completedTitle: null, parentCheckoutPath: "/repo-wu",
    })).toMatchObject({
      kind: "resolved",
      nextOffer: { key: "First", parentCheckoutPath: "/repo-wu" },
    });
  });

  it("refuses a completed subject that remains marked and malformed queue state", () => {
    expect(resolveExecutionNextOffer({
      content: marked(), completedTitle: "First", parentCheckoutPath: null,
    })).toMatchObject({ kind: "refused", reason: expect.stringContaining("remains") });
    expect(resolveExecutionNextOffer({
      content: marked().replace("- _Disposition:_ `execute-bound`", "- _Disposition:_ broken"),
      completedTitle: null, parentCheckoutPath: null,
    })).toMatchObject({ kind: "refused", reason: expect.stringContaining("Malformed") });
  });
});
