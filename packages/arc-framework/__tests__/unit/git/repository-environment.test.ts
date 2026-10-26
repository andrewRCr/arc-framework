import { describe, expect, it } from "vitest";

import { sanitizeGitRepositoryEnvironment } from "../../../src/lib/git/process-executor.js";

const selectors = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE", "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE", "GIT_PREFIX", "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
];

describe("supplied Git child environment", () => {
  it.each(selectors)("removes %s and portable case variants", (name) => {
    const mixed = name.replace(/[A-Z]/gu, (letter, offset: number) => offset % 2 ? letter.toLowerCase() : letter);
    const environment = { [name]: "override", [name.toLowerCase()]: "override", [mixed]: "override", PATH: "/tools" };

    expect(sanitizeGitRepositoryEnvironment(environment)).toEqual({ PATH: "/tools" });
  });

  it("preserves caller state and unrelated ambient, Git and adapter control variables", () => {
    const retained = { PATH: "/tools", HOME: "/home/user", GIT_SSH_COMMAND: "ssh -F config",
      GIT_TERMINAL_PROMPT: "0", GIT_LITERAL_PATHSPECS: "1", GIT_CONFIG_KEY_0: "user.name",
      ARC_CHECK_NOTICE: "/notice", ARC_REMOTE_CHECKS: "required", EMPTY: "", UNSET: undefined };
    const supplied = Object.freeze({ ...retained, GIT_DIR: "/other" });

    const sanitized = sanitizeGitRepositoryEnvironment(supplied);

    expect(sanitized).toEqual(retained);
    expect(supplied).toEqual({ ...retained, GIT_DIR: "/other" });
    expect(sanitized).not.toBe(supplied);
  });
});
