#!/usr/bin/env node
"use strict";

// Mechanical extraction only: preserve the exported SVG's geometry, styles,
// and source file while moving identical embedded image bytes to local files.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const projectRoot = path.resolve(__dirname, "..");
const assetStem = process.argv[2] || "douyin-layered";
const sourcePath = path.join(projectRoot, "assets", `${assetStem}.svg`);
const outputPath = path.join(projectRoot, "assets", `${assetStem}-prepared.svg`);
const imageDirectory = path.join(projectRoot, "assets", `${assetStem}-images`);
const extensions = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/svg+xml", "svg"],
]);
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

async function main() {
  if (process.argv.length > 3 || assetStem.length > 96 || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(assetStem)) {
    throw new Error("Usage: node tools/prepare_detail_svg.cjs [safe-lowercase-asset-stem]");
  }
  const source = await fs.readFile(sourcePath);
  const sourceDigest = digest(source);
  const svg = source.toString("utf8");
  const images = new Map();
  let embeddedCount = 0;
  const prepared = svg.replace(
    /((?:xlink:)?href\s*=\s*)(["'])data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n\t ]+)\2/g,
    (original, attribute, quote, mime, encoded) => {
      const extension = extensions.get(mime.toLowerCase());
      if (!extension) throw new Error(`Unsupported embedded image MIME type: ${mime}`);
      const base64 = encoded.replace(/\s/g, "");
      const bytes = Buffer.from(base64, "base64");
      // Round-trip validation avoids nested regular-expression repetitions
      // exhausting the engine's stack on multi-megabyte image payloads.
      if (bytes.toString("base64") !== base64) {
        throw new Error("Invalid embedded image base64 payload");
      }
      const hash = digest(bytes);
      let image = images.get(hash);
      if (!image) {
        image = { name: `${hash}.${extension}`, bytes };
        images.set(hash, image);
      }
      embeddedCount += 1;
      return `${attribute}${quote}./${assetStem}-images/${image.name}${quote}`;
    },
  );
  if (/data:image\//i.test(prepared)) {
    throw new Error("An embedded image was not extracted; output was not written");
  }
  if (!embeddedCount) throw new Error("No embedded image hrefs found; output was not written");

  await fs.mkdir(imageDirectory, { recursive: true });
  for (const image of images.values()) {
    const destination = path.join(imageDirectory, image.name);
    try {
      const existing = await fs.readFile(destination);
      if (!existing.equals(image.bytes)) throw new Error(`Existing asset differs: ${destination}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.writeFile(destination, image.bytes, { flag: "wx" });
    }
  }
  await fs.writeFile(outputPath, prepared, "utf8");
  const sourceAfter = await fs.readFile(sourcePath);
  if (digest(sourceAfter) !== sourceDigest) throw new Error("The source SVG changed during preparation");
  const imageBytes = [...images.values()].reduce((sum, image) => sum + image.bytes.length, 0);
  process.stdout.write(`${JSON.stringify({
    source: sourcePath,
    sourceBytes: source.length,
    sourceSha256: sourceDigest,
    output: outputPath,
    outputBytes: Buffer.byteLength(prepared),
    embeddedImages: embeddedCount,
    uniqueImages: images.size,
    imageBytes,
    preparedTotalBytes: Buffer.byteLength(prepared) + imageBytes,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
