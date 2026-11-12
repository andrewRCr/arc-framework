import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createKernelRegistry } from "../../../src/lib/kernel/index.js";
import { editorDocumentReference } from "../../../src/lib/schema-command/editor-documents.js";

function registry() {
  const result = createKernelRegistry();
  result.register(z.strictObject({ count: z.number(), $schema: z.string().optional() }), {
    id: "editor", version: 1, migrationPosture: "strict-current", authored: "editor-document",
  });
  return result;
}

describe("project-file editor document references", () => {
  it.each(["yaml", "yml"])("composes a %s modeline beside ARC configuration", (extension) => {
    expect(editorDocumentReference("editor", `.arc/system/declaration.${extension}`, registry())).toEqual({
      status: "found", reference: "# yaml-language-server: $schema=./.internal/schemas/editor.schema.json",
    });
  });

  it("composes a JSON schema value relative to another directory", () => {
    expect(editorDocumentReference("editor", "config/input.json", registry())).toEqual({
      status: "found", reference: "../.arc/system/.internal/schemas/editor.schema.json",
    });
  });

  it("prefixes a root-relative JSON reference with dot-slash", () => {
    expect(editorDocumentReference("editor", "input.json", registry())).toEqual({
      status: "found", reference: "./.arc/system/.internal/schemas/editor.schema.json",
    });
  });

  it.each(["slug", "missing"])("classifies unmarked identity %s before considering its file type", (id) => {
    expect(editorDocumentReference(id, "input.txt", registry())).toEqual({ status: "not-an-editor-document" });
  });

  it("classifies unsupported file types for a marked identity", () => {
    expect(editorDocumentReference("editor", "input.toml", registry())).toEqual({ status: "unsupported-file" });
  });
});
