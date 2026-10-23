# Local exercise notes

This file records observations for OpenCode 1.19.4 and the v0.1.0 plugin as they become available. Release installation and live project results have not been recorded here yet.

OpenCode 1.19.4's source declares an asynchronous plugin `config` hook, invokes it on the mutable configuration object, and initializes plugins before other project services. Its MCP service later reads `cfg.mcp`. Local MCP configuration accepts `cwd` and resolves it against the OpenCode project directory. Source: [plugin hook type](https://github.com/anomalyco/opencode/blob/v1.19.4/packages/plugin/src/index.ts), [hook invocation](https://github.com/anomalyco/opencode/blob/v1.19.4/packages/opencode/src/plugin/index.ts), [project bootstrap](https://github.com/anomalyco/opencode/blob/v1.19.4/packages/opencode/src/project/bootstrap.ts), [MCP service](https://github.com/anomalyco/opencode/blob/v1.19.4/packages/opencode/src/mcp/index.ts).

The public `examples/design-studio/mcp.json` declares a fictional `project-design` stdio server. Its command starts the bundled `dist/design-example.cjs` from that example directory. No real application data or service account is needed.

## Observations

Local build and test results: pending.

Local OpenCode MCP listing and tool use: pending.

GitHub release tarball installation: pending.

Global `.js` plugin directory installation: pending.
