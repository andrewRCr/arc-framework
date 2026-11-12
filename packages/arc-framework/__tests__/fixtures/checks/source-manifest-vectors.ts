/** Canonical manifest vectors covering literal escaping, UTF-8 order and unborn coordinates. */
import type { SourceManifest } from "../../../src/lib/checks/runner/contract-source.js";

interface SourceManifestVector { name: string; input: SourceManifest; encoding: string; digest: `sha256:${string}` }
export const sourceManifestVectors: SourceManifestVector[] = [
  {
    "name": "unicode",
    "input": {
      "entries": [
        {
          "bytes": 1,
          "digest": "sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
          "mode": 493,
          "kind": "file",
          "path": "𐀀"
        },
        {
          "bytes": 2,
          "digest": "sha256:06eb7d6a69ee19e5fbdf749018d3d2abfa04bcbd1365db312eb86dc7169389b8",
          "mode": 420,
          "kind": "file",
          "path": ""
        },
        {
          "bytes": 0,
          "digest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "mode": 384,
          "kind": "file",
          "path": "quote\"\\é\nname"
        },
        {
          "target": "../",
          "kind": "symlink",
          "path": "links/current"
        }
      ],
      "coordinates": {
        "merged": [
          "5555555555555555555555555555555555555555",
          "4444444444444444444444444444444444444444"
        ],
        "base": "3333333333333333333333333333333333333333",
        "head": "2222222222222222222222222222222222222222",
        "tree": "1111111111111111111111111111111111111111"
      },
      "version": 1
    },
    "encoding": "{\"version\":1,\"coordinates\":{\"tree\":\"1111111111111111111111111111111111111111\",\"head\":\"2222222222222222222222222222222222222222\",\"base\":\"3333333333333333333333333333333333333333\",\"merged\":[\"5555555555555555555555555555555555555555\",\"4444444444444444444444444444444444444444\"]},\"entries\":[{\"path\":\"links/current\",\"kind\":\"symlink\",\"target\":\"../\"},{\"path\":\"quote\\\"\\\\é\\nname\",\"kind\":\"file\",\"mode\":384,\"digest\":\"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\",\"bytes\":0},{\"path\":\"\",\"kind\":\"file\",\"mode\":420,\"digest\":\"sha256:06eb7d6a69ee19e5fbdf749018d3d2abfa04bcbd1365db312eb86dc7169389b8\",\"bytes\":2},{\"path\":\"𐀀\",\"kind\":\"file\",\"mode\":493,\"digest\":\"sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb\",\"bytes\":1}]}",
    "digest": "sha256:1d4b1b9589752bf95137063ff3f9f0b1f49fb7a2368b6bfb1fb1f5d9dc5c7e60"
  },
  {
    "name": "unborn-sha256",
    "input": {
      "entries": [],
      "coordinates": {
        "merged": [],
        "tree": "6666666666666666666666666666666666666666666666666666666666666666"
      },
      "version": 1
    },
    "encoding": "{\"version\":1,\"coordinates\":{\"tree\":\"6666666666666666666666666666666666666666666666666666666666666666\",\"merged\":[]},\"entries\":[]}",
    "digest": "sha256:b3b16bee2f8b11f0d343309ce65cffedf9f42526f1160e3a4830600e51d010b1"
  }
];
