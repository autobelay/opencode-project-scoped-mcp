import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { discover, readManifest, interpolate } from "./manifest.mjs";

export const VERSION = "0.1.0";
export function serverId(name, root) {
  return `project_${name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40)}_${createHash(
    "sha256",
  )
    .update(JSON.stringify([root, name]))
    .digest("hex")
    .slice(0, 12)}`;
}
export function projectServer(server, root, env = process.env) {
  const s = interpolate(server, env);
  if (s.type === "stdio")
    return {
      type: "local",
      command: [s.command, ...(s.args ?? [])],
      cwd: root,
      ...(s.env ? { environment: s.env } : {}),
      enabled: true,
      timeout: 30000,
    };
  const url = new URL(s.url);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Unsupported URL protocol");
  let oauth;
  if (s.oauth !== undefined) {
    if (!s.oauth || typeof s.oauth !== "object" || Array.isArray(s.oauth))
      throw new Error("Invalid OAuth configuration");
    for (const key of Object.keys(s.oauth))
      if (!["clientId", "scopes", "redirectUri"].includes(key))
        throw new Error("Unsupported OAuth field");
    if (s.oauth.clientId !== undefined && typeof s.oauth.clientId !== "string")
      throw new Error("Invalid clientId");
    if (
      s.oauth.redirectUri !== undefined &&
      typeof s.oauth.redirectUri !== "string"
    )
      throw new Error("Invalid redirectUri");
    if (
      s.oauth.scopes !== undefined &&
      (!Array.isArray(s.oauth.scopes) ||
        !s.oauth.scopes.every((x) => typeof x === "string"))
    )
      throw new Error("Invalid scopes");
    oauth = {
      ...(s.oauth.clientId !== undefined ? { clientId: s.oauth.clientId } : {}),
      ...(s.oauth.scopes !== undefined
        ? { scope: s.oauth.scopes.join(" ") }
        : {}),
      ...(s.oauth.redirectUri !== undefined
        ? { redirectUri: s.oauth.redirectUri }
        : {}),
    };
  } else if (
    Object.keys(s.headers ?? {}).some(
      (k) => k.toLowerCase() === "authorization",
    )
  )
    oauth = false;
  return {
    type: "remote",
    url: s.url,
    ...(s.headers ? { headers: s.headers } : {}),
    ...(oauth !== undefined ? { oauth } : {}),
    enabled: true,
    timeout: 30000,
  };
}
export async function loadProject(directory) {
  const manifest = await discover(directory);
  return {
    manifest,
    root: manifest ? dirname(manifest) : null,
    servers: manifest ? await readManifest(manifest) : {},
  };
}
export function applyProject(config, project, env = process.env) {
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
        description: s.description,
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
        description: s.description,
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
        description: s.description,
      });
    } catch {
      records.push({
        name,
        runtimeId: id,
        source: "manifest",
        error:
          "Could not translate this server. Check its transport, OAuth fields and referenced environment variables.",
      });
    }
  }
  return records;
}
