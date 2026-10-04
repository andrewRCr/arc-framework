/** Native parsing keeps root operands separate from literal execution values. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { parseFocusedTestInput } from "../../src/lib/focused-test-input.js";

async function inputFixture(): Promise<{ root: string; file: string; directory: string }> {
  const root = await mkdtemp(join(tmpdir(), "arc-focused-input-"));
  const directory = "packages/arc-framework/__tests__/unit";
  const file = `${directory}/literal.test.ts`;
  await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, file), "");
  return { root, file, directory };
}

it("resolves root file and directory operands while retaining native literal values", async () => {
  const { root, file, directory } = await inputFixture();
  try {
    const input = parseFocusedTestInput(root, [file, directory, "-t", "literal path - value", "--project", "unit",
      "--no-isolate", "--pool", "threads", "--no-file-parallelism", "--maxWorkers=50%"]);
    expect(input.packageRoot).toBe(join(root, "packages/arc-framework"));
    expect(input.targets).toEqual([
      { operand: file, path: join(root, file), kind: "file" },
      { operand: directory, path: join(root, directory), kind: "directory" },
    ]);
    expect(input.options).toMatchObject({ testNamePattern: "literal path - value", project: ["unit"], isolate: false,
      pool: "threads", fileParallelism: false, maxWorkers: "50%" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each([
  ["unknown", "--unknown=1"], ["unknown reporter spelling", "--reporters=dot"],
  ["config", "--config=false"], ["config alias", "-c", "false"], ["root alias", "-r", "elsewhere"],
  ["changed", "--changed=main"], ["related", "--related=source.ts"], ["directory override", "--dir=elsewhere"],
  ["include", "--include=x"], ["typecheck", "--typecheck"], ["watch", "--watch=false"],
  ["browser", "--browser"], ["UI", "--ui"], ["missing pool", "--pool"], ["invalid pool", "--pool=wrong"],
  ["missing project", "--project"], ["invalid timeout", "--testTimeout=foo"], ["negative timeout", "--hookTimeout=-1"],
  ["invalid workers", "--maxWorkers=wat"], ["zero workers", "--maxWorkers=0"],
  ["invalid boolean", "--isolate=wat"], ["invalid regular expression", "-t", "["],
  ["extra separator", "--", "missing.test.ts"],
] as const)("rejects %s before native discovery", async (_name, ...flags) => {
  const { root, file } = await inputFixture();
  try { expect(() => parseFocusedTestInput(root, [file, ...flags])).toThrow(/focused|separator/iu); }
  finally { await rm(root, { recursive: true, force: true }); }
});

it.each(["__tests__/unit/literal.test.ts", "packages/arc-framework/src/cli.ts", "../outside.test.ts",
  "packages/arc-framework/__tests__/unit/missing.test.ts", "watch"])("rejects ineligible root operand %s", async (operand) => {
  const { root, file } = await inputFixture();
  try { expect(() => parseFocusedTestInput(root, [file, operand])).toThrow(/target|operand|command/iu); }
  finally { await rm(root, { recursive: true, force: true }); }
});

it("requires at least one explicit root operand", () => {
  expect(() => parseFocusedTestInput(process.cwd(), ["--project", "unit"])).toThrow(/target|operand/iu);
});

it.each(["--no-isolate", "--file-parallelism"])("rejects malformed %s values even when they resemble valid targets", async (flag) => {
  const { root, file } = await inputFixture();
  try { expect(() => parseFocusedTestInput(root, [file, `${flag}=${file}`])).toThrow(/focused/iu); }
  finally { await rm(root, { recursive: true, force: true }); }
});

it("rejects unknown options whose names also exist on ordinary objects", async () => {
  const { root, file } = await inputFixture();
  try { expect(() => parseFocusedTestInput(root, [file, "--toString=x"])).toThrow(/unsupported focused/iu); }
  finally { await rm(root, { recursive: true, force: true }); }
});

it("rejects an unknown long option discarded by the native parser", async () => {
  const { root, file } = await inputFixture();
  try { expect(() => parseFocusedTestInput(root, [file, "--__proto__=x"])).toThrow(/unsupported focused/iu); }
  finally { await rm(root, { recursive: true, force: true }); }
});
