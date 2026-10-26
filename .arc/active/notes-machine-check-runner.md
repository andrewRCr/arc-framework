# Machine Check Runner Notes

## Reference Material

- [Cargo runner configuration][cargo]
- [Remote Execution API][reapi]
- [Bazel remote caching][bazel-cache]
- [Buck2 remote execution][buck2]
- [Buck2 executor configuration][buck2-config]
- [Bazel dynamic execution][bazel-dynamic]
- [JSON-RPC 2.0 specification][json-rpc]
- [MCP stdio transport][stdio-transport]

---

[cargo]: https://doc.rust-lang.org/cargo/reference/config.html#targettriplerunner
[reapi]: https://github.com/bazelbuild/remote-apis/blob/main/build/bazel/remote/execution/v2/remote_execution.proto
[bazel-cache]: https://bazel.build/remote/caching
[buck2]: https://buck2.build/docs/users/remote_execution/
[buck2-config]: https://buck2.build/docs/api/build/CommandExecutorConfig/
[bazel-dynamic]: https://bazel.build/remote/dynamic
[json-rpc]: https://www.jsonrpc.org/specification
[stdio-transport]: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
