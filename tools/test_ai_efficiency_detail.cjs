#!/usr/bin/env node
"use strict";

// Asset integrity and real controller execution against a small DOM/data
// fixture plus GSAP request spy. No browser rendering or visual QA is claimed.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createDetailMotionModel, flushTasks } = require("./detail_motion_test_fixture.cjs");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const carousel = read("work-carousel.js");
const detail = read("work-detail.js");
const controller = read("work-detail-motion.js");
const recordPreview = read("work-record-preview.js");
const markup = read("index.html");
const originalSVG = read("assets/ai-efficiency-layered-v2.svg");
const preparedSVG = read("assets/ai-efficiency-layered-v2-prepared.svg");
const offline = read("assets/ai-efficiency-layered-v2-offline.js");
const arrayLiteral = (name, context = {}) => {
  const literal = carousel.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n  \\]);`))?.[1];
  assert.ok(literal, `${name} exists`);
  return vm.runInNewContext(`(${literal})`, context, { timeout: 1000 });
};
const mappings = arrayLiteral("AI_EFFICIENCY_REVEAL_CARDS");
const works = arrayLiteral("WORK_CARDS", {
  LENOVO_REVEAL_CARDS: arrayLiteral("LENOVO_REVEAL_CARDS"),
  BAIDU_REVEAL_CARDS: arrayLiteral("BAIDU_REVEAL_CARDS"),
  QUYE_REVEAL_CARDS: arrayLiteral("QUYE_REVEAL_CARDS"),
  AI_EFFICIENCY_REVEAL_CARDS: mappings,
});
const artwork = works[4].detail.images[0];
const modelFor = (options = {}) => createDetailMotionModel({
  controllerSource: controller, definition: artwork, bundledSVG: preparedSVG,
  resourceHref: "./ai-efficiency-layered-v2-images/model-resource.png", ...options,
});

test("the fifth AI card uses its supplied cover and binds the complete 1668 × 4244 project", () => {
  assert.equal(works.length, 5);
  const fifth = works[4];
  assert.equal(fifth.src, "./assets/work-card-05.png");
  assert.equal(fifth.coverInset, 24, "The 823 × 484 export has a 24px outer inset");
  assert.equal(fifth.coverImageBackground, "transparent");
  assert.match(fifth.alt, /AI/);
  assert.match(fifth.detail.title, /AI/);
  assert.equal(fifth.detail.images.length, 1, "The project is not sliced into bitmap strips");
  assert.equal(artwork.src, "./assets/ai-work-efficiency-v2.png");
  assert.equal(artwork.width, 1668);
  assert.equal(artwork.height, 4244);
  assert.equal(artwork.layeredArtwork, "./assets/ai-efficiency-layered-v2-prepared.svg");
  assert.equal(artwork.layeredArtworkKey, "ai-efficiency");
  assert.equal(artwork.rejectLayeredAncestry, true);
  assert.equal(artwork.revealCards, mappings);
  assert.equal(works.flatMap((work) => work.detail.images)
    .filter((image) => image.src === artwork.src).length, 1);
  const png = fs.readFileSync(path.join(root, "assets/ai-work-efficiency-v2.png"));
  assert.ok(png.length > 33);
  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1668);
  assert.equal(png.readUInt32BE(20), 4244);
});

test("the supplied fifth cover and AI record retain exact PNG sizes and independent bindings", () => {
  const assets = [
    [works[4].src, 823, 484],
    ["./assets/work-record-ai.png", 1254, 1254],
  ];
  assets.forEach(([source, width, height]) => {
    const png = fs.readFileSync(path.join(root, source));
    assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.equal(png[25], 6, "The supplied PNG retains an alpha channel");
  });
  assert.match(markup, /id="recordAi"[^>]*src="\.\/assets\/work-record-ai\.png"[^>]*data-project-record="ai"/);
  assert.match(markup, /id="recordAiLayer"/);
});

test("version two PNG and SVG contain changed bytes while the original version remains recoverable", () => {
  const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
  const previousPNG = path.join(root, "assets/ai-work-efficiency.png");
  const previousSVG = path.join(root, "assets/ai-efficiency-layered.svg");
  assert.ok(fs.existsSync(previousPNG), "The previous complete PNG is retained");
  assert.ok(fs.existsSync(previousSVG), "The previous original SVG is retained");
  const latestPNGHash = hash(fs.readFileSync(path.join(root, "assets/ai-work-efficiency-v2.png")));
  const latestSVGHash = hash(originalSVG);
  assert.equal(latestPNGHash, "40a1e5aa04220123dbc7aa4bc2d42a60a93be4ddef985528435f8bcde47b8ab8");
  assert.equal(latestSVGHash, "6b35de11b990af7ef0b55c9b865dc54116f978d0e42da53ef995ac99a5df23d1");
  assert.notEqual(latestPNGHash, hash(fs.readFileSync(previousPNG)), "PNG content changes, not just its filename");
  assert.notEqual(latestSVGHash, hash(fs.readFileSync(previousSVG)), "Original vector content changes too");
});

test("existing four bindings remain independent while index four gains an AI project disc", () => {
  const covers = ["./assets/work-card-01.png", "./assets/work-card-02.png",
    "./assets/work-card-03.png", "./assets/work-card-04.png"];
  const content = ["./assets/douyin-super-lucky-bag-v2.png", "./assets/lenovo-ai-service-v2.png",
    "./assets/baidu-bid-diagnosis.png", "./assets/quye-outdoor-social.png"];
  works.slice(0, 4).forEach((work, index) => {
    assert.equal(work.src, covers[index]);
    assert.equal(work.detail.images[0].src, content[index]);
    assert.notEqual(work.detail, works[4].detail);
    assert.notEqual(work.detail.images[0].revealCards, mappings);
  });
  assert.equal(works[1].coverInset, 24);
  assert.equal(works[1].coverImageBackground, "transparent");
  const literal = recordPreview.match(/const themes = (\[[\s\S]*?\n  \])\.map/)?.[1];
  assert.ok(literal);
  const themes = vm.runInNewContext(`(${literal})`, {}, { timeout: 1000 });
  assert.deepEqual(Array.from(themes, (theme) => theme.index), [0, 1, 3, 4]);
  assert.equal(themes[3].name, "ai");
  assert.equal(themes[3].layerId, "recordAiLayer");
  assert.equal(themes[3].artworkId, "recordAi");
  const gate = carousel.match(/portfolioWorkRecordPreview\?\.setEnabled\(([\s\S]*?),\s*active,\s*\);/)?.[1];
  assert.ok(gate);
  assert.match(gate, /active\s*===\s*4/);
  assert.deepEqual(Array.from(markup.matchAll(/data-project-record="([^"]+)"/g), (match) => match[1]),
    ["douyin", "lenovo", "quye", "ai"]);
});

test("the SVG retains its original canvas, 462 unique IDs, and three whole nonnested reveal units", () => {
  for (const svg of [originalSVG, preparedSVG]) {
    const header = svg.match(/<svg\b[^>]*>/)?.[0];
    assert.ok(header);
    assert.match(header, /\bwidth="1668"/);
    assert.match(header, /\bheight="4244"/);
    assert.match(header, /\bviewBox="0 0 1668 4244"/);
  }
  assert.equal(mappings.length, 3);
  const names = new Set();
  const selected = [];
  mappings.forEach((card) => {
    assert.ok(typeof card.name === "string" && card.name.trim() && !names.has(card.name));
    names.add(card.name);
    assert.ok(Number.isFinite(card.top) && card.top >= 0);
    assert.ok(Number.isFinite(card.bottom) && card.bottom > card.top && card.bottom <= 4244);
    assert.ok(card.parts.length > 0);
    card.parts.forEach((part) => { assert.ok(part.length > 0); selected.push(...part); });
  });
  assert.deepEqual(Array.from(selected), ["Group 2147226801", "Group 2147241199",
    "Group 2147241204", "Group 2147241205"]);
  assert.equal(new Set(selected).size, 4);
  const occurrences = new Map();
  const ancestors = new Map();
  const stack = [];
  const decode = (id) => id.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi,
    (entity, hex, decimal, named) => hex || decimal
      ? String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10))
      : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named.toLowerCase()]);
  for (const match of preparedSVG.matchAll(/<(\/?)([\w:.-]+)\b([^>]*)>/g)) {
    const [, closing, tag, attributes] = match;
    if (closing) { assert.equal(stack.pop()?.tag, tag); continue; }
    const encoded = attributes.match(/\bid="([^"]*)"/)?.[1];
    const id = encoded === undefined ? undefined : decode(encoded);
    if (id !== undefined) {
      occurrences.set(id, (occurrences.get(id) || 0) + 1);
      ancestors.set(id, stack.map((node) => node.id).filter((value) => value !== undefined));
    }
    if (!/\/\s*$/.test(attributes)) stack.push({ tag, id });
  }
  assert.equal(stack.length, 0);
  assert.equal(occurrences.size, 462);
  assert.ok(Array.from(occurrences.values()).every((count) => count === 1));
  selected.forEach((id) => {
    assert.equal(occurrences.get(id), 1);
    assert.ok(!ancestors.get(id).some((parent) => selected.includes(parent)),
      `An animated ancestor must not also own ${id}`);
  });
});

test("all 20 original images are extracted without changing bytes or any SVG geometry", () => {
  const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
    "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg" };
  const images = new Set();
  const expected = originalSVG.replace(
    /((?:xlink:)?href\s*=\s*)(["'])data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n\t ]+)\2/g,
    (original, attribute, quote, mime, encoded) => {
      const bytes = Buffer.from(encoded.replace(/\s/g, ""), "base64");
      const hash = crypto.createHash("sha256").update(bytes).digest("hex");
      assert.ok(extensions[mime.toLowerCase()]);
      const name = `${hash}.${extensions[mime.toLowerCase()]}`;
      assert.ok(fs.readFileSync(path.join(root, "assets/ai-efficiency-layered-v2-images", name)).equals(bytes));
      images.add(name);
      return `${attribute}${quote}./ai-efficiency-layered-v2-images/${name}${quote}`;
    },
  );
  assert.equal(images.size, 20);
  assert.doesNotMatch(preparedSVG, /data:image\//i);
  assert.equal(preparedSVG, expected);
});

test("offline AI registry preserves exact SVG text and coexists with the earlier Quye bundle", () => {
  const sources = { quye: "preserved earlier artwork" };
  const window = { portfolioLayeredArtworkSources: sources };
  vm.runInNewContext(offline, { window }, { timeout: 1000 });
  assert.equal(window.portfolioLayeredArtworkSources, sources);
  assert.equal(sources.quye, "preserved earlier artwork");
  assert.equal(sources["ai-efficiency"], preparedSVG);
  const position = markup.indexOf("./assets/ai-efficiency-layered-v2-offline.js");
  assert.ok(position >= 0 && position < markup.indexOf("./work-detail-motion.js"));
});

test("the shared fill helper binds fifth dimensions, layer metadata, and independent reading memory", () => {
  const literal = detail.match(/const fillContent = (\(work\) => \{[\s\S]*?\n  \});/)?.[1];
  assert.ok(literal);
  const title = {};
  const content = { style: {}, children: [],
    replaceChildren() { this.children.length = 0; }, append(node) { this.children.push(node); } };
  const document = { createElement: (tag) => {
    assert.equal(tag, "img");
    return { dataset: {}, style: {}, addEventListener() {}, remove() {} };
  } };
  const fill = vm.runInNewContext(`(${literal})`, { title, content, document, TARGET: { width: 1668 } });
  const nodes = fill(works[4]);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].src, artwork.src);
  assert.equal(nodes[0].width, 1668);
  assert.equal(nodes[0].height, 4244);
  assert.equal(nodes[0].style.height, undefined, "This original-size export needs no ratio correction");
  assert.equal(nodes[0].dataset.layeredArtwork, artwork.layeredArtwork);
  assert.equal(nodes[0].dataset.layeredArtworkKey, "ai-efficiency");
  assert.equal(nodes[0].dataset.rejectLayeredAncestry, "true");
  assert.equal(nodes[0].dataset.revealCards, JSON.stringify(mappings));
  assert.equal(title.textContent, works[4].detail.title);
  assert.match(detail, /restoreReadingPosition\(index, detailImages\)/);
  assert.match(detail, /scrollPositions\.set\(selected\.index,/);
  assert.equal(145 + artwork.height - 1080, 3309, "Static native-panel model reaches the whole fifth project");
});

test("unit model waits for 20% entry, replays the fifth flow, and sequences bottom skill groups at 0 and 0.18", async () => {
  const model = modelFor();
  assert.equal(model.fetches.length, 0, "Bundled artwork does not request SVG over fetch");
  assert.equal(model.content.children[0], model.image);
  model.resolveDecode();
  await flushTasks();
  const flow = model.wrappersFor("ai-efficiency-flow");
  assert.equal(flow.length, 1);
  assert.equal(flow[0].dataset.revealState, "armed");
  assert.ok(model.sets.some((call) => call.properties.y === 96 && call.targets.includes(flow[0])));
  model.scrollTo(300);
  assert.equal(flow[0].dataset.revealState, "armed");
  assert.equal(flow[0].dataset.revealPlays, undefined);
  model.scrollTo(400);
  assert.equal(flow[0].dataset.revealPlays, "1");
  model.timelines.find((owner) => owner.calls.some((call) => call.targets.includes(flow[0]))).complete();
  model.scrollTo(0);
  assert.equal(flow[0].dataset.revealState, "armed");
  model.scrollTo(400);
  assert.equal(flow[0].dataset.revealPlays, "2");
  model.scrollTo(2700);
  const tools = model.timelines.findLast((owner) => owner.calls.some((call) =>
    call.targets.some((target) => target.dataset.revealCard === "ai-efficiency-tools")));
  assert.ok(tools);
  assert.deepEqual(tools.calls.map((call) => call.position), [0, 0.18]);
  assert.deepEqual(tools.calls.map((call) => call.targets[0].dataset.figmaLayer),
    ["Group 2147241204", "Group 2147241205"]);
  assert.equal(tools.settings.defaults.duration, 1.4);
  assert.equal(tools.settings.defaults.ease, "sine.inOut");
  model.dispose();
  assert.equal(model.content.children[0], model.image);
});

test("unit model keeps the fifth PNG on decode failure and skips animation for reduced motion", async () => {
  const failed = modelFor();
  failed.rejectDecode(new Error("Fixture resource failure"));
  await flushTasks();
  assert.equal(failed.content.children[0], failed.image);
  assert.ok(failed.warnings.length > 0);
  failed.dispose();
  for (const options of [{ reducedMotion: true }, { useGSAP: false }]) {
    const model = modelFor(options);
    assert.equal(model.content.children[0], model.image);
    assert.equal(model.parsed.length, 0);
    assert.equal(model.fetches.length, 0);
    assert.equal(model.timelines.length, 0);
    assert.doesNotThrow(model.dispose);
  }
});

test("unit model respects the top-exit motion envelope and 216px return threshold without stacking replays", async () => {
  const model = modelFor();
  model.resolveDecode();
  await flushTasks();
  const flow = model.wrappersFor("ai-efficiency-flow")[0];
  const end = 145 + mappings[0].bottom;
  const owners = () => model.timelines.filter((owner) => owner.calls.some((call) => call.targets.includes(flow)));
  model.scrollTo(400);
  owners()[0].complete();
  for (const outside of [end + 65, end + 160]) {
    model.scrollTo(outside);
    assert.equal(flow.dataset.revealState, "shown", "A 96px reset cannot put the tail back on screen");
  }
  model.scrollTo(end + 161);
  assert.equal(flow.dataset.revealState, "armed");
  assert.ok(end + 96 < model.panel.scrollTop - 64);
  model.scrollTo(end - 215);
  assert.equal(flow.dataset.revealState, "armed");
  model.scrollTo(end - 216);
  assert.equal(flow.dataset.revealPlays, "2");
  const second = owners()[1];
  for (const top of [end - 215, end - 216, end - 220, end - 216]) model.scrollTo(top);
  assert.equal(owners().length, 2, "Rapid entry changes cannot create parallel owners for the same card");
  assert.equal(second.killed, false);
  model.scrollTo(end + 161);
  assert.equal(second.killed, true);
  model.scrollTo(end - 216);
  assert.equal(flow.dataset.revealPlays, "3");
  model.dispose();
  assert.ok(owners().every((owner) => owner.killed));
  assert.equal(model.content.children[0], model.image);
});
