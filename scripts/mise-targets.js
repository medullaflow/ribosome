// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// ribosome's five release targets, mapped to mise's own release asset
// naming (verified against a real mise release: "macos", not "darwin") and
// to the bundled binary's own filename on each OS. Shared by
// vendor-mise-update.js (pin bump) and fetch-bundled-mise.js (CI download),
// so the two can never drift apart on what a "target" means.

const MISE_TARGETS = {
  "linux-x64": { assetSuffix: "linux-x64", binName: "mise" },
  "linux-arm64": { assetSuffix: "linux-arm64", binName: "mise" },
  "darwin-x64": { assetSuffix: "macos-x64", binName: "mise" },
  "darwin-arm64": { assetSuffix: "macos-arm64", binName: "mise" },
  "windows-x64": { assetSuffix: "windows-x64.exe", binName: "mise.exe" },
};

module.exports = { MISE_TARGETS };
