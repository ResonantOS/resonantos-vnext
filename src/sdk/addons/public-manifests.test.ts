// Intent citation: docs/architecture/ADR-018-addon-sdk-v0.md

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateAddOnManifest } from "./validation";

describe("bundled add-on manifests", () => {
  it("conform to Add-on SDK V0 validation", () => {
    const publicAddonsRoot = resolve(process.cwd(), "public", "addons");
    const manifestFiles = JSON.parse(readFileSync(resolve(publicAddonsRoot, "index.json"), "utf8")) as string[];
    const invalidManifests = manifestFiles
      .map((file) => {
        const manifest = JSON.parse(readFileSync(resolve(publicAddonsRoot, file), "utf8")) as unknown;
        return { file, validation: validateAddOnManifest(manifest, { source: "bundled" }) };
      })
      .filter(({ validation }) => !validation.valid);

    expect(
      invalidManifests.map(({ file, validation }) => ({
        file,
        issues: validation.issues.filter((issue) => issue.severity === "error"),
      })),
    ).toEqual([]);
  });

  it("keeps development add-ons out of the bundled default catalog", () => {
    const publicAddonsRoot = resolve(process.cwd(), "public", "addons");
    const manifestFiles = JSON.parse(readFileSync(resolve(publicAddonsRoot, "index.json"), "utf8")) as string[];

    expect(manifestFiles).toEqual(["augmentor-chat.json", "living-archive.json"]);
  });

  it("keeps the reference third-party memory add-on manifest sideloadable", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "examples", "addons", "reference-memory.json"), "utf8"),
    ) as unknown;

    const validation = validateAddOnManifest(manifest, { source: "sideload" });

    expect(validation.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("keeps the experimental RecursiveMAS add-on manifest sideloadable", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "examples", "addons", "recursive-mas.json"), "utf8"),
    ) as unknown;

    const validation = validateAddOnManifest(manifest, { source: "sideload" });

    expect(validation.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
