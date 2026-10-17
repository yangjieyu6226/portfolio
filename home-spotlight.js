(() => {
  "use strict";

  const stage = document.getElementById("stage");
  const spotlight = document.getElementById("homeSpotlight");
  if (!stage || !spotlight) return;
  window.portfolioHomeSpotlight?.destroy();

  const events = new AbortController();
  const finePointer = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const FOLLOW_TIME = 400;
  const SETTLE_DISTANCE = 0.25;
  let point = null;
  let lightPoint = null;
  let bounds = null;
  let frame = 0;
  let lastTime = null;
  let opacity = 0;
  let destroyed = false;

  const sceneOpacity = () => {
    const workScroll = window.portfolioWorkScroll;
    const distance = Math.max(560, Number(window.innerHeight) || 1080);
    const progressValues = [
      Number(workScroll?.getProgress?.() ?? 0),
      Number(stage.dataset.workProgress ?? 0),
      Number(window.scrollY ?? 0) / distance,
    ];
    if (!progressValues.every(Number.isFinite)) return 0;
    const progress = Math.min(1, Math.max(0, ...progressValues));
    // Use the same live scroll progress as the machine, with gentle slopes
    // at both ends. A direction change never restarts a separate fade tween.
    return 1 - progress * progress * (3 - 2 * progress);
  };
  const canShowSurface = () => !destroyed && !document.hidden &&
    finePointer.matches && !reducedMotion.matches &&
    Number(window.portfolioWorkScroll?.getDetailProgress?.() ?? 0) === 0 &&
    Number(stage.dataset.detailProgress ?? 0) === 0 &&
    !stage.classList.contains("is-modal-active") &&
    !stage.classList.contains("is-work-detail-active") && sceneOpacity() > 0;
  const stopFollow = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = null;
    lightPoint = null;
  };
  const hide = () => {
    stopFollow();
    opacity = 0;
    spotlight.hidden = true;
  };
  const showResting = () => {
    stopFollow();
    // The backdrop itself stays at 50% black on the homepage. Only the
    // pointer-shaped opening disappears when the mouse leaves the stage.
    opacity = sceneOpacity();
    spotlight.classList.add("is-resting");
    spotlight.style.setProperty("opacity", String(opacity));
    spotlight.hidden = false;
  };
  const render = (timestamp) => {
    frame = 0;
    if (!canShowSurface()) {
      hide();
      return;
    }
    if (!point) {
      showResting();
      return;
    }
    if (!bounds) {
      bounds = stage.getBoundingClientRect();
      if (![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) ||
          bounds.width <= 0 || bounds.height <= 0) {
        bounds = null;
        hide();
        return;
      }
      // The stage scales as one 1920 × 1080 canvas. Keep the light's clear
      // 200px radius and feather measured in screen CSS pixels, not design px.
      const scale = bounds.width / 1920;
      [["radius", 200], ["soft-1", 228], ["soft-2", 264], ["edge", 312]].forEach(([name, radius]) => {
        spotlight.style.setProperty(`--spotlight-${name}`, `${radius / scale}px`);
      });
    }
    const toStage = (position) => ({
      x: (position.x - bounds.left) * 1920 / bounds.width,
      y: (position.y - bounds.top) * 1080 / bounds.height,
    });
    const insideStage = ({ x, y }) => x >= 0 && x <= 1920 && y >= 0 && y <= 1080;
    if (!insideStage(toStage(point))) {
      point = null;
      showResting();
      return;
    }
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    if (!lightPoint || !insideStage(toStage(lightPoint))) {
      // Seed on entry/return, never fly in from an old page or an offscreen point.
      lightPoint = { ...point };
    } else {
      const elapsed = Math.max(0, Math.min(64, now - (lastTime ?? now)));
      // Time-based damping keeps the same lag at 60Hz and 120Hz. Only the
      // latest target changes; reversals continue from the current light.
      const follow = 1 - Math.exp(-elapsed / FOLLOW_TIME);
      lightPoint.x += (point.x - lightPoint.x) * follow;
      lightPoint.y += (point.y - lightPoint.y) * follow;
    }
    const distance = Math.hypot(point.x - lightPoint.x, point.y - lightPoint.y);
    if (distance <= SETTLE_DISTANCE) lightPoint = { ...point };
    const { x, y } = toStage(lightPoint);
    spotlight.style.setProperty("--spotlight-x", `${x}px`);
    spotlight.style.setProperty("--spotlight-y", `${y}px`);
    opacity = sceneOpacity();
    spotlight.style.setProperty("opacity", String(opacity));
    spotlight.classList.remove("is-resting");
    spotlight.hidden = false;
    if (distance > SETTLE_DISTANCE) {
      lastTime = now;
      frame = requestAnimationFrame(render);
    } else lastTime = null;
  };
  const refresh = () => {
    if (!canShowSurface()) hide();
    else if (!point) showResting();
    else if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(render);
    }
  };
  const clearPoint = () => {
    point = null;
    refresh();
  };
  const invalidateBounds = () => {
    bounds = null;
    refresh();
  };
  const observer = new MutationObserver(refresh);
  observer.observe(stage, {
    attributes: true,
    attributeFilter: ["class", "data-work-progress", "data-work-target", "data-detail-progress"],
  });
  stage.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" ||
        !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      clearPoint();
      return;
    }
    point = { x: event.clientX, y: event.clientY };
    refresh();
  }, { passive: true, signal: events.signal });
  stage.addEventListener("pointerleave", clearPoint, { passive: true, signal: events.signal });
  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") clearPoint();
  }, { passive: true, signal: events.signal });
  window.addEventListener("resize", invalidateBounds, { passive: true, signal: events.signal });
  window.addEventListener("scroll", invalidateBounds, { passive: true, signal: events.signal });
  window.addEventListener("blur", clearPoint, { signal: events.signal });
  window.addEventListener("pagehide", clearPoint, { signal: events.signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearPoint();
    else refresh();
  }, { signal: events.signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") clearPoint();
  }, { signal: events.signal });
  [finePointer, reducedMotion].forEach((query) => {
    query.addEventListener("change", clearPoint, { signal: events.signal });
  });

  window.portfolioHomeSpotlight = {
    refresh,
    resetToResting: clearPoint,
    getState: () => ({
      active: !spotlight.hidden,
      opacity,
      running: Boolean(frame),
      point: point && { ...point },
      lightPoint: lightPoint && { ...lightPoint },
    }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearPoint();
      observer.disconnect();
      events.abort();
    },
  };
  refresh();
})();
