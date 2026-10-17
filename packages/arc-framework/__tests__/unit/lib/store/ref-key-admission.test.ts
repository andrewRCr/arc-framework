import { describe, expect, it } from "vitest";
import { createPreflightRefStore } from "../../../helpers/store/ref-preflight.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";

const provenance = { verb: "merge", lifecycleAction: "test" };
const put = (reference: ReturnType<typeof RecordReferenceSchema.parse>) => ({ action: "put" as const, reference, content: "{}", expected: null });
const check = (reference: ReturnType<typeof RecordReferenceSchema.parse>) => createPreflightRefStore().write({ ...put(reference), provenance });

const uid = "00000000-0000-4000-8000-000000000001";
const companion = (key: string, resolved = true) => RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha", ...(resolved ? { uid } : {}) }, kind: "work-item/companion", key });
const document = (key: string) => RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key });

describe("ref key admission before I/O", () => {
  it("checks conflict-resolution coordinates before consulting a port", async () => {
    const reference = document("scratch/one.md");
    const conflict = RecordReferenceSchema.parse({ owner: reference.owner, kind: "personal/conflict-record", key: "bad/path" });
    expect(await createPreflightRefStore().write({ ...put(reference), resolves: [conflict], provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference: conflict } });
  });
  it("refuses reserved and malformed history coordinates before consulting a port", async () => {
    for (const [reference, code] of [[companion("meta"), "unsupported"], [document(".internal/request.json"), "record-malformed"]] as const) {
      const refusal = code === "unsupported" ? { code, case: "unhomed-kind" } : { code, reference };
      expect(await createPreflightRefStore().history({ reference })).toMatchObject({ status: "refused", refusal });
    }
  });
  it("reserves role names and stored coordinates before consulting a port", async () => {
    for (const resolved of [false, true]) {
      for (const key of ["meta", "tasks", "draft", "spec", "notes", "errand", "inbound", "cohort",
        "spec-alpha-prd.md", "spec-alpha-rfc.md", "meta-other.md", "review/unknown.json", "conflicts/unknown.md", "receipts/unknown.md"]) {
        expect(await check(companion(key, resolved)), key).toMatchObject({ status: "refused", refusal: { code: "unsupported", class: "terminal", case: "unhomed-kind" } });
      }
    }
    for (const key of [`metadata-${uid}.json`, `state-${uid}/capture.json`]) {
      expect(await check(companion(key)), key).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
    }
    for (const key of ["USER-INBOX.md", "WORKING-MEMORY.md", "errand-queue-andrew.md", "work/SESSION-NOTES.md",
      "metadata-andrew.json", "state-andrew/capture.json", "conflicts", "receipts", "conflicts/x.md", "receipts/x.md"]) {
      expect(await check(document(key)), key).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
    }
  });
  it("reports malformed control keys, multi-segment IDs, and excluded personal paths before consulting a port", async () => {
    const references = [document("STATUS.USER.md"), document(".internal/notes.md"), document("work/.internal/notes.md"), document("scratch/bad\n.md")];
    for (const value of ["a/b", "a\0b", "a\nb", "a\u007fb", "a\u0085b"]) {
      for (const kind of ["review/evidence", "review/adversarial-pass"] as const) {
        references.push(RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind,
          key: kind === "review/adversarial-pass" ? { activity: value, number: 1 } : value }));
      }
    }
    for (const reference of references) {
      expect(await check(reference)).toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference } });
    }
  });
  it("refuses file/folder collisions in either batch order before consulting a port", async () => {
    const session = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/session-context", key: "work" });
    for (const writes of [[put(document("scratch/item")), put(document("scratch/item/child.md"))], [put(document("work")), put(session)]]) {
      for (const batch of [writes, [...writes].reverse()]) {
        expect(await createPreflightRefStore().batch({ writes: batch, provenance })).toMatchObject({ status: "refused", refusal: {
          code: "unsupported", case: "unhomed-kind", condition: expect.stringContaining("personal/") } });
      }
    }
  });
});
