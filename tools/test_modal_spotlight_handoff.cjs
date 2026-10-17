#!/usr/bin/env node
"use strict";

// Exercise the actual modal open/close handlers with deterministic frames and
// timers. This checks the two-overlay handoff without claiming to render CSS.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const script = readFileSync(path.join(root, "script.js"), "utf8");
const css = readFileSync(path.join(root, "styles.css"), "utf8");
const start = script.indexOf("  const sharedCardHomes = new Map();");
const end = script.indexOf("  const cancelPendingProfileNavigation = () => {", start);
assert.ok(start >= 0 && end > start, "The modal handlers must be extractable from script.js");
const handlers = script.slice(start, end);

class NodeModel {
  constructor(name, log) {
    this.name = name;
    this.log = log;
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((value) => { this.classes.add(value); log.push(`${name}+${value}`); }),
      remove: (...names) => names.forEach((value) => { this.classes.delete(value); log.push(`${name}-${value}`); }),
      contains: (value) => this.classes.has(value),
    };
    this.attributes = new Map();
    this.style = { removeProperty(name) { delete this[name]; } };
    this.isConnected = true;
    this.offsetLeft = 0;
    this.offsetTop = 0;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() { this.log.push(`${this.name}:focus`); }
}

class MatrixModel {
  constructor(value) {
    this.values = value && value !== "none"
      ? value.match(/^matrix\(([^)]+)\)$/)?.[1].split(",").map(Number)
      : [1, 0, 0, 1, 0, 0];
    assert.equal(this.values?.length, 6, `Unsupported test transform: ${value}`);
  }
  multiply(other) {
    const [a, b, c, d, e, f] = this.values;
    const [g, h, i, j, k, l] = other.values;
    const result = new MatrixModel();
    result.values = [
      a * g + c * h, b * g + d * h,
      a * i + c * j, b * i + d * j,
      a * k + c * l + e, b * k + d * l + f,
    ];
    return result;
  }
  translate(x, y) {
    const translation = new MatrixModel();
    translation.values[4] = x;
    translation.values[5] = y;
    return this.multiply(translation);
  }
  toString() {
    return `matrix(${this.values.map((value) => Number(value.toFixed(6))).join(", ")})`;
  }
}

const setup = ({ reduced = false, sourceHoverAtOpen = false } = {}) => {
  const log = [];
  let sourceHovered = sourceHoverAtOpen;
  const stage = new NodeModel("stage", log);
  const portfolioModal = new NodeModel("modal", log);
  const tagsZone = new NodeModel("tags", log);
  const modalWhiteCard = new NodeModel("white", log);
  const modalBlueCard = new NodeModel("blue", log);
  const tagWhite = new NodeModel("tagWhite", log);
  const tagBlue = new NodeModel("tagBlue", log);
  const machine = new NodeModel("machine", log);
  let modalHidden = true;
  Object.defineProperty(portfolioModal, "hidden", {
    get: () => modalHidden,
    set(value) { modalHidden = value; log.push(`modal:hidden=${value}`); },
  });
  portfolioModal.offsetWidth = 1920;
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const frames = new Map();
  const setTimeout = (callback, delay) => {
    const id = ++nextId;
    timers.set(id, { due: now + delay, callback });
    return id;
  };
  const clearTimeout = (id) => timers.delete(id);
  const requestAnimationFrame = (callback) => {
    const id = ++nextId;
    frames.set(id, callback);
    return id;
  };
  const window = {
    setTimeout, clearTimeout,
    portfolioWorkScroll: { canOpenProfile: () => true },
    portfolioHomeSpotlight: { resetToResting() {
      assert.equal(stage.classList.contains("is-modal-active"), false,
        "Restore the spotlight only after its modal gate clears");
      assert.equal(portfolioModal.hidden, false,
        "The old backdrop must still cover the screen during spotlight restoration");
      log.push("spotlight:resting");
    } },
  };
  const runner = `(() => {
    let modalState = "closed";
    let modalTimer = 0;
    let modalAnimationTimer = 0;
    let modalReturnFocus = null;
    const prefersReducedMotion = () => reduced;
    const clearModalTimers = () => {
      window.clearTimeout(modalTimer);
      window.clearTimeout(modalAnimationTimer);
    };
    const setBackgroundInert = () => {};
    const animateModalWhiteCard = () => {};
    const animateModalIdRig = () => {};
    const modalWhiteCardSpring = { reset() {} };
    const modalIdRigSpring = { setInstant() {}, kick() {}, reset() {} };
    ${handlers}
    return { openPortfolioModal, closePortfolioModal, getState: () => modalState };
  })()`;
  const api = vm.runInNewContext(runner, {
    window, document: { activeElement: null, body: {} }, HTMLElement: NodeModel,
    stage, portfolioModal, tagsZone, modalWhiteCard, modalBlueCard, tagWhite, tagBlue,
    machine, reduced, requestAnimationFrame,
    getComputedStyle: (node) => {
      const hoveredTag = sourceHovered && (node === tagWhite || node === tagBlue);
      return {
        transform: hoveredTag
          ? node === tagBlue
            ? "matrix(0.9945, 0.1045, -0.1045, 0.9945, -14, -10)"
            : "matrix(0.9945, -0.1045, 0.1045, 0.9945, 14, -10)"
          : "none",
        transformOrigin: "0px 0px",
        filter: node === machine ? "none" : hoveredTag
          ? "drop-shadow(0 15px 22px rgba(0, 0, 0, 0.25))"
          : "drop-shadow(0 7px 11px rgba(0, 0, 0, 0.25))",
      };
    },
    DOMMatrix: MatrixModel,
  }, { filename: "script.js:modal-handlers", timeout: 1000 });
  const flushFrame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  };
  const advance = (milliseconds) => {
    now += milliseconds;
    for (;;) {
      const ready = [...timers.entries()].filter(([, timer]) => timer.due <= now)
        .sort((left, right) => left[1].due - right[1].due)[0];
      if (!ready) break;
      timers.delete(ready[0]);
      ready[1].callback();
    }
  };
  return { api, stage, portfolioModal, modalWhiteCard, modalBlueCard,
    log, timers, flushFrame, advance,
    setSourceHovered(value) { sourceHovered = value; } };
};

test("desktop modal backdrop stays opaque only during closing; touch and reduced-motion keep their fade", () => {
  const openRule = css.match(/\.portfolio-modal\.is-open\s+\.portfolio-modal__backdrop\s*\{([^}]+)\}/)?.[1];
  assert.match(openRule, /opacity:\s*1/);
  const rule = ".portfolio-modal.is-closing .portfolio-modal__backdrop";
  assert.equal(css.split(rule).length - 1, 1, "Closing override must have exactly one owner");
  const media = css.match(/@media\s*\(any-hover:\s*hover\)\s*and\s*\(any-pointer:\s*fine\)\s*and\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(media, "Only fine-pointer, motion-enabled home scenes can hold the 50% shade");
  assert.ok(media.includes(rule));
  assert.match(media, /opacity:\s*1/);
  assert.match(css, /\.portfolio-modal__backdrop\s*\{[^}]*opacity:\s*0;[^}]*transition:\s*opacity\s+300ms\s+ease/s,
    "Touch still fades the backdrop naturally when no homepage spotlight is available");
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.portfolio-modal__backdrop\s*\{\s*transition-duration:\s*80ms/s);
});

test("both shared cards darken to the home spotlight level before the modal unmounts", () => {
  const modalRule = css.match(/\.portfolio-modal\s*\{([^}]+)\}/)?.[1];
  assert.match(modalRule, /--modal-return-brightness:\s*1\s*;/,
    "Default card brightness stays full when the home spotlight is unavailable");
  const media = css.match(/@media\s*\(any-hover:\s*hover\)\s*and\s*\(any-pointer:\s*fine\)\s*and\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.match(media, /\.portfolio-modal\.is-closing\s*\{\s*--modal-return-brightness:\s*0\.5\s*;/,
    "Only the desktop spotlight path dims returning cards to 50%");
  assert.equal((css.match(/--modal-return-brightness:\s*0\.5\s*;/g) || []).length, 1,
    "Touch and reduced-motion modes must keep the default full brightness as their backdrop fades");
  for (const selector of ["blue", "white"]) {
    const base = css.match(new RegExp(`\\.modal-shared-card--${selector}\\s*\\{([^}]+)\\}`))?.[1];
    const open = css.match(new RegExp(`\\.portfolio-modal\\.is-open\\s+\\.modal-shared-card--${selector}\\s*\\{([^}]+)\\}`))?.[1];
    assert.match(base, /filter:\s*drop-shadow\([^;]+\)\s+brightness\(1\)\s*;/,
      `${selector} card needs the same filter-function order at home`);
    assert.match(open, /filter:\s*drop-shadow\([^;]+\)\s+brightness\(1\)\s*;/,
      `${selector} card needs the same filter-function order while open`);
  }
  assert.match(css, /\.modal-shared-card\s*\{[^}]*filter\s+580ms/s,
    "Card lightness must have time to interpolate before the 650ms close handoff");

  const model = setup();
  model.api.openPortfolioModal();
  for (const card of [model.modalWhiteCard, model.modalBlueCard]) {
    assert.match(card.style.filter, /^drop-shadow\(.+\) brightness\(1\)$/,
      "Seeded shared card starts at the same full brightness as its source");
  }
  model.flushFrame();
  model.api.closePortfolioModal();
  for (const card of [model.modalWhiteCard, model.modalBlueCard]) {
    assert.match(card.style.filter,
      /^drop-shadow\(.+\) brightness\(var\(--modal-return-brightness\)\)$/,
      "Returning card preserves the filter list while the media-gated CSS variable darkens it");
  }
});

test("shared cards return to the current resting pose, not the hover pose captured while opening", () => {
  const hoverRule = css.indexOf(".tags-zone:hover .tag-blue");
  const restingRule = css.match(/\.stage\.is-modal-active \.tags-zone \.tag\s*\{([^}]+)\}/);
  assert.ok(hoverRule >= 0 && restingRule && css.indexOf(restingRule[0]) > hoverRule,
    "The hidden source-card rest override must win over the ordinary hover pose");
  assert.match(restingRule[1], /transition:\s*none\s*;/,
    "Hidden originals must finish the old hover transition before the return target is measured");
  assert.match(restingRule[1], /transform:\s*none\s*;/);
  assert.match(restingRule[1], /filter:\s*drop-shadow\(0 7px 11px rgb\(0 0 0 \/ 0\.25\)\)\s*;/);

  const model = setup({ sourceHoverAtOpen: true });
  model.api.openPortfolioModal();
  for (const card of [model.modalWhiteCard, model.modalBlueCard]) {
    assert.notEqual(card.style.transform, "matrix(1, 0, 0, 1, 0, 0)",
      "Opening clone begins at the source card's hovered transform");
    assert.match(card.style.filter, /drop-shadow\(0 15px 22px .+\) brightness\(1\)$/,
      "Opening clone also inherits the live hover shadow");
  }

  model.flushFrame();
  model.setSourceHovered(false);
  model.api.closePortfolioModal();
  for (const card of [model.modalWhiteCard, model.modalBlueCard]) {
    assert.equal(card.style.transform, "matrix(1, 0, 0, 1, 0, 0)",
      "Returning clone must target the card's current resting transform");
    assert.equal(card.style.filter,
      "drop-shadow(0 7px 11px rgba(0, 0, 0, 0.25)) brightness(var(--modal-return-brightness))",
      "Returning clone must use the resting shadow rather than the old hover shadow");
  }
});

test("close keeps the modal mounted until the flat spotlight resumes, then removes the backdrop", () => {
  const model = setup();
  model.api.openPortfolioModal(); model.flushFrame();
  assert.equal(model.portfolioModal.classList.contains("is-open"), true);
  model.api.closePortfolioModal();
  assert.equal(model.api.getState(), "closing");
  assert.equal(model.portfolioModal.hidden, false);
  assert.equal(model.portfolioModal.classList.contains("is-closing"), true);
  assert.equal(model.portfolioModal.classList.contains("is-open"), false);
  assert.equal(model.stage.classList.contains("is-modal-active"), true);
  model.advance(649);
  assert.equal(model.portfolioModal.hidden, false,
    "No gap appears after the old 300ms backdrop transition would have finished");
  assert.equal(model.log.includes("spotlight:resting"), false);
  model.advance(1);
  assert.equal(model.api.getState(), "closed");
  assert.equal(model.portfolioModal.hidden, true);
  assert.equal(model.portfolioModal.classList.contains("is-closing"), false);
  const stageOff = model.log.indexOf("stage-is-modal-active");
  const restored = model.log.indexOf("spotlight:resting");
  const modalOff = model.log.indexOf("modal:hidden=true");
  assert.ok(stageOff >= 0 && stageOff < restored && restored < modalOff,
    "Modal gate clears, spotlight appears, then old backdrop unmounts in one task");
});

test("reopening during card return cancels stale close and removes the held-shade state only as opening takes over", () => {
  const model = setup();
  model.api.openPortfolioModal(); model.flushFrame();
  model.api.closePortfolioModal();
  model.advance(100);
  model.api.openPortfolioModal();
  assert.equal(model.api.getState(), "opening");
  assert.equal(model.portfolioModal.classList.contains("is-closing"), true,
    "Held backdrop remains until the reopening frame");
  model.flushFrame();
  assert.equal(model.portfolioModal.classList.contains("is-open"), true);
  assert.equal(model.portfolioModal.classList.contains("is-closing"), false);
  model.advance(1000);
  assert.equal(model.api.getState(), "open");
  assert.equal(model.portfolioModal.hidden, false);
  assert.equal(model.log.includes("spotlight:resting"), false,
    "The canceled close cannot revive the homepage mask behind an open modal");
});

test("reduced-motion close keeps its short 120ms completion instead of waiting for the desktop handoff", () => {
  const model = setup({ reduced: true });
  model.api.openPortfolioModal(); model.flushFrame();
  model.api.closePortfolioModal();
  model.advance(119);
  assert.equal(model.portfolioModal.hidden, false);
  model.advance(1);
  assert.equal(model.portfolioModal.hidden, true);
  assert.equal(model.api.getState(), "closed");
});
