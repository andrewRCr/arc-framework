import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { runCli } from "../helpers/run-cli.js";

const run = promisify(execFile);

describe("planning-lane ownership application", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
  });

  it("applies the guarded exception through the packaged CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-planning-lane-ownership-"));
    roots.push(root);
    const gh = join(root, "gh");
    const ownership = join(root, "CODEOWNERS");
    await run("git", ["init", "-q"], { cwd: root });
    await writeFile(gh, [
      "#!/bin/sh",
      "set -eu",
      "case \"$2\" in",
      "  repos/example/project/branches/main/protection)",
      "    printf '%s\\n' '{\"required_status_checks\":{\"strict\":true,\"contexts\":[\"arc-cleared\"]}}' ;;",
      "  repos/example/project/rules/branches/main?per_page=100)",
      "    printf '%s\\n' '[]' ;;",
      "  *) printf 'unexpected gh invocation: %s\\n' \"$*\" >&2; exit 2 ;;",
      "esac",
      "",
    ].join("\n"), "utf8");
    await chmod(gh, 0o755);
    await writeFile(ownership, "* @reviewers\n/.arc/active/spec-*.md\n", "utf8");

    const result = await runCli([
      "review",
      "planning-lane-ownership",
      "example/project",
      "main",
      "arc-cleared",
      ownership,
      "--apply",
    ], {
      cwd: root,
      env: { PATH: `${root}:${process.env.PATH ?? ""}` },
    });

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(JSON.parse(result.stdout)).toMatchObject({
      eligible: true,
      application: { state: "applied", ownershipFile: ownership },
    });
    await expect(readFile(ownership, "utf8")).resolves.toBe(
      "* @reviewers\n/.arc/active/spec-*.md\n"
        + "/.arc/system/.internal/retirement-receipts/*.json\n",
    );
  });
});
