// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// The thin effects layer: persists a resolved RibosomeLockfile *value* to
// disk. Deliberately separate from Materializer.materialize(), which returns
// that value without ever touching the filesystem -- this is the one place
// the I/O boundary is crossed, so the resolution pipeline itself stays
// testable with zero filesystem access (see docs/ARCHITECTURE.md's "Purity
// and effects").

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RibosomeLockfile } from "@medullaflow/ribosome-schema";

export const LOCKFILE_FILENAME = "ribosome.lock.json";

/** Serialize and write a resolved lockfile to `<cwd>/ribosome.lock.json`. */
export async function writeLockfile(lockfile: RibosomeLockfile, cwd: string): Promise<void> {
  await writeFile(join(cwd, LOCKFILE_FILENAME), `${JSON.stringify(lockfile, null, 2)}\n`, "utf8");
}
