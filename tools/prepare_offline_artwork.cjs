#!/usr/bin/env node
"use strict";

// Data packaging only: preserve every SVG character, geometry and image href.
// Loading the generated script works on file:// without fetching SVG text.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const projectRoot = path.resolve(__dirname, "..");
const safeName = (value) => typeof value === "string" && value.length <= 96 &&
  /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(value);
const safeLiteral = (value) => JSON.stringify(value)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

async function main() {
  const [assetStem, registryKey] = process.argv.slice(2);
  if (process.argv.length !== 4 || !safeName(assetStem) || !safeName(registryKey) ||
      ["constructor", "prototype", "__proto__"].includes(registryKey)) {
    throw new Error("Usage: node tools/prepare_offline_artwork.cjs <safe-asset-stem> <safe-registry-key>");
  }
  const sourcePath = path.join(projectRoot, "assets", `${assetStem}-prepared.svg`);
  const outputPath = path.join(projectRoot, "assets", `${assetStem}-offline.js`);
  const source = await fs.readFile(sourcePath);
  const sourceDigest = digest(source);
  const svg = source.toString("utf8");
  if (!Buffer.from(svg, "utf8").equals(source)) {
    throw new Error("Prepared SVG is not lossless UTF-8 text; output was not written");
  }
  if (!/<svg\b/.test(svg)) throw new Error("Prepared SVG root is missing; output was not written");
  const bundle = "// Original Figma artwork, safely packaged for local-file loading.\n" +
    "(() => {\n  \"use strict\";\n" +
    "  const sources = window.portfolioLayeredArtworkSources ||\n" +
    "    (window.portfolioLayeredArtworkSources = Object.create(null));\n" +
    `  sources[${safeLiteral(registryKey)}] = ${safeLiteral(svg)};\n` +
    "})();\n";
  await fs.writeFile(outputPath, bundle, "utf8");
  if (digest(await fs.readFile(sourcePath)) !== sourceDigest) {
    throw new Error("The prepared SVG changed during offline packaging");
  }
  process.stdout.write(`${JSON.stringify({
    source: sourcePath,
    sourceBytes: source.length,
    sourceSha256: sourceDigest,
    output: outputPath,
    outputBytes: Buffer.byteLength(bundle),
    registryKey,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
