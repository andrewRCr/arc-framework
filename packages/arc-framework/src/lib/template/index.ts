/**
 * Template domain — rendering, recipe evaluation, file operations.
 *
 * @module
 */

export { renderTokens, renderConditionals, renderConfigOverrides } from "./render.js";

export {
  validateRecipe,
  evaluateCondition,
  getInitTokenNames,
  findResidualInitTokens,
  type RecipeValidationResult,
} from "./recipe.js";

export {
  ensureDir,
  copyWithRendering,
  appendToGitignore,
  writeArcGitignoreBlock,
  appendToGitattributes,
  type MkdirFn,
  type ReadFileFn,
  type WriteFileFn,
} from "./files.js";
