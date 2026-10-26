/** Dependency-free Git repository scoping for native source entry points and bundled processes. */

/** Repository selectors removed before a cwd-scoped Git child is launched. */
export const GIT_REPOSITORY_LOCAL_ENVIRONMENT = new Set([
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
]);

/**
 * Copy a supplied child environment without repository-local Git selectors.
 * @param {Record<string, string | undefined>} environment
 * @returns {Record<string, string | undefined>}
 */
export function sanitizeGitRepositoryEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment)
    .filter(([variable]) => !GIT_REPOSITORY_LOCAL_ENVIRONMENT.has(variable.toUpperCase())));
}
