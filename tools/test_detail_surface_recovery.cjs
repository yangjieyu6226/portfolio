#!/usr/bin/env node
"use strict";

// Controller-state and CSS contract regressions only. ModelNode does not paint
// SVG, execute blur filters, or reproduce GPU composition; these checks cannot
// certify real-browser white-tail or flicker appearance.
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
const css = read("work-detail.css");
const readArray = (source, name, context = {}) => {
  const literal = source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n  \\]);`))?.[1];
  assert.ok(literal);
  return vm.runInNewContext(`(${literal})`, context, { timeout: 1000 });
};
const works = readArray(carousel, "WORK_CARDS", Object.fromEntries(
  ["LENOVO_REVEAL_CARDS", "BAIDU_REVEAL_CARDS", "QUYE_REVEAL_CARDS", "AI_EFFICIENCY_REVEAL_CARDS"]
    .map((name) => [name, readArray(carousel, name)])));
const defaultCards = readArray(controller, "CARDS");
const modelFor = (index, options = {}) => {
  const definition = works[index].detail.images[0];
  return createDetailMotionModel({
    controllerSource: controller, definition,
    bundledSVG: read(definition.layeredArtwork),
    svgWidth: definition.designWidth ?? definition.width,
    svgHeight: Math.round(definition.designHeight ?? definition.height), ...options,
  });
};
const active = (artwork) => artwork.classList.contains("is-reveal-active");
const completeLive = (model) => model.timelines.filter((owner) => !owner.killed).forEach((owner) => owner.complete());

test("CSS shows the original PNG by default and swaps only a ready, actively animated SVG without collapsing its reserved height", () => {
  assert.doesNotMatch(css, /\.work-detail__artwork\.is-reveal-ready\s*>\s*img\s*\{/);
  assert.match(css, /\.work-detail__artwork\.is-reveal-ready\.is-reveal-active\s*>\s*img\s*\{\s*opacity:\s*0/);
  assert.match(css, /\.work-detail__layered-artwork\s*\{[^}]*visibility:\s*hidden/);
  assert.match(css, /\.work-detail__artwork\.is-reveal-ready\.is-reveal-active\s*>\s*\.work-detail__layered-artwork\s*\{\s*visibility:\s*visible/);
});

for (const [index, work] of works.entries()) {
  const definition = work.detail.images[0];
  const key = definition.layeredArtworkKey;
  test(`${key}: fast tail entry, all-owner completion, stationary scroll, reverse, and replay recover the same PNG surface`, async () => {
    const model = modelFor(index);
    assert.equal(model.content.children[0], model.image);
    model.resolveDecode(); await flushTasks();
    const artwork = model.content.children[0];
    const height = definition.designHeight ?? definition.height;
    const cards = definition.revealCards ?? defaultCards;
    const tail = 145 + height - model.panel.clientHeight;
    assert.equal(artwork.style.height, `${height}px`);
    assert.equal(artwork.classList.contains("is-reveal-ready"), true);
    assert.equal(active(artwork), false, "First resting viewport stays on the exact original PNG");
    model.scrollTo(tail);
    assert.equal(active(artwork), true);
    const owners = model.timelines.filter((owner) => !owner.killed);
    assert.ok(owners.length > 0);
    for (const owner of owners.slice(0, -1)) {
      owner.complete();
      assert.equal(active(artwork), true, "One completion cannot hide another card's in-flight SVG");
    }
    owners.at(-1).complete();
    assert.equal(active(artwork), false, "The final visible tail animation returns ownership to the PNG");
    const before = { sets: model.sets.length, timelines: model.timelines.length, parsed: model.parsed.length };
    for (const top of [tail, tail - 1, tail, tail - 2, tail]) model.scrollTo(top);
    assert.equal(active(artwork), false);
    assert.deepEqual({ sets: model.sets.length, timelines: model.timelines.length, parsed: model.parsed.length }, before);
    const last = cards.at(-1);
    const lastWrappers = model.wrappersFor(last.name);
    assert.ok(lastWrappers.length > 0);
    assert.equal(lastWrappers[0].dataset.revealPlays, "1");
    model.scrollTo(Math.max(0, tail - 1800));
    assert.equal(lastWrappers[0].dataset.revealState, "armed", "Reverse movement genuinely moves the last card offscreen");
    model.scrollTo(tail);
    assert.equal(lastWrappers[0].dataset.revealPlays, "2");
    assert.equal(active(artwork), true);
    completeLive(model);
    assert.equal(active(artwork), false, "Replayed tail also hands back to the PNG");
    assert.equal(model.content.children[0], artwork, "Visibility changes do not rebuild the artwork DOM");
    assert.equal(artwork.children[0], model.image);
    assert.equal(artwork.style.height, `${height}px`);
    model.dispose();
    assert.equal(model.content.children[0], model.image);
    assert.ok(model.timelines.every((owner) => owner.killed));
  });
}

test("armed groups wholly above the current viewport cannot keep a settled tail on the live SVG", async () => {
  for (const index of [2, 3, 4]) {
    const model = modelFor(index); model.resolveDecode(); await flushTasks();
    const definition = works[index].detail.images[0];
    const tail = 145 + (definition.designHeight ?? definition.height) - 1080;
    model.scrollTo(tail); completeLive(model);
    const scale = (definition.designHeight ?? definition.height) / Math.round(definition.designHeight ?? definition.height);
    const preceding = definition.revealCards.filter((card) => {
      const end = 145 + card.bottom * scale;
      return end <= tail && end + 96 >= tail - 64;
    });
    assert.ok(preceding.length > 0, "The fixture reaches the previously untested 96px-envelope edge condition");
    assert.ok(preceding.every((card) => model.wrappersFor(card.name)[0].dataset.revealState === "armed"));
    assert.equal(active(model.content.children[0]), false,
      "Only actual original-card visibility, not an offscreen reset envelope, can request the live surface");
    model.dispose();
  }
});

test("armed approach activates near the lower edge, while an offscreen long-card reset cannot suppress PNG recovery at rest", async () => {
  const model = modelFor(0); model.resolveDecode(); await flushTasks();
  const artwork = model.content.children[0];
  const intro = defaultCards.find((card) => card.name === "intro-stack");
  const introStart = 145 + intro.top;
  model.scrollTo(introStart - 1080 - 65);
  assert.equal(active(artwork), false);
  model.scrollTo(introStart - 1080 - 64);
  assert.equal(active(artwork), true);
  model.scrollTo(400);
  completeLive(model);
  assert.equal(active(artwork), false);
  const solution = defaultCards.find((card) => card.name === "solution-stack");
  model.scrollTo(145 + solution.top - 1080 + 216);
  assert.equal(active(artwork), true);
  completeLive(model);
  model.scrollTo(7000);
  completeLive(model);
  assert.equal(model.wrappersFor("solution-stack")[0].dataset.revealState, "shown",
    "A tall background is not reset when only its upper edge has left the viewport");
  model.dispose();
});

test("the live-blur omission is Douyin-only and leaves other projects' foreignObject nodes intact", async () => {
  for (const index of [1, 2, 3, 4]) {
    let foreignObject;
    const model = modelFor(index, { mutateSVG: (svg) => {
      foreignObject = new svg.constructor("foreignObject");
      const div = new svg.constructor("div");
      div.setAttribute("style", "backdrop-filter:blur(2px);height:100%;width:100%");
      foreignObject.append(div); svg.append(foreignObject);
    } });
    model.resolveDecode(); await flushTasks();
    assert.equal(model.parsed[0].svg.querySelectorAll("foreignObject")[0], foreignObject);
    assert.equal(foreignObject.parentElement, model.parsed[0].svg);
    assert.equal(model.content.children[0].classList.contains("is-reveal-ready"), true);
    model.dispose();
  }
});
