#!/usr/bin/env node
"use strict";

// Executes the real controller in a small EventTarget/DOM data model. Manual
// MutationObserver and rAF delivery verifies gates and cleanup, not browser
// rendering, gradient quality, event-loop timing, or visual performance.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const source = read("home-spotlight.js");
const css = read("styles.css");
const markup = read("index.html");

class NodeModel extends EventTarget {
  constructor() {
    super();
    this.dataset = {};
    this.hidden = true;
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
    };
    this.properties = new Map();
    this.writes = [];
    this.style = { setProperty: (name, value) => {
      this.properties.set(name, value);
      this.writes.push({ name, value });
    } };
  }
}
const setup = ({ fine = true, reduced = false, withScrollAPI = true,
  rect = { left: 100, top: 50, width: 960, height: 540 } } = {}) => {
  const stage = new NodeModel();
  stage.dataset = { workTarget: "0", workProgress: "0", detailProgress: "0" };
  stage.rect = { ...rect };
  let rectReads = 0;
  stage.getBoundingClientRect = () => { rectReads += 1; return { ...stage.rect }; };
  const spotlight = new NodeModel();
  const document = new NodeModel();
  document.hidden = false;
  document.getElementById = (id) => {
    if (id === "stage") return stage;
    if (id === "homeSpotlight") return spotlight;
    throw new Error(`Unexpected ID: ${id}`);
  };
  const fineQuery = new NodeModel();
  fineQuery.matches = fine;
  const reduceQuery = new NodeModel();
  reduceQuery.matches = reduced;
  const window = new NodeModel();
  window.scrollY = 0;
  window.innerHeight = 1080;
  window.matchMedia = (query) => query.includes("prefers-reduced-motion") ? reduceQuery : fineQuery;
  const scrollState = { progress: 0, detail: 0, canOpenProfile: true };
  if (withScrollAPI) window.portfolioWorkScroll = {
    getProgress: () => scrollState.progress,
    getDetailProgress: () => scrollState.detail,
    canOpenProfile: () => scrollState.canOpenProfile,
  };
  const observers = [];
  class MutationObserverModel {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const frames = new Map();
  const allFrames = [];
  let frameId = 0;
  let now = 0;
  const raf = (callback) => {
    const id = ++frameId;
    frames.set(id, callback);
    allFrames.push(callback);
    return id;
  };
  vm.runInNewContext(source, {
    window, document, AbortController, MutationObserver: MutationObserverModel,
    performance: { now: () => now },
    requestAnimationFrame: raf, cancelAnimationFrame: (id) => frames.delete(id),
  }, { filename: "home-spotlight.js", timeout: 1000 });
  const fire = (target, type, properties = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
    return event;
  };
  const move = (clientX = 340, clientY = 185, pointerType = "mouse") =>
    fire(stage, "pointermove", { clientX, clientY, pointerType });
  const mutate = (attributeName = "class") => observers.forEach((observer) => {
    if (observer.connected) observer.callback([{ target: stage, attributeName }], observer);
  });
  const flush = (timestamp = now + 1000 / 60) => {
    now = timestamp;
    const callbacks = Array.from(frames.values());
    frames.clear();
    callbacks.forEach((callback) => callback(timestamp));
  };
  const drain = (fps = 60) => {
    let count = 0;
    while (frames.size && count < 400) { flush(now + 1000 / fps); count += 1; }
    assert.ok(count < 400, "Tracking must converge and stop scheduling frames");
    return count;
  };
  const pixel = (name) => Number.parseFloat(spotlight.properties.get(`--spotlight-${name}`));
  const api = window.portfolioHomeSpotlight;
  const show = () => { move(); flush(); assert.equal(api.getState().active, true); };
  return { stage, spotlight, window, document, fineQuery, reduceQuery, scrollState,
    api, fire, move, mutate, flush, drain, frames, allFrames, observers, pixel, show,
    advance: (milliseconds) => { now += milliseconds; },
    get now() { return now; },
    get rectReads() { return rectReads; } };
};
const assertResting = (model, opacity = 1) => {
  assert.equal(model.api.getState().active, true);
  assert.equal(model.api.getState().opacity, opacity);
  assert.equal(model.api.getState().point, null);
  assert.equal(model.api.getState().lightPoint, null);
  assert.equal(model.api.getState().running, false);
  assert.equal(model.frames.size, 0);
  assert.equal(model.spotlight.classList.contains("is-resting"), true,
    "The flat-background CSS override hides the previous gradient hole");
};

test("the homepage spotlight is a direct stage child above homepage pixels but below dialogs and uses a noninteractive soft gradient", () => {
  const stack = [];
  let parentId;
  const voidTags = new Set(["meta", "link", "img", "input", "br", "hr", "source"]);
  for (const match of markup.matchAll(/<!--[\s\S]*?-->|<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    if (!match[1]) continue;
    const token = match[0];
    const tag = match[1].toLowerCase();
    if (token.startsWith("</")) { stack.pop(); continue; }
    const id = token.match(/\bid="([^"]+)"/)?.[1];
    if (id === "homeSpotlight") {
      parentId = stack.at(-1)?.id;
      assert.match(token, /\baria-hidden="true"/);
      assert.match(token, /\bhidden\b/);
    }
    if (!voidTags.has(tag) && !token.endsWith("/>")) stack.push({ tag, id });
  }
  assert.equal(parentId, "stage", "The light is not nested inside the transformed machine");
  const rule = css.match(/\.home-spotlight\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /inset:\s*0/);
  assert.match(rule, /z-index:\s*260/);
  assert.match(rule, /pointer-events:\s*none/);
  assert.match(rule, /opacity:\s*0/);
  assert.match(rule, /background:\s*radial-gradient/);
  for (const [alpha, name, pixels] of [[0, "radius", 200], [0.08, "soft-1", 228],
    [0.28, "soft-2", 264], [0.5, "edge", 312]]) {
    assert.ok(rule.includes(`rgb(0 0 0 / ${alpha}) var(--spotlight-${name}, ${pixels}px)`));
  }
  assert.doesNotMatch(rule, /(?:backdrop-filter|filter|mix-blend-mode|transform)\s*:/);
  assert.doesNotMatch(rule, /(?:transition|animation)\s*:/,
    "Opacity follows the work scene directly, not an independent CSS animation");
  assert.doesNotMatch(source, /\b(?:setTimeout|setInterval|gsap)\b/,
    "The light controller does not own another opacity clock or tween");
  assert.match(css, /\.home-spotlight\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(css, /\.home-spotlight\.is-resting\s*\{\s*background:\s*rgb\(0 0 0 \/ 50%\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.home-spotlight\s*\{\s*display:\s*none/);
  assert.match(css, /\.pixel-trail\s*\{[^}]*z-index:\s*250/);
  assert.match(read("work-detail.css"), /\.work-detail\s*\{[^}]*z-index:\s*270/);
  assert.match(css, /\.portfolio-modal\s*\{[^}]*z-index:\s*300/);
  assert.ok(markup.indexOf("./home-spotlight.js") > markup.indexOf("./work-detail.js"));
});

test("the real controller coalesces the latest first-show coordinates and keeps the clear radius at 200 screen pixels", () => {
  const model = setup();
  assertResting(model);
  let existingHoverEvents = 0;
  model.stage.addEventListener("pointermove", () => { existingHoverEvents += 1; });
  assert.equal(model.move().defaultPrevented, false);
  model.move(400, 230);
  model.move(410, 240);
  assert.equal(existingHoverEvents, 3);
  assert.equal(model.frames.size, 1);
  assert.equal(model.rectReads, 0, "Pointer handlers do not force layout before the scheduled render");
  model.flush();
  assert.equal(model.api.getState().active, true);
  assert.equal(model.spotlight.classList.contains("is-resting"), false);
  assert.equal(model.pixel("x"), 620);
  assert.equal(model.pixel("y"), 380);
  assert.equal(model.api.getState().lightPoint.x, 410, "The first light seeds at the latest target");
  assert.equal(model.api.getState().lightPoint.y, 240);
  for (const [name, size] of [["radius", 200], ["soft-1", 228], ["soft-2", 264], ["edge", 312]]) {
    assert.equal(model.pixel(name) * 0.5, size);
  }
  assert.equal(model.rectReads, 1);
  model.move(420, 250); model.flush();
  assert.equal(model.rectReads, 1, "Subsequent pointer frames reuse valid stage bounds");
  model.drain();
  assert.equal(model.frames.size, 0, "There is no continuous animation loop while the cursor rests");
  model.stage.rect = { left: 40, top: 20, width: 1920, height: 1080 };
  model.fire(model.window, "resize");
  model.flush();
  assert.equal(model.rectReads, 2);
  assert.equal(model.pixel("radius"), 200);
  assert.equal(model.pixel("x"), 380);
  assert.equal(model.pixel("y"), 230);
  model.api.destroy();
});

test("navigation changes do not jump opacity and the mask fades monotonically with scene progress in either direction", () => {
  const model = setup();
  model.show();
  assert.equal(model.api.getState().opacity, 1);
  model.stage.dataset.workTarget = "1";
  model.stage.classList.add("is-profile-disabled");
  model.scrollState.canOpenProfile = false;
  model.mutate("data-work-target");
  model.flush();
  assert.equal(model.api.getState().active, true);
  assert.equal(model.api.getState().opacity, 1, "Choosing WORK before movement cannot cut the mask off");
  let previous = 1;
  for (const progress of [0.25, 0.5, 0.75, 1]) {
    model.scrollState.progress = progress;
    model.stage.dataset.workProgress = String(progress);
    model.mutate("data-work-progress"); model.flush();
    const opacity = model.api.getState().opacity;
    closeTo(opacity, 1 - progress * progress * (3 - 2 * progress), "Scene-linked fade out");
    assert.ok(opacity <= previous); previous = opacity;
  }
  assert.equal(model.api.getState().active, false, "A stable full work view keeps no black overlay");
  assert.equal(model.api.getState().lightPoint, null);
  assert.equal(model.frames.size, 0);
  model.move(350, 195);
  assert.equal(model.frames.size, 0, "Hidden work view updates the target without animating the mask");
  model.stage.dataset.workTarget = "0";
  for (const progress of [0.75, 0.5, 0.25, 0]) {
    model.scrollState.progress = progress;
    model.stage.dataset.workProgress = String(progress);
    model.mutate("data-work-progress"); model.flush();
    const opacity = model.api.getState().opacity;
    closeTo(opacity, 1 - progress * progress * (3 - 2 * progress), "Scene-linked fade in");
    assert.ok(opacity >= previous); previous = opacity;
    assert.equal(model.api.getState().active, true);
  }
  assert.equal(model.api.getState().lightPoint.x, 350);
  assert.equal(model.api.getState().lightPoint.y, 195);
  assert.equal(model.frames.size, 0, "Returning light seeds at the latest retained target");
  model.api.destroy();
});

test("the maximum API, dataset, or normalized native progress drives opacity, while detail progress hard disables", () => {
  const checks = [
    ["API detail progress", (m) => { m.scrollState.detail = 0.00001; }],
    ["dataset detail progress", (m) => { m.stage.dataset.detailProgress = "0.00001"; }],
  ];
  for (const [name, invalidate] of checks) {
    const model = setup();
    model.show(); invalidate(model); model.mutate();
    assert.equal(model.api.getState().active, false, name);
    assert.equal(model.api.getState().opacity, 0, name);
    assert.equal(model.api.getState().lightPoint, null, name);
    assert.equal(model.frames.size, 0, name);
    model.api.destroy();
  }
  const native = setup();
  native.show();
  native.window.scrollY = 1;
  native.fire(native.window, "scroll");
  native.flush();
  assert.equal(native.api.getState().active, true, "Tiny native movement fades without a sudden hard hide");
  const progress = 1 / 1080;
  closeTo(native.api.getState().opacity, 1 - progress * progress * (3 - 2 * progress), "Native-scroll opacity");
  native.window.scrollY = 540;
  native.fire(native.window, "scroll"); native.flush();
  assert.equal(native.api.getState().opacity, 0.5);
  native.scrollState.progress = 0.75;
  native.stage.dataset.workProgress = "0.25";
  native.mutate(); native.flush();
  assert.equal(native.api.getState().opacity, 0.15625, "The API outranks a smaller dataset and native progress");
  native.scrollState.progress = 0.1;
  native.stage.dataset.workProgress = "0.75";
  native.mutate(); native.flush();
  assert.equal(native.api.getState().opacity, 0.15625, "The dataset outranks a smaller API and native progress");
  native.scrollState.progress = 0;
  native.stage.dataset.workProgress = "0";
  native.window.scrollY = 0;
  native.fire(native.window, "scroll"); native.flush();
  assert.equal(native.api.getState().active, true);
  assert.equal(native.api.getState().opacity, 1);
  assert.ok(native.rectReads > 1, "Native scroll invalidates previous stage bounds");
  native.window.innerHeight = 540;
  native.window.scrollY = 280;
  native.fire(native.window, "scroll"); native.flush();
  assert.equal(native.api.getState().opacity, 0.5, "The native transition distance has a 560px minimum");
  native.api.destroy();
  const fallback = setup({ withScrollAPI: false });
  fallback.show();
  fallback.stage.dataset.workProgress = "0.00001"; fallback.mutate(); fallback.flush();
  assert.equal(fallback.api.getState().active, true);
  assert.ok(fallback.api.getState().opacity > 0.999999);
  fallback.stage.dataset.workProgress = "0.5"; fallback.mutate(); fallback.flush();
  assert.equal(fallback.api.getState().opacity, 0.5);
  fallback.api.destroy();
});

test("both dialog classes hard hide, while navigation-only classes do not interrupt the scene fade", () => {
  const model = setup();
  model.show();
  for (const name of ["is-modal-active", "is-work-detail-active"]) {
    model.stage.classList.add(name); model.mutate();
    assert.equal(model.api.getState().active, false, name);
    assert.equal(model.api.getState().opacity, 0, name);
    model.api.refresh(); model.flush();
    assert.equal(model.api.getState().active, false, "Closing transition remains excluded while its class persists");
    model.stage.classList.remove(name); model.mutate(); model.flush();
    assert.equal(model.api.getState().active, true, `${name} exit resumes the valid homepage point`);
  }
  for (const name of ["is-work-view", "is-profile-disabled"]) {
    model.stage.classList.add(name); model.mutate(); model.flush();
    assert.equal(model.api.getState().active, true, name);
    assert.equal(model.api.getState().opacity, 1);
    model.stage.classList.remove(name); model.mutate(); model.flush();
  }
  const observer = model.observers[0];
  assert.equal(observer.target, model.stage);
  assert.equal(observer.options.attributes, true);
  assert.deepEqual(Array.from(observer.options.attributeFilter),
    ["class", "data-work-progress", "data-work-target", "data-detail-progress"]);
  model.api.destroy();
});

test("modal close can restore the flat home mask synchronously before its backdrop unmounts", () => {
  const model = setup();
  model.show();
  model.stage.classList.add("is-modal-active"); model.mutate();
  assert.equal(model.api.getState().active, false);
  model.stage.classList.remove("is-modal-active");
  model.api.resetToResting();
  assertResting(model);
  assert.equal(model.spotlight.properties.get("opacity"), "1");
  model.mutate();
  assertResting(model);
  model.move(410, 240); model.flush();
  assert.equal(model.spotlight.classList.contains("is-resting"), false,
    "The light can resume normally once the pointer moves on the home scene");
  model.api.destroy();
});

test("fine-hover and reduced-motion hard gates restore only a flat mask until a fresh pointer arrives", () => {
  for (const options of [{ fine: false }, { reduced: true }]) {
    const model = setup(options);
    model.move(); model.flush();
    assert.equal(model.api.getState().active, false);
    assert.equal(model.spotlight.writes.length, 0);
    model.api.destroy();
  }
  const model = setup();
  model.show();
  model.fineQuery.matches = false; model.fire(model.fineQuery, "change");
  assert.equal(model.api.getState().point, null);
  model.fineQuery.matches = true; model.fire(model.fineQuery, "change"); model.flush();
  assertResting(model);
  model.show();
  model.reduceQuery.matches = true; model.fire(model.reduceQuery, "change");
  assert.equal(model.api.getState().active, false);
  model.reduceQuery.matches = false; model.fire(model.reduceQuery, "change"); model.flush();
  assertResting(model);
  model.show(); model.api.destroy();
});

test("touch, Tab, blur, leave, pagehide, and invalid events clear only the hole while document visibility hard hides", () => {
  const clearCases = [
    (m) => m.move(340, 185, "touch"),
    (m) => m.fire(m.stage, "pointerdown", { pointerType: "touch" }),
    (m) => m.fire(m.document, "keydown", { key: "Tab" }),
    (m) => m.fire(m.window, "blur"),
    (m) => m.fire(m.stage, "pointerleave"),
    (m) => m.fire(m.window, "pagehide"),
    (m) => m.move(Number.NaN, 185),
  ];
  for (const clear of clearCases) {
    const model = setup(); model.show(); clear(model);
    assertResting(model);
    model.api.refresh(); model.flush();
    assertResting(model);
    model.show(); model.api.destroy();
  }
  const model = setup(); model.show();
  model.fire(model.document, "keydown", { key: "ArrowRight" });
  assert.equal(model.api.getState().active, true, "Non-Tab keys do not destroy mouse tracking");
  model.document.hidden = true; model.fire(model.document, "visibilitychange");
  assert.equal(model.api.getState().active, false);
  assert.equal(model.api.getState().opacity, 0);
  assert.equal(model.api.getState().point, null);
  assert.equal(model.api.getState().lightPoint, null);
  model.document.hidden = false; model.fire(model.document, "visibilitychange"); model.flush();
  assertResting(model);
  model.show(); model.api.destroy();
});

test("invalid geometry hides safely and outside-stage points retain a flat mask without invalid coordinates", () => {
  for (const rect of [{ left: 0, top: 0, width: 0, height: 1080 },
    { left: 0, top: 0, width: 1920, height: 0 },
    { left: Number.NaN, top: 0, width: 1920, height: 1080 }]) {
    const model = setup({ rect }); model.move(); model.flush();
    assert.equal(model.api.getState().active, false);
    assert.ok(model.spotlight.writes.every((write) => write.name === "opacity"),
      "Invalid geometry never writes light coordinates or radii; the initial flat mask needs no geometry");
    model.stage.rect = { left: 100, top: 50, width: 960, height: 540 };
    model.fire(model.window, "resize"); model.flush();
    assert.equal(model.api.getState().active, true);
    model.api.destroy();
  }
  const outside = setup(); outside.move(99, 185); outside.flush();
  assertResting(outside);
  outside.move(340, 591); outside.flush();
  assertResting(outside);
  assert.ok(outside.spotlight.writes.every(({ value }) => !/NaN|Infinity/.test(value)));
  outside.show(); outside.api.destroy();
});

test("destroy cancels pending work, disconnects observation, aborts listeners, and makes late callbacks inert", () => {
  const model = setup(); model.show(); model.move(350, 195);
  const late = model.allFrames.at(-1);
  const writeCount = model.spotlight.writes.length;
  model.api.destroy();
  assert.equal(model.api.getState().active, false);
  assert.equal(model.api.getState().point, null);
  assert.equal(model.api.getState().lightPoint, null);
  assert.equal(model.frames.size, 0);
  assert.equal(model.observers[0].connected, false);
  late();
  model.move(); model.mutate(); model.fire(model.window, "resize");
  model.fire(model.window, "scroll"); model.api.refresh(); model.flush();
  assert.equal(model.spotlight.writes.length, writeCount);
  assert.equal(model.api.getState().active, false);
  assert.equal(model.api.getState().point, null);
  assert.equal(model.frames.size, 0);
  assert.doesNotThrow(model.api.destroy);
});

const closeTo = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${message}: got ${actual}, expected ${expected}`);

test("later motion follows a slower 400ms screen-space exponential rather than teleporting and converges to a stopped frame loop", () => {
  const model = setup(); model.show();
  model.move(740, 385);
  const before = model.now;
  model.flush(before + 16);
  const alpha = 1 - Math.exp(-16 / 400);
  let light = model.api.getState().lightPoint;
  closeTo(light.x, 340 + 400 * alpha, "First delayed x step");
  closeTo(light.y, 185 + 200 * alpha, "First delayed y step");
  closeTo(model.pixel("x"), (light.x - 100) * 2, "Rendered x uses the current light, not target");
  assert.equal(model.api.getState().point.x, 740);
  assert.ok(light.x > 340 && light.x < 740);
  assert.equal(model.frames.size, 1);
  const previous = light;
  model.flush(model.now + 1000);
  const cappedAlpha = 1 - Math.exp(-64 / 400);
  light = model.api.getState().lightPoint;
  closeTo(light.x, previous.x + (740 - previous.x) * cappedAlpha, "Long frames clamp elapsed time to 64ms");
  closeTo(light.y, previous.y + (385 - previous.y) * cappedAlpha, "Long-frame y clamp");
  assert.ok(model.drain() > 0);
  assert.equal(model.api.getState().lightPoint.x, 740);
  assert.equal(model.api.getState().lightPoint.y, 385);
  assert.equal(model.api.getState().running, false);
  assert.equal(model.frames.size, 0);
  assert.equal(model.rectReads, 1, "Follow frames do not repeatedly force stage layout");
  model.api.destroy();
});

test("60Hz and 120Hz frames produce the same position after the same real duration", () => {
  const samples = [60, 120].map((fps) => {
    const model = setup(); model.show(); model.move(740, 385);
    const started = model.now;
    const count = fps * 0.4;
    for (let index = 1; index <= count; index += 1) model.flush(started + index * 1000 / fps);
    const light = model.api.getState().lightPoint;
    closeTo(light.x, 740 - 400 * Math.exp(-400 / 400), `${fps}Hz real-time x`);
    closeTo(light.y, 385 - 200 * Math.exp(-400 / 400), `${fps}Hz real-time y`);
    assert.equal(model.frames.size, 1);
    model.drain(fps);
    assert.equal(model.api.getState().running, false);
    model.api.destroy();
    return light;
  });
  closeTo(samples[0].x, samples[1].x, "Refresh rate independent x");
  closeTo(samples[0].y, samples[1].y, "Refresh rate independent y");
});

test("rapid target reversals keep a single owner and continue from the current light position", () => {
  const model = setup(); model.show(); model.move(740, 385); model.flush(model.now + 16);
  const previous = model.api.getState().lightPoint;
  const requested = model.allFrames.length;
  model.move(200, 100); model.move(240, 120); model.move(220, 110);
  assert.equal(model.frames.size, 1);
  assert.equal(model.allFrames.length, requested, "New targets reuse the existing pending follow frame");
  closeTo(model.api.getState().lightPoint.x, previous.x, "Target events do not reset current x");
  closeTo(model.api.getState().lightPoint.y, previous.y, "Target events do not reset current y");
  model.flush(model.now + 8);
  const alpha = 1 - Math.exp(-8 / 400);
  const current = model.api.getState().lightPoint;
  closeTo(current.x, previous.x + (220 - previous.x) * alpha, "Reversal continues from the live x");
  closeTo(current.y, previous.y + (110 - previous.y) * alpha, "Reversal continues from the live y");
  assert.ok(current.x > 220 && current.x < previous.x);
  model.drain();
  assert.equal(model.api.getState().lightPoint.x, 220);
  assert.equal(model.api.getState().lightPoint.y, 110);
  model.api.destroy();
});

test("a quarter-pixel screen error snaps exactly and idle restarts use the new clock instead of stale elapsed time", () => {
  const model = setup(); model.show();
  model.move(340.2, 185.1); model.flush(model.now + 1);
  assert.equal(model.api.getState().lightPoint.x, 340.2);
  assert.equal(model.api.getState().lightPoint.y, 185.1);
  assert.equal(model.frames.size, 0, "Tolerance is measured in screen pixels, not scaled stage units");
  model.advance(5000);
  model.move(740.2, 385.1); model.flush(model.now + 16);
  const alpha = 1 - Math.exp(-16 / 400);
  closeTo(model.api.getState().lightPoint.x, 340.2 + 400 * alpha, "A fresh animation resets its clock");
  closeTo(model.api.getState().lightPoint.y, 185.1 + 200 * alpha, "Fresh animation y clock");
  model.api.destroy();
});

test("every follow interruption clears its moving light and prevents pending work from reviving it", () => {
  const interrupts = [
    { hard: true, run: (m) => { m.scrollState.progress = 1; m.mutate("data-work-progress"); } },
    { hard: false, run: (m) => m.fire(m.stage, "pointerleave") },
    { hard: false, run: (m) => m.fire(m.window, "blur") },
    { hard: true, run: (m) => { m.document.hidden = true; m.fire(m.document, "visibilitychange"); } },
    { hard: true, run: (m) => { m.reduceQuery.matches = true; m.fire(m.reduceQuery, "change"); } },
    { hard: true, run: (m) => m.api.destroy() },
  ];
  for (const { hard, run } of interrupts) {
    const model = setup(); model.show(); model.move(740, 385); model.flush(model.now + 16);
    const pending = model.allFrames.at(-1);
    const writes = model.spotlight.writes.length;
    run(model);
    assert.equal(model.api.getState().active, !hard);
    assert.equal(model.api.getState().lightPoint, null);
    assert.equal(model.frames.size, 0);
    pending(model.now + 16);
    assert.equal(model.api.getState().active, !hard);
    assert.equal(model.api.getState().lightPoint, null);
    if (hard) assert.equal(model.spotlight.writes.length, writes);
    else {
      assertResting(model);
      assert.ok(model.spotlight.writes.slice(writes).every((write) => write.name === "opacity"),
        "A late callback may refresh the flat opacity but cannot paint a stale light");
    }
    assert.equal(model.frames.size, 0);
    model.api.destroy();
  }
});

test("nonfinite progress fails safely to zero opacity and finite recovery seeds the latest target", () => {
  const invalidations = [
    (m) => { m.scrollState.progress = Number.NaN; },
    (m) => { m.scrollState.progress = Number.POSITIVE_INFINITY; },
    (m) => { m.stage.dataset.workProgress = "not a number"; },
    (m) => { m.stage.dataset.workProgress = "-Infinity"; },
    (m) => { m.window.scrollY = Number.POSITIVE_INFINITY; },
    (m) => { m.scrollState.detail = Number.NaN; },
    (m) => { m.stage.dataset.detailProgress = "NaN"; },
  ];
  for (const invalidate of invalidations) {
    const model = setup(); model.show(); invalidate(model); model.mutate(); model.flush();
    assert.equal(model.api.getState().opacity, 0);
    assert.equal(model.api.getState().active, false);
    assert.equal(model.api.getState().lightPoint, null);
    assert.equal(model.frames.size, 0);
    assert.ok(model.spotlight.writes.every(({ value }) => !/NaN|Infinity/.test(value)));
    model.move(360, 195);
    assert.equal(model.frames.size, 0);
    model.scrollState.progress = 0;
    model.scrollState.detail = 0;
    model.stage.dataset.workProgress = "0";
    model.stage.dataset.detailProgress = "0";
    model.window.scrollY = 0;
    model.mutate(); model.flush();
    assert.equal(model.api.getState().opacity, 1);
    assert.equal(model.api.getState().lightPoint.x, 360);
    assert.equal(model.api.getState().lightPoint.y, 195);
    model.api.destroy();
  }
});

test("rapid navigation reversals update opacity from live progress while sharing the existing follow frame", () => {
  const model = setup(); model.show(); model.move(740, 385); model.flush(model.now + 16);
  let previousLight = model.api.getState().lightPoint;
  const alpha = 1 - Math.exp(-16 / 400);
  for (const progress of [0.25, 0.75, 0.5, 0.25, 0.5]) {
    const pendingCount = model.allFrames.length;
    model.scrollState.progress = progress;
    model.stage.dataset.workProgress = String(progress);
    model.mutate("data-work-progress");
    for (const target of ["0", "1", "0"]) {
      model.stage.dataset.workTarget = target;
      model.mutate("data-work-target");
    }
    assert.equal(model.frames.size, 1);
    assert.equal(model.allFrames.length, pendingCount, "Progress and direction updates reuse the same pending owner");
    closeTo(model.api.getState().lightPoint.x, previousLight.x, "Progress events do not reseed the moving light");
    model.flush(model.now + 16);
    closeTo(model.api.getState().opacity, 1 - progress * progress * (3 - 2 * progress), "Current scene opacity");
    closeTo(Number(model.spotlight.properties.get("opacity")), model.api.getState().opacity,
      "The same follow frame paints the current opacity");
    const current = model.api.getState().lightPoint;
    closeTo(current.x, previousLight.x + (740 - previousLight.x) * alpha, "Following continues through fade reversal");
    closeTo(current.y, previousLight.y + (385 - previousLight.y) * alpha, "Following y continues through fade reversal");
    previousLight = current;
  }
  model.scrollState.progress = 1;
  model.stage.dataset.workProgress = "1";
  model.mutate();
  assert.equal(model.api.getState().opacity, 0);
  assert.equal(model.api.getState().active, false);
  assert.equal(model.frames.size, 0);
  model.scrollState.progress = 0.5;
  model.stage.dataset.workProgress = "0.5";
  model.mutate(); model.flush();
  assert.equal(model.api.getState().opacity, 0.5);
  assert.equal(model.api.getState().lightPoint.x, 740, "Returning from hidden work view seeds at the current target");
  assert.equal(model.api.getState().lightPoint.y, 385);
  assert.equal(model.frames.size, 0);
  model.api.destroy();
});

test("scene progress clamps finite extremes and negative native overscroll does not create opacity outside zero to one", () => {
  const model = setup(); model.show();
  model.scrollState.progress = 2; model.mutate(); model.flush();
  assert.equal(model.api.getState().opacity, 0);
  assert.equal(model.api.getState().active, false);
  model.scrollState.progress = -2;
  model.stage.dataset.workProgress = "-0.75";
  model.window.scrollY = -50;
  model.fire(model.window, "scroll"); model.flush();
  assert.equal(model.api.getState().opacity, 1);
  assert.equal(model.api.getState().active, true);
  model.api.destroy();
});

test("leaving during delayed follow retains 50% black, removes the old hole, stops frames, and seeds reentry at the new mouse", () => {
  const model = setup(); model.show();
  model.move(740, 385); model.flush(model.now + 16);
  assert.equal(model.api.getState().running, true);
  const late = model.allFrames.at(-1);
  model.fire(model.stage, "pointerleave");
  assertResting(model);
  assert.equal(model.api.getState().opacity * 0.5, 0.5,
    "Scene opacity remains 1 on home; 50% black comes from the background alpha, not double opacity");
  const writes = model.spotlight.writes.length;
  late(model.now + 16);
  assertResting(model);
  assert.ok(model.spotlight.writes.slice(writes).every((write) => write.name === "opacity"));
  model.move(900, 500); model.flush();
  assert.equal(model.spotlight.classList.contains("is-resting"), false);
  assert.equal(model.api.getState().lightPoint.x, 900);
  assert.equal(model.api.getState().lightPoint.y, 500);
  assert.equal(model.pixel("x"), 1600);
  assert.equal(model.pixel("y"), 900);
  assert.equal(model.frames.size, 0, "Reentry seeds immediately rather than flying from the prior light");
  model.api.destroy();
});

test("without a pointer the flat mask fades to work and back using scene progress with no follow loop or layout reads", () => {
  const model = setup();
  assertResting(model);
  for (const progress of [0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25, 0]) {
    model.scrollState.progress = progress;
    model.stage.dataset.workProgress = String(progress);
    model.stage.dataset.workTarget = progress > 0.5 ? "1" : "0";
    model.mutate("data-work-progress");
    const expected = 1 - progress * progress * (3 - 2 * progress);
    if (progress === 1) {
      assert.equal(model.api.getState().active, false);
      assert.equal(model.api.getState().opacity, 0);
    } else assertResting(model, expected);
    assert.equal(model.api.getState().point, null);
    assert.equal(model.api.getState().lightPoint, null);
    assert.equal(model.frames.size, 0);
  }
  model.fire(model.window, "resize");
  assertResting(model);
  assert.equal(model.rectReads, 0, "A flat stage-sized background does not need cursor bounds calculations");
  model.api.destroy();
});

test("flat no-pointer masks still obey detail, modal, visibility, media, and invalid-progress hard gates", () => {
  const cases = [
    { off: (m) => m.stage.classList.add("is-modal-active"), on: (m) => m.stage.classList.remove("is-modal-active") },
    { off: (m) => m.stage.classList.add("is-work-detail-active"), on: (m) => m.stage.classList.remove("is-work-detail-active") },
    { off: (m) => { m.scrollState.detail = 0.1; }, on: (m) => { m.scrollState.detail = 0; } },
    { off: (m) => { m.document.hidden = true; }, on: (m) => { m.document.hidden = false; } },
    { off: (m) => { m.fineQuery.matches = false; }, on: (m) => { m.fineQuery.matches = true; } },
    { off: (m) => { m.reduceQuery.matches = true; }, on: (m) => { m.reduceQuery.matches = false; } },
    { off: (m) => { m.scrollState.progress = Number.NaN; }, on: (m) => { m.scrollState.progress = 0.5; } },
  ];
  for (const { off, on } of cases) {
    const model = setup();
    model.scrollState.progress = 0.5; model.mutate();
    assertResting(model, 0.5);
    off(model); model.api.refresh();
    assert.equal(model.api.getState().active, false);
    assert.equal(model.api.getState().opacity, 0);
    assert.equal(model.frames.size, 0);
    on(model); model.api.refresh();
    assertResting(model, 0.5);
    model.api.destroy();
  }
});
