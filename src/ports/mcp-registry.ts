// SPDX-License-Identifier: MPL-2.0
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
 *
 * `resolve()` rejects with one of the typed errors below, never a generic
 * `Error` — this is part of the port's contract, not just the official
 * adapter's behavior, so any future registry adapter (GitHub, Microsoft, ...)
 * and the orchestrator that catches these agree on the same failure shapes
 * regardless of which adapter is plugged in.
 */
export interface McpRegistry {
  /** The protocol this adapter speaks, matched against `RegistrySource.type`. */
  readonly type: string;
  resolve(query: RegistryQuery): Promise<McpServerJson>;
}

/** Base for every typed McpRegistry resolution failure. Carries the query that failed. */
export abstract class McpRegistryError extends Error {
  protected constructor(
    readonly query: RegistryQuery,
    message: string,
  ) {
    super(message);
  }
}

/** The registry could not be reached at all — network failure, timeout, non-2xx/404 status. */
export class RegistryUnreachableError extends McpRegistryError {
  constructor(
    query: RegistryQuery,
    readonly cause: unknown,
  ) {
    super(
      query,
      `registry unreachable at "${query.source.url}" while resolving "${query.name}": ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = "RegistryUnreachableError";
  }
}

/** The registry responded, but has no such server (or version) registered. */
export class ServerNotFoundError extends McpRegistryError {
  constructor(query: RegistryQuery) {
    super(
      query,
      `"${query.name}@${query.version ?? "latest"}" not found in registry "${query.source.url}"`,
    );
    this.name = "ServerNotFoundError";
  }
}

/**
 * The registry responded with something that isn't a valid server.json — malformed
 * JSON, or a document that fails validation against the standard's vendored schema.
 */
export class InvalidServerDescriptorError extends McpRegistryError {
  constructor(
    query: RegistryQuery,
    readonly validationErrors: string[],
  ) {
    super(
      query,
      `"${query.name}" from registry "${query.source.url}" is not a valid server.json:\n` +
        validationErrors.map((e) => `  - ${e}`).join("\n"),
    );
    this.name = "InvalidServerDescriptorError";
  }
}

/**
 * `query.source.auth` names an environment variable to read a header's value
 * from, but it isn't set. Distinct from `RegistryUnreachableError`: this is a
 * caller-config problem caught before any request is made, not a network
 * failure — sending the request anyway would just produce a confusing 401
 * from the registry instead of a clear answer about what's actually missing.
 */
export class MissingRegistryCredentialError extends McpRegistryError {
  constructor(
    query: RegistryQuery,
    readonly header: string,
    readonly envVar: string,
  ) {
    super(
      query,
      `registry "${query.source.url}" requires header "${header}", but environment variable "${envVar}" is not set`,
    );
    this.name = "MissingRegistryCredentialError";
  }
}
