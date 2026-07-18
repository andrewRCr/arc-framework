/** Public surface for the `arc view` command. */

export { runView, type ViewDependencies } from "./view/run.js";
export {
  VIEW_KINDS,
  type ResolveViewArtifactOptions,
  type RunViewOptions,
  type ViewArtifactResolver,
  type ViewArtifactResult,
  type ViewKind,
  type ViewOutput,
} from "./view/types.js";
