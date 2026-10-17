#!/usr/bin/env node
"use strict";

// Exercise the real carousel controller and the page's wheel binding in small
// DOM/event fixtures. The GSAP stub records targets; it does not render motion.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const carouselSource = fs.readFileSync(path.join(root, "work-carousel.js"), "utf8");
const scrollSource = fs.readFileSync(path.join(root, "work-scroll.js"), "utf8");

class NodeStub {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.classes = new Set();
    Object.defineProperty(this, "className", {
      get: () => [...this.classes].join(" "),
      set: (value) => { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
    });
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, force) => {
        const wanted = force === undefined ? !this.classes.has(name) : force;
        if (wanted) this.classes.add(name);
        else this.classes.delete(name);
        return wanted;
      },
      contains: (name) => this.classes.has(name),
    };
    this.listeners = new Map();
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...nodes) {
    nodes.forEach((node) => { node.parentNode = this; this.children.push(node); });
  }
  replaceChildren(...nodes) {
    this.children.forEach((node) => { node.parentNode = null; });
    this.children = [];
    this.append(...nodes);
  }
  querySelector(selector) {
    if (selector === ".work-carousel__surface") {
      return this.children.find((node) => node.classList.contains("work-carousel__surface")) || null;
    }
    throw new Error(`Unexpected selector: ${selector}`);
  }
  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }
  getBoundingClientRect() {
    const rect = this.rect || { left: 0, top: 0, width: 0, height: 0 };
    return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height };
  }
  closest(selector) {
    if (selector === "#workCarousel" || selector === ".work-carousel") {
      for (let current = this; current; current = current.parentNode) {
        if (current.id === "workCarousel") return current;
      }
      return null;
    }
    return null;
  }
  focus() {}
}

const wheel = (target, deltaY, now, options = {}) => ({
  target, deltaY, deltaX: options.deltaX || 0, deltaMode: options.deltaMode || 0,
  clientX: options.clientX ?? 200, clientY: options.clientY ?? 200,
  ctrlKey: Boolean(options.ctrlKey), metaKey: Boolean(options.metaKey),
  timeStamp: now,
  cancelable: true,
  defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true; },
  stopPropagation() { this.propagationStopped = true; },
});

const setupCarousel = () => {
  const container = new NodeStub();
  container.id = "workCarousel";
  const document = {
    activeElement: null,
    getElementById: (id) => id === "workCarousel" ? container : null,
    createElement: (tag) => new NodeStub(tag),
  };
  const motionQuery = new NodeStub();
  motionQuery.matches = false;
  const tweens = [];
  let clock = 0;
  const gsap = {
    to(state, options) {
      const tween = {
        state, options, killed: false,
        kill() { this.killed = true; },
        pause() {}, resume() {},
      };
      tweens.push(tween);
      return tween;
    },
  };
  const window = {
    gsap,
    matchMedia: () => motionQuery,
    setTimeout: () => 1,
    clearTimeout() {},
    portfolioWorkRecordPreview: { setEnabled() {}, destroy() {} },
  };
  vm.runInNewContext(carouselSource, {
    window, document, AbortController,
    performance: { now: () => clock },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  }, { filename: "work-carousel.js", timeout: 1000 });
  const api = window.portfolioWorkCarousel;
  const cards = container.children.filter((node) => node.classList.contains("work-carousel__card"));
  cards.forEach((card, index) => {
    card.rect = { left: 100 + index * 300, top: 100, width: 200, height: 200 };
  });
  const outside = new NodeStub();
  return { api, cards, container, outside, tweens, setNow: (value) => { clock = value; } };
};

test("wheel over a card moves the revealed carousel; outside and disabled scenes are not claimed", () => {
  const model = setupCarousel();
  assert.equal(typeof model.api.handleWheel, "function", "carousel exposes the page-wheel handoff");
  model.setNow(100);
  assert.equal(model.api.handleWheel(wheel(model.cards[0], 120, 100)), false,
    "home/reveal animation must retain the page wheel gesture");
  model.api.setReveal(1);
  assert.equal(model.container.classList.contains("is-interactive"), true);
  assert.equal(model.cards[1].style.visibility, "visible");
  assert.ok(Number(model.cards[1].style.opacity) >= 0.05);
  assert.equal(model.api.handleWheel(wheel(model.outside, 120, 200, { clientX: 900, clientY: 900 })), false,
    "a wheel outside the card region must still navigate the page");
  assert.equal(model.api.handleWheel(wheel(model.outside, 120, 250, {
    clientX: 500, clientY: 200,
  })), true, "visible side cards should be hit by position even when pointer events pass through");
  assert.equal(model.api.handleWheel(wheel(model.cards[0], 120, 300)), true);
  assert.equal(model.tweens.length, 1);
  assert.equal(model.tweens[0].options.position, 1, "downward scroll chooses the next card");
  model.api.setPaused(true);
  assert.equal(model.api.handleWheel(wheel(model.cards[0], 120, 400)), false,
    "open detail/paused carousel must not respond behind the sheet");
  model.api.destroy();
});

test("one trackpad gesture moves one slot, but a reversal can retarget the live tween", () => {
  const model = setupCarousel();
  model.api.setReveal(1);
  model.setNow(100);
  assert.equal(model.api.handleWheel(wheel(model.cards[0], 120, 100)), true);
  for (let i = 1; i <= 8; i += 1) {
    model.setNow(100 + i * 12);
    assert.equal(model.api.handleWheel(wheel(model.cards[0], 24, 100 + i * 12)), true);
  }
  assert.equal(model.tweens.length, 1, "momentum ticks must not skip additional cards");
  // Model a partially completed GSAP tween, then reverse before it settles.
  model.tweens[0].state.position = 0.35;
  model.tweens[0].options.onUpdate();
  model.setNow(205);
  assert.equal(model.api.handleWheel(wheel(model.cards[0], -120, 205)), true);
  assert.equal(model.tweens.length, 2, "opposite intent should not wait for the prior tween");
  assert.equal(model.tweens[0].killed, true);
  assert.equal(model.tweens[1].options.position, 0, "reverse returns smoothly from current position");
  model.api.destroy();
});

test("horizontal gestures and browser zoom are not claimed by the carousel", () => {
  const model = setupCarousel();
  model.api.setReveal(1);
  assert.equal(model.api.handleWheel(wheel(model.cards[0], 5, 100, { deltaX: 20 })), false);
  assert.equal(model.api.handleWheel(wheel(model.cards[0], 120, 200, { ctrlKey: true })), false);
  assert.equal(model.api.handleWheel(wheel(model.cards[0], 120, 300, { metaKey: true })), false);
  assert.equal(model.tweens.length, 0);
  model.api.destroy();
});

test("upward wheel chooses previous card and selected detail cannot rotate behind the sheet", () => {
  const model = setupCarousel();
  model.api.setReveal(1);
  model.api.setSelectedHidden(0);
  assert.equal(model.api.handleWheel(wheel(model.cards[0], -120, 100)), false);
  model.api.setSelectedHidden(null);
  model.setNow(200);
  assert.equal(model.api.handleWheel(wheel(model.cards[0], -120, 200)), true);
  assert.equal(model.tweens.length, 1);
  assert.equal(model.tweens[0].options.position, -1, "upward scroll chooses the previous card");
  model.api.destroy();
});

const wheelBindingStart = scrollSource.indexOf('  window.addEventListener("wheel", (event) => {');
const wheelBindingEnd = scrollSource.indexOf('  window.addEventListener("touchstart",', wheelBindingStart);
assert.ok(wheelBindingStart >= 0 && wheelBindingEnd > wheelBindingStart);
const wheelBinding = scrollSource.slice(wheelBindingStart, wheelBindingEnd);

test("the global wheel handler delegates a claimed card gesture before scene navigation", () => {
  const listeners = new Map();
  const navigations = [];
  const window = {
    innerHeight: 900,
    portfolioWorkCarousel: { handleWheel: () => true },
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  const runner = `(() => {
    let paused = false, wheelDistance = 0, lastWheelTime = 0;
    let scrollTween = null, targetProgress = 1;
    const carousel = window.portfolioWorkCarousel;
    const navigate = (direction) => navigations.push(direction);
    ${wheelBinding}
  })()`;
  vm.runInNewContext(runner, {
    window, navigations, performance: { now: () => 100 },
  }, { filename: "work-scroll.js:wheel", timeout: 1000 });
  const event = wheel({}, 120, 100);
  listeners.get("wheel")(event);
  assert.equal(event.defaultPrevented, true, "handled card wheel should not scroll the page");
  assert.deepEqual(navigations, [], "handled card wheel must not call scene navigate");
});
