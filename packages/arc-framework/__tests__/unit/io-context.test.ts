import { execPath } from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { gitExec } from "../../src/lib/io-context.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("gitExec", () => {
  it("captures stdout beyond the execFile default buffer", async () => {
    const outputBytes = (1024 * 1024) + 1;

    const result = await gitExec(execPath, [
      "-e",
      `process.stdout.write("x".repeat(${outputBytes}))`,
    ]);

    expect(result.stdout).toHaveLength(outputBytes);
  });

  it("scrubs repository-local Git variables when cwd selects the repository", async () => {
    const localGitVariables = [
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_CONFIG",
      "GIT_CONFIG_PARAMETERS",
      "GIT_CONFIG_COUNT",
      "GIT_OBJECT_DIRECTORY",
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_IMPLICIT_WORK_TREE",
      "GIT_GRAFT_FILE",
      "GIT_INDEX_FILE",
      "GIT_NO_REPLACE_OBJECTS",
      "GIT_REPLACE_REF_BASE",
      "GIT_PREFIX",
      "GIT_SHALLOW_FILE",
      "GIT_COMMON_DIR",
    ];
    for (const variable of localGitVariables) vi.stubEnv(variable, `inherited-${variable}`);
    vi.stubEnv("ARC_TEST_SENTINEL", "preserved");

    const script = [
      `const keys = ${JSON.stringify(localGitVariables)};`,
      "const present = keys.filter((key) => process.env[key] !== undefined);",
      "process.stdout.write(JSON.stringify({ present, sentinel: process.env.ARC_TEST_SENTINEL }));",
    ].join("");
    const result = await gitExec(execPath, ["-e", script], { cwd: process.cwd() });

    expect(JSON.parse(result.stdout)).toEqual({ present: [], sentinel: "preserved" });
  });
});
