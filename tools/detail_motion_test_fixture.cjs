"use strict";
const vm = require("node:vm");

// Small DOM/data model for executing the real controller. SVG parsing and
// GSAP playback are not emulated: asset integrity is checked above, while the
// tests below observe controller states, API commands, and completion events.
class ModelNode extends EventTarget {
  constructor(tag, id = "") {
    super();
    this.tag = tag;
    this.id = id;
    this.attributes = new Map(id ? [["id", id]] : []);
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.offsetTop = 0;
    this.isConnected = true;
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      contains: (name) => this.classes.has(name),
      toggle: (name, force) => {
        if (force === false || (force === undefined && this.classes.has(name))) {
          this.classes.delete(name);
          return false;
        }
        this.classes.add(name);
        return true;
      },
    };
  }
  get localName() { return this.tag; }
  get parentElement() { return this.parentNode; }
  get previousElementSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.children[this.parentNode.children.indexOf(this) - 1] ?? null;
  }
  get firstElementChild() { return this.children[0] ?? null; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  getAttributeNS(namespace, name) { return this.getAttribute(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  setAttributeNS(namespace, name, value) { this.setAttribute(name, value); }
  detach() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  remove() { this.detach(); }
  append(...nodes) {
    nodes.forEach((node) => { node.detach(); node.parentNode = this; this.children.push(node); });
  }
  before(node) {
    const parent = this.parentNode;
    node.detach();
    parent.children.splice(parent.children.indexOf(this), 0, node);
    node.parentNode = parent;
  }
  replaceWith(node) {
    const parent = this.parentNode;
    node.detach();
    parent.children.splice(parent.children.indexOf(this), 1, node);
    node.parentNode = parent;
    this.parentNode = null;
  }
  contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
  querySelectorAll(selector) {
    const all = [];
    const visit = (node) => node.children.forEach((child) => { all.push(child); visit(child); });
    visit(this);
    if (selector === "[id]") return all.filter((node) => node.id);
    if (selector === "image") return all.filter((node) => node.tag === "image");
    if (selector === "foreignObject") return all.filter((node) => node.tag === "foreignObject");
    if (selector === "img[data-layered-artwork], img[data-layered-artwork-key]") {
      return all.filter((node) => node.tag === "img" &&
        (node.dataset.layeredArtwork || node.dataset.layeredArtworkKey));
    }
    throw new Error(`Unexpected model selector: ${selector}`);
  }
}

const createDetailMotionModel = ({ controllerSource, definition, bundledSVG,
  svgWidth = definition.width, svgHeight = definition.height,
  resourceHref = "./quye-layered-images/model-resource.png",
  reducedMotion = false, useGSAP = true, bundled = true, invalidAncestry = false,
  baseURI = "https://unit.invalid/portfolio/index.html", fetchSVG = null,
  initialScroll = 0, panelHeight = 1080, mutateSVG = null } = {}) => {
  // A definition with no custom mapping deliberately uses the controller's
  // actual Douyin defaults; no fake revealCards dataset is supplied to it.
  const definitions = definition.revealCards ?? vm.runInNewContext(
    `(${controllerSource.match(/const CARDS = (\[[\s\S]*?\n  \]);/)[1]})`, {}, { timeout: 1000 });
  const makeSVG = () => {
    const svg = new ModelNode("svg");
    svg.namespaceURI = "http://www.w3.org/2000/svg";
    svg.setAttribute("width", svgWidth);
    svg.setAttribute("height", svgHeight);
    const layers = new Map();
    const companionClips = Object.assign({}, ...definitions.map((card) => card.companionClips || {}));
    const defs = new ModelNode("defs");
    if (Object.keys(companionClips).length) svg.append(defs);
    // Known export structure, not painted SVG: two adjacent paper blur
    // companions plus four smaller local backdrops. Geometry mirrors the
    // source attributes so the six-member fail-closed guard is exercised.
    const blurGeometry = {
      1: { x: -3.47664, y: 5324.47, width: 1675.74, height: 2418, blur: 1.74 },
      2: { x: -3.47664, y: 5345.33, width: 1675.74, height: 7730.3, blur: 1.74 },
      4: { x: 903.291, y: 8165.28, width: 46.2044, height: 44.2532, blur: 2.41 },
      10: { x: 813.708, y: 11631.3, width: 201.689, height: 97.8016, blur: 9.91 },
      11: { x: 1404.74, y: 11918.1, width: 201.689, height: 97.8016, blur: 9.91 },
      12: { x: 1438.63, y: 11723.4, width: 201.689, height: 97.8016, blur: 9.91 },
    };
    const makeBlur = (clip) => {
      const number = clip.match(/^bgblur_(\d+)_1029_11591_clip_path$/)?.[1];
      const geometry = blurGeometry[number] || blurGeometry[1];
      const companion = new ModelNode("foreignObject");
      for (const name of ["x", "y", "width", "height"]) companion.setAttribute(name, geometry[name]);
      const div = new ModelNode("div");
      div.setAttribute("style", `backdrop-filter:blur(${geometry.blur}px);clip-path:url(#${clip});height:100%;width:100%`);
      div.style.clipPath = `url(#${clip})`;
      div.style.getPropertyValue = (name) => name === "clip-path" ? div.style.clipPath : "";
      companion.append(div);
      defs.append(new ModelNode("clipPath", clip));
      return companion;
    };
    definitions.flatMap((card) => card.parts.flat()).forEach((id) => {
      const layer = new ModelNode("g", id);
      layers.set(id, layer);
      const clip = companionClips[id];
      if (clip) svg.append(makeBlur(clip));
      svg.append(layer);
    });
    if (definition.layeredArtworkKey === "douyin") {
      for (const number of [4, 10, 11, 12]) svg.append(makeBlur(`bgblur_${number}_1029_11591_clip_path`));
    }
    if (invalidAncestry) {
      const [parentId, childId] = definitions.flatMap((card) => card.parts.flat());
      layers.get(parentId).append(layers.get(childId));
    }
    const resource = new ModelNode("image");
    resource.setAttribute("href", resourceHref);
    svg.append(resource);
    mutateSVG?.(svg);
    return svg;
  };
  const document = new EventTarget();
  document.baseURI = baseURI;
  document.hidden = false;
  document.head = new ModelNode("head");
  const scripts = [];
  const appendToHead = document.head.append.bind(document.head);
  document.head.append = (...nodes) => {
    scripts.push(...nodes.filter((node) => node.tag === "script"));
    appendToHead(...nodes);
  };
  document.importNode = (node) => node;
  document.createElement = (tag) => new ModelNode(tag);
  document.createElementNS = (namespace, tag) => new ModelNode(tag);
  const fetches = [];
  const parsed = [];
  const warnings = [];
  const preloads = [];
  let resolveDecode;
  let rejectDecode;
  const decoding = new Promise((resolve, reject) => { resolveDecode = resolve; rejectDecode = reject; });
  const frames = new Map();
  let frameId = 0;
  const sets = [];
  const timelines = [];
  const gsap = {
    set: (targets, properties) => sets.push({ targets, properties }),
    timeline: (settings) => {
      const owner = {
        settings, calls: [], killed: false,
        to(targets, properties, position) { this.calls.push({ targets, properties, position }); return this; },
        kill() { this.killed = true; },
        complete() { settings.onComplete?.(); },
      };
      timelines.push(owner);
      return owner;
    },
  };
  const window = bundled ? { portfolioLayeredArtworkSources: { [definition.layeredArtworkKey]: bundledSVG } } : {};
  vm.runInNewContext(controllerSource, {
    window, document, AbortController, URL,
    DOMParser: class {
      parseFromString(text, mime) {
        const svg = makeSVG();
        parsed.push({ text, mime, svg });
        return { documentElement: svg };
      }
    },
    Image: class {
      constructor() { preloads.push(this); }
      decode() { return decoding; }
    },
    fetch: async (url) => {
      fetches.push(url);
      return { ok: typeof fetchSVG === "string", text: async () => fetchSVG };
    },
    console: { warn: (...parts) => warnings.push(parts) },
    requestAnimationFrame: (callback) => { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
  }, { filename: "work-detail-motion.js", timeout: 1000 });
  const open = (options = {}) => {
    const sheet = new ModelNode("div");
    sheet.offsetTop = 145;
    const content = new ModelNode("div");
    sheet.append(content);
    const image = new ModelNode("img");
    image.setAttribute("width", definition.width);
    image.setAttribute("height", definition.height);
    for (const property of ["layeredArtwork", "layeredArtworkKey", "layeredArtworkBundle"]) {
      if (definition[property]) image.dataset[property] = definition[property];
    }
    if (definition.rejectLayeredAncestry) image.dataset.rejectLayeredAncestry = "true";
    if (definition.revealCards) image.dataset.revealCards = JSON.stringify(definition.revealCards);
    if (definition.designWidth !== undefined) image.dataset.designWidth = String(definition.designWidth);
    if (definition.designHeight !== undefined) image.dataset.designHeight = String(definition.designHeight);
    content.append(image);
    const panel = new EventTarget();
    panel.scrollTop = options.initialScroll ?? initialScroll;
    panel.clientHeight = panelHeight;
    const motionQuery = new EventTarget();
    motionQuery.matches = options.reducedMotion ?? reducedMotion;
    const dispose = window.createPortfolioDetailMotion({
      content, panel, gsap: (options.useGSAP ?? useGSAP) ? gsap : null, motionQuery,
    });
    const scrollTo = (top) => {
      panel.scrollTop = top;
      panel.dispatchEvent(new Event("scroll"));
      const callbacks = Array.from(frames.values());
      frames.clear();
      callbacks.forEach((callback) => callback());
    };
    const wrappersFor = (name) => content.querySelectorAll("[id]").map((node) => node.parentNode)
      .filter((node) => node?.dataset.revealCard === name);
    return { content, image, panel, motionQuery, dispose, scrollTo, wrappersFor };
  };
  const loadScript = (source = { [definition.layeredArtworkKey]: bundledSVG }, script = scripts.at(-1)) => {
    if (typeof source === "string") vm.runInNewContext(source, { window }, { timeout: 2000 });
    else Object.assign(window.portfolioLayeredArtworkSources ||= {}, source);
    script.dispatchEvent(new Event("load"));
  };
  const errorScript = (script = scripts.at(-1)) => script.dispatchEvent(new Event("error"));
  return { ...open(), document, window, fetches, parsed, warnings, preloads, scripts,
    timelines, sets, resolveDecode, rejectDecode, reopen: open, loadScript, errorScript };
};
const flushTasks = () => new Promise((resolve) => setImmediate(resolve));

module.exports = { createDetailMotionModel, flushTasks };
