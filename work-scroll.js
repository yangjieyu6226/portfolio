(() => {
  "use strict";

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const root = document.documentElement;
  const stage = document.getElementById("stage");
  const scene = document.getElementById("scrollScene");
  const machine = document.querySelector(".machine");
  const underlay = document.querySelector(".work-underlay");
  const shade = document.querySelector(".work-shade");
  const hint = document.querySelector(".mouse-hint");
  const tagsZone = document.getElementById("tagsZone");
  const carousel = window.portfolioWorkCarousel;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const workLink = document.querySelector('.nav a[href="#work"]');
  const homeLink = document.querySelector(".brand");
  const state = { progress: 0 };
  const clamp = (value) => Math.min(1, Math.max(0, value));
  const ease = gsap.parseEase("power1.inOut");
  const TARGET = { x: 442, y: -187.58, scale: 1.332071 };
  let paused = false;
  let pausedScrollY = 0;
  let targetProgress = 0;
  let detailProgress = 0;
  let refreshAfterModal = false;
  let scrollTween = null;
  let settleTimer = 0;
  let wheelDistance = 0;
  let lastWheelTime = 0;
  let touchStart = null;

  const canOpenProfile = () => targetProgress === 0 && state.progress <= 0.001 && detailProgress === 0;
  const updateProfileGate = () => {
    const enabled = canOpenProfile();
    stage.classList.toggle("is-profile-disabled", !enabled);
    tagsZone.setAttribute("aria-disabled", String(!enabled));
    tagsZone.tabIndex = enabled ? 0 : -1;
  };

  // One existing machine, including all its layers and hotspots, is transformed.
  // The header, carousel, cursor effect and dialog stay in stage coordinates.
  const render = () => {
    const progress = clamp(state.progress);
    const movement = ease(progress) * (1 - detailProgress);
    // Write all layers from one progress value without creating nested tweens.
    machine.style.transform =
      `translate3d(${TARGET.x * movement}px, ${TARGET.y * movement}px, 0) ` +
      `scale(${1 + (TARGET.scale - 1) * movement})`;
    underlay.style.opacity = movement.toFixed(4);
    shade.style.opacity = (ease(clamp(progress / 0.92)) * (1 - detailProgress)).toFixed(4);
    hint.style.opacity = (1 - clamp((progress - 0.12) / 0.55)).toFixed(4);
    carousel?.setReveal(clamp((progress - 0.12) / 0.88) * (1 - detailProgress));
    stage.dataset.workProgress = progress.toFixed(4);
    stage.dataset.workTarget = String(targetProgress);
    stage.dataset.detailProgress = detailProgress.toFixed(4);
    updateProfileGate();
    stage.classList.toggle("is-work-view", progress > 0.985);
    if (progress > 0.985) workLink.setAttribute("aria-current", "page");
    else workLink.removeAttribute("aria-current");
    stage.classList.add("is-scrolling");
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => stage.classList.remove("is-scrolling"), 160);
  };

  const measure = () => {
    const distance = `${Math.max(560, window.innerHeight)}px`;
    if (paused && root.style.getPropertyValue("--work-scroll-distance") !== distance) {
      refreshAfterModal = true;
    }
    root.style.setProperty("--work-scroll-distance", distance);
  };
  measure();
  root.classList.add("has-work-scroll");

  const trigger = ScrollTrigger.create({
    id: "portfolio-work",
    trigger: scene,
    start: "top top",
    end: () => `+=${Math.max(560, window.innerHeight)}`,
    // The gesture already eases native scroll. Read its progress directly;
    // a second animation can suppress its callbacks during trigger refresh.
    onUpdate(self) {
      if (paused) return;
      state.progress = self.progress;
      render();
    },
    onRefresh(self) {
      if (paused) return;
      state.progress = self.progress;
      render();
    },
  });

  const stopNavigation = () => {
    scrollTween?.kill();
    scrollTween = null;
  };
  const navigate = (progress) => {
    if (paused) return;
    const nextTarget = progress >= 0.5 ? 1 : 0;
    if (nextTarget === targetProgress &&
        (scrollTween || Math.abs(state.progress - nextTarget) < 0.001)) return;
    stopNavigation();
    targetProgress = nextTarget;
    stage.dataset.workTarget = String(targetProgress);
    updateProfileGate();
    // A click can arrive before ScrollTrigger's debounced resize refresh.
    measure();
    trigger.refresh();
    const target = trigger.start + targetProgress * (trigger.end - trigger.start);
    if (motionQuery.matches) {
      window.scrollTo({ top: target, behavior: "instant" });
      trigger.update();
      state.progress = targetProgress;
      render();
      return;
    }
    const scroll = { y: window.scrollY };
    scrollTween = gsap.to(scroll, {
      y: target,
      duration: Math.max(0.4, 1.05 * Math.abs(targetProgress - state.progress)),
      ease: "power1.inOut",
      onUpdate: () => window.scrollTo(0, scroll.y),
      onComplete: () => {
        window.scrollTo(0, target);
        trigger.update();
        state.progress = targetProgress;
        render();
        scrollTween = null;
      },
    });
  };
  workLink.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(1);
  });
  homeLink.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(0);
  });
  // One small vertical gesture chooses a destination, not a fraction of it.
  // Same-direction momentum never restarts the tween; a deliberate reversal
  // replaces it from the live scroll position without resetting the artwork.
  window.addEventListener("wheel", (event) => {
    if (paused || event.ctrlKey || event.metaKey ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (carousel?.handleWheel(event)) {
      wheelDistance = 0;
      lastWheelTime = 0;
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * units;
    const now = performance.now();
    if (now - lastWheelTime > 160 || Math.sign(wheelDistance) !== Math.sign(delta)) {
      wheelDistance = 0;
    }
    lastWheelTime = now;
    wheelDistance += delta;
    const nextTarget = delta > 0 ? 1 : 0;
    const threshold = scrollTween && nextTarget !== targetProgress ? 14 : 6;
    if (Math.abs(wheelDistance) >= threshold) {
      wheelDistance = 0;
      navigate(nextTarget);
    }
  }, { passive: false });
  window.addEventListener("touchstart", (event) => {
    touchStart = null;
    if (paused || event.touches.length !== 1 ||
        event.target.closest?.('[role="slider"]')) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  window.addEventListener("touchmove", (event) => {
    if (paused || !touchStart || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = touchStart.x - point.clientX;
    const dy = touchStart.y - point.clientY;
    if (Math.abs(dy) <= Math.abs(dx)) return;
    if (event.cancelable) event.preventDefault();
    if (Math.abs(dy) >= 18) {
      navigate(dy > 0 ? 1 : 0);
      touchStart = { x: point.clientX, y: point.clientY };
    }
  }, { passive: false });
  window.addEventListener("touchend", () => { touchStart = null; }, { passive: true });
  window.addEventListener("touchcancel", () => { touchStart = null; }, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || paused || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
    if (event.key === " " && event.target.closest?.('button, [role="button"], a')) return;
    const down = ["ArrowDown", "PageDown", "End"].includes(event.key) || (event.key === " " && !event.shiftKey);
    const up = ["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey);
    if (!down && !up) return;
    event.preventDefault();
    navigate(down ? 1 : 0);
  });
  window.addEventListener("resize", measure, { passive: true });
  ScrollTrigger.addEventListener("refreshInit", measure);
  motionQuery.addEventListener("change", () => {
    if (motionQuery.matches && scrollTween) scrollTween.progress(1);
  });

  window.portfolioWorkScroll = {
    getProgress: () => state.progress,
    getDetailProgress: () => detailProgress,
    setDetailProgress(value) {
      detailProgress = clamp(Number(value) || 0);
      render();
    },
    canOpenProfile,
    navigate,
    setPaused(value) {
      const nextPaused = Boolean(value);
      if (nextPaused === paused) return;
      paused = nextPaused;
      stopNavigation();
      if (paused) {
        pausedScrollY = window.scrollY;
        trigger.disable(false, true);
        root.classList.add("is-portfolio-scroll-locked");
      } else {
        root.classList.remove("is-portfolio-scroll-locked");
        // Focus and native accessibility actions may adjust a locked scroller.
        // Restore its original position before reconnecting the scene trigger.
        window.scrollTo({ top: pausedScrollY, behavior: "instant" });
        trigger.enable(false, false);
        if (refreshAfterModal) {
          refreshAfterModal = false;
          trigger.refresh();
        }
        trigger.update();
        state.progress = trigger.progress;
        render();
      }
    },
  };
  render();
  ScrollTrigger.refresh();
  targetProgress = Math.round(state.progress);
  render();
})();
