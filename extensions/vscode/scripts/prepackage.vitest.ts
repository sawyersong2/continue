import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("prepackage ripgrep setup", () => {
  test("downloads the ripgrep binary before copying packaged node modules", () => {
    const script = fs.readFileSync(
      path.join(__dirname, "prepackage.js"),
      "utf8",
    );

    const downloadIndex = script.indexOf("await downloadRipgrepBinary(target)");
    const copyIndex = script.indexOf(
      "Copy node_modules for pre-built binaries",
    );

    expect(downloadIndex).toBeGreaterThan(-1);
    expect(copyIndex).toBeGreaterThan(downloadIndex);
  });
});
