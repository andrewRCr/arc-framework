/** Hand-edited entry identities are restored from the base before parsing and sending. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { createWriteBackPort, prepareWriteBack } from "../../../../src/lib/store/projection/write-back.js";

let fixture: Awaited<ReturnType<typeof createWriteBackFixture>> | undefined;
afterEach(async () => { vi.restoreAllMocks(); await fixture?.dispose(); });

function inbox(...entries: string[]): string {
  return `# Inbox\n\n## Errand\n\n${entries.join("\n")}\n## Work Unit\n`;
}

function entry(title: string, body: string, id?: string): string {
  return `### [ ] **${title}**\n${id === undefined ? "" : `- _Id:_ \`${id}\`\n`}\n${body}\n`;
}

describe("restoring hand-edited entry IDs", () => {
  it("restores a deleted ID by its unique base heading before sending", async () => {
    fixture = await createWriteBackFixture({ kind: "personal/inbox", content: inbox(entry("Keep", "before", "aaaaaaaa")) });
    await fixture.edit(inbox(entry("Keep", "edited")));
    const prepared = await prepareWriteBack(fixture.context, fixture.request);
    expect(prepared).toMatchObject({ kind: "ready", write: { content: inbox(entry("Keep", "edited", "aaaaaaaa")) } });
  });

  it("gives a duplicate a fresh repeatable ID so a retry after a landed write keeps one copy", async () => {
    fixture = await createWriteBackFixture({ kind: "personal/inbox", content: inbox(entry("Original", "before", "aaaaaaaa")) });
    await fixture.edit(inbox(entry("Original", "before", "aaaaaaaa"), entry("Accepted copy", "new concern", "aaaaaaaa")));
    const prepared = await prepareWriteBack(fixture.context, fixture.request);
    expect(prepared.kind).toBe("ready");
    if (prepared.kind !== "ready") throw new Error("preparation refused");
    const ids = [...prepared.write.content.matchAll(/- _Id:_ `([0-9a-f]{8})`/gu)].map(match => match[1]);
    expect(ids[0]).toBe("aaaaaaaa");
    expect(new Set(ids).size).toBe(2);
    const repeated = await prepareWriteBack(fixture.context, fixture.request);
    expect(repeated).toMatchObject({ kind: "ready", write: { content: prepared.write.content } });
    const batch = fixture.store.batch.bind(fixture.store);
    vi.spyOn(fixture.store, "batch").mockImplementationOnce(async input => {
      const result = await batch(input);
      if (result.status !== "ok") throw new Error("write refused");
      throw new Error("stopped after landing");
    });
    const port = createWriteBackPort(fixture.context);
    await expect(port(fixture.request)).rejects.toThrow("stopped after landing");
    expect(await port(fixture.request)).toMatchObject({ answer: "taken-in" });
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    if (read.status !== "ok") throw new Error("record unavailable");
    expect([...read.result.content.matchAll(/- _Id:_ `([0-9a-f]{8})`/gu)].map(match => match[1])).toEqual(ids);
    expect(read.result.content.match(/\*\*Accepted copy\*\*/gu)).toHaveLength(1);
  });
});
