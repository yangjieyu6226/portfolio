(() => {
  "use strict";

  const machine = document.querySelector(".machine");
  const original = document.getElementById("recordOriginalLayer");
  const themes = [
    { index: 0, name: "douyin", layerId: "recordDouyinLayer", artworkId: "recordDouyin" },
    { index: 1, name: "lenovo", layerId: "recordLenovoLayer", artworkId: "recordLenovo" },
    { index: 3, name: "quye", layerId: "recordQuyeLayer", artworkId: "recordQuye" },
    { index: 4, name: "ai", layerId: "recordAiLayer", artworkId: "recordAi" },
  ].map((theme) => ({
    ...theme,
    card: document.querySelector(`#workCarousel [data-card-index="${theme.index}"]`),
    layer: document.getElementById(theme.layerId),
    artwork: document.getElementById(theme.artworkId),
    pointerInside: false,
    keyboardFocused: false,
  })).filter((theme) => theme.card && theme.layer && theme.artwork);
  if (!machine || !original || !themes.length) return;
  themes.forEach((theme) => {
    theme.assetReady = theme.artwork.complete && theme.artwork.naturalWidth > 0;
  });

  const gsap = window.gsap;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const events = new AbortController();
  let eligibleIndex = null;
  let wanted = null;
  let timeline = null;
  let destroyed = false;
  const motion = { progress: 0 };

  const clearHints = () => {
    original.style.removeProperty("will-change");
    themes.forEach((theme) => theme.layer.style.removeProperty("will-change"));
  };
  const render = () => {
    machine.dataset.recordPreview = wanted?.name || "default";
    timeline?.kill();
    timeline = null;
    if (!gsap) {
      machine.classList.add("uses-record-preview-css");
      machine.classList.toggle("is-project-record-preview", Boolean(wanted));
      themes.forEach((theme) => {
        machine.classList.toggle(`is-${theme.name}-preview`, theme === wanted);
      });
    } else if (motionQuery.matches) {
      gsap.set(original, { x: 0, autoAlpha: wanted ? 0 : 1 });
      themes.forEach((theme) => gsap.set(theme.layer, { autoAlpha: theme === wanted ? 1 : 0 }));
      motion.progress = wanted ? 1 : 0;
      machine.dataset.recordPreviewProgress = motion.progress.toFixed(4);
      clearHints();
    } else {
      // One owner for all shells. Killing preserves live values, so rapid
      // reversal and project switches never reset position or compete.
      original.style.willChange = "transform, opacity";
      themes.forEach((theme) => { theme.layer.style.willChange = "opacity"; });
      timeline = gsap.timeline({
        onComplete: clearHints,
        onUpdate: () => {
          machine.dataset.recordPreviewProgress = motion.progress.toFixed(4);
        },
      });
      timeline.to(original, {
        x: wanted ? 1500 : 0, autoAlpha: wanted ? 0 : 1,
        duration: 0.64, ease: "power3.inOut", overwrite: "auto",
      }, 0);
      themes.forEach((theme) => {
        const selected = theme === wanted;
        timeline.to(theme.layer, {
          autoAlpha: selected ? 1 : 0, duration: selected ? 0.56 : 0.32,
          ease: "power2.out", overwrite: "auto",
        }, selected ? 0.16 : 0);
      });
      timeline.to(motion, {
        progress: wanted ? 1 : 0, duration: wanted ? 0.72 : 0.64, ease: "none",
      }, 0);
    }
  };
  const sync = () => {
    const next = themes.find((theme) => theme.index === eligibleIndex &&
      theme.assetReady && (theme.pointerInside || theme.keyboardFocused)) || null;
    if (next === wanted || destroyed) return;
    wanted = next;
    render();
  };
  const listen = (node, type, callback) => {
    node.addEventListener(type, callback, { signal: events.signal });
  };
  themes.forEach((theme) => {
    listen(theme.artwork, "load", () => {
      theme.assetReady = theme.artwork.naturalWidth > 0;
      sync();
    });
    listen(theme.artwork, "error", () => { theme.assetReady = false; sync(); });
    listen(theme.card, "pointerenter", (event) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      theme.pointerInside = true;
      sync();
    });
    listen(theme.card, "pointerleave", () => { theme.pointerInside = false; sync(); });
    listen(theme.card, "focus", () => {
      theme.keyboardFocused = theme.card.matches(":focus-visible");
      sync();
    });
    listen(theme.card, "blur", () => { theme.keyboardFocused = false; sync(); });
  });
  const release = () => {
    themes.forEach((theme) => {
      theme.pointerInside = false;
      theme.keyboardFocused = false;
    });
    sync();
  };
  listen(window, "blur", release);
  listen(document, "visibilitychange", () => { if (document.hidden) release(); });
  listen(motionQuery, "change", render);

  gsap?.set(original, { x: 0, autoAlpha: 1 });
  themes.forEach((theme) => gsap?.set(theme.layer, { autoAlpha: 0 }));
  machine.dataset.recordPreview = "default";
  machine.dataset.recordPreviewProgress = "0.0000";
  window.portfolioWorkRecordPreview = {
    setEnabled(value, activeIndex = 0) {
      const active = themes.find((theme) => theme.index === activeIndex);
      const next = value && active ? activeIndex : null;
      if (destroyed || next === eligibleIndex) return;
      eligibleIndex = next;
      if (next !== null) {
        active.pointerInside = active.card.matches(":hover");
        active.keyboardFocused = active.card === document.activeElement &&
          active.card.matches(":focus-visible");
      }
      sync();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      events.abort();
      timeline?.kill();
      gsap?.set(original, { x: 0, autoAlpha: 1 });
      themes.forEach((theme) => gsap?.set(theme.layer, { autoAlpha: 0 }));
      themes.forEach((theme) => machine.classList.remove(`is-${theme.name}-preview`));
      machine.classList.remove("is-project-record-preview", "uses-record-preview-css");
      machine.dataset.recordPreview = "default";
      machine.dataset.recordPreviewProgress = "0.0000";
      clearHints();
      delete window.portfolioWorkRecordPreview;
    },
  };
})();
