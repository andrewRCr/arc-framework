/** Parsed project declarations reject duplicate keys before schema validation. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readTypedProjectFile } from "../../../../src/lib/config/typed-file-reader.js";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";

it.each([
  'checks:\n  test: {command: [npm, test]}\n  test: {command: [npm, test]}\n',
  '{"checks":{"test":{"command":["npm","test"]},"test":{"command":["npm","test"]}}}',
])("refuses duplicate ids in structured input %s", async (content) => {
  const root = await mkdtemp(join(tmpdir(), "arc-check-declaration-"));
  try {
    await mkdir(join(root, ".arc/system"), { recursive: true });
    await writeFile(join(root, ".arc/system/arc-checks.yml"), content);
    const result = await readTypedProjectFile(root, "check-declaration", CheckDeclarationSchema);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.message).toContain("duplicated mapping key");
  } finally { await rm(root, { recursive: true, force: true }); }
});
