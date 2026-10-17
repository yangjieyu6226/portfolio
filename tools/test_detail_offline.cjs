#!/usr/bin/env node
"use strict";

// Real controller execution in an inert DOM/data fixture with GSAP API spies.
// No file:// browser access, rendering, network, or visual playback is claimed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createDetailMotionModel, flushTasks } = require("./detail_motion_test_fixture.cjs");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const controller = read("work-detail-motion.js");
const carousel = read("work-carousel.js");
const detail = read("work-detail.js");
const markup = read("index.html");
const arrayLiteral = (name, context = {}) => {
  const literal = carousel.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n  \\]);`))?.[1];
  assert.ok(literal, `${name} exists`);
  return vm.runInNewContext(`(${literal})`, context, { timeout: 1000 });
};
const works = arrayLiteral("WORK_CARDS", Object.fromEntries(
  ["LENOVO_REVEAL_CARDS", "BAIDU_REVEAL_CARDS", "QUYE_REVEAL_CARDS", "AI_EFFICIENCY_REVEAL_CARDS"]
    .map((name) => [name, arrayLiteral(name)])));
const firstThree = [
  { index: 0, key: "douyin", stem: "douyin-layered", first: "intro-stack" },
  { index: 1, key: "lenovo", stem: "lenovo-layered-v2", first: "lenovo-overview" },
  { index: 2, key: "baidu", stem: "baidu-layered", first: "baidu-1048-13756" },
].map((item) => ({ ...item, definition: works[item.index].detail.images[0],
  prepared: read(`assets/${item.stem}-prepared.svg`),
  offline: read(`assets/${item.stem}-offline.js`) }));
const localModel = (item = firstThree[0], options = {}) => createDetailMotionModel({
  controllerSource: controller, definition: item.definition, bundledSVG: item.prepared,
  bundled: false, baseURI: "file:///unit-fixture/portfolio/index.html",
  resourceHref: `./${item.stem}-images/model-resource.png`, ...options,
});
const ready = (instance) => instance.content.children[0].classList.contains("is-reveal-ready");

test("all five offline bundles register their exact prepared SVG without overwriting other keys", () => {
  const sources = { unrelated: "keep" };
  const window = { portfolioLayeredArtworkSources: sources };
  const bundles = [...firstThree,
    { key: "quye", prepared: read("assets/quye-layered-prepared.svg"),
      offline: read("assets/quye-layered-offline.js") },
    { key: "ai-efficiency", prepared: read("assets/ai-efficiency-layered-v2-prepared.svg"),
      offline: read("assets/ai-efficiency-layered-v2-offline.js") }];
  for (const item of bundles) {
    vm.runInNewContext(item.offline, { window }, { timeout: 2000 });
    assert.equal(window.portfolioLayeredArtworkSources, sources);
    assert.equal(sources[item.key], item.prepared);
    assert.equal(sources.unrelated, "keep");
  }
  assert.deepEqual(Object.keys(sources).sort(),
    ["unrelated", "douyin", "lenovo", "baidu", "quye", "ai-efficiency"].sort());
  for (const item of firstThree) {
    assert.equal(item.definition.layeredArtworkKey, item.key);
    assert.equal(item.definition.layeredArtworkBundle, `./assets/${item.stem}-offline.js`);
    assert.doesNotMatch(markup, new RegExp(`<script[^>]*${item.stem}-offline\\.js`),
      "First-three bundles are lazy, not eagerly added to the homepage");
  }
});

test("the real fill helper copies first-three bundle metadata while preserving all five complete PNG bindings", () => {
  const literal = detail.match(/const fillContent = (\(work\) => \{[\s\S]*?\n  \});/)?.[1];
  assert.ok(literal);
  const title = {};
  const content = { style: {}, children: [], replaceChildren() { this.children.length = 0; },
    append(node) { this.children.push(node); } };
  const document = { createElement: () => ({ dataset: {}, style: {}, addEventListener() {}, remove() {} }) };
  const fill = vm.runInNewContext(`(${literal})`, { title, content, document, TARGET: { width: 1668 } });
  works.forEach((work, index) => {
    const images = fill(work);
    assert.equal(images.length, 1);
    const definition = work.detail.images[0];
    assert.equal(images[0].src, definition.src);
    assert.equal(images[0].width, definition.width);
    assert.equal(images[0].height, definition.height);
    assert.equal(images[0].dataset.layeredArtworkKey, definition.layeredArtworkKey);
    assert.equal(images[0].dataset.layeredArtworkBundle,
      index < 3 ? definition.layeredArtworkBundle : undefined);
  });
});

test("file-mode first-three details lazily load one classic bundle and preserve PNG until decode, without fetch", async () => {
  for (const item of firstThree) {
    const model = localModel(item);
    assert.equal(model.fetches.length, 0);
    assert.equal(model.scripts.length, 1);
    assert.equal(model.scripts[0].src, `file:///unit-fixture/portfolio/assets/${item.stem}-offline.js`);
    assert.equal(model.scripts[0].async, true);
    assert.equal(model.scripts[0].type, undefined, "The lazy bundle is a classic, not module, script");
    assert.equal(model.content.children[0], model.image);
    assert.equal(model.parsed.length, 0);
    if (item.index === 0) assert.equal(model.image.dataset.revealCards, undefined,
      "Douyin exercises the production default mapping, not a custom fixture mapping");
    model.loadScript(item.offline);
    await flushTasks();
    assert.equal(model.document.head.children.length, 0, "Completed scripts are removed");
    assert.equal(model.parsed[0].text, item.prepared);
    assert.equal(model.fetches.length, 0);
    assert.equal(model.content.children[0], model.image, "Decoded resources gate the SVG swap");
    assert.equal(model.preloads[0].src,
      `file:///unit-fixture/portfolio/assets/${item.stem}-images/model-resource.png`);
    model.resolveDecode();
    await flushTasks();
    assert.equal(ready(model), true);
    const names = item.definition.revealCards ?? vm.runInNewContext(
      `(${controller.match(/const CARDS = (\[[\s\S]*?\n  \]);/)[1]})`);
    assert.ok(model.wrappersFor(names[0].name).length > 0);
    model.dispose();
    assert.equal(model.content.children[0], model.image);
  }
});

test("HTTP first-three details retain fetch enhancement and never inject offline scripts", async () => {
  for (const item of firstThree) {
    const model = localModel(item, { baseURI: "https://unit.invalid/portfolio/index.html", fetchSVG: item.prepared });
    assert.equal(model.scripts.length, 0);
    assert.equal(model.fetches.length, 1);
    assert.equal(model.fetches[0].href, new URL(item.definition.layeredArtwork, model.document.baseURI).href);
    model.resolveDecode();
    await flushTasks();
    assert.equal(model.parsed[0].text, item.prepared);
    assert.equal(ready(model), true);
    model.dispose();
  }
});

test("a shared runtime deduplicates pending URLs, reuses a registered source, and retries an invalidated cache", async () => {
  const item = firstThree[0];
  const model = localModel(item);
  const concurrent = model.reopen();
  assert.equal(model.scripts.length, 1, "Concurrent opens share one pending URL");
  model.loadScript(item.offline);
  model.resolveDecode();
  await flushTasks();
  assert.equal(ready(model), true);
  assert.equal(ready(concurrent), true);
  assert.equal(model.parsed.length, 2);
  const reopened = model.reopen();
  await flushTasks();
  assert.equal(ready(reopened), true);
  assert.equal(model.scripts.length, 1, "A successfully registered SVG avoids another script or fetch");
  assert.equal(model.fetches.length, 0);
  model.dispose(); concurrent.dispose(); reopened.dispose();
  delete model.window.portfolioLayeredArtworkSources[item.key];
  const missing = model.reopen();
  await flushTasks();
  assert.equal(missing.content.children[0], missing.image);
  assert.equal(model.scripts.length, 1, "A resolved cache still verifies that its key exists");
  assert.ok(model.warnings.some((parts) => parts.join(" ").includes("did not register")));
  missing.dispose();
  const retry = model.reopen();
  assert.equal(model.scripts.length, 2, "Invalid registration evicts the cached URL for a retry");
  model.loadScript(item.offline);
  await flushTasks();
  assert.equal(ready(retry), true);
  retry.dispose();
});

test("script errors and successful loads without a registered key preserve PNG and allow a fresh retry", async () => {
  for (const fail of ["error", "missing-key"]) {
    const model = localModel();
    if (fail === "error") model.errorScript();
    else model.loadScript({ unrelated: "not the requested SVG" });
    await flushTasks();
    assert.equal(model.content.children[0], model.image);
    assert.equal(model.fetches.length, 0);
    assert.equal(model.parsed.length, 0);
    assert.ok(model.warnings.length > 0);
    assert.equal(model.document.head.children.length, 0);
    model.dispose();
    const retry = model.reopen();
    assert.equal(model.scripts.length, 2);
    model.loadScript(firstThree[0].offline);
    model.resolveDecode();
    await flushTasks();
    assert.equal(ready(retry), true);
    retry.dispose();
  }
});

test("late offline loading after close cannot insert SVG and remains usable on a later open", async () => {
  const model = localModel();
  model.dispose();
  model.loadScript(firstThree[0].offline);
  await flushTasks();
  assert.equal(model.content.children[0], model.image);
  assert.equal(model.parsed.length, 0);
  assert.equal(model.preloads.length, 0);
  assert.equal(model.timelines.length, 0);
  const reopened = model.reopen();
  model.resolveDecode();
  await flushTasks();
  assert.equal(ready(reopened), true);
  assert.equal(model.scripts.length, 1);
  reopened.dispose();
});

test("reduced-motion and absent GSAP never load local scripts; a reduce change aborts pending enhancement", async () => {
  for (const options of [{ reducedMotion: true }, { useGSAP: false }]) {
    const model = localModel(firstThree[0], options);
    assert.equal(model.scripts.length, 0);
    assert.equal(model.fetches.length, 0);
    assert.equal(model.parsed.length, 0);
    assert.equal(model.content.children[0], model.image);
    model.dispose();
  }
  const pending = localModel();
  pending.motionQuery.matches = true;
  pending.motionQuery.dispatchEvent(new Event("change"));
  pending.loadScript(firstThree[0].offline);
  await flushTasks();
  assert.equal(pending.parsed.length, 0);
  assert.equal(pending.content.children[0], pending.image);
  assert.doesNotThrow(pending.dispose);
});

test("the long Douyin intro stays active mid-card and repeated scroll events do not stack timelines", async () => {
  const model = localModel();
  model.loadScript(firstThree[0].offline);
  model.resolveDecode();
  await flushTasks();
  const wrappers = model.wrappersFor("intro-stack");
  assert.equal(wrappers.length, 5);
  model.scrollTo(400);
  const owners = () => model.timelines.filter((owner) => owner.calls.some((call) => call.targets.includes(wrappers[0])));
  assert.equal(owners().length, 1);
  const owner = owners()[0];
  assert.deepEqual(owner.calls.map((call) => call.position), [0, 0.18, 0.36]);
  assert.equal(owner.settings.defaults.duration, 1.4);
  assert.equal(owner.settings.defaults.ease, "sine.inOut");
  model.scrollTo(1600);
  model.scrollTo(1601);
  model.scrollTo(1599);
  assert.equal(owners().length, 1);
  assert.equal(owner.killed, false);
  assert.ok(wrappers.every((wrapper) => wrapper.dataset.revealState === "revealing"));
  owner.complete();
  model.scrollTo(2700);
  assert.ok(wrappers.every((wrapper) => wrapper.dataset.revealState === "shown"),
    "A long card is not reset after only its upper edge leaves the viewport");
  model.dispose();
});
