#!/usr/bin/env node
"use strict";

// Exported-file integrity, declarative bindings, and real helper execution
// against minimal data fixtures only. These are not browser or visual tests.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const readSource = (name) => fs.readFileSync(path.join(projectRoot, name), "utf8");
const carousel = readSource("work-carousel.js");
const detail = readSource("work-detail.js");
const detailCSS = readSource("work-detail.css");
const detailMotion = readSource("work-detail-motion.js");
const styles = readSource("styles.css");
const script = readSource("script.js");
const markup = readSource("index.html");
const preview = readSource("work-record-preview.js");
const sourceSVG = readSource("assets/quye-layered.svg");
const preparedSVG = readSource("assets/quye-layered-prepared.svg");
const offlineSource = readSource("assets/quye-layered-offline.js");
const DESIGN_WIDTH = 1668;
const DESIGN_HEIGHT = 21189.681640625;

const readArrayLiteral = (name, context = {}) => {
  const literal = carousel.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n  \\]);`))?.[1];
  assert.ok(literal, `The ${name} data literal exists`);
  return vm.runInNewContext(`(${literal})`, context, { timeout: 1000 });
};
const readWorks = () => readArrayLiteral("WORK_CARDS", {
  LENOVO_REVEAL_CARDS: readArrayLiteral("LENOVO_REVEAL_CARDS"),
  BAIDU_REVEAL_CARDS: readArrayLiteral("BAIDU_REVEAL_CARDS"),
  QUYE_REVEAL_CARDS: readArrayLiteral("QUYE_REVEAL_CARDS"),
  AI_EFFICIENCY_REVEAL_CARDS: readArrayLiteral("AI_EFFICIENCY_REVEAL_CARDS"),
});

const readPNG = (relativePath) => {
  const bytes = fs.readFileSync(path.join(projectRoot, relativePath));
  assert.ok(bytes.length > 33, `${relativePath}: exported PNG is nonempty`);
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `${relativePath}: PNG signature`);
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR", `${relativePath}: first chunk is IHDR`);
  assert.equal(bytes.readUInt32BE(8), 13, `${relativePath}: complete IHDR`);
  let offset = 8;
  let imageDataBytes = 0;
  let finished = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString("ascii", offset + 4, offset + 8);
    assert.ok(offset + length + 12 <= bytes.length, `${relativePath}: complete ${kind} chunk`);
    if (kind === "IDAT") imageDataBytes += length;
    offset += length + 12;
    if (kind === "IEND") {
      assert.equal(length, 0, `${relativePath}: valid IEND size`);
      finished = true;
      break;
    }
  }
  assert.ok(imageDataBytes > 0, `${relativePath}: compressed pixel data exists`);
  assert.ok(finished, `${relativePath}: exported stream reaches IEND`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cssDeclarations = (css, selector) => {
  const rule = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]+)\\}`))?.[1];
  assert.ok(rule, `The ${selector} declaration exists`);
  return (property) => rule.match(new RegExp(`(?:^|[;\\n])\\s*${escapeRegExp(property)}\\s*:\\s*([^;]+);`))?.[1].trim();
};

test("the complete high-resolution Quye export retains its 2580 × 32768 PNG root and pixel-data stream", () => {
  assert.deepEqual(readPNG("assets/quye-outdoor-social.png"), { width: 2580, height: 32768 });
});

test("the fourth card alone binds one full independent Quye detail, preserving its cover and hover disc", () => {
  const works = readWorks();
  assert.equal(works.length, 5);
  const quye = works[3];
  assert.equal(quye.src, "./assets/work-card-04.png");
  assert.match(quye.alt, /趣野/);
  assert.match(quye.detail.title, /趣野/);
  assert.equal(quye.detail.images.length, 1, "The export is not cut into horizontal strips");
  const image = quye.detail.images[0];
  assert.equal(image.src, "./assets/quye-outdoor-social.png");
  assert.equal(image.width, 2580);
  assert.equal(image.height, 32768);
  assert.equal(image.designWidth, DESIGN_WIDTH);
  assert.equal(image.designHeight, DESIGN_HEIGHT);
  assert.equal(image.layeredArtwork, "./assets/quye-layered-prepared.svg");
  assert.equal(image.layeredArtworkKey, "quye");
  assert.equal(image.rejectLayeredAncestry, true);
  assert.equal(JSON.stringify(image.revealCards), JSON.stringify(readArrayLiteral("QUYE_REVEAL_CARDS")));
  assert.equal(image.revealCards.length, 18);
  const allImages = works.flatMap((work) => work.detail?.images || []);
  assert.equal(allImages.filter((item) => item.src === image.src).length, 1);
  for (const [index, work] of works.entries()) {
    if (index === 3) continue;
    assert.notEqual(quye.detail, work.detail);
    assert.ok(!(work.detail?.images || []).some((item) => item.src === image.src));
  }
  assert.deepEqual(readPNG("assets/work-card-04.png"), { width: 775, height: 436 });
  assert.deepEqual(readPNG("assets/work-record-quye.png"), { width: 1061, height: 1061 });
  assert.match(preview, /index:\s*3,\s*name:\s*"quye",\s*layerId:\s*"recordQuyeLayer",\s*artworkId:\s*"recordQuye"/);
  assert.match(markup, /id="recordQuye"[^>]*src="\.\/assets\/work-record-quye\.png"[^>]*data-project-record="quye"/);
});

test("the shared content helper reserves physical PNG dimensions and calibrates logical full height without slicing", () => {
  const literal = detail.match(/const fillContent = (\(work\) => \{[\s\S]*?\n  \});/)?.[1];
  assert.ok(literal, "The real shared fillContent helper is available");
  const title = {};
  const content = {
    style: {}, children: [],
    replaceChildren() { this.children.length = 0; },
    append(node) { this.children.push(node); },
  };
  const document = {
    createElement(tag) {
      assert.equal(tag, "img", "The shared helper appends the export itself");
      return { tagName: tag, dataset: {}, style: {}, listeners: [],
        addEventListener(type, callback, options) { this.listeners.push({ type, callback, options }); },
        remove() { this.removed = true; } };
    },
  };
  const fillContent = vm.runInNewContext(`(${literal})`, {
    title, content, document, TARGET: { width: DESIGN_WIDTH },
  }, { timeout: 1000 });
  const work = readWorks()[3];
  const nodes = fillContent(work);
  assert.equal(nodes.length, 1);
  assert.equal(content.children.length, 1);
  assert.equal(nodes[0], content.children[0]);
  assert.equal(nodes[0].src, "./assets/quye-outdoor-social.png");
  assert.equal(nodes[0].width, 2580);
  assert.equal(nodes[0].height, 32768);
  assert.equal(nodes[0].dataset.layeredArtwork, "./assets/quye-layered-prepared.svg");
  assert.equal(nodes[0].dataset.layeredArtworkKey, "quye");
  assert.equal(nodes[0].dataset.rejectLayeredAncestry, "true");
  assert.equal(nodes[0].dataset.designWidth, String(DESIGN_WIDTH));
  assert.equal(nodes[0].dataset.designHeight, String(DESIGN_HEIGHT));
  assert.equal(nodes[0].dataset.revealCards, JSON.stringify(work.detail.images[0].revealCards));
  assert.ok(Math.abs(Number.parseFloat(nodes[0].style.height) - DESIGN_HEIGHT) < 0.01,
    "The entire image is calibrated to the logical Figma height rather than the export's rounded aspect ratio");
  assert.equal(nodes[0].style.objectFit, undefined, "The high-resolution export is not cover-cropped");
  assert.equal(nodes[0].style.clipPath, undefined, "No visual crop is applied to the full export");
  assert.equal(title.textContent, work.detail.title);
  for (const existing of readWorks().slice(0, 3)) {
    const existingNodes = fillContent(existing);
    assert.equal(existingNodes.length, existing.detail.images.length);
    existingNodes.forEach((image, index) => {
      const data = existing.detail.images[index];
      assert.equal(image.src, data.src);
      assert.equal(image.width, data.width);
      assert.equal(image.height, data.height);
      assert.equal(image.style.height, undefined,
        "Projects without optional logical dimensions retain their original automatic image height");
    });
  }
});

test("shared display geometry preserves the full export's ratio and models an available full-length scroll", () => {
  const targetLiteral = detail.match(/const TARGET = (\{[^;]+\});/)?.[1];
  assert.ok(targetLiteral);
  const target = vm.runInNewContext(`(${targetLiteral})`, {}, { timeout: 1000 });
  assert.equal(target.x, 126);
  assert.equal(target.y, 145);
  assert.equal(target.width, 1668);
  assert.equal(target.height, 935);
  const panel = cssDeclarations(detailCSS, ".work-detail__panel");
  assert.equal(panel("inset"), "0");
  assert.equal(panel("overflow-y"), "auto");
  assert.equal(panel("overflow-x"), "hidden");
  const sheet = cssDeclarations(detailCSS, ".work-detail__sheet");
  const content = cssDeclarations(detailCSS, ".work-detail__content");
  const image = cssDeclarations(detailCSS, ".work-detail__content img");
  assert.equal(sheet("left"), "126px");
  assert.equal(sheet("width"), "1668px");
  assert.equal(sheet("margin-top"), "145px");
  assert.equal(content("width"), "1668px");
  assert.equal(content("height"), undefined, "The content is not fixed to the short opening viewport");
  assert.equal(image("width"), "100%");
  assert.equal(image("height"), "auto");
  assert.equal(image("object-fit"), undefined, "The detail image is not cover-cropped");
  const artwork = readWorks()[3].detail.images[0];
  const displayedHeight = artwork.designHeight * target.width / artwork.designWidth;
  assert.equal(displayedHeight, DESIGN_HEIGHT);
  // Static geometry model only, not a measured browser scrollHeight.
  const stageHeight = 1080;
  const modeledMaximumScroll = target.y + displayedHeight - stageHeight;
  assert.equal(modeledMaximumScroll, 20254.681640625);
  assert.equal(target.y - target.y, 0, "Scrolling the initial margin removes the top gap");
  assert.equal(target.y + displayedHeight - modeledMaximumScroll, stageHeight,
    "The complete export's lower edge is reachable in the native panel model");
});

test("Quye offline registry contains the exact prepared SVG and loads before the shared motion adapter", () => {
  const existing = { preserved: "unrelated artwork" };
  const window = { portfolioLayeredArtworkSources: existing };
  vm.runInNewContext(offlineSource, { window }, { filename: "quye-layered-offline.js", timeout: 2000 });
  assert.equal(window.portfolioLayeredArtworkSources, existing);
  assert.equal(existing.preserved, "unrelated artwork");
  assert.equal(existing.quye, preparedSVG);
  const bundled = markup.indexOf("./assets/quye-layered-offline.js");
  const motion = markup.indexOf("./work-detail-motion.js");
  assert.ok(bundled >= 0 && motion > bundled, "The bundle is available before the controller can enhance the PNG");
});

test("Quye native SVG and prepared SVG keep the 1668 × 21190 original canvas", () => {
  for (const svg of [sourceSVG, preparedSVG]) {
    const header = svg.match(/<svg\b[^>]*>/)?.[0];
    assert.ok(header);
    assert.match(header, /\bwidth="1668"/);
    assert.match(header, /\bheight="21190"/);
    assert.match(header, /\bviewBox="0 0 1668 21190"/);
    assert.ok(Math.abs(21190 - DESIGN_HEIGHT) < 0.5, "Only export rounding separates logical and SVG heights");
  }
});

const decodeXML = (value) => value.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi,
  (entity, hex, decimal, named) => hex || decimal
    ? String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10))
    : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named.toLowerCase()]);

test("all 18 Quye units target unique original layers, with no simultaneously selected ancestor", () => {
  const cards = readArrayLiteral("QUYE_REVEAL_CARDS");
  assert.equal(cards.length, 18);
  const names = new Set();
  const selected = [];
  for (const card of cards) {
    assert.ok(typeof card.name === "string" && card.name.trim());
    assert.ok(!names.has(card.name));
    names.add(card.name);
    assert.ok(Number.isFinite(card.top) && card.top >= 0);
    assert.ok(Number.isFinite(card.bottom) && card.bottom > card.top && card.bottom <= 21190);
    assert.ok(Array.isArray(card.parts) && card.parts.length > 0);
    for (const part of card.parts) {
      assert.ok(Array.isArray(part) && part.length > 0);
      part.forEach((id) => { assert.ok(typeof id === "string" && id.trim()); selected.push(id); });
    }
  }
  assert.equal(selected.length, 22);
  assert.equal(new Set(selected).size, selected.length, "No original node is animated twice");
  const stack = [];
  const occurrences = new Map();
  const ancestors = new Map();
  // Exported SVG tag structure only; no rendering or DOM geometry is inferred.
  for (const match of preparedSVG.matchAll(/<(\/?)([\w:.-]+)\b([^>]*)>/g)) {
    const [, closing, tag, attributes] = match;
    if (closing) {
      assert.equal(stack.pop()?.tag, tag, "Exported SVG nesting is balanced");
      continue;
    }
    const id = attributes.match(/\bid="([^"]*)"/)?.[1];
    const decoded = id === undefined ? undefined : decodeXML(id);
    if (decoded !== undefined) {
      occurrences.set(decoded, (occurrences.get(decoded) || 0) + 1);
      ancestors.set(decoded, stack.map((node) => node.id).filter((value) => value !== undefined));
    }
    if (!/\/\s*$/.test(attributes)) stack.push({ tag, id: decoded });
  }
  assert.equal(stack.length, 0);
  const selectedSet = new Set(selected);
  for (const id of selected) {
    assert.equal(occurrences.get(id), 1, `Original Figma node exists exactly once: ${id}`);
    assert.ok(!(ancestors.get(id) || []).some((ancestor) => selectedSet.has(ancestor)),
      `An animated ancestor cannot also own ${id}`);
  }
  assert.equal(JSON.stringify(cards.find((card) => card.name === "quye-gray-card-stack").parts),
    JSON.stringify([["Group 528"], ["Group 529"], ["Group 530"]]));
  assert.equal(JSON.stringify(cards.find((card) => card.name === "quye-ai-phone-sequence").parts),
    JSON.stringify([["Group 655"], ["Group 653"], ["Group 654"]]));
  assert.ok(!selectedSet.has("Group 2147241288") && !selectedSet.has("Group 2147241324"),
    "The two sequence parents remain static while their complete children move");
});

test("Quye preparation preserves every exported image byte and changes only the image hrefs", () => {
  const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
    "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg" };
  const images = new Set();
  const expected = sourceSVG.replace(
    /((?:xlink:)?href\s*=\s*)(["'])data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n\t ]+)\2/g,
    (original, attribute, quote, mime, encoded) => {
      const extension = extensions[mime.toLowerCase()];
      assert.ok(extension);
      const bytes = Buffer.from(encoded.replace(/\s/g, ""), "base64");
      const hash = crypto.createHash("sha256").update(bytes).digest("hex");
      const name = `${hash}.${extension}`;
      const extracted = fs.readFileSync(path.join(projectRoot, "assets/quye-layered-images", name));
      assert.ok(extracted.equals(bytes), `Original image bytes are unchanged: ${name}`);
      images.add(name);
      return `${attribute}${quote}./quye-layered-images/${name}${quote}`;
    },
  );
  assert.equal(images.size, 111, "Every distinct native-exported raster resource is checked");
  assert.doesNotMatch(preparedSVG, /data:image\//i);
  assert.equal(preparedSVG, expected, "Paths, text outlines, masks, filters, and geometry are unchanged");
});

const { createDetailMotionModel, flushTasks } = require("./detail_motion_test_fixture.cjs");
const createMotionModel = (options = {}) => createDetailMotionModel({
  controllerSource: detailMotion, definition: readWorks()[3].detail.images[0],
  bundledSVG: preparedSVG, svgWidth: 1668, svgHeight: 21190, ...options,
});

test("unit model keeps PNG during loading, uses bundled SVG without fetch, and replays complete groups on second scroll entry", async () => {
  const model = createMotionModel();
  assert.equal(model.fetches.length, 0);
  assert.equal(model.parsed[0].text, preparedSVG);
  assert.equal(model.content.children.length, 1);
  assert.equal(model.content.children[0], model.image, "The PNG remains until every resource is decoded");
  assert.equal(model.preloads.length, 1);
  assert.equal(model.preloads[0].src,
    "https://unit.invalid/portfolio/assets/quye-layered-images/model-resource.png");
  model.resolveDecode();
  await flushTasks();
  assert.equal(model.content.children[0].classList.contains("is-reveal-ready"), true);
  const wrappers = model.wrappersFor("quye-introduction");
  assert.equal(wrappers.length, 1);
  assert.equal(wrappers[0].dataset.revealState, "armed");
  assert.ok(model.sets.some((call) => call.properties.y === 96 && call.targets.includes(wrappers[0])));
  model.scrollTo(1000);
  assert.equal(wrappers[0].dataset.revealState, "armed");
  assert.equal(wrappers[0].dataset.revealPlays, undefined);
  model.scrollTo(1100);
  assert.equal(wrappers[0].dataset.revealState, "revealing");
  assert.equal(wrappers[0].dataset.revealPlays, "1");
  model.timelines.find((owner) => owner.calls.some((call) => call.targets.includes(wrappers[0]))).complete();
  assert.equal(wrappers[0].dataset.revealState, "shown");
  model.scrollTo(0);
  assert.equal(wrappers[0].dataset.revealState, "armed");
  model.scrollTo(1100);
  assert.equal(wrappers[0].dataset.revealPlays, "2", "A second entry schedules a fresh reveal");

  for (const [name, top] of [["quye-gray-card-stack", 2250], ["quye-ai-phone-sequence", 17300]]) {
    model.scrollTo(top);
    const sequence = model.timelines.findLast((owner) => owner.calls.some((call) =>
      call.targets.some((target) => target.dataset.revealCard === name)));
    assert.ok(sequence);
    assert.deepEqual(sequence.calls.map((call) => call.position), [0, 0.18, 0.36]);
    assert.equal(sequence.calls.length, 3);
    sequence.calls.forEach((call) => {
      assert.equal(call.targets.length, 1, "Each part is one complete original Figma child group");
      assert.equal(call.properties.y, 0);
      assert.equal(sequence.settings.defaults.duration, 1.4);
      assert.equal(sequence.settings.defaults.ease, "sine.inOut");
    });
  }
  model.document.hidden = true;
  model.document.dispatchEvent(new Event("visibilitychange"));
  assert.ok(model.wrappersFor("quye-ai-phone-sequence")
    .every((wrapper) => wrapper.dataset.revealState === "shown"),
  "Hiding the document settles active reveals rather than leaving suspended transforms");
  model.motionQuery.matches = true;
  model.motionQuery.dispatchEvent(new Event("change"));
  assert.equal(model.content.children[0], model.image, "Reduced-motion change restores the original PNG");
  assert.ok(model.timelines.every((owner) => owner.killed));
  assert.doesNotThrow(model.dispose);
});

test("unit model preserves PNG on resource failure, missing bundle, bad ancestry, or disposal before load", async () => {
  const failed = createMotionModel();
  failed.rejectDecode(new Error("Model decode failed"));
  await flushTasks();
  assert.equal(failed.content.children[0], failed.image);
  assert.ok(failed.warnings.length > 0);
  failed.dispose();
  const missing = createMotionModel({ bundled: false });
  await flushTasks();
  assert.equal(missing.fetches.length, 1);
  assert.equal(missing.content.children[0], missing.image);
  missing.dispose();
  const nested = createMotionModel({ invalidAncestry: true });
  await flushTasks();
  assert.equal(nested.content.children[0], nested.image);
  assert.equal(nested.preloads.length, 0, "Ancestor rejection happens before resource loading or wrapping");
  assert.ok(nested.warnings.some((parts) => parts.join(" ").includes("group and its child")));
  nested.dispose();
  const closed = createMotionModel();
  closed.dispose();
  closed.resolveDecode();
  await flushTasks();
  assert.equal(closed.content.children[0], closed.image, "Late loading cannot revive a disposed enhancement");
  assert.equal(closed.timelines.length, 0);
});

test("unit model skips Quye enhancement entirely without GSAP or with reduced motion", () => {
  for (const options of [{ useGSAP: false }, { reducedMotion: true }]) {
    const model = createMotionModel(options);
    assert.equal(model.content.children[0], model.image);
    assert.equal(model.fetches.length, 0);
    assert.equal(model.parsed.length, 0);
    assert.equal(model.preloads.length, 0);
    assert.equal(model.timelines.length, 0);
    assert.doesNotThrow(model.dispose);
  }
});

test("unit model replays Quye from the top only after 216px visibility and keeps the reset envelope offscreen", async () => {
  const model = createMotionModel();
  model.resolveDecode();
  await flushTasks();
  const card = readArrayLiteral("QUYE_REVEAL_CARDS")[0];
  const end = 145 + card.bottom * DESIGN_HEIGHT / 21190;
  const wrapper = model.wrappersFor(card.name)[0];
  const owners = () => model.timelines.filter((owner) => owner.calls.some((call) => call.targets.includes(wrapper)));
  model.scrollTo(1100);
  owners()[0].complete();
  for (const outside of [end + 65, end + 160]) {
    model.scrollTo(outside);
    assert.equal(wrapper.dataset.revealState, "shown");
  }
  model.scrollTo(end + 161);
  assert.equal(wrapper.dataset.revealState, "armed");
  assert.ok(end + 96 < model.panel.scrollTop - 64);
  model.scrollTo(end - 215);
  assert.equal(wrapper.dataset.revealState, "armed");
  model.scrollTo(end - 216);
  assert.equal(wrapper.dataset.revealPlays, "2");
  for (const top of [end - 215, end - 220, end - 216]) model.scrollTo(top);
  assert.equal(owners().length, 2, "Minor scroll reversals do not stack timeline owners");
  model.dispose();
  assert.ok(owners().every((owner) => owner.killed));
});

test("shared full-length scrolling, per-project reading memory, closing, and mosaic callsites remain connected", () => {
  assert.match(detail, /const detailImages = fillContent\(work\);/);
  assert.match(detail, /restoreReadingPosition\(index, detailImages\);/);
  assert.match(detail, /scrollPositions\.get\(index\)/);
  assert.match(detail, /scrollPositions\.set\(selected\.index, pendingScrollRestore\?\.target \?\? panel\.scrollTop\)/);
  assert.match(detail, /panel\.append\(backpaper, sheet\)/, "The sheet belongs to the native scroll surface");
  assert.match(detail, /closeButton\.addEventListener\("click", close,/);
  assert.match(detail, /if \(event\.key === "Escape"\) \{[\s\S]*?close\(\);/);
  assert.match(detail, /stage\.classList\.add\("is-work-detail-active"\)/);
  assert.match(detail, /stage\.classList\.remove\("is-work-detail-active"\)/);
  const activeTrail = cssDeclarations(styles, ".stage.is-work-detail-active .pixel-trail");
  const detailMount = cssDeclarations(detailCSS, ".work-detail");
  assert.ok(Number(activeTrail("z-index")) > Number(detailMount("z-index")), "The existing mosaic remains above the detail");
  assert.equal(cssDeclarations(styles, ".pixel-trail")("pointer-events"), "none");
  assert.match(script, /stage\.addEventListener\("pointermove", addPixelTrailPoint/);
});
