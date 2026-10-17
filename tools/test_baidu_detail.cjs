#!/usr/bin/env node
"use strict";

// Original exported assets and declarative bindings only. Real browser QA
// separately checks the shared-element transition and complete-card motion.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const carousel = fs.readFileSync(path.join(projectRoot, "work-carousel.js"), "utf8");
const sourceSVG = fs.readFileSync(path.join(projectRoot, "assets/baidu-layered.svg"), "utf8");
const preparedSVG = fs.readFileSync(path.join(projectRoot, "assets/baidu-layered-prepared.svg"), "utf8");
const imageDirectory = path.join(projectRoot, "assets/baidu-layered-images");
const decodeXMLID = (id) => id.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi,
  (entity, hex, decimal, named) => {
    if (hex || decimal) return String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named.toLowerCase()];
  });

const readArrayLiteral = (name, context = {}) => {
  const literal = carousel.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n  \\]);`))?.[1];
  assert.ok(literal, `The ${name} data literal exists`);
  // Never evaluate the live page script or access document/window.
  return vm.runInNewContext(`(${literal})`, context, { timeout: 1000 });
};

test("Baidu static and layered artworks retain their 1668 × 13474 dimensions", () => {
  for (const svg of [sourceSVG, preparedSVG]) {
    const header = svg.match(/<svg\b[^>]*>/)?.[0];
    assert.ok(header, "SVG root exists");
    assert.match(header, /\bwidth="1668"/);
    assert.match(header, /\bheight="13474"/);
    assert.match(header, /\bviewBox="0 0 1668 13474"/);
  }
  const png = fs.readFileSync(path.join(projectRoot, "assets/baidu-bid-diagnosis.png"));
  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Valid PNG signature");
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1668);
  assert.equal(png.readUInt32BE(20), 13474);
});

test("nine complete Baidu units map ten unique original Figma layers within the artwork", () => {
  const cards = readArrayLiteral("BAIDU_REVEAL_CARDS");
  assert.equal(cards.length, 9);
  const names = new Set();
  const configured = [];
  for (const card of cards) {
    assert.equal(typeof card.name, "string");
    assert.ok(card.name.trim(), "A card has a stable nonempty name");
    assert.ok(!names.has(card.name), `Unique card name: ${card.name}`);
    names.add(card.name);
    assert.ok(Number.isFinite(card.top) && card.top >= 0, `${card.name}: valid top boundary`);
    assert.ok(Number.isFinite(card.bottom) && card.bottom > card.top && card.bottom <= 13474,
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
  assert.equal(configured.length, 10);
  assert.equal(new Set(configured).size, 10, "No original Baidu layer is animated twice");
  assert.ok(cards.some((card) => card.parts.some((part) =>
    part.includes("Rectangle 2131354604_2") && part.includes("Group 2147241271"))),
  "The KR2 white paper and its content stay in the same animation part");
  for (const svg of [sourceSVG, preparedSVG]) {
    const occurrences = new Map();
    for (const match of svg.matchAll(/\bid="([^"]+)"/g)) {
      const id = decodeXMLID(match[1]);
      occurrences.set(id, (occurrences.get(id) || 0) + 1);
    }
    for (const id of configured) {
      assert.equal(occurrences.get(id), 1, `Original Baidu Figma layer must exist exactly once: ${id}`);
    }
  }
});

test("the third Baidu cover has an independent detail and reveal-card binding", () => {
  const baiduCards = readArrayLiteral("BAIDU_REVEAL_CARDS");
  const lenovoCards = readArrayLiteral("LENOVO_REVEAL_CARDS");
  const works = readArrayLiteral("WORK_CARDS", {
    BAIDU_REVEAL_CARDS: baiduCards,
    LENOVO_REVEAL_CARDS: lenovoCards,
    QUYE_REVEAL_CARDS: readArrayLiteral("QUYE_REVEAL_CARDS"),
    AI_EFFICIENCY_REVEAL_CARDS: readArrayLiteral("AI_EFFICIENCY_REVEAL_CARDS"),
  });
  assert.equal(works.length, 5, "The original five-card carousel is retained");
  const baidu = works[2];
  assert.equal(baidu.src, "./assets/work-card-03.png");
  const cover = fs.readFileSync(path.join(projectRoot, "assets/work-card-03.png"));
  assert.ok(cover.length > 24, "The imported cover PNG is nonempty");
  assert.ok(cover.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "The imported cover has a valid PNG signature");
  assert.equal(cover.toString("ascii", 12, 16), "IHDR");
  assert.equal(cover.readUInt32BE(16), 775);
  assert.equal(cover.readUInt32BE(20), 484);
  const color = baidu.coverColor?.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  assert.ok(color, "The third cover retains an explicit RGB fallback color");
  const [red, green, blue] = color.slice(1).map((part) => parseInt(part, 16));
  assert.ok(blue >= 128 && blue > red && blue > green, "The loading-failure fallback is blue");
  assert.match(baidu.alt, /百度/);
  assert.match(baidu.detail.title, /百度/);
  assert.equal(baidu.detail.images.length, 1);
  const artwork = baidu.detail.images[0];
  assert.equal(artwork.src, "./assets/baidu-bid-diagnosis.png");
  assert.equal(artwork.layeredArtwork, "./assets/baidu-layered-prepared.svg");
  assert.equal(artwork.width, 1668);
  assert.equal(artwork.height, 13474);
  assert.equal(artwork.revealCards, baiduCards);
  assert.notEqual(artwork.revealCards, works[1].detail.images[0].revealCards);
  assert.notEqual(artwork.src, works[0].detail.images[0].src);
  assert.notEqual(artwork.src, works[1].detail.images[0].src);
});

test("all 35 Baidu images are extracted losslessly and SVG changes only image hrefs", () => {
  assert.doesNotMatch(preparedSVG, /data:image\//i);
  const referencedImages = new Set();
  const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
    "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg" };
  const expected = sourceSVG.replace(
    /((?:xlink:)?href\s*=\s*)(["'])data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n\t ]+)\2/g,
    (original, attribute, quote, mime, encoded) => {
      const extension = extensions[mime.toLowerCase()];
      assert.ok(extension, `Supported exported image type: ${mime}`);
      const bytes = Buffer.from(encoded.replace(/\s/g, ""), "base64");
      const hash = crypto.createHash("sha256").update(bytes).digest("hex");
      const name = `${hash}.${extension}`;
      const destination = path.join(imageDirectory, name);
      assert.equal(path.dirname(destination), imageDirectory);
      const extracted = fs.readFileSync(destination);
      assert.equal(crypto.createHash("sha256").update(extracted).digest("hex"), hash,
        `Content hash matches: ${name}`);
      assert.ok(extracted.equals(bytes), `Exported pixels are unchanged: ${name}`);
      referencedImages.add(name);
      return `${attribute}${quote}./baidu-layered-images/${name}${quote}`;
    },
  );
  assert.equal(referencedImages.size, 35, "All 35 distinct exported images are verified");
  assert.equal(preparedSVG, expected, "Geometry, masks, paths, and other SVG source remain unchanged");
});
