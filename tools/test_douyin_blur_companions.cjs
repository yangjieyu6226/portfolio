#!/usr/bin/env node
"use strict";

// Exported SVG structure/byte integrity plus real-controller data-model tests.
// Does not emulate foreignObject rasterization, GSAP playback, or browser GPU
// composition, and therefore does not claim to visually certify flicker fixes.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createDetailMotionModel, flushTasks } = require("./detail_motion_test_fixture.cjs");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const controller = read("work-detail-motion.js");
const carousel = read("work-carousel.js");
const prepared = read("assets/douyin-layered-prepared.svg");
const offline = read("assets/douyin-layered-offline.js");
const readArray = (source, name, context = {}) => {
  const literal = source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n  \\]);`))?.[1];
  assert.ok(literal, `${name} exists`);
  return vm.runInNewContext(`(${literal})`, context, { timeout: 1000 });
};
const cards = readArray(controller, "CARDS");
const works = readArray(carousel, "WORK_CARDS", Object.fromEntries(
  ["LENOVO_REVEAL_CARDS", "BAIDU_REVEAL_CARDS", "QUYE_REVEAL_CARDS", "AI_EFFICIENCY_REVEAL_CARDS"]
    .map((name) => [name, readArray(carousel, name)])));
const definition = works[0].detail.images[0];
const solution = cards.find((card) => card.name === "solution-stack");
const companionClips = {
  "Rectangle 279335026": "bgblur_1_1029_11591_clip_path",
  "Rectangle 2131354573": "bgblur_2_1029_11591_clip_path",
};
const modelFor = (options = {}) => createDetailMotionModel({
  controllerSource: controller, definition, bundledSVG: prepared,
  resourceHref: "./douyin-layered-images/model-resource.png", ...options,
});
const hash = (relative) => crypto.createHash("sha256")
  .update(fs.readFileSync(path.join(root, relative))).digest("hex");
const decodeXML = (value) => value.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi,
  (entity, hex, decimal, named) => hex || decimal
    ? String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10))
    : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named.toLowerCase()]);
const parseTagStructure = (svg) => {
  const stack = [];
  const ids = new Map();
  for (const match of svg.matchAll(/<(\/?)([\w:.-]+)\b([^>]*)>/g)) {
    const [, closing, tag, attributeSource] = match;
    if (closing) { assert.equal(stack.pop()?.tag, tag); continue; }
    const attributes = Object.fromEntries(Array.from(attributeSource.matchAll(/([\w:.-]+)="([^"]*)"/g),
      (entry) => [entry[1], decodeXML(entry[2])]));
    const node = { tag, attributes, children: [], parent: stack.at(-1) ?? null };
    node.parent?.children.push(node);
    if (attributes.id) {
      assert.ok(!ids.has(attributes.id), `Unique SVG ID: ${attributes.id}`);
      ids.set(attributes.id, node);
    }
    if (!/\/\s*$/.test(attributeSource)) stack.push(node);
  }
  assert.equal(stack.length, 0);
  return ids;
};

test("the Douyin PNG, source SVG, prepared SVG, and offline bundle retain their pre-fix bytes", () => {
  const hashes = {
    "assets/douyin-super-lucky-bag-v2.png": "9ad5469c87eeaab2d74435122c14426c4116db9185cf330f54f9c2acc9d3589f",
    "assets/douyin-layered.svg": "84551be545638f07a0379855faf9dcc64cd799b52a8233d96e7f6d1c873c5298",
    "assets/douyin-layered-prepared.svg": "ea28ed683c683b32d794003317fe3a26607736390bad8588f6cf7fd207281710",
    "assets/douyin-layered-offline.js": "deb31d97fd41c69d321739b3fe56b0d6f7f99215fc887de24d2e46572e043d2e",
  };
  for (const [name, expected] of Object.entries(hashes)) assert.equal(hash(name), expected, name);
  const window = {};
  vm.runInNewContext(offline, { window }, { timeout: 2000 });
  assert.equal(window.portfolioLayeredArtworkSources.douyin, prepared);
});

test("both exported backdrop-blur foreignObjects are adjacent companions with original clips, filter, geometry, and 55 primary IDs", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(solution.companionClips)), companionClips);
  assert.equal(solution.top, 5208);
  assert.equal(cards.flatMap((card) => card.parts.flat()).length, 55);
  const ids = parseTagStructure(prepared);
  const allClips = Array.from(prepared.matchAll(/<foreignObject\b[^>]*><div\b[^>]*style="([^"]+)"/g),
    (match) => match[1].match(/clip-path:url\(#([^\s)]+)\)/)?.[1]);
  assert.deepEqual(allClips, [1, 2, 4, 10, 11, 12].map((number) => `bgblur_${number}_1029_11591_clip_path`));
  allClips.forEach((clip) => assert.equal(ids.get(clip)?.tag, "clipPath"));
  for (const [id, clip] of Object.entries(companionClips)) {
    const path = ids.get(id);
    assert.ok(path);
    const siblings = path.parent.children;
    const companion = siblings[siblings.indexOf(path) - 1];
    assert.equal(companion.tag, "foreignObject");
    assert.equal(companion.children[0].tag, "div");
    assert.match(companion.children[0].attributes.style, /backdrop-filter:blur\(1\.74px\)/);
    assert.ok(companion.children[0].attributes.style.includes(`clip-path:url(#${clip})`));
    for (const attribute of ["x", "y", "width", "height"]) {
      assert.ok(Number.isFinite(Number(companion.attributes[attribute])));
    }
    assert.equal(path.attributes["data-figma-bg-blur-radius"], "3.47664");
    assert.equal(ids.get(clip).tag, "clipPath");
    assert.equal(ids.get(clip).parent.tag, "defs");
  }
  for (const work of works.slice(1)) {
    assert.ok(work.detail.images[0].revealCards.every((card) => !card.companionClips),
      "The blur-pair exception does not alter any other project's mapping");
  }
});

const pairsBefore = (svg) => {
  const ids = new Map(svg.querySelectorAll("[id]").map((node) => [node.id, node]));
  return Object.entries(companionClips).map(([id, clip]) => {
    const node = ids.get(id);
    const companion = node.previousElementSibling;
    return { id, clip, node, companion, div: companion.firstElementChild,
      before: JSON.stringify([Array.from(node.attributes), Array.from(companion.attributes),
        Array.from(companion.firstElementChild.attributes)]) };
  });
};

test("the controller omits all six verified live blur surfaces but preserves paper geometry, primary order, and shared movement", async () => {
  let pairs;
  let rootOrder;
  let blurs;
  const model = modelFor({ mutateSVG: (svg) => {
    pairs = pairsBefore(svg);
    rootOrder = Array.from(svg.children).filter((node) => node.localName !== "foreignObject");
    blurs = svg.querySelectorAll("foreignObject");
  } });
  const svg = model.parsed[0].svg;
  assert.equal(blurs.length, 6);
  assert.equal(svg.querySelectorAll("foreignObject").length, 0, "Runtime backdrops are removed before resource decode");
  assert.ok(blurs.every((node) => node.parentElement === null));
  model.resolveDecode(); await flushTasks();
  assert.equal(model.content.children[0].classList.contains("is-reveal-ready"), true);
  for (const pair of pairs) {
    const wrapper = pair.node.parentElement;
    assert.equal(pair.companion.parentElement, null);
    assert.deepEqual(wrapper.children, [pair.node]);
    assert.equal(wrapper.dataset.figmaLayer, pair.id);
    assert.equal(wrapper.dataset.figmaCompanionClip, pair.clip);
    assert.equal(pair.before, JSON.stringify([Array.from(pair.node.attributes),
      Array.from(pair.companion.attributes), Array.from(pair.div.attributes)]));
    assert.ok(model.sets.some((call) => call.targets.includes(wrapper) && call.properties.y === 96));
  }
  const expandedOrder = svg.children.flatMap((node) => node.dataset.figmaLayer ? node.children : [node]);
  assert.deepEqual(expandedOrder, rootOrder, "Original primary paint order is retained after only the live blurs are omitted");
  assert.equal(svg.querySelectorAll("[id]").filter((node) => node.parentElement?.dataset.figmaLayer).length, 55);
  model.scrollTo(145 + solution.top - model.panel.clientHeight + model.panel.clientHeight * 0.2);
  const sequence = model.timelines.find((owner) => owner.calls.some((call) => call.targets.includes(pairs[0].node.parentElement)));
  assert.ok(sequence);
  assert.deepEqual(sequence.calls.map((call) => call.position), [0, 0.18]);
  assert.equal(sequence.settings.defaults.duration, 1.4);
  assert.equal(sequence.settings.defaults.ease, "sine.inOut");
  for (const pair of pairs) {
    const movement = sequence.calls.find((call) => call.targets.includes(pair.node.parentElement));
    assert.equal(movement.properties.y, 0);
    assert.ok(!movement.targets.includes(pair.companion), "A blur does not own a second independent tween");
  }
  sequence.complete(); model.dispose();
  assert.equal(model.content.children[0], model.image);
});

test("wrong or missing companion tags, content, clip references, and clip definitions fail closed before any wrapping", async () => {
  const [id, clip] = Object.entries(companionClips)[0];
  const faults = {
    missing: (node) => node.previousElementSibling.remove(),
    "wrong-tag": (node) => { node.previousElementSibling.tag = "rect"; },
    "missing-div": (node) => node.previousElementSibling.firstElementChild.remove(),
    "wrong-child": (node) => { node.previousElementSibling.firstElementChild.tag = "span"; },
    "missing-style": (node) => {
      node.previousElementSibling.firstElementChild.attributes.delete("style");
      node.previousElementSibling.firstElementChild.style.clipPath = "";
    },
    "wrong-clip": (node) => {
      const div = node.previousElementSibling.firstElementChild;
      div.setAttribute("style", "backdrop-filter:blur(1.74px);clip-path:url(#wrong)");
      div.style.clipPath = "url(#wrong)";
    },
    "missing-def": (node, ids) => ids.get(clip).remove(),
    "wrong-def-tag": (node, ids) => { ids.get(clip).tag = "g"; },
  };
  for (const [name, fault] of Object.entries(faults)) {
    const model = modelFor({ mutateSVG: (svg) => {
      const ids = new Map(svg.querySelectorAll("[id]").map((node) => [node.id, node]));
      fault(ids.get(id), ids);
    } });
    await flushTasks();
    assert.equal(model.content.children[0], model.image, name);
    assert.equal(model.content.children.length, 1, name);
    assert.equal(model.preloads.length, 0, `${name}: structure is checked before resource decode or mutation`);
    assert.equal(model.sets.length, 0, name);
    assert.equal(model.timelines.length, 0, name);
    assert.ok(model.warnings.length > 0, name);
    const svg = model.parsed[0].svg;
    assert.ok(svg.querySelectorAll("[id]").every((node) => !node.parentElement?.dataset.figmaLayer), name);
    model.dispose();
  }
});

test("ancestry and duplicate-member validation includes foreignObjects, not just the 55 primary layers", async () => {
  for (const kind of ["selected-child", "duplicate-member"]) {
    const model = modelFor({
      definition: { ...definition, revealCards: cards, rejectLayeredAncestry: true },
      mutateSVG: (svg) => {
        const ids = new Map(svg.querySelectorAll("[id]").map((node) => [node.id, node]));
        const primary = ids.get("Rectangle 279335026");
        const companion = primary.previousElementSibling;
        const selected = ids.get("Group 2147241249");
        if (kind === "selected-child") companion.firstElementChild.append(selected);
        else {
          // A selected primary is also returned as another layer's companion.
          // Structurally valid pairing still must not move this member twice.
          selected.tag = "foreignObject";
          selected.append(companion.firstElementChild);
          companion.replaceWith(selected);
        }
      },
    });
    await flushTasks();
    assert.equal(model.content.children[0], model.image, kind);
    assert.equal(model.preloads.length, 0, kind);
    assert.equal(model.sets.length, 0, kind);
    assert.ok(model.warnings.length > 0, kind);
    model.dispose();
  }
});

test("an unexpected Douyin blur count, style, duplicate or unknown clip, or missing local clip definition preserves PNG", async () => {
  const faults = {
    "missing-local-blur": (svg) => svg.querySelectorAll("foreignObject").at(-1).remove(),
    "extra-local-blur": (svg) => {
      const extra = new svg.constructor("foreignObject");
      const div = new svg.constructor("div");
      div.setAttribute("style", "backdrop-filter:blur(9.91px);clip-path:url(#bgblur_13_1029_11591_clip_path)");
      extra.append(div); svg.append(extra);
    },
    "unknown-clip": (svg) => svg.querySelectorAll("foreignObject").at(-1).firstElementChild
      .setAttribute("style", "backdrop-filter:blur(9.91px);clip-path:url(#unknown)"),
    "duplicate-clip": (svg) => svg.querySelectorAll("foreignObject").at(-1).firstElementChild
      .setAttribute("style", "backdrop-filter:blur(9.91px);clip-path:url(#bgblur_11_1029_11591_clip_path)"),
    "not-backdrop-blur": (svg) => svg.querySelectorAll("foreignObject").at(-1).firstElementChild
      .setAttribute("style", "height:100%;width:100%;clip-path:url(#bgblur_12_1029_11591_clip_path)"),
    "missing-local-def": (svg) => svg.querySelectorAll("[id]")
      .find((node) => node.id === "bgblur_12_1029_11591_clip_path").remove(),
    "wrong-local-def": (svg) => { svg.querySelectorAll("[id]")
      .find((node) => node.id === "bgblur_12_1029_11591_clip_path").tag = "g"; },
  };
  for (const [name, mutateSVG] of Object.entries(faults)) {
    const model = modelFor({ mutateSVG }); await flushTasks();
    assert.equal(model.content.children[0], model.image, name);
    assert.equal(model.preloads.length, 0, name);
    assert.equal(model.sets.length, 0, name);
    assert.ok(model.warnings.some((parts) => parts.join(" ").includes("Unexpected Douyin backdrop")), name);
    model.dispose();
  }
});

test("companions preserve PNG fallback on decode failure, late close, reduced motion, and file-mode lazy loading", async () => {
  const failed = modelFor(); failed.rejectDecode(new Error("Model decode failure")); await flushTasks();
  assert.equal(failed.content.children[0], failed.image); failed.dispose();
  const closed = modelFor(); closed.dispose(); closed.resolveDecode(); await flushTasks();
  assert.equal(closed.content.children[0], closed.image);
  assert.equal(closed.sets.length, 0);
  for (const options of [{ reducedMotion: true }, { useGSAP: false }]) {
    const model = modelFor(options);
    assert.equal(model.parsed.length, 0); assert.equal(model.content.children[0], model.image); model.dispose();
  }
  const local = modelFor({ bundled: false, baseURI: "file:///unit-fixture/portfolio/index.html" });
  assert.equal(local.scripts.length, 1); assert.equal(local.fetches.length, 0);
  local.loadScript(offline); local.resolveDecode(); await flushTasks();
  const svg = local.parsed[0].svg;
  const ids = new Map(svg.querySelectorAll("[id]").map((node) => [node.id, node]));
  assert.equal(svg.querySelectorAll("foreignObject").length, 0);
  assert.ok(Object.entries(companionClips).every(([id, clip]) =>
    ids.get(id).parentElement.dataset.figmaCompanionClip === clip));
  assert.equal(local.fetches.length, 0);
  local.motionQuery.matches = true; local.motionQuery.dispatchEvent(new Event("change"));
  assert.equal(local.content.children[0], local.image); local.dispose();
});

test("initially visible intro content stays in place, while the separate three-paper stack retains first-entry sequencing", async () => {
  const intro = cards.find((card) => card.name === "intro-stack");
  const introContent = cards.find((card) => card.name === "intro-content");
  assert.ok(introContent);
  assert.equal(cards.length, 14);
  assert.equal(intro.top, 1021);
  assert.equal(introContent.top, 721);
  assert.equal(introContent.bottom, 2163);
  assert.deepEqual(Array.from(intro.parts, (part) => Array.from(part)),
    [["Rectangle 1"], ["Rectangle 3", "Live Dot", "LIVE Text"], ["Rectangle 2"]]);
  assert.deepEqual(Array.from(introContent.parts, (part) => Array.from(part)), [["Group 2147241249"]]);
  assert.ok(145 + introContent.top < 1080, "The complete content group is already visible in the first viewport");
  const model = modelFor(); model.resolveDecode(); await flushTasks();
  const content = model.wrappersFor("intro-content")[0];
  const papers = model.wrappersFor("intro-stack");
  assert.equal(content.dataset.revealState, "shown");
  assert.equal(papers.length, 5);
  assert.ok(!model.sets.some((call) => call.targets.includes(content) && call.properties.y === 96),
    "The visible logo/content is never pushed down 96px during initial enhancement");
  model.scrollTo(400);
  const stack = model.timelines.find((owner) => owner.calls.some((call) => call.targets.includes(papers[0])));
  assert.deepEqual(stack.calls.map((call) => call.position), [0, 0.18, 0.36]);
  assert.ok(stack.calls.every((call) => !call.targets.includes(content)));
  assert.equal(content.dataset.revealState, "shown");
  stack.complete();
  model.scrollTo(0);
  assert.ok(papers.every((paper) => paper.dataset.revealState === "armed"),
    "The genuine paper envelope is below the viewport before rearming");
  assert.equal(content.dataset.revealState, "shown");
  model.scrollTo(400);
  assert.equal(papers[0].dataset.revealPlays, "2");
  const end = 145 + introContent.bottom;
  for (const top of [end + 65, end + 160]) {
    model.scrollTo(top);
    assert.equal(content.dataset.revealState, "shown");
  }
  model.scrollTo(end + 161);
  assert.equal(content.dataset.revealState, "armed");
  assert.ok(end + 96 < model.panel.scrollTop - 64, "Reset cannot push the original content back into view");
  model.scrollTo(end - 215);
  assert.equal(content.dataset.revealState, "armed");
  model.scrollTo(end - 216);
  assert.equal(content.dataset.revealPlays, "1");
  const owner = model.timelines.findLast((timeline) => timeline.calls.some((call) => call.targets.includes(content)));
  owner.complete();
  model.scrollTo(end + 161); model.scrollTo(end - 216);
  assert.equal(content.dataset.revealPlays, "2");
  model.dispose();
  assert.ok(model.timelines.every((timeline) => timeline.killed));
});
