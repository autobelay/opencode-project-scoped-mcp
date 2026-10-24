# Local Project MCP distribution

This repository distributes an independent OpenCode plugin. It is not an official OpenCode marketplace listing and is not affiliated with OpenCode or Anomaly.

Local Project MCP automatically reads the nearest project `mcp.json` and adds its local and remote servers to that project's native OpenCode MCP configuration in memory. No wrapper or configuration sync is needed.

For OpenCode 1.19.4, the plugin is a package whose `main` and `exports["./server"]` point to `dist/plugin.js`. The global `opencode plugin <module> -g` command installs a package and adds it to the user's global OpenCode configuration. Install the v0.1.1 GitHub tarball with:

```sh
opencode plugin --global https://github.com/autobelay/opencode-project-scoped-mcp/releases/download/v0.1.1/autobelay-opencode-project-scoped-mcp-0.1.1.tgz
```

The plugin does not require npm registry publication. A repository checkout offers a direct alternative: copy `dist/plugin.js` to `~/.config/opencode/plugins/project-scoped-mcp.js`. OpenCode [loads global `.js` and `.ts` plugin files](https://docs.opencode.ai/docs/plugins/#from-local-files) from that directory when it starts. Use the `.js` extension for this path; the 1.19.4 loader does not auto-discover `.mjs` files.

OpenCode's [v1 plugin documentation](https://docs.opencode.ai/docs/plugins/) describes the plugin context and global plugin directory. Its [MCP documentation](https://docs.opencode.ai/docs/mcp-servers/) describes native local and remote server configuration, including `cwd` and OAuth. OpenCode v2 has a [different plugin API](https://opencode.ai/v2/docs/build/plugins) and [different MCP configuration](https://opencode.ai/v2/docs/mcp-servers/); this v0.1.1 package targets v1.19.4 only.

The plugin reads a project's `mcp.json` in memory when OpenCode loads that project. It does not write MCP entries to `opencode.json`, run a separate bridge, install project servers, or access a hosted service of its own. A project manifest may start local commands or connect to remote URLs specified by that project.

The [fictional design-studio example](examples/design-studio) bundles a read-only server and a small set of sample design tokens. It demonstrates project-specific discovery without credentials or private assets. See [TESTING.md](TESTING.md) for local observations.
