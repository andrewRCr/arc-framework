/** Shared command-input declarations, acquisition, and interaction contracts. */

export {
  AcquisitionClassSchema,
  CancellationBehaviorSchema,
  CommandInputDeclarationError,
  CommandInputDeclarationSchema,
  CommandInputSiteSchema,
  CommandInputSourceSchema,
  NoInputBehaviorSchema,
  SchemaOwnershipSchema,
  SubprocessPolicySchema,
  declarePromptSite,
  defineCommandInputDeclaration,
  defineCommandInputDeclarations,
  type PromptForm,
  type PromptSite,
  type AcquisitionClass,
  type CommandInputDeclaration,
  type CommandInputDeclarationErrorCode,
} from "./declaration.js";
export {
  scanCommanderSource,
  scanCommandInputSources,
  scanInteractionSource,
  type CommandInputSourceInventory,
  type CommanderSourceScan,
  type DiscoveredAction,
  type DiscoveredCommand,
  type DiscoveredInteractionKind,
  type DiscoveredInteractionSite,
  type DiscoveredOperand,
  type DiscoveredOption,
  type DiscoveredSourceLocus,
  type InteractionSourceScan,
} from "./source-scanner.js";
export {
  CommandInputInventoryError,
  reconcileCommandInputInventory,
  type CommandInputInventory,
  type CommandInputInventoryEntry,
  type CommandInputInventoryErrorCode,
} from "./inventory.js";
export {
  resolveInteractionContext,
  resolveCommandInteractionContext,
  resolveProcessInteractionContext,
  withInteractionContext,
  type CommandInteractionPolicy,
  type InteractionContext,
  type InteractionCommand,
  type InteractionSignals,
  type PromptStreams,
  type YesSignal,
} from "./interaction-context.js";
export {
  CommandInputError,
  acquireInputValue,
  adaptCommandInputError,
  collectMissingRequirements,
  resolveConfirmation,
  resolveInputValue,
  resolvePromptInput,
  type CommandInputErrorCode,
  type ConfirmationKind,
  type InputCandidate,
  type InputIssue,
  type InputRequirement,
  type InputResolution,
  type InputSource,
} from "./resolution.js";
export {
  commandInputSchemaId,
  createCommandInputRegistry,
  parseCommandInput,
  type CommandInputRegistration,
  type CommandInputRegistry,
} from "./registry.js";
export {
  acquirePromptInput,
  presentWithInteraction,
} from "./capabilities.js";
export { normalizeCommandIdentity } from "./identity.js";
