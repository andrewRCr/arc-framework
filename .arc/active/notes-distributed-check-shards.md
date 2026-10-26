# Distributed Check Shards — Notes

## Historical performance context

Earlier runner-pool measurements put a complete store run at approximately ten minutes on the primary mini and
608.86 seconds on WSL. Distributing whole checks reduced the measured full gate from 1,072.05 to 665.62 seconds.
Those runs used a frozen historical source. They motivate investigating the remaining long checks; they do not
predict performance at a newer head or qualify distributed execution.

## Supplemental investigation

Local harnesses and results live under `.arc/user/andrew/.internal/distributed-check-shards-recon/` in this checkout:

- `probe.py` and `input-transport-result.json`: one frozen tiny repository and static two-way manifest, with one
  direct WSL sibling and one admitted remote sibling. Source, duration, manifest and HEAD identities matched after
  editing the original fixture; membership was complete/disjoint and a forced remote failure retained status 7.
  The temporary fixture retained inherited runner path mappings; the live registry and routing mode were unchanged.
- `capture-objects-probe.py` and `capture-objects-result.json`: two independent materializations retained captured
  dirty/untracked bytes, original head/base, executable mode, symlink, deletion and external duration input. The
  original index was unchanged and private state/projection data was absent. The tiny Linux object pack was
  808 bytes; production ancestry-transfer and preparation costs were not measured.
- `capture-raw-bytes-probe.py` and `capture-raw-bytes-result.json`: one Linux `text eol=lf` fixture demonstrated
  that Git-only materialization changed CRLF working bytes, while a frozen raw-byte overlay restored them without
  changing the code coordinates or original index.

These fixtures establish limited transport/materialization observations. They did not qualify native Vitest
membership, runtime identity, cache reuse, parent pass publication, cancellation or performance. They also did not
qualify arbitrary filters, LFS, submodules, sparse/shallow history or Windows file semantics.

The native reach-based store observations used source revision `82579e9f0ff38613e9cb3d8456d5f6d8e7498884`.
`runReachCheck`, `runReachSuites` and `reach-check-shards.test.ts` are useful starting pointers for selection no-ops
and empty-share behavior; inspect the landed implementation before native qualification.

## Prior-art references

- [Cargo runner configuration][cargo-runner]: executable/argument configuration.
- [Remote Execution API definitions][reapi]: command, environment, working directory and input-root vocabulary.
- [Bazel remote caching][bazel-caching]: action inputs and untracked-tool caveats.
- [Swarming user guide][swarming-guide] and [bot documentation][swarming-bot]: task workspaces and retained caches.
- [Bazel test sharding][bazel-sharding]: native runner participation in a shard contract.
- [Nextest partitioning][nextest-partitioning] and [running tests][nextest-running]: partition and no-tests policies.
- [pytest-xdist execution model][xdist-model] and [crash handling][xdist-crashes]: collection agreement and worker loss.
- [Buck2 remote execution][buck2-remote] and [executor configuration][buck2-executor]: placement/fallback policy.

---

[cargo-runner]: https://doc.rust-lang.org/cargo/reference/config.html#targettriplerunner
[reapi]: https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto
[bazel-caching]: https://bazel.build/remote/caching
[swarming-guide]: https://chromium.googlesource.com/infra/luci/luci-py.git/+/HEAD/appengine/swarming/doc/User-Guide.md
[swarming-bot]: https://chromium.googlesource.com/infra/luci/luci-py/+/refs/heads/main/appengine/swarming/doc/Bot.md
[bazel-sharding]: https://bazel.build/versions/9.2.0/reference/test-encyclopedia
[nextest-partitioning]: https://github.com/nextest-rs/nextest/blob/main/site/src/docs/ci-features/partitioning.md
[nextest-running]: https://github.com/nextest-rs/nextest/blob/main/site/src/docs/running.md
[xdist-model]: https://pytest-xdist.readthedocs.io/en/stable/how-it-works.html
[xdist-crashes]: https://pytest-xdist.readthedocs.io/en/stable/crash.html
[buck2-remote]: https://buck2.build/docs/users/remote_execution/
[buck2-executor]: https://buck2.build/docs/api/build/CommandExecutorConfig/
