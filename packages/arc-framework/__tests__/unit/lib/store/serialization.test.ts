import { describe, expect, it } from "vitest";
import { checkSerializationRules, RecordReferenceSchema } from "../../../../src/lib/store/index.js";

const document = (key = "notes.md") => RecordReferenceSchema.parse({ owner: { type: "person", name: "test-user" }, kind: "personal/document", key });

describe("record serialization admission", () => {
  it("uses Git's first 8000 bytes for binary admission, including multibyte text", () => {
    const reference = document();
    for (const content of ["\0text", `${"a".repeat(7_999)}\0`, `${"😀".repeat(1_999)}\0`]) {
      expect(checkSerializationRules(reference, content)).toMatchObject({ code: "record-malformed", reference,
        rule: "store.text-only", condition: expect.any(String), remedy: { text: expect.any(String) } });
    }
    expect(checkSerializationRules(reference, `${"a".repeat(8_000)}\0`)).toBeUndefined();
    expect(checkSerializationRules(reference, `${"😀".repeat(2_000)}\0`)).toBeUndefined();
  });
  it("caps projected UTF-8 bytes while admitting large machine records", () => {
    expect(checkSerializationRules(document(), "é".repeat(524_289))).toMatchObject({ rule: "store.size-cap" });
    expect(checkSerializationRules(document(), "é".repeat(524_288))).toBeUndefined();
    const candidate = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "large" }, kind: "review/candidate" });
    expect(checkSerializationRules(candidate, JSON.stringify({ value: "x".repeat(1_048_577) }))).toBeUndefined();
    expect(checkSerializationRules(document(), `\0${"x".repeat(1_048_577)}`)).toMatchObject({ rule: "store.text-only" });
  });
  it("checks the last personal path segment for environment files, preserving the example exception", () => {
    for (const name of [".env", "x.env", ".env.local", ".ENV", "X.ENV", ".Env.Local"]) {
      expect(checkSerializationRules(document(`scratch/${name}`), "text")).toMatchObject({ rule: "store.env-file" });
    }
    for (const key of [".env.example", "scratch/.ENV.EXAMPLE", ".env.local/notes.md", "notes.env.md"]) {
      expect(checkSerializationRules(document(key), "text")).toBeUndefined();
    }
    expect(checkSerializationRules(document(".env"), "x".repeat(1_048_577))).toMatchObject({ rule: "store.size-cap" });
  });
  it("refuses matching private-key blocks and private-key document basenames", () => {
    for (const label of ["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY", "OPENSSH PRIVATE KEY", "ENCRYPTED PRIVATE KEY"]) {
      const content = `intro\r\n-----BEGIN ${label}-----\r\nsensitive\r\n-----END ${label}-----\r\noutro`;
      const refusal = checkSerializationRules(document(), content);
      expect(refusal).toMatchObject({ rule: "store.private-key" });
      expect(JSON.stringify(refusal)).not.toContain("sensitive");
    }
    for (const name of ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]) {
      expect(checkSerializationRules(document(`scratch/${name}`), "text")).toMatchObject({ rule: "store.private-key" });
    }
    for (const content of ["-----BEGIN RSA PRIVATE KEY-----\ntext", "-----BEGIN RSA PRIVATE KEY-----\n-----END EC PRIVATE KEY-----",
      "prefix -----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY----- suffix"]) {
      expect(checkSerializationRules(document(), content)).toBeUndefined();
    }
    expect(checkSerializationRules(document("id_rsa.pub"), "text")).toBeUndefined();
    expect(checkSerializationRules(document(".env"), "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----"))
      .toMatchObject({ rule: "store.env-file" });
  });
  it("rejects Git-special stored segments at every depth without broadening its filesystem predicates", () => {
    const reserved = [".git", ".GIT", ".git.", "GIT~1", ".git . .", ".git:stream", "git~1::$INDEX_ALLOCATION",
      ".g\u200cit", "\ufeff.git", ".git\u206f", ".gitmodules", "GITMOD~1", "gitmod~4. ", ".gitmodules:x",
      ".gitmo\u202adules", ".gitattributes", ".GitAttributes", "GITATT~1", "gitatt~4", ".gitattributes. :x",
      ".gitattribu\u200ftes", "gi7eba~1", "GI7D29~9", "gi7eb~12", "g~123456", "~1234567"];
    for (const segment of reserved) {
      for (const key of [segment, `scratch/${segment}`, `scratch/${segment}/file.md`]) {
        expect(checkSerializationRules(document(key), "text"), key).toMatchObject({ rule: "store.git-path" });
      }
    }
    for (const segment of ["notes.git", ".github", ".gitignore", "git~2", "gitmod~5", "gitatt~0", "gi7eba~0",
      "gi7eba~12", "gi7d2x~1", ".g\u200cit.", ".git\u200b", ".gitmodules.md"]) {
      expect(checkSerializationRules(document(`scratch/${segment}/notes.md`), "text"), segment).toBeUndefined();
    }
  });
  it("bounds expanded components and owner/key bytes, exempting the whole personal path key", () => {
    expect(checkSerializationRules(document(`scratch/${"é".repeat(2_048)}x`), "text")).toMatchObject({ rule: "store.git-path" });
    expect(checkSerializationRules(document(`scratch/${"é".repeat(2_048)}/${"b".repeat(4_096)}`), "text")).toBeUndefined();
    for (const length of [2_040, 2_041]) {
      const owner = { type: "work-item", name: "a".repeat(length) };
      const slug = RecordReferenceSchema.parse({ owner, kind: "work-item/spec" });
      const id = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "work" }, kind: "review/evidence", key: "a".repeat(length) });
      const pass = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "work" }, kind: "review/adversarial-pass", key: { activity: "é".repeat(length / 2) + (length % 2 ? "a" : ""), number: 1 } });
      for (const reference of [slug, id, pass]) {
        const result = checkSerializationRules(reference, reference.kind === "work-item/spec" ? "text" : "{}");
        if (length === 2_041) expect(result).toMatchObject({ rule: "store.git-path", reference });
        else expect(result).toBeUndefined();
      }
    }
    const unhomed = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "constitution/prose", key: "notes" });
    expect(checkSerializationRules(unhomed, "text")).toBeUndefined();
  });
  it("requires canonicalizable JSON for machine records, including scalar strings and object keys", () => {
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "work" }, kind: "review/candidate" });
    for (const content of ["text", '"\\ud800"', '{"\\udc00":"value"}', '{"é":1,"e\\u0301":2}', "1e999"]) {
      expect(checkSerializationRules(reference, content), content).toMatchObject({ rule: "store.json", reference });
    }
    for (const content of [' { "b": 2, "a": "e\\u0301" }\n', '"\\ud83d\\ude00"', "null", "[1,true]"]) {
      expect(checkSerializationRules(reference, content)).toBeUndefined();
    }
    expect(checkSerializationRules(document(), "ordinary prose")).toBeUndefined();
    const unsafe = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "work" }, kind: "review/evidence", key: "x".repeat(2_041) });
    expect(checkSerializationRules(unsafe, "text")).toMatchObject({ rule: "store.git-path" });
  });
});
