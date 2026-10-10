/** A declared-check program for committing in an independent Git repository. */
export const nestedGitCheckProgram = String.raw`
/** Commit in an independent fixture repository and report the check's Git environment. */
const fs = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const variables = ["GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE", "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE", "GIT_PREFIX", "GIT_SHALLOW_FILE", "GIT_COMMON_DIR"];
const repository = fs.mkdtempSync(path.join(tmpdir(), "arc-check-nested-git-"));
const git = args => execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
try {
  git(["init", "--quiet"]);
  git(["config", "user.name", "Check fixture"]);
  git(["config", "user.email", "check-fixture@example.com"]);
  git(["config", "commit.gpgsign", "false"]);
  git(["config", "core.hooksPath", path.join(repository, "no-hooks")]);
  fs.writeFileSync(path.join(repository, "data.txt"), "nested\n");
  git(["add", "data.txt"]);
  git(["commit", "--quiet", "-m", "nested"]);
  fs.writeFileSync("receipt.json", JSON.stringify({ content: git(["show", "HEAD:data.txt"]).trim(),
    repositoryLocalVariables: variables.filter(variable => process.env[variable] !== undefined) }));
} finally {
  fs.rmSync(repository, { recursive: true, force: true });
}
`;
