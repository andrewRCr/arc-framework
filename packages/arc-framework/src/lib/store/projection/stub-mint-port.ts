/** A projection's request to the ordinary stub command path and its exact creation receipt. */
import type { Store } from "../contract.js";
import type { WriteResult } from "../write.js";
import type { StubParameterVerdict } from "../../work-unit/verbs/stub-parameters.js";
import type { RefusedMark } from "./index-schema.js";

/** Parameters already admitted by the shared pure stub validator. */
export type ProjectionStubParameters = Extract<StubParameterVerdict, { status: "valid" }>["params"];
/** Bind minting to the engine's Store, including its command-scoped wrappers. */
export interface ProjectionStubMintRequest { readonly store: Store; readonly checkout: string; readonly params: ProjectionStubParameters }
/** Only an actual returned primary write proves which generation was created. */
export type ProjectionStubMintResult = { readonly kind: "created"; readonly receipt: WriteResult }
  | { readonly kind: "refused"; readonly mark: RefusedMark };
/** Handler-layer composition, without importing command adapters into the projection engine. */
export type ProjectionStubMintPort = (request: ProjectionStubMintRequest) => Promise<ProjectionStubMintResult>;
