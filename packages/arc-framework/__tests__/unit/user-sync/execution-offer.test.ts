/** Global execute-bound continuation. */

import { describe, expect, it } from "vitest";

import {
  resolveExecutionNextOffer,
  resolveExecutionStartupOffer,
} from "../../../src/lib/user-sync/execution-offer.js";
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
  it("selects a readable startup offer while retaining sibling diagnostics", () => {
    const corrupted = marked().replace("### `[ ]` **First**", "### `[ ]` First");

    expect(resolveExecutionStartupOffer({
      content: corrupted,
      parentCheckoutPath: null,
    })).toMatchObject({
      kind: "resolved",
      nextOffer: { key: "Second", parentCheckoutPath: null },
      warnings: [expect.stringContaining("Malformed USER-INBOX entry heading")],
    });
  });

  it("returns no offer for an empty execute-bound queue", () => {
    expect(resolveExecutionNextOffer({
      content: inbox,
      completedTitle: null,
      parentCheckoutPath: "/repo-wu",
    })).toEqual({ kind: "resolved", nextOffer: null });
  });

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
