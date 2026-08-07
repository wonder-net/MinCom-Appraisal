/**
 * Tests that all required project directories exist and contain
 * index files as barrel exports, ensuring the project scaffolding
 * is intact.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

const SRC_DIR = resolve(__dirname, "..");

/**
 * Required directories relative to src/ that must contain an index.ts file.
 */
const REQUIRED_DIRECTORIES_WITH_INDEX: string[] = [
  "api",
  "auth",
  "components",
  "hooks",
  "types",
  "utils",
  "features/dashboard",
  "features/appraisals",
  "features/growth-plans",
  "features/workflows",
  "features/reports",
  "features/employees",
  "features/admin",
];

describe("Project structure", () => {
  it.each(REQUIRED_DIRECTORIES_WITH_INDEX)(
    "src/%s directory exists and contains an index.ts file",
    (dir) => {
      const dirPath = resolve(SRC_DIR, dir);
      const indexPath = resolve(dirPath, "index.ts");

      expect(
        existsSync(dirPath),
        `Directory src/${dir}/ does not exist`,
      ).toBe(true);

      expect(
        existsSync(indexPath),
        `Index file src/${dir}/index.ts does not exist`,
      ).toBe(true);
    },
  );
});
