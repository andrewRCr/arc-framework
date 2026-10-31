import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import {
  readTreeMetas,
  type V3RepositoryPlanTree,
} from "../../../src/lib/work-unit/decompose-v3-repository-tree.js";

const encoder = new TextEncoder();

function blob(text: string): V3RepositoryPlanTree[string] {
  return { kind: "object", objectKind: "blob", mode: "100644", bytes: encoder.encode(text) };
}

describe("readTreeMetas", () => {
  it("reads metadata by its own file name, never by a meta-prefixed work-unit directory", () => {
    const directory = ".arc/backlog/provisional/meta-staging";
    const tree: V3RepositoryPlanTree = {
      [`${directory}/draft-meta-staging.md`]: blob("# Draft: Meta Staging\n\n- **Origin:** [internal]\n"),
      [`${directory}/meta-meta-staging.md`]: blob(renderMetaFile("meta-staging", {
        state: "Planning",
        owner: "andrew",
        branch: null,
        design: ["draft-meta-staging.md"],
        dependsOn: [],
      })),
    };

    expect(readTreeMetas(tree)?.map(({ slug, path }) => ({ slug, path }))).toEqual([
      { slug: "meta-staging", path: `${directory}/meta-meta-staging.md` },
    ]);
  });
});
