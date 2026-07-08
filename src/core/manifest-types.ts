// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Input shape for DependencyResolver.resolve() — mirrors medullaflow's
// medullaflow.json `dependencies` section. Keep in lockstep with that
// schema by hand until a codegen step exists; this file has no logic of
// its own.
//
// Callers outside medullaflow can use a compatible subset: any object
// satisfying DependenciesManifest is valid input regardless of whether
// it came from a medullaflow.json.

export interface DependenciesManifest {
  runtimes?: Record<string, string>; // tool name -> requested version, e.g. { node: "20.11.0" }
  mcpServers?: Record<string, McpServerManifest>;
}

export type McpServerManifest =
  | {
      source: "registry";
      /** MCP Registry reference, e.g. "io.modelcontextprotocol/filesystem@1.0.0". Transport and connection details come from resolving this, not from the manifest. */
      ref: string;
      permissions?: string[];
    }
  | {
      source: "command";
      /** argv to launch the server. */
      command: string[];
      transport: "stdio" | "http";
      /** Required by the loader (not the schema) when transport === "http". */
      url?: string;
      permissions?: string[];
    };
