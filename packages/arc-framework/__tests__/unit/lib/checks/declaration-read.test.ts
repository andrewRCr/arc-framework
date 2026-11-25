/** Parsed project declarations reject duplicate keys before schema validation. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readTypedProjectFile } from "../../../../src/lib/config/typed-file-reader.js";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";

it("reads portable runner inputs and accepts repaired reserved-binding declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-input-declaration-"));
  const supported = "checks:\n  verify:\n    command: [verify]\n    runner: true\n    environment_inputs:\n      CHECK_MODE: value\n      CHECK_FILE: file\n";
  try {
    await mkdir(join(root, ".arc/system"), { recursive: true });
    const path = join(root, ".arc/system/arc-checks.yml");
    await writeFile(path, supported);
    expect(await readTypedProjectFile(root, "check-declaration", CheckDeclarationSchema)).toMatchObject({
      status: "valid", value: { checks: { verify: { runner: true, environment_inputs: { CHECK_MODE: "value", CHECK_FILE: "file" } } } },
    });
    await writeFile(path, supported + "      GIT_DIR: file\n");
    const refused = await readTypedProjectFile(root, "check-declaration", CheckDeclarationSchema);
    expect(refused.status).toBe("invalid");
    if (refused.status !== "invalid") throw new Error("Expected reserved binding refusal");
    expect(refused.message).toMatch(/GIT_DIR.*remove.*retry/su);
    await writeFile(path, supported);
    expect(await readTypedProjectFile(root, "check-declaration", CheckDeclarationSchema)).toMatchObject({ status: "valid" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

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
