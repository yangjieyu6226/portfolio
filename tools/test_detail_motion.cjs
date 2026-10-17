#!/usr/bin/env node
"use strict";

// Asset integrity and genuine static fallbacks only. Actual browser QA checks
// complete-card movement, final visual fidelity, and repeat-scroll playback.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const controller = fs.readFileSync(path.join(projectRoot, "work-detail-motion.js"), "utf8");
const sourceSVG = fs.readFileSync(path.join(projectRoot, "assets/douyin-layered.svg"), "utf8");
const preparedSVG = fs.readFileSync(path.join(projectRoot, "assets/douyin-layered-prepared.svg"), "utf8");
const imageDirectory = path.join(projectRoot, "assets/douyin-layered-images");
const carousel = fs.readFileSync(path.join(projectRoot, "work-carousel.js"), "utf8");
const lenovoSourceSVG = fs.readFileSync(path.join(projectRoot, "assets/lenovo-layered-v2.svg"), "utf8");
const lenovoPreparedSVG = fs.readFileSync(path.join(projectRoot, "assets/lenovo-layered-v2-prepared.svg"), "utf8");
const lenovoImageDirectory = path.join(projectRoot, "assets/lenovo-layered-v2-images");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

test("layered artwork retains its 1668 × 12854 bounds and every configured Figma ID", () => {
  for (const svg of [sourceSVG, preparedSVG]) {
    const header = svg.match(/<svg\b[^>]*>/)?.[0];
    assert.ok(header, "SVG root exists");
    assert.match(header, /\bwidth="1668"/);
    assert.match(header, /\bheight="12854"/);
    assert.match(header, /\bviewBox="0 0 1668 12854"/);
  }
  const literal = controller.match(/const CARDS = (\[[\s\S]*?\n  \]);/)?.[1];
  assert.ok(literal, "The original-layer configuration exists");
  const cards = vm.runInNewContext(`(${literal})`, {}, { timeout: 1000 });
  const configured = cards.flatMap((card) => card.parts.flat());
  assert.ok(configured.length > 0);
  assert.equal(new Set(configured).size, configured.length, "No layer is animated twice");
  const occurrences = new Map();
  for (const match of preparedSVG.matchAll(/\bid="([^"]+)"/g)) {
    occurrences.set(match[1], (occurrences.get(match[1]) || 0) + 1);
  }
  for (const id of configured) {
    assert.equal(occurrences.get(id), 1, `Original Figma layer must exist exactly once: ${id}`);
  }
});

const assertLosslessExtraction = (source, prepared, directory, referenceDirectory) => {
  assert.doesNotMatch(prepared, /data:image\//i);
  const referencedImages = new Set();
  const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
    "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg" };
  const expected = source.replace(
    /((?:xlink:)?href\s*=\s*)(["'])data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n\t ]+)\2/g,
    (original, attribute, quote, mime, encoded) => {
      const extension = extensions[mime.toLowerCase()];
      assert.ok(extension, `Supported exported image type: ${mime}`);
      const bytes = Buffer.from(encoded.replace(/\s/g, ""), "base64");
      const hash = sha256(bytes);
      const name = `${hash}.${extension}`;
      const destination = path.join(directory, name);
      assert.equal(path.dirname(destination), directory);
      const extracted = fs.readFileSync(destination);
      assert.equal(sha256(extracted), hash, `Content hash matches: ${name}`);
      assert.ok(extracted.equals(bytes), `Exported pixels are unchanged: ${name}`);
      referencedImages.add(name);
      return `${attribute}${quote}./${referenceDirectory}/${name}${quote}`;
    },
  );
  assert.ok(referencedImages.size > 0, "The SVG references extracted images");
  assert.equal(prepared, expected, "Geometry, masks, paths, and other SVG source remain unchanged");
};

test("prepared SVG changes only image hrefs; extracted image bytes match their hashes", () => {
  assertLosslessExtraction(sourceSVG, preparedSVG, imageDirectory, "douyin-layered-images");
});

test("no GSAP and reduced motion leave the static artwork completely untouched", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(controller, sandbox, { filename: "work-detail-motion.js" });
  const untouched = new Proxy({}, {
    get() { throw new Error("Static fallback must not inspect or mutate the DOM"); },
  });
  for (const options of [
    { gsap: null, motionQuery: { matches: false } },
    { gsap: untouched, motionQuery: { matches: true } },
  ]) {
    const dispose = sandbox.window.createPortfolioDetailMotion({
      content: untouched, panel: untouched, ...options,
    });
    assert.equal(typeof dispose, "function");
    assert.doesNotThrow(dispose);
    assert.doesNotThrow(dispose);
  }
});

test("Lenovo static and layered artworks retain their 1668 × 19614 bounds", () => {
  for (const svg of [lenovoSourceSVG, lenovoPreparedSVG]) {
    const header = svg.match(/<svg\b[^>]*>/)?.[0];
    assert.ok(header, "SVG root exists");
    assert.match(header, /\bwidth="1668"/);
    assert.match(header, /\bheight="19614"/);
    assert.match(header, /\bviewBox="0 0 1668 19614"/);
  }
  const png = fs.readFileSync(path.join(projectRoot, "assets/lenovo-ai-service-v2.png"));
  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Valid PNG signature");
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1668);
  assert.equal(png.readUInt32BE(20), 19614);
});

test("all 19 Lenovo card mappings stay inside the artwork and target unique original Figma IDs", () => {
  // Evaluate the data literal only, never the carousel's live page script.
  const literal = carousel.match(/const LENOVO_REVEAL_CARDS = (\[[\s\S]*?\n  \]);/)?.[1];
  assert.ok(literal, "The Lenovo original-layer configuration exists");
  const cards = vm.runInNewContext(`(${literal})`, {}, { timeout: 1000 });
  assert.equal(cards.length, 19);
  const names = new Set();
  const configured = [];
  for (const card of cards) {
    assert.equal(typeof card.name, "string");
    assert.ok(card.name.trim(), "A card has a stable nonempty name");
    assert.ok(!names.has(card.name), `Unique card name: ${card.name}`);
    names.add(card.name);
    assert.ok(Number.isFinite(card.top) && card.top >= 0, `${card.name}: valid top boundary`);
    assert.ok(Number.isFinite(card.bottom) && card.bottom > card.top && card.bottom <= 19614,
      `${card.name}: valid bottom boundary`);
    assert.ok(Array.isArray(card.parts) && card.parts.length > 0, `${card.name}: complete-card parts exist`);
    for (const part of card.parts) {
      assert.ok(Array.isArray(part) && part.length > 0, `${card.name}: each animation part has Figma layers`);
      for (const id of part) {
        assert.equal(typeof id, "string");
        assert.ok(id.trim(), `${card.name}: a layer ID is nonempty`);
        configured.push(id);
      }
    }
  }
  assert.equal(new Set(configured).size, configured.length, "No Lenovo layer is animated twice");
  for (const svg of [lenovoSourceSVG, lenovoPreparedSVG]) {
    const occurrences = new Map();
    for (const match of svg.matchAll(/\bid="([^"]+)"/g)) {
      occurrences.set(match[1], (occurrences.get(match[1]) || 0) + 1);
    }
    for (const id of configured) {
      assert.equal(occurrences.get(id), 1, `Original Lenovo Figma layer must exist exactly once: ${id}`);
    }
  }
});

test("Lenovo extraction preserves every exported image byte and changes only image hrefs", () => {
  assertLosslessExtraction(lenovoSourceSVG, lenovoPreparedSVG, lenovoImageDirectory, "lenovo-layered-v2-images");
});
