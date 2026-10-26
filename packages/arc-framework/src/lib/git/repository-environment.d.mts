/** Types for the dependency-free Git environment boundary. */

/** Repository selectors removed before a cwd-scoped Git child is launched. */
export const GIT_REPOSITORY_LOCAL_ENVIRONMENT: ReadonlySet<string>;

/** Copy a supplied child environment without repository-local Git selectors. */
export function sanitizeGitRepositoryEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
