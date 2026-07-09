// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Port: resolution of an MCP server reference into a concrete server.json
// descriptor. The orchestrator depends on this interface only — it must not know
// which registry (official, GitHub, Microsoft, ...) or protocol is in play.

import type { McpServerJson, RegistrySource } from "@medullaflow/ribosome-schema";

/** A request to resolve one server from one registry source. */
export interface RegistryQuery {
  /** Reverse-DNS server name, e.g. "io.modelcontextprotocol/filesystem". */
  name: string;
  /** Exact version, or undefined for the registry's latest. */
  version?: string;
  /** The registry source to resolve against (already selected by the orchestrator). */
  source: RegistrySource;
}

/**
 * Resolves a registry reference to a server.json document. One adapter per
 * registry protocol (keyed by `RegistrySource.type`). Inline (`source: inline`)
 * servers bypass this port entirely — they already carry their server.json.
 */
export interface McpRegistry {
  /** The protocol this adapter speaks, matched against `RegistrySource.type`. */
  readonly type: string;
  resolve(query: RegistryQuery): Promise<McpServerJson>;
}
