// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Pinned mise (https://mise.jdx.dev, MIT) release bundled into every packaged
// binary artifact (#8) — a deliberate, reproducible pin, not "latest",
// mirroring the vendored-and-pinned MCP schema precedent in the sibling
// ribosome-schema repo. Bump via `node scripts/vendor-mise-update.js
// <version>`, never by hand: that script re-fetches the matching checksums
// from mise's own published SHASUMS256.txt so this file's pin and its
// integrity proof always move together. Staleness is caught separately, on
// a schedule (#9) — see scripts/check-mise-drift.js.
//
// Checksums cover the five raw, uncompressed release binaries mise publishes
// 1:1 against ribosome's own five release targets — not the .tar.gz/.zip
// archives, which packaging steps don't need.

export const MISE_VERSION = "2026.7.5";

export const MISE_CHECKSUMS: Record<string, string> = {
  "linux-x64": "5f7ab76afdf0780d12edeaa67e908094e9ccf7924cfe203e415c1cfb87bbf778",
  "linux-arm64": "41fcf744050bfa27f9871e2151ac6f44b5ce2741424b3d5282b92becc71e6bc4",
  "darwin-x64": "62fe1fe9dbc32c6ce1388ee23df4a0862d3d7f40a6820b40c2f1cbab995dc1d4",
  "darwin-arm64": "a456c65907e8334619d77fa152bdcf9023fddc0daa03d47fbe86d032dbf565b0",
  "windows-x64": "1840f167ec8b161598e08b8ede769cf9954c0239b25bb7bdf0b326124b548c32",
};
