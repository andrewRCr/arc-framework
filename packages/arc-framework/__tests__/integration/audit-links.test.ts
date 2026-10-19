/** The repository audit reads named ignored Markdown and uses real Git ignore decisions. */
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const auditUrl = new URL("../../src/scripts/audit-links.ts", import.meta.url).href;
const loader = import.meta.resolve("tsx");
const root = fileURLToPath(new URL("../../../..", import.meta.url));
const temporary: string[] = [];

async function write(directory: string, path: string, content: string) {
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(join(directory, path), content);
}

async function run(directory: string, paths: readonly string[]) {
  const program = `import { auditRepositoryLinks } from ${JSON.stringify(auditUrl)};
    const report = auditRepositoryLinks(process.argv[1], process.argv.slice(2));
    console.log(JSON.stringify(report)); process.exitCode = report.result.pass ? 0 : 1;`;
  try {
    const result = await execute(process.execPath, ["--import", loader, "--input-type=module", "-e", program, directory, ...paths],
      { cwd: directory, env: { ...process.env, FORCE_COLOR: undefined, GIT_TRACE: join(directory, "git-trace.log") } });
    return { code: 0, ...result };
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string };
    return { code: result.code, stdout: result.stdout, stderr: result.stderr };
  }
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("repository link audit", () => {
  it("audits exactly named ignored sources, batches Git decisions, and recovers after correction", async () => {
    const directory = await mkdtemp(join(tmpdir(), "arc-audit-links-"));
    temporary.push(directory);
    await execute("git", ["init", "-q"], { cwd: directory });
    await write(directory, ".gitignore", ".arc/user/*\n");
    await write(directory, ".git/info/exclude", ".arc/active/\n");
    await write(directory, ".arc/user/alice/private.md", "# Private\n");
    await write(directory, ".arc/user/README.md", "# Users\n");
    await write(directory, ".arc/reference/tracked.md", "[users](/.arc/user/README.md)\n");
    await execute("git", ["add", "-f", ".arc/user/README.md", ".arc/reference/tracked.md"], { cwd: directory });
    const source = ".arc/active/current/source [literal].md";
    await write(directory, source, "[private](/.arc/user/alice/private.md)\n[movable](/.arc/active/meta-example.md)\n");
    await write(directory, ".arc/active/current/unchanged.md", "[bad](/missing.md)\n");
    const failed = await run(directory, [source]);
    expect(failed.code).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({ paths: [source], result: { pass: false, diagnostics: [
      `${source}:1:1: link to ignored ARC path -> /.arc/user/alice/private.md`,
      `${source}:2:1: link to movable artifact -> /.arc/active/meta-example.md`,
    ] } });
    const trace = await readFile(join(directory, "git-trace.log"), "utf8");
    expect(trace.match(/check-ignore.*--stdin/g)).toHaveLength(1);
    expect(trace).not.toContain("ls-files");
    await write(directory, source, "[users](/.arc/user/README.md)\n");
    expect(await run(directory, [source])).toMatchObject({ code: 0 });
    const ordinary = await run(directory, []);
    expect(ordinary.code).toBe(0);
    expect(JSON.parse(ordinary.stdout).paths).toEqual([".arc/reference/tracked.md", ".arc/user/README.md"]);
  });

  it("takes literal source operands through the actual script entry", async () => {
    const directory = await mkdtemp(join(root, ".arc/user/link-audit-test-"));
    temporary.push(directory);
    const source = join(directory, "source.md");
    await writeFile(source, "[missing](/no-such-audit-target.md)\n");
    await writeFile(join(directory, "unrequested.md"), "[other](/another-missing-audit-target.md)\n");
    const operand = relative(root, source).split(sep).join("/");
    await expect(execute(process.execPath, ["--import", loader, fileURLToPath(auditUrl), operand], {
      cwd: root, env: { ...process.env, FORCE_COLOR: undefined },
    }))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining(`${operand}:1:1: broken link`) });
  });
});
