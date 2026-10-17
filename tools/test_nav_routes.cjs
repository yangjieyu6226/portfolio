#!/usr/bin/env node
"use strict";

// Run the actual navigation handlers from script.js in a small event/scroll
// model. This checks routing and interruption without simulating visual layout.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = readFileSync(path.join(root, "script.js"), "utf8");
const markup = readFileSync(path.join(root, "index.html"), "utf8");
const scrollSource = readFileSync(path.join(root, "work-scroll.js"), "utf8");

const sliceBetween = (text, start, end) => {
  const first = text.indexOf(start);
  assert.notEqual(first, -1, `Missing handler boundary: ${start}`);
  const last = text.indexOf(end, first + start.length);
  assert.notEqual(last, -1, `Missing handler boundary: ${end}`);
  return text.slice(first, last);
};
const handlers = sliceBetween(
  source,
  "  const cancelPendingProfileNavigation = () => {",
  "  const animate = (now) => {",
);
const bindings = sliceBetween(
  source,
  "  [aboutLink, contactLink].forEach((link) => {",
  '  tagsZone.addEventListener("keydown",',
);

class EventHub {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  fire(type, options = {}) {
    const event = {
      target: options.target || this,
      clientX: options.clientX,
      defaultPrevented: Boolean(options.defaultPrevented),
      preventDefault() { this.defaultPrevented = true; },
    };
    for (const handler of this.listeners.get(type) || []) handler(event);
    return event;
  }
}

const targetUnder = (ancestor) => ({
  closest(selectorList) {
    return selectorList.split(/\s*,\s*/).includes(ancestor) ? { ancestor } : null;
  },
});

const setup = ({ atHome = true } = {}) => {
  const aboutLink = new EventHub();
  const contactLink = new EventHub();
  const workLink = new EventHub();
  const homeLink = new EventHub();
  const stage = new EventHub();
  const tagsZone = new EventHub();
  const classes = new Set();
  stage.dataset = { workTarget: atHome ? "0" : "1" };
  stage.classList = {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    contains: (name) => classes.has(name),
  };
  stage.rect = { left: 100, width: 960 };
  stage.getBoundingClientRect = () => ({ ...stage.rect });

  const status = { home: atHome, progress: atHome ? 0 : 1, detail: 0,
    navigations: [], opens: 0, now: 0 };
  const scroll = {
    canOpenProfile: () => status.home,
    getProgress: () => status.progress,
    getDetailProgress: () => status.detail,
    navigate(value) {
      status.navigations.push(value);
      stage.dataset.workTarget = String(value);
    },
  };
  const frames = new Map();
  let frameId = 0;
  const requestAnimationFrame = (callback) => {
    const id = ++frameId;
    frames.set(id, callback);
    return id;
  };
  const cancelAnimationFrame = (id) => frames.delete(id);
  const runner = `(() => {
    const DESIGN_WIDTH = 1920;
    let profileNavigationFrame = 0;
    let profileNavigationToken = 0;
    let modalState = "closed";
    const openPortfolioModal = () => {
      if (modalState === "closed" && window.portfolioWorkScroll.canOpenProfile()) {
        status.opens += 1;
        modalState = "opening";
      }
    };
    ${handlers}
    ${bindings}
    return {
      setModalState(value) { modalState = value; },
      getModalState() { return modalState; },
      pending() { return profileNavigationFrame !== 0; },
    };
  })()`;
  const api = vm.runInNewContext(runner, {
    aboutLink, contactLink, workLink, homeLink, stage, tagsZone,
    window: { portfolioWorkScroll: scroll }, status,
    performance: { now: () => status.now },
    requestAnimationFrame, cancelAnimationFrame,
  }, { filename: "script.js:nav-handlers", timeout: 1000 });
  const frame = () => {
    const callbacks = Array.from(frames.values());
    frames.clear();
    callbacks.forEach((callback) => callback());
  };
  return { aboutLink, contactLink, workLink, homeLink, stage, tagsZone,
    status, scroll, frames, frame, api };
};

test("top links are real dialog routes while WORK keeps the existing scene navigation", () => {
  for (const name of ["about", "contact"]) {
    assert.match(markup, new RegExp(
      `<a href="#${name}"[^>]*aria-haspopup="dialog"[^>]*aria-controls="portfolioModal"`,
    ));
  }
  assert.match(scrollSource, /workLink\.addEventListener\("click",\s*\(event\)\s*=>\s*\{[\s\S]*?navigate\(1\)/);
  assert.match(markup, /id="portfolioModal"[\s\S]*?role="dialog"|role="dialog"[\s\S]*?id="portfolioModal"/);
});

test("ABOUT and CONTACT open the existing profile immediately at home", () => {
  for (const link of ["aboutLink", "contactLink"]) {
    const model = setup();
    const event = model[link].fire("click");
    assert.equal(event.defaultPrevented, true, `${link} should not change the URL hash`);
    assert.equal(model.status.opens, 1);
    assert.deepEqual(model.status.navigations, []);
    assert.equal(model.frames.size, 0);
  }
});

test("header profile route returns from work and opens only after home settles", () => {
  const model = setup({ atHome: false });
  const event = model.aboutLink.fire("click");
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(model.status.navigations, [0]);
  assert.equal(model.status.opens, 0);
  assert.equal(model.frames.size, 1);
  model.status.progress = 0.35;
  model.frame();
  assert.equal(model.status.opens, 0);
  assert.equal(model.frames.size, 1);
  model.status.home = true;
  model.status.progress = 0;
  model.frame();
  assert.equal(model.status.opens, 1);
  assert.equal(model.frames.size, 0);
});

test("WORK or brand cancels a pending profile; reversal and detail state also guard stale opens", () => {
  for (const cancelBy of ["workLink", "homeLink"]) {
    const model = setup({ atHome: false });
    model.contactLink.fire("click");
    assert.equal(model.api.pending(), true);
    model[cancelBy].fire("click");
    model.status.home = true;
    model.frame();
    assert.equal(model.status.opens, 0, `${cancelBy} should cancel the pending profile`);
    assert.equal(model.frames.size, 0);
  }
  const reversed = setup({ atHome: false });
  reversed.aboutLink.fire("click");
  reversed.stage.dataset.workTarget = "1";
  reversed.status.home = true;
  reversed.frame();
  assert.equal(reversed.status.opens, 0);
  const detail = setup({ atHome: false });
  detail.stage.classList.add("is-work-detail-active");
  detail.aboutLink.fire("click");
  assert.deepEqual(detail.status.navigations, []);
  assert.equal(detail.status.opens, 0);
});

test("right blank click collapses work using scaled stage coordinates", () => {
  const model = setup({ atHome: false });
  const blank = targetUnder(".record-hotspot");
  model.stage.fire("click", { target: blank, clientX: 565 });
  assert.deepEqual(model.status.navigations, [0], "565px maps to 930 design pixels");
  assert.equal(model.stage.dataset.workTarget, "0");
  const left = setup({ atHome: false });
  left.stage.fire("click", { target: blank, clientX: 564.5 });
  assert.deepEqual(left.status.navigations, []);
  const outside = setup({ atHome: false });
  outside.stage.fire("click", { target: blank, clientX: 1061 });
  assert.deepEqual(outside.status.navigations, []);
});

test("blank-click dismissal ignores navigation, cards, controls, tags, stickers and active dialogs", () => {
  for (const ancestor of [".site-header", ".work-carousel", ".fader-control",
    ".tags-zone", ".sticker-zone", ".portfolio-modal", ".work-detail",
    "a", "button", '[role="button"]', '[role="slider"]']) {
    const model = setup({ atHome: false });
    model.stage.fire("click", { target: targetUnder(ancestor), clientX: 800 });
    assert.deepEqual(model.status.navigations, [], `Do not dismiss ${ancestor}`);
  }
  for (const gate of ["is-work-detail-active", "is-modal-active"]) {
    const model = setup({ atHome: false });
    model.stage.classList.add(gate);
    model.stage.fire("click", { target: targetUnder(".record-hotspot"), clientX: 800 });
    assert.deepEqual(model.status.navigations, [], `Do not dismiss during ${gate}`);
  }
  const nearHome = setup({ atHome: false });
  nearHome.status.progress = 0.54;
  nearHome.stage.fire("click", { target: targetUnder(".record-hotspot"), clientX: 800 });
  assert.deepEqual(nearHome.status.navigations, []);
  const alreadyHandled = setup({ atHome: false });
  alreadyHandled.stage.fire("click", {
    target: targetUnder(".record-hotspot"), clientX: 800, defaultPrevented: true,
  });
  assert.deepEqual(alreadyHandled.status.navigations, []);
});
