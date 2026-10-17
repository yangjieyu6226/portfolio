(() => {
  "use strict";

  const mount = document.getElementById("workDetail");
  const stage = document.getElementById("stage");
  if (!mount || !stage) return;

  const gsap = window.gsap;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const machine = document.querySelector(".machine");
  const header = document.querySelector(".site-header");
  const events = new AbortController();
  const scrollPositions = new Map();
  const motion = { progress: 0 };
  const TARGET = { x: 126, y: 145, width: 1668, height: 935 };
  let state = "closed";
  let selected = null;
  let timeline = null;
  let ghost = null;
  let restoreFocus = null;
  let savedInert = null;
  let frozenSurface = null;
  let releaseFrame = 0;
  let scrollRestoreToken = 0;
  let scrollRestoreFrame = 0;
  let pendingScrollRestore = null;
  let disposeContentMotion = null;

  const element = (tag, className) => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  };
  const backdrop = element("div", "work-detail__backdrop");
  backdrop.setAttribute("aria-hidden", "true");
  const backpaper = element("div", "work-detail__backpaper");
  backpaper.setAttribute("aria-hidden", "true");
  const title = element("h2", "work-detail__sr-only");
  title.id = "workDetailTitle";
  const help = element("p", "work-detail__sr-only");
  help.id = "workDetailHelp";
  help.textContent = "作品内容可以上下滚动。按 Escape 返回作品列表。";
  const panel = element("div", "work-detail__panel");
  panel.tabIndex = 0;
  panel.setAttribute("role", "document");
  panel.setAttribute("aria-labelledby", title.id);
  panel.setAttribute("aria-describedby", help.id);
  const sheet = element("div", "work-detail__sheet");
  const content = element("div", "work-detail__content");
  sheet.append(content);
  // Both paper layers belong to the same native scroll surface. The initial
  // top margin disappears as the sheet moves up, instead of staying pinned.
  panel.append(backpaper, sheet);
  const closeButton = element("button", "work-detail__close");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭作品，返回作品列表");
  [
    ["base", "./assets/work-detail-close-base.svg"],
    ["icon", "./assets/work-detail-close-icon.svg"],
  ].forEach(([name, src]) => {
    const image = element("img", `work-detail__close-${name}`);
    image.src = src;
    image.alt = "";
    image.draggable = false;
    closeButton.append(image);
  });
  mount.append(backdrop, title, help, panel, closeButton);

  const setState = (next) => {
    state = next;
    mount.dataset.state = next;
  };

  const renderProgress = () => {
    window.portfolioWorkScroll?.setDetailProgress(motion.progress);
    mount.dataset.progress = motion.progress.toFixed(4);
  };

  const cancelScrollRestore = () => {
    scrollRestoreToken += 1;
    cancelAnimationFrame(scrollRestoreFrame);
    scrollRestoreFrame = 0;
    pendingScrollRestore = null;
  };

  const restoreReadingPosition = (index, images) => {
    cancelScrollRestore();
    const target = scrollPositions.get(index) || 0;
    panel.scrollTop = target;
    if (target <= 0) return;
    const pending = {
      token: scrollRestoreToken,
      index,
      target,
      remaining: new Set(images.filter((image) => !image.complete)),
    };
    pendingScrollRestore = pending;
    const isCurrent = () => pendingScrollRestore === pending &&
      pending.token === scrollRestoreToken && selected?.index === index &&
      (state === "opening" || state === "open");
    const apply = () => {
      scrollRestoreFrame = 0;
      if (!isCurrent()) return;
      // A long image can initially have zero height, clamping scrollTop to the
      // placeholder's end. Retry after each image establishes its dimensions.
      // Keep the restore pending until all image heights settle: load order
      // must not let a later image above the viewport shift the saved offset.
      panel.scrollTop = target;
      if (!pending.remaining.size) pendingScrollRestore = null;
    };
    pending.remaining.forEach((image) => {
      const settled = () => {
        if (!isCurrent()) return;
        pending.remaining.delete(image);
        cancelAnimationFrame(scrollRestoreFrame);
        scrollRestoreFrame = requestAnimationFrame(apply);
      };
      image.addEventListener("load", settled, { once: true });
      image.addEventListener("error", settled, { once: true });
    });
    apply();
  };

  const restoreSurface = () => {
    cancelAnimationFrame(releaseFrame);
    releaseFrame = 0;
    if (!frozenSurface) return;
    const { node, transform, transformPriority, transition, transitionPriority } = frozenSurface;
    if (transition) node.style.setProperty("transition", transition, transitionPriority);
    else node.style.removeProperty("transition");
    if (transform) node.style.setProperty("transform", transform, transformPriority);
    else node.style.removeProperty("transform");
    frozenSurface = null;
  };

  const freezeSurface = (surface, computedTransform) => {
    frozenSurface = {
      node: surface,
      transform: surface.style.getPropertyValue("transform"),
      transformPriority: surface.style.getPropertyPriority("transform"),
      transition: surface.style.getPropertyValue("transition"),
      transitionPriority: surface.style.getPropertyPriority("transition"),
    };
    surface.style.transition = "none";
    surface.style.transform = computedTransform;
  };

  const captureCard = (card, surface) => {
    const rect = surface.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const scale = stageRect.width / 1920;
    const computed = getComputedStyle(surface);
    const width = surface.offsetWidth || 775;
    const height = surface.offsetHeight || 436;
    let a = rect.width / scale / width;
    let b = 0;
    let c = 0;
    let d = rect.height / scale / height;
    // Preserve a card's live orbit angle if it is clicked while settling.
    // Its bounding box supplies translation; the two 2D matrices supply axes.
    if (window.DOMMatrixReadOnly) {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform === "none"
        ? undefined : getComputedStyle(card).transform)
        .multiply(new DOMMatrixReadOnly(computed.transform === "none"
          ? undefined : computed.transform));
      ({ a, b, c, d } = matrix);
    }
    const minX = Math.min(0, a * width, c * height, a * width + c * height);
    const minY = Math.min(0, b * width, d * height, b * width + d * height);
    const scaleX = Math.hypot(a, b);
    return {
      x: (rect.left - stageRect.left) / scale - minX,
      y: (rect.top - stageRect.top) / scale - minY,
      width,
      height,
      rotation: Math.atan2(b, a) * 180 / Math.PI,
      scaleX,
      scaleY: (a * d - b * c) / scaleX,
      surfaceTransform: computed.transform,
      backgroundColor: computed.backgroundColor,
    };
  };

  const fillContent = (work) => {
    const detail = work.detail || {};
    title.textContent = detail.title || work.alt || "作品详情";
    content.replaceChildren();
    const images = Array.isArray(detail.images) ? detail.images : [];
    const minHeight = Number(detail.placeholderHeight);
    content.style.minHeight = `${Number.isFinite(minHeight) && minHeight > 0 ? minHeight : 2037}px`;
    const imageNodes = [];
    images.forEach((item) => {
      const data = typeof item === "string" ? { src: item, alt: "" } : item;
      if (!data?.src) return;
      const image = document.createElement("img");
      const width = Number(data.width);
      const height = Number(data.height);
      if (Number.isFinite(width) && width > 0) image.width = width;
      if (Number.isFinite(height) && height > 0) image.height = height;
      const designWidth = Number(data.designWidth);
      const designHeight = Number(data.designHeight);
      // Large Figma exports may hit the renderer's pixel cap and round their
      // aspect ratio. Restore the exact logical canvas length without cropping
      // or changing the source pixels. Existing assets keep their auto height.
      if (Number.isFinite(designWidth) && designWidth > 0 &&
          Number.isFinite(designHeight) && designHeight > 0) {
        image.style.height = `${TARGET.width * designHeight / designWidth}px`;
        image.dataset.designWidth = String(designWidth);
        image.dataset.designHeight = String(designHeight);
      }
      if (data.layeredArtwork) image.dataset.layeredArtwork = data.layeredArtwork;
      if (data.layeredArtworkKey) image.dataset.layeredArtworkKey = data.layeredArtworkKey;
      if (data.layeredArtworkBundle) image.dataset.layeredArtworkBundle = data.layeredArtworkBundle;
      if (data.rejectLayeredAncestry === true) image.dataset.rejectLayeredAncestry = "true";
      if (Array.isArray(data.revealCards)) image.dataset.revealCards = JSON.stringify(data.revealCards);
      image.src = data.src;
      image.alt = data.alt || "";
      image.decoding = "async";
      image.draggable = false;
      // Suppress a broken-image glyph without adding a visual substitute.
      image.addEventListener("error", () => image.remove(), { once: true });
      content.append(image);
      imageNodes.push(image);
    });
    return imageNodes;
  };

  const finishOpen = () => {
    if (state !== "opening") return;
    setState("open");
    mount.classList.remove("is-animating");
    panel.inert = false;
    panel.focus({ preventScroll: true });
    disposeContentMotion = window.createPortfolioDetailMotion?.({ content, panel, gsap, motionQuery });
  };

  const finishClose = () => {
    if (state === "closed") return;
    cancelScrollRestore();
    disposeContentMotion?.();
    disposeContentMotion = null;
    motion.progress = 0;
    renderProgress();
    timeline?.kill();
    timeline = null;
    ghost?.remove();
    ghost = null;
    mount.hidden = true;
    mount.setAttribute("aria-hidden", "true");
    mount.classList.remove("is-animating");
    stage.classList.remove("is-work-detail-active");
    panel.inert = false;
    window.portfolioWorkCarousel?.setSelectedHidden(null);
    window.portfolioWorkCarousel?.setPaused(false);
    if (savedInert) {
      if (machine) machine.inert = savedInert.machine;
      if (header) header.inert = savedInert.header;
    }
    window.portfolioWorkScroll?.setPaused(false);
    setState("closed");
    const focusTarget = selected?.card?.isConnected ? selected.card : restoreFocus;
    selected = null;
    savedInert = null;
    restoreFocus = null;
    focusTarget?.focus({ preventScroll: true });
    // Reveal at precisely the ghost's original hover offset first. The next
    // paint releases the surface to its existing 260ms hover transition.
    releaseFrame = requestAnimationFrame(restoreSurface);
  };

  const showWithoutMotion = () => {
    motion.progress = 1;
    renderProgress();
    if (gsap) {
      timeline.progress(1);
    } else {
      [backdrop, backpaper, panel, closeButton].forEach((node) => {
        node.style.opacity = "1";
        node.style.visibility = "visible";
      });
      panel.style.transform = "none";
      ghost.style.visibility = "hidden";
      finishOpen();
    }
  };

  const open = ({ index, work = {}, card, surface } = {}) => {
    if (state !== "closed" || !card || !surface || stage.classList.contains("is-modal-active")) return false;
    restoreSurface();
    const source = captureCard(card, surface);
    freezeSurface(surface, source.surfaceTransform);
    selected = { index, work, card, surface };
    restoreFocus = document.activeElement;
    savedInert = { machine: Boolean(machine?.inert), header: Boolean(header?.inert) };
    setState("opening");
    mount.dataset.workIndex = String(index);
    const detailImages = fillContent(work);
    // Only the clicked artwork is copied, temporarily, for the shared-element
    // transition. The original machine and background remain in place.
    ghost = element("div", "work-detail__ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${source.width}px`;
    ghost.style.height = `${source.height}px`;
    ghost.style.backgroundColor = source.backgroundColor;
    Array.from(surface.childNodes).forEach((child) => ghost.append(child.cloneNode(true)));
    mount.append(ghost);
    mount.hidden = false;
    mount.setAttribute("aria-hidden", "false");
    mount.classList.add("is-animating");
    stage.classList.add("is-work-detail-active");
    panel.inert = true;
    restoreReadingPosition(index, detailImages);
    window.portfolioWorkScroll?.setPaused(true);
    window.portfolioWorkCarousel?.setPaused(true);
    window.portfolioWorkCarousel?.setSelectedHidden(index);
    if (machine) machine.inert = true;
    if (header) header.inert = true;
    // Keep keyboard focus on the visible dialog while its close icon fades in.
    mount.focus({ preventScroll: true });
    motion.progress = 0;
    if (!gsap) {
      showWithoutMotion();
      return true;
    }
    gsap.set(ghost, {
      x: source.x, y: source.y,
      rotation: source.rotation,
      scaleX: source.scaleX, scaleY: source.scaleY,
      autoAlpha: 1,
    });
    gsap.set(panel, {
      x: source.x - TARGET.x, y: source.y - TARGET.y,
      scaleX: source.width * source.scaleX / TARGET.width,
      scaleY: source.height * source.scaleY / TARGET.height,
      rotation: source.rotation,
      autoAlpha: 0,
    });
    gsap.set(backdrop, { autoAlpha: 0 });
    gsap.set(backpaper, { autoAlpha: 0, x: -28, y: 40, scale: 0.95, rotation: -1.58 });
    gsap.set(closeButton, { autoAlpha: 0 });
    timeline = gsap.timeline({
      paused: true,
      defaults: { duration: 0.72, ease: "power3.inOut" },
      onComplete: finishOpen,
      onReverseComplete: finishClose,
    });
    timeline
      .to(motion, { progress: 1, onUpdate: renderProgress }, 0)
      .to(backdrop, { autoAlpha: 1, duration: 0.5, ease: "power1.out" }, 0)
      .to(panel, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, 0)
      .to(ghost, {
        x: TARGET.x, y: TARGET.y, rotation: 0,
        scaleX: TARGET.width / source.width,
        scaleY: TARGET.width / source.width,
      }, 0)
      .to(backpaper, { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: 0.52 }, 0.15)
      .to(panel, { autoAlpha: 1, duration: 0.28, ease: "power1.inOut" }, 0.3)
      .to(ghost, { autoAlpha: 0, duration: 0.25, ease: "power1.inOut" }, 0.43)
      .to(closeButton, { autoAlpha: 1, duration: 0.2, ease: "power1.out" }, 0.38);
    if (motionQuery.matches) showWithoutMotion();
    else timeline.play();
    return true;
  };

  const close = () => {
    if (state === "closed" || state === "closing") return false;
    // Closing before an image arrives must not replace a deep saved position
    // with the temporary, height-clamped offset of the unloaded placeholder.
    scrollPositions.set(selected.index, pendingScrollRestore?.target ?? panel.scrollTop);
    cancelScrollRestore();
    disposeContentMotion?.();
    disposeContentMotion = null;
    setState("closing");
    mount.classList.add("is-animating");
    panel.inert = true;
    mount.focus({ preventScroll: true });
    if (!timeline || motionQuery.matches || timeline.time() < 0.001) finishClose();
    else timeline.reverse();
    return true;
  };

  closeButton.addEventListener("click", close, { signal: events.signal });
  backdrop.addEventListener("click", close, { signal: events.signal });
  // The full-stage transparent scroller covers the backdrop; blank areas
  // keep its click-to-dismiss behavior without dismissing clicks on artwork.
  panel.addEventListener("click", (event) => {
    if (event.target === panel) close();
  }, { signal: events.signal });
  // Stop scroll chaining beyond the sheet, without blocking native scrolling
  // inside it or the arrow/page/space keys used by keyboard readers.
  mount.addEventListener("wheel", (event) => {
    if (state === "closed") return;
    if (!panel.contains(event.target) || panel.inert) event.preventDefault();
    else cancelScrollRestore();
    event.stopPropagation();
  }, { passive: false, signal: events.signal });
  mount.addEventListener("touchmove", (event) => {
    if (!panel.contains(event.target) || panel.inert) event.preventDefault();
    else cancelScrollRestore();
    event.stopPropagation();
  }, { passive: false, signal: events.signal });
  // User intent wins over an outstanding async restoration immediately, even
  // before a touch drag, selection drag, or keyboard scroll changes scrollTop.
  ["pointerdown", "touchstart"].forEach((type) => {
    panel.addEventListener(type, cancelScrollRestore, {
      passive: true,
      signal: events.signal,
    });
  });
  document.addEventListener("keydown", (event) => {
    if (state === "closed") return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (panel.contains(event.target) && !panel.inert &&
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
      cancelScrollRestore();
    }
    if (event.key !== "Tab") return;
    if (state !== "open") {
      event.preventDefault();
      mount.focus({ preventScroll: true });
      return;
    }
    const focusable = [panel, closeButton];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }, { signal: events.signal });
  motionQuery.addEventListener("change", () => {
    if (!motionQuery.matches || !timeline) return;
    if (state === "opening") {
      timeline.pause();
      showWithoutMotion();
    } else if (state === "closing") finishClose();
  }, { signal: events.signal });

  window.portfolioWorkDetail = {
    open,
    close,
    isOpen: () => state !== "closed",
    getState: () => state,
    destroy() {
      if (state !== "closed") finishClose();
      cancelScrollRestore();
      restoreSurface();
      events.abort();
      mount.replaceChildren();
      delete window.portfolioWorkDetail;
    },
  };
  setState("closed");
})();
