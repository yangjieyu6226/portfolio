#!/usr/bin/env node
"use strict";

// These tests exercise the controller's real CSS fallback state, event gates,
// and cleanup. GSAP tests record API requests and single-owner lifecycle only;
// they do not simulate tween playback or claim to verify rendered motion.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "work-record-preview.js"), "utf8");

class StubNode extends EventTarget {
  constructor() {
    super();
    this.dataset = {};
    this.classes = new Set();
    this.hovered = false;
    this.focusVisible = false;
    this.removedStyleProperties = [];
    this.style = {
      removeProperty: (name) => this.removedStyleProperties.push(name),
    };
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, wanted) => wanted ? this.classes.add(name) : this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
  }

  matches(selector) {
    if (selector === ":hover") return this.hovered;
    if (selector === ":focus-visible") return this.focusVisible;
    throw new Error(`Unexpected selector: ${selector}`);
  }
}

const setup = ({ assetLoaded = true, lenovoAssetLoaded = true, quyeAssetLoaded = true, aiAssetLoaded = true,
  reducedMotion = false,
  gsap = null } = {}) => {
  const machine = new StubNode();
  const card = new StubNode();
  const cardLenovo = new StubNode();
  const cardQuye = new StubNode();
  const original = new StubNode();
  const douyin = new StubNode();
  const artwork = new StubNode();
  artwork.complete = assetLoaded;
  artwork.naturalWidth = assetLoaded ? 1061 : 0;
  const lenovo = new StubNode();
  const artworkLenovo = new StubNode();
  artworkLenovo.complete = lenovoAssetLoaded;
  artworkLenovo.naturalWidth = lenovoAssetLoaded ? 1061 : 0;
  const quye = new StubNode();
  const artworkQuye = new StubNode();
  artworkQuye.complete = quyeAssetLoaded;
  artworkQuye.naturalWidth = quyeAssetLoaded ? 1061 : 0;
  const cardAi = new StubNode();
  const ai = new StubNode();
  const artworkAi = new StubNode();
  artworkAi.complete = aiAssetLoaded;
  artworkAi.naturalWidth = aiAssetLoaded ? 1254 : 0;
  const motionQuery = new StubNode();
  motionQuery.matches = reducedMotion;
  const window = new StubNode();
  if (gsap) window.gsap = gsap;
  window.matchMedia = () => motionQuery;
  const document = new StubNode();
  document.hidden = false;
  document.activeElement = null;
  document.querySelector = (selector) => {
    if (selector === ".machine") return machine;
    if (selector === '#workCarousel [data-card-index="0"]') return card;
    if (selector === '#workCarousel [data-card-index="1"]') return cardLenovo;
    if (selector === '#workCarousel [data-card-index="3"]') return cardQuye;
    if (selector === '#workCarousel [data-card-index="4"]') return cardAi;
    throw new Error(`Unexpected selector: ${selector}`);
  };
  document.getElementById = (id) => {
    if (id === "recordOriginalLayer") return original;
    if (id === "recordDouyinLayer") return douyin;
    if (id === "recordDouyin") return artwork;
    if (id === "recordLenovoLayer") return lenovo;
    if (id === "recordLenovo") return artworkLenovo;
    if (id === "recordQuyeLayer") return quye;
    if (id === "recordQuye") return artworkQuye;
    if (id === "recordAiLayer") return ai;
    if (id === "recordAi") return artworkAi;
    throw new Error(`Unexpected ID: ${id}`);
  };
  vm.runInNewContext(source, { window, document, AbortController }, {
    filename: "work-record-preview.js", timeout: 1000,
  });
  const fire = (node, type, properties = {}) => {
    const event = new Event(type);
    Object.assign(event, properties);
    node.dispatchEvent(event);
  };
  return { machine, card, cardLenovo, cardQuye, cardAi, original, douyin, artwork,
    lenovo, artworkLenovo, quye, artworkQuye, ai, artworkAi,
    window, document, motionQuery,
    api: window.portfolioWorkRecordPreview, fire };
};

test("CSS fallback is gated by eligibility, ignores touch, and handles rapid hover reversal", () => {
  const { machine, card, api, fire } = setup();
  assert.equal(machine.dataset.recordPreview, "default");
  fire(card, "pointerenter", { pointerType: "mouse" });
  assert.equal(machine.dataset.recordPreview, "default", "An ineligible card cannot preview");
  api.setEnabled(true);
  fire(card, "pointerenter", { pointerType: "touch" });
  assert.equal(machine.dataset.recordPreview, "default", "Touch is not hover");
  for (let index = 0; index < 8; index += 1) {
    fire(card, "pointerenter", { pointerType: "mouse" });
    assert.equal(machine.dataset.recordPreview, "douyin");
    assert.ok(machine.classList.contains("uses-record-preview-css"));
    assert.ok(machine.classList.contains("is-douyin-preview"));
    fire(card, "pointerleave");
    assert.equal(machine.dataset.recordPreview, "default");
    assert.ok(!machine.classList.contains("is-douyin-preview"));
  }
  fire(card, "pointerenter", { pointerType: "pen" });
  api.setEnabled(false);
  assert.equal(machine.dataset.recordPreview, "default", "Pause/collapse restores without a pointerleave");
  card.hovered = true;
  api.setEnabled(true);
  assert.equal(machine.dataset.recordPreview, "douyin", "Eligibility rechecks the actual card hot area");
  api.destroy();
});

test("unloaded or failed artwork keeps the blue disc; successful load resumes an eligible hover", () => {
  const { machine, card, artwork, api, fire } = setup({ assetLoaded: false });
  api.setEnabled(true);
  fire(card, "pointerenter", { pointerType: "mouse" });
  assert.equal(machine.dataset.recordPreview, "default", "Unloaded artwork never slides the blue disc away");
  artwork.complete = true;
  artwork.naturalWidth = 1061;
  fire(artwork, "load");
  assert.equal(machine.dataset.recordPreview, "douyin", "A ready asset syncs the existing hover");
  fire(artwork, "error");
  assert.equal(machine.dataset.recordPreview, "default", "An asset error restores the blue disc");
  artwork.naturalWidth = 0;
  fire(artwork, "load");
  assert.equal(machine.dataset.recordPreview, "default", "A zero-width load is not usable artwork");
  fire(card, "pointerleave");
  artwork.naturalWidth = 1061;
  fire(artwork, "load");
  assert.equal(machine.dataset.recordPreview, "default", "Late load does not preview an unhovered card");
  fire(card, "pointerenter", { pointerType: "mouse" });
  assert.equal(machine.dataset.recordPreview, "douyin");
  api.setEnabled(false);
  fire(artwork, "load");
  assert.equal(machine.dataset.recordPreview, "default", "Load cannot bypass disabled eligibility");
  api.destroy();
});

test("keyboard focus, window blur, and document visibility release the CSS fallback", () => {
  const { machine, card, window, document, api, fire } = setup();
  api.setEnabled(true);
  document.activeElement = card;
  card.focusVisible = true;
  fire(card, "focus");
  assert.equal(machine.dataset.recordPreview, "douyin");
  fire(card, "blur");
  assert.equal(machine.dataset.recordPreview, "default");
  fire(card, "pointerenter", { pointerType: "mouse" });
  fire(window, "blur");
  assert.equal(machine.dataset.recordPreview, "default");
  fire(card, "pointerenter", { pointerType: "mouse" });
  document.hidden = true;
  fire(document, "visibilitychange");
  assert.equal(machine.dataset.recordPreview, "default");
  api.destroy();
});

test("destroy restores fallback classes and makes aborted listeners inert", () => {
  const { machine, card, cardLenovo, cardQuye, cardAi, original, douyin, lenovo, quye, ai,
    artworkLenovo, artworkQuye, artworkAi,
    window, api, fire } = setup();
  api.setEnabled(true);
  fire(card, "pointerenter", { pointerType: "mouse" });
  assert.equal(machine.dataset.recordPreview, "douyin");
  api.destroy();
  assert.equal(window.portfolioWorkRecordPreview, undefined);
  assert.equal(machine.dataset.recordPreview, "default");
  assert.equal(machine.dataset.recordPreviewProgress, "0.0000");
  assert.ok(!machine.classList.contains("uses-record-preview-css"));
  assert.ok(!machine.classList.contains("is-douyin-preview"));
  assert.ok(!machine.classList.contains("is-lenovo-preview"));
  assert.ok(!machine.classList.contains("is-quye-preview"));
  assert.ok(!machine.classList.contains("is-ai-preview"));
  assert.ok(original.removedStyleProperties.includes("will-change"));
  assert.ok(douyin.removedStyleProperties.includes("will-change"));
  assert.ok(lenovo.removedStyleProperties.includes("will-change"));
  assert.ok(quye.removedStyleProperties.includes("will-change"));
  assert.ok(ai.removedStyleProperties.includes("will-change"));
  fire(card, "pointerenter", { pointerType: "mouse" });
  fire(cardLenovo, "pointerenter", { pointerType: "mouse" });
  fire(artworkLenovo, "load");
  fire(cardQuye, "pointerenter", { pointerType: "mouse" });
  fire(artworkQuye, "load");
  fire(cardAi, "pointerenter", { pointerType: "mouse" });
  fire(artworkAi, "load");
  api.setEnabled(true, 4);
  api.destroy();
  assert.equal(machine.dataset.recordPreview, "default");
  assert.ok(!machine.classList.contains("is-douyin-preview"));
  assert.ok(!machine.classList.contains("is-lenovo-preview"));
  assert.ok(!machine.classList.contains("is-quye-preview"));
  assert.ok(!machine.classList.contains("is-ai-preview"));
});

test("Lenovo hover uses only the eligible second card and leaves Douyin unchanged", () => {
  const { machine, card, cardLenovo, api, fire } = setup();
  api.setEnabled(true, 1);
  fire(cardLenovo, "pointerenter", { pointerType: "touch" });
  assert.equal(machine.dataset.recordPreview, "default");
  fire(card, "pointerenter", { pointerType: "mouse" });
  assert.equal(machine.dataset.recordPreview, "default", "Passing Douyin cannot activate the central Lenovo theme");
  fire(cardLenovo, "pointerenter", { pointerType: "mouse" });
  assert.equal(machine.dataset.recordPreview, "lenovo");
  assert.ok(machine.classList.contains("is-lenovo-preview"));
  assert.ok(!machine.classList.contains("is-douyin-preview"));
  fire(card, "pointerleave");
  assert.equal(machine.dataset.recordPreview, "lenovo", "An inactive card leave cannot reset the active theme");
  fire(cardLenovo, "pointerleave");
  assert.equal(machine.dataset.recordPreview, "default");
  assert.ok(!machine.classList.contains("is-lenovo-preview"));
  api.destroy();
});

test("cross-theme and rapid eligibility changes never leave both themes active", () => {
  const { machine, card, cardLenovo, api } = setup();
  card.hovered = true;
  cardLenovo.hovered = true;
  for (let index = 0; index < 32; index += 1) {
    const active = index % 2;
    api.setEnabled(true, active);
    assert.equal(machine.dataset.recordPreview, active === 0 ? "douyin" : "lenovo");
    assert.equal(machine.classList.contains("is-douyin-preview"), active === 0);
    assert.equal(machine.classList.contains("is-lenovo-preview"), active === 1);
    api.setEnabled(false, active);
    assert.equal(machine.dataset.recordPreview, "default", "Pause, step, or collapse restores the original theme");
    assert.ok(!machine.classList.contains("is-douyin-preview"));
    assert.ok(!machine.classList.contains("is-lenovo-preview"));
  }
  api.setEnabled(true, 0);
  assert.equal(machine.dataset.recordPreview, "douyin");
  api.setEnabled(true, 1);
  assert.equal(machine.dataset.recordPreview, "lenovo", "Index changes must sync even while enabled remains true");
  for (const invalidIndex of [2, 5, -1, NaN]) {
    api.setEnabled(true, invalidIndex);
    assert.equal(machine.dataset.recordPreview, "default", "Unsupported cards restore the blue original");
  }
  api.destroy();
});

test("theme-specific asset failure and late recovery cannot alter the other active theme", () => {
  const { machine, card, cardLenovo, artwork, artworkLenovo, api, fire } = setup({
    lenovoAssetLoaded: false,
  });
  card.hovered = true;
  cardLenovo.hovered = true;
  api.setEnabled(true, 1);
  assert.equal(machine.dataset.recordPreview, "default", "Unloaded Lenovo leaves the original visible");
  artworkLenovo.complete = true;
  artworkLenovo.naturalWidth = 1061;
  fire(artworkLenovo, "load");
  assert.equal(machine.dataset.recordPreview, "lenovo");
  fire(artworkLenovo, "error");
  assert.equal(machine.dataset.recordPreview, "default");
  api.setEnabled(true, 0);
  assert.equal(machine.dataset.recordPreview, "douyin", "A Lenovo error does not disable Douyin");
  fire(artworkLenovo, "load");
  assert.equal(machine.dataset.recordPreview, "douyin", "An inactive asset load cannot select its theme");
  fire(artwork, "error");
  assert.equal(machine.dataset.recordPreview, "default");
  api.setEnabled(true, 1);
  assert.equal(machine.dataset.recordPreview, "lenovo", "Recovered Lenovo is usable despite a Douyin error");
  fire(artwork, "load");
  assert.equal(machine.dataset.recordPreview, "lenovo");
  api.setEnabled(false, 1);
  fire(artworkLenovo, "load");
  assert.equal(machine.dataset.recordPreview, "default");
  api.destroy();
});

test("Lenovo focus, blur, and document hiding obey the same release rules", () => {
  const { machine, cardLenovo, window, document, api, fire } = setup();
  document.activeElement = cardLenovo;
  cardLenovo.focusVisible = true;
  api.setEnabled(true, 1);
  assert.equal(machine.dataset.recordPreview, "lenovo");
  fire(cardLenovo, "blur");
  assert.equal(machine.dataset.recordPreview, "default");
  fire(cardLenovo, "focus");
  assert.equal(machine.dataset.recordPreview, "lenovo");
  fire(window, "blur");
  assert.equal(machine.dataset.recordPreview, "default");
  fire(cardLenovo, "pointerenter", { pointerType: "pen" });
  assert.equal(machine.dataset.recordPreview, "lenovo");
  document.hidden = true;
  fire(document, "visibilitychange");
  assert.equal(machine.dataset.recordPreview, "default");
  api.destroy();
});

test("Quye hover responds only to the eligible fourth card and ignores unrelated hot-area exits", () => {
  const { machine, card, cardLenovo, cardQuye, api, fire } = setup();
  api.setEnabled(true, 3);
  fire(cardQuye, "pointerenter", { pointerType: "touch" });
  assert.equal(machine.dataset.recordPreview, "default");
  fire(card, "pointerenter", { pointerType: "mouse" });
  fire(cardLenovo, "pointerenter", { pointerType: "mouse" });
  assert.equal(machine.dataset.recordPreview, "default", "Passing earlier cards cannot activate Quye");
  fire(cardQuye, "pointerenter", { pointerType: "mouse" });
  assert.equal(machine.dataset.recordPreview, "quye");
  assert.ok(machine.classList.contains("is-project-record-preview"));
  assert.ok(machine.classList.contains("is-quye-preview"));
  assert.ok(!machine.classList.contains("is-douyin-preview"));
  assert.ok(!machine.classList.contains("is-lenovo-preview"));
  fire(card, "pointerleave");
  fire(cardLenovo, "pointerleave");
  assert.equal(machine.dataset.recordPreview, "quye");
  fire(cardQuye, "pointerleave");
  assert.equal(machine.dataset.recordPreview, "default");
  assert.ok(!machine.classList.contains("is-quye-preview"));
  fire(cardQuye, "pointerenter", { pointerType: "pen" });
  assert.equal(machine.dataset.recordPreview, "quye");
  api.destroy();
  assert.equal(machine.dataset.recordPreview, "default", "Destroy during Quye hover restores the original disc");
  assert.ok(!machine.classList.contains("is-quye-preview"));
  assert.ok(!machine.classList.contains("is-project-record-preview"));
});

test("AI hover previews only the eligible fifth card, with reversible CSS fallback", () => {
  const { machine, card, cardLenovo, cardQuye, cardAi, api, fire } = setup();
  api.setEnabled(true, 4);
  fire(cardAi, "pointerenter", { pointerType: "touch" });
  assert.equal(machine.dataset.recordPreview, "default");
  for (const unrelated of [card, cardLenovo, cardQuye]) {
    fire(unrelated, "pointerenter", { pointerType: "mouse" });
  }
  assert.equal(machine.dataset.recordPreview, "default");
  for (let count = 0; count < 8; count += 1) {
    fire(cardAi, "pointerenter", { pointerType: "mouse" });
    assert.equal(machine.dataset.recordPreview, "ai");
    assert.ok(machine.classList.contains("uses-record-preview-css"));
    assert.ok(machine.classList.contains("is-project-record-preview"));
    assert.ok(machine.classList.contains("is-ai-preview"));
    for (const name of ["douyin", "lenovo", "quye"]) {
      assert.ok(!machine.classList.contains(`is-${name}-preview`));
    }
    for (const unrelated of [card, cardLenovo, cardQuye]) {
      fire(unrelated, "pointerleave");
    }
    assert.equal(machine.dataset.recordPreview, "ai", "An unrelated card cannot end AI preview");
    fire(cardAi, "pointerleave");
    assert.equal(machine.dataset.recordPreview, "default");
    assert.ok(!machine.classList.contains("is-ai-preview"));
  }
  fire(cardAi, "pointerenter", { pointerType: "pen" });
  assert.equal(machine.dataset.recordPreview, "ai");
  api.setEnabled(false, 4);
  assert.equal(machine.dataset.recordPreview, "default", "Collapse restores the original record");
  api.destroy();
});

test("four project themes remain mutually exclusive through rapid switches and disabling", () => {
  const { machine, card, cardLenovo, cardQuye, cardAi, api } = setup();
  [card, cardLenovo, cardQuye, cardAi].forEach((node) => { node.hovered = true; });
  const projects = [[0, "douyin"], [3, "quye"], [4, "ai"], [1, "lenovo"]];
  for (let iteration = 0; iteration < 45; iteration += 1) {
    const [index, selected] = projects[iteration % projects.length];
    api.setEnabled(true, index);
    assert.equal(machine.dataset.recordPreview, selected);
    assert.ok(machine.classList.contains("is-project-record-preview"));
    for (const [, name] of projects) {
      assert.equal(machine.classList.contains(`is-${name}-preview`), name === selected);
    }
    if (iteration % 4 === 0) {
      api.setEnabled(false, index);
      assert.equal(machine.dataset.recordPreview, "default");
      assert.ok(!machine.classList.contains("is-project-record-preview"));
      for (const [, name] of projects) assert.ok(!machine.classList.contains(`is-${name}-preview`));
    }
  }
  api.setEnabled(true, 4);
  assert.equal(machine.dataset.recordPreview, "ai");
  for (const unsupportedIndex of [2, 5, -1, NaN]) {
    api.setEnabled(true, unsupportedIndex);
    assert.equal(machine.dataset.recordPreview, "default");
  }
  api.destroy();
});

test("Quye asset failure and late recovery preserve both existing themes and eligibility", () => {
  const { machine, card, cardLenovo, cardQuye, artwork, artworkLenovo, artworkQuye, api, fire } = setup({
    quyeAssetLoaded: false,
  });
  [card, cardLenovo, cardQuye].forEach((node) => { node.hovered = true; });
  api.setEnabled(true, 3);
  assert.equal(machine.dataset.recordPreview, "default");
  artworkQuye.complete = true;
  fire(artworkQuye, "load");
  assert.equal(machine.dataset.recordPreview, "default", "A zero-width Quye load is not usable");
  artworkQuye.naturalWidth = 1061;
  fire(artworkQuye, "load");
  assert.equal(machine.dataset.recordPreview, "quye");
  fire(artworkQuye, "error");
  assert.equal(machine.dataset.recordPreview, "default");
  api.setEnabled(true, 0);
  assert.equal(machine.dataset.recordPreview, "douyin");
  fire(artworkQuye, "load");
  assert.equal(machine.dataset.recordPreview, "douyin", "Inactive Quye recovery cannot choose its theme");
  api.setEnabled(true, 1);
  assert.equal(machine.dataset.recordPreview, "lenovo");
  fire(artworkQuye, "error");
  assert.equal(machine.dataset.recordPreview, "lenovo", "Quye failure cannot disable Lenovo");
  fire(artwork, "error");
  assert.equal(machine.dataset.recordPreview, "lenovo", "An inactive Douyin failure cannot disable Lenovo");
  fire(artworkQuye, "load");
  api.setEnabled(true, 3);
  assert.equal(machine.dataset.recordPreview, "quye");
  fire(artworkLenovo, "error");
  assert.equal(machine.dataset.recordPreview, "quye", "Inactive Lenovo failure cannot disable Quye");
  api.setEnabled(false, 3);
  fire(artworkQuye, "load");
  assert.equal(machine.dataset.recordPreview, "default", "Late load cannot bypass disabling");
  api.destroy();
});

test("AI artwork load, failure, and late recovery cannot affect other active records", () => {
  const { machine, card, cardAi, artworkAi, api, fire } = setup({ aiAssetLoaded: false });
  card.hovered = true;
  cardAi.hovered = true;
  api.setEnabled(true, 4);
  assert.equal(machine.dataset.recordPreview, "default", "Missing AI art keeps the blue record visible");
  artworkAi.complete = true;
  fire(artworkAi, "load");
  assert.equal(machine.dataset.recordPreview, "default", "A zero-width image is not ready");
  artworkAi.naturalWidth = 1254;
  fire(artworkAi, "load");
  assert.equal(machine.dataset.recordPreview, "ai");
  fire(artworkAi, "error");
  assert.equal(machine.dataset.recordPreview, "default");
  api.setEnabled(true, 0);
  assert.equal(machine.dataset.recordPreview, "douyin");
  fire(artworkAi, "load");
  assert.equal(machine.dataset.recordPreview, "douyin", "Inactive AI recovery cannot change Douyin");
  api.setEnabled(true, 4);
  assert.equal(machine.dataset.recordPreview, "ai");
  api.setEnabled(false, 4);
  fire(artworkAi, "load");
  assert.equal(machine.dataset.recordPreview, "default", "Late AI load cannot override collapse");
  api.destroy();
});

test("Quye keyboard focus, window blur, and visibility change release preview state", () => {
  const { machine, cardQuye, window, document, api, fire } = setup();
  document.activeElement = cardQuye;
  cardQuye.focusVisible = true;
  api.setEnabled(true, 3);
  assert.equal(machine.dataset.recordPreview, "quye");
  fire(cardQuye, "blur");
  assert.equal(machine.dataset.recordPreview, "default");
  fire(cardQuye, "focus");
  assert.equal(machine.dataset.recordPreview, "quye");
  fire(window, "blur");
  assert.equal(machine.dataset.recordPreview, "default");
  fire(cardQuye, "pointerenter", { pointerType: "mouse" });
  document.hidden = true;
  fire(document, "visibilitychange");
  assert.equal(machine.dataset.recordPreview, "default");
  api.destroy();
});

test("reduced motion requests immediate mutually exclusive theme states, never tween playback", () => {
  const sets = [];
  const gsap = {
    set: (targets, properties) => {
      for (const node of Array.isArray(targets) ? targets : [targets]) {
        sets.push({ node, properties: { ...properties } });
      }
    },
    killTweensOf: () => {},
    timeline: () => { throw new Error("Reduced motion must not create a timeline"); },
    to: () => { throw new Error("Reduced motion must not create a tween"); },
  };
  const { machine, card, cardLenovo, cardQuye, cardAi, original, douyin, lenovo, quye, ai,
    motionQuery, api, fire } = setup({
    gsap, reducedMotion: true,
  });
  const alphaFor = (node) => {
    const entry = sets.findLast((item) => item.node === node && "autoAlpha" in item.properties);
    assert.ok(entry, "The controller requested an immediate alpha state");
    return entry.properties.autoAlpha;
  };
  card.hovered = true;
  cardLenovo.hovered = true;
  cardQuye.hovered = true;
  cardAi.hovered = true;
  api.setEnabled(true, 0);
  assert.equal(machine.dataset.recordPreview, "douyin");
  assert.equal(alphaFor(original), 0);
  assert.equal(alphaFor(douyin), 1);
  assert.equal(alphaFor(lenovo), 0);
  assert.equal(alphaFor(quye), 0);
  assert.equal(alphaFor(ai), 0);
  api.setEnabled(true, 1);
  assert.equal(machine.dataset.recordPreview, "lenovo");
  assert.equal(alphaFor(original), 0);
  assert.equal(alphaFor(douyin), 0);
  assert.equal(alphaFor(lenovo), 1);
  assert.equal(alphaFor(quye), 0);
  assert.equal(alphaFor(ai), 0);
  api.setEnabled(true, 3);
  assert.equal(machine.dataset.recordPreview, "quye");
  assert.equal(alphaFor(original), 0);
  assert.equal(alphaFor(douyin), 0);
  assert.equal(alphaFor(lenovo), 0);
  assert.equal(alphaFor(quye), 1);
  assert.equal(alphaFor(ai), 0);
  api.setEnabled(true, 4);
  assert.equal(machine.dataset.recordPreview, "ai");
  assert.equal(alphaFor(original), 0);
  assert.equal(alphaFor(douyin), 0);
  assert.equal(alphaFor(lenovo), 0);
  assert.equal(alphaFor(quye), 0);
  assert.equal(alphaFor(ai), 1);
  fire(motionQuery, "change");
  assert.equal(machine.dataset.recordPreview, "ai");
  assert.equal(alphaFor(douyin), 0);
  assert.equal(alphaFor(lenovo), 0);
  assert.equal(alphaFor(quye), 0);
  assert.equal(alphaFor(ai), 1);
  api.setEnabled(false, 4);
  assert.equal(machine.dataset.recordPreview, "default");
  assert.equal(alphaFor(original), 1);
  assert.equal(alphaFor(douyin), 0);
  assert.equal(alphaFor(lenovo), 0);
  assert.equal(alphaFor(quye), 0);
  assert.equal(alphaFor(ai), 0);
  api.destroy();
  assert.equal(alphaFor(original), 1);
  assert.equal(alphaFor(douyin), 0);
  assert.equal(alphaFor(lenovo), 0);
  assert.equal(alphaFor(quye), 0);
  assert.equal(alphaFor(ai), 0);
});

test("normal GSAP requests kill the old owner before replacing it, without resetting or tweening artwork", () => {
  // API spy only: it records commands without assigning properties or running
  // callbacks, so this cannot establish visual continuity or tween rendering.
  const requests = [];
  let nextId = 0;
  const gsap = {
    set: (node, properties) => requests.push({ kind: "set", node, properties: { ...properties } }),
    timeline: (settings) => {
      const id = ++nextId;
      requests.push({ kind: "create", id, settings });
      const owner = {
        to: (node, properties, position) => {
          requests.push({ kind: "to", id, node, properties: { ...properties }, position });
          return owner;
        },
        kill: () => requests.push({ kind: "kill", id }),
      };
      return owner;
    },
    to: () => { throw new Error("The controller must use its single timeline owner"); },
  };
  const { machine, card, cardLenovo, cardQuye, cardAi, original, douyin, lenovo, quye, ai,
    artwork, artworkLenovo, artworkQuye, artworkAi, api, fire } = setup({ gsap });
  assert.equal(requests.filter((entry) => entry.kind === "create").length, 0,
    "Initialization does not start an animation");
  requests.length = 0; // Initialization's deliberate static state sets are allowed.
  card.hovered = true;
  cardLenovo.hovered = true;
  cardQuye.hovered = true;
  cardAi.hovered = true;

  const assertTargets = (entries, theme) => {
    assert.ok(!entries.some((entry) => entry.kind === "set"), "Transitions do not reset live shell values");
    const tweens = entries.filter((entry) => entry.kind === "to");
    assert.equal(tweens.length, 6, "One original shell, four theme shells, and one progress object");
    const progressTargets = tweens.filter((entry) => ![original, douyin, lenovo, quye, ai].includes(entry.node));
    assert.equal(progressTargets.length, 1);
    assert.equal(typeof progressTargets[0].node.progress, "number");
    for (const entry of tweens) {
      assert.ok(entry.node !== artwork && entry.node !== artworkLenovo &&
        entry.node !== artworkQuye && entry.node !== artworkAi,
        "Rotation-owned images are never animation targets");
      assert.ok(!("rotation" in entry.properties) && !("transform" in entry.properties),
        "Shell tweens cannot replace the artwork rotation");
    }
    const originalTween = tweens.find((entry) => entry.node === original);
    assert.equal(originalTween.properties.x, theme ? 1500 : 0);
    assert.equal(originalTween.properties.autoAlpha, theme ? 0 : 1);
    assert.equal(tweens.find((entry) => entry.node === douyin).properties.autoAlpha, theme === "douyin" ? 1 : 0);
    assert.equal(tweens.find((entry) => entry.node === lenovo).properties.autoAlpha, theme === "lenovo" ? 1 : 0);
    assert.equal(tweens.find((entry) => entry.node === quye).properties.autoAlpha, theme === "quye" ? 1 : 0);
    assert.equal(tweens.find((entry) => entry.node === ai).properties.autoAlpha, theme === "ai" ? 1 : 0);
  };

  api.setEnabled(true, 0);
  assert.equal(machine.dataset.recordPreview, "douyin");
  assert.equal(requests[0].kind, "create");
  assertTargets(requests, "douyin");
  let previousId = requests[0].id;

  for (const themeIndex of [1, 3, 4, 0, 4, 3, 1, 4]) {
    requests.length = 0;
    api.setEnabled(true, themeIndex);
    assert.equal(requests[0].kind, "kill", "The previous owner is killed before a replacement is created");
    assert.equal(requests[0].id, previousId);
    assert.equal(requests[1].kind, "create");
    previousId = requests[1].id;
    const name = { 0: "douyin", 1: "lenovo", 3: "quye", 4: "ai" }[themeIndex];
    assert.equal(machine.dataset.recordPreview, name);
    assertTargets(requests, name);
  }

  requests.length = 0;
  api.setEnabled(false, 4);
  assert.equal(requests[0].kind, "kill");
  assert.equal(requests[0].id, previousId);
  assert.equal(requests[1].kind, "create");
  previousId = requests[1].id;
  assertTargets(requests, null);
  assert.equal(machine.dataset.recordPreview, "default");

  requests.length = 0;
  api.destroy();
  assert.equal(requests[0].kind, "kill", "Destroy terminates the last owner before restoring static states");
  assert.equal(requests[0].id, previousId);
  assert.equal(requests.filter((entry) => entry.kind === "create").length, 0);
  const sets = requests.filter((entry) => entry.kind === "set");
  assert.equal(sets.length, 5);
  assert.equal(sets.find((entry) => entry.node === original).properties.autoAlpha, 1);
  assert.equal(sets.find((entry) => entry.node === douyin).properties.autoAlpha, 0);
  assert.equal(sets.find((entry) => entry.node === lenovo).properties.autoAlpha, 0);
  assert.equal(sets.find((entry) => entry.node === quye).properties.autoAlpha, 0);
  assert.equal(sets.find((entry) => entry.node === ai).properties.autoAlpha, 0);
  const requestCount = requests.length;
  fire(cardLenovo, "pointerenter", { pointerType: "mouse" });
  fire(artworkLenovo, "load");
  fire(cardQuye, "pointerenter", { pointerType: "mouse" });
  fire(artworkQuye, "load");
  fire(cardAi, "pointerenter", { pointerType: "mouse" });
  fire(artworkAi, "load");
  api.setEnabled(true, 4);
  api.destroy();
  assert.equal(requests.length, requestCount, "Destroyed listeners and API cannot recreate an owner");
});
