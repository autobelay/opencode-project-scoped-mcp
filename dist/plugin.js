/*
MIT License

Copyright (c) 2026 Autobelay

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// src/project.mjs
import { createHash } from "node:crypto";
import { dirname as dirname2 } from "node:path";

// src/manifest.mjs
import { stat, readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
async function discover(start = process.cwd()) {
  let dir = resolve(start);
  if (!(await stat(dir)).isDirectory())
    throw new Error("Project directory is not a directory");
  while (true) {
    try {
      if ((await stat(join(dir, "mcp.json"))).isFile())
        return join(dir, "mcp.json");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    try {
      await stat(join(dir, ".git"));
      return null;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function record(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function strings(v) {
  return record(v) && Object.values(v).every((x) => typeof x === "string");
}
function validate(document) {
  if (!record(document) || !record(document.mcpServers))
    throw new Error("Expected an mcpServers object");
  for (const [name, s] of Object.entries(document.mcpServers)) {
    if (!/^[a-zA-Z0-9_\[\]-]+$/.test(name))
      throw new Error("Invalid server name");
    if (!record(s)) throw new Error(`Invalid server entry: ${name}`);
    if (!["stdio", "streamable-http", "sse"].includes(s.type))
      throw new Error(`Unsupported transport for ${name}`);
    for (const field of ["title", "description"])
      if (s[field] !== void 0 && typeof s[field] !== "string")
        throw new Error(`Invalid ${field} for ${name}`);
    if (s.type === "stdio") {
      if (typeof s.command !== "string" || !s.command)
        throw new Error(`Missing command for ${name}`);
      if (s.args !== void 0 && (!Array.isArray(s.args) || !s.args.every((v) => typeof v === "string")))
        throw new Error(`Invalid args for ${name}`);
      if (s.env !== void 0 && !strings(s.env))
        throw new Error(`Invalid env for ${name}`);
    } else {
      if (typeof s.url !== "string") throw new Error(`Missing URL for ${name}`);
      if (s.headers !== void 0 && !strings(s.headers))
        throw new Error(`Invalid headers for ${name}`);
    }
  }
  return document.mcpServers;
}
async function readManifest(path) {
  return validate(JSON.parse(await readFile(path, "utf8")));
}
function interpolate(value, env = process.env) {
  if (typeof value === "string")
    return value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => {
      if (env[key] === void 0)
        throw new Error(`Missing environment variable: ${key}`);
      return env[key];
    });
  if (Array.isArray(value)) return value.map((v) => interpolate(v, env));
  if (record(value))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, interpolate(v, env)])
    );
  return value;
}

// src/project.mjs
var VERSION = "0.1.0";
function serverId(name, root) {
  return `project_${name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40)}_${createHash(
    "sha256"
  ).update(JSON.stringify([root, name])).digest("hex").slice(0, 12)}`;
}
function projectServer(server, root, env = process.env) {
  const s = interpolate(server, env);
  if (s.type === "stdio")
    return {
      type: "local",
      command: [s.command, ...s.args ?? []],
      cwd: root,
      ...s.env ? { environment: s.env } : {},
      enabled: true,
      timeout: 3e4
    };
  const url = new URL(s.url);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Unsupported URL protocol");
  let oauth;
  if (s.oauth !== void 0) {
    if (!s.oauth || typeof s.oauth !== "object" || Array.isArray(s.oauth))
      throw new Error("Invalid OAuth configuration");
    for (const key of Object.keys(s.oauth))
      if (!["clientId", "scopes", "redirectUri"].includes(key))
        throw new Error("Unsupported OAuth field");
    if (s.oauth.clientId !== void 0 && typeof s.oauth.clientId !== "string")
      throw new Error("Invalid clientId");
    if (s.oauth.redirectUri !== void 0 && typeof s.oauth.redirectUri !== "string")
      throw new Error("Invalid redirectUri");
    if (s.oauth.scopes !== void 0 && (!Array.isArray(s.oauth.scopes) || !s.oauth.scopes.every((x) => typeof x === "string")))
      throw new Error("Invalid scopes");
    oauth = {
      ...s.oauth.clientId !== void 0 ? { clientId: s.oauth.clientId } : {},
      ...s.oauth.scopes !== void 0 ? { scope: s.oauth.scopes.join(" ") } : {},
      ...s.oauth.redirectUri !== void 0 ? { redirectUri: s.oauth.redirectUri } : {}
    };
  } else if (Object.keys(s.headers ?? {}).some(
    (k) => k.toLowerCase() === "authorization"
  ))
    oauth = false;
  return {
    type: "remote",
    url: s.url,
    ...s.headers ? { headers: s.headers } : {},
    ...oauth !== void 0 ? { oauth } : {},
    enabled: true,
    timeout: 3e4
  };
}
async function loadProject(directory) {
  const manifest = await discover(directory);
  return {
    manifest,
    root: manifest ? dirname2(manifest) : null,
    servers: manifest ? await readManifest(manifest) : {}
  };
}
function applyProject(config, project, env = process.env) {
  const records = [];
  if (!Object.keys(project.servers).length) return records;
  config.mcp ??= {};
  for (const [name, s] of Object.entries(project.servers)) {
    const id = serverId(name, project.root);
    if (Object.hasOwn(config.mcp, name)) {
      records.push({
        name,
        runtimeId: name,
        source: "native",
        title: s.title,
        description: s.description
      });
      continue;
    }
    const existing = config.mcp[id];
    if (existing?.type) {
      records.push({
        name,
        runtimeId: id,
        source: "native",
        title: s.title,
        description: s.description
      });
      continue;
    }
    try {
      config.mcp[id] = { ...projectServer(s, project.root, env), ...existing };
      records.push({
        name,
        runtimeId: id,
        source: "manifest",
        title: s.title,
        description: s.description
      });
    } catch {
      records.push({
        name,
        runtimeId: id,
        source: "manifest",
        error: "Could not translate this server. Check its transport, OAuth fields and referenced environment variables."
      });
    }
  }
  return records;
}

// src/plugin.mjs
async function ProjectScopedMcp({ directory, client }) {
  let project = { manifest: null, root: null, servers: {} }, records = [], error;
  return {
    config: async (config) => {
      try {
        project = await loadProject(directory);
        records = applyProject(config, project);
        error = void 0;
      } catch {
        error = "Could not read the project manifest. Check the project directory, mcp.json syntax and server definitions.";
        records = [];
      }
    },
    tool: {
      project_mcp_status: {
        description: "Report the discovered project mcp.json and its native OpenCode MCP connection states. Does not return credentials, launch arguments or raw connection errors.",
        args: {},
        execute: async () => {
          let states = {}, statusError;
          try {
            const response = await client.mcp.status({ query: { directory } });
            if (response.error) throw new Error("status");
            states = response.data ?? {};
          } catch {
            statusError = "Native MCP status is temporarily unavailable.";
          }
          return JSON.stringify({
            version: VERSION,
            manifest: project.manifest,
            projectRoot: project.root,
            ...error ? { error } : {},
            ...statusError ? { statusError } : {},
            servers: records.map((r) => ({
              name: r.name,
              runtimeId: r.runtimeId,
              source: r.source,
              status: r.error ? "invalid" : states[r.runtimeId]?.status ?? "unknown",
              ...r.error ? { error: r.error } : {}
            }))
          });
        }
      }
    },
    "experimental.chat.system.transform": async (_input, output) => {
      if (!records.length) return;
      const lines = [
        "Project MCP connection descriptions (from this project\u2019s manifest):"
      ];
      for (const r of records)
        if (!r.error)
          lines.push(
            `- ${r.name} (OpenCode server: ${r.runtimeId})${r.title ? ` \u2014 ${r.title}` : ""}${r.description ? `: ${r.description}` : ""}`
          );
      output.system.push(lines.join("\n"));
    }
  };
}
export {
  ProjectScopedMcp as default
};
