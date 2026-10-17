(() => {
  "use strict";

  // Replace these five image paths with your own work. An empty path keeps the
  // plain placeholder from the design; coverColor customizes its color.
  // The frame always crops to 775 × 436.
  // Each detail.images array is independent from its cover. Add image path
  // strings or { src, alt, width, height } objects in order. Supplying original
  // dimensions reserves the long image's layout before it finishes loading.
  // With no detail images, the 1668px-wide gray content area stays as designed.
  // Complete, original Figma groups — never slices through a card or device.
  // The long decorative background and first-screen cover stay stationary.
  const LENOVO_REVEAL_CARDS = [
    { name: "lenovo-1048-16518", top: 1060, bottom: 1859, parts: [["Group 2147241215"]] },
    { name: "lenovo-1048-16517", top: 1866, bottom: 2681, parts: [["Group 2147241214"]] },
    { name: "lenovo-1041-14167", top: 2614, bottom: 3496, parts: [["Group 2147226819"]] },
    { name: "lenovo-1041-12945", top: 3629, bottom: 4475, parts: [["Group 2147226818"]] },
    { name: "lenovo-1048-16519", top: 4549, bottom: 5359, parts: [["Group 2147241216"]] },
    { name: "lenovo-1048-16523", top: 5497, bottom: 6281, parts: [["Group 2147241217"]] },
    { name: "lenovo-1048-16524", top: 6170, bottom: 7605, parts: [["Group 2147241218"]] },
    { name: "lenovo-1048-16525", top: 7698, bottom: 8622, parts: [["Group 2147241219"]] },
    { name: "lenovo-1048-16533", top: 8749, bottom: 9577, parts: [["Group 2147241221"]] },
    { name: "lenovo-1048-16539", top: 9715, bottom: 10623, parts: [["Group 2147241225"]] },
    { name: "lenovo-1048-16544", top: 10743, bottom: 11690, parts: [["Group 2147241226"]] },
    { name: "lenovo-1048-16607", top: 11697, bottom: 12618, parts: [["Group 2147241229"]] },
    { name: "lenovo-1048-16612", top: 12757, bottom: 13576, parts: [["Group 2147241230"]] },
    { name: "lenovo-1048-16613", top: 13137, bottom: 14552, parts: [["Group 2147241231"]] },
    { name: "lenovo-1048-16615", top: 14632, bottom: 15783, parts: [["Group 2147241233"]] },
    { name: "lenovo-1048-16618", top: 15936, bottom: 16809, parts: [["Group 2147241236"]] },
    { name: "lenovo-1048-16631", top: 16930, bottom: 17765, parts: [["Group 2147241239"]] },
    { name: "lenovo-1048-16632", top: 17771, bottom: 18784, parts: [["Group 2147241240"]] },
    { name: "lenovo-1048-16664", top: 18709, bottom: 19581, parts: [["Mask group_14"]] },
  ];

  // Native SVG export preserves these complete original Baidu groups.
  // The KR2 white paper and its contents move together, not as cropped bands.
  const BAIDU_REVEAL_CARDS = [
    { name: "baidu-1062-17043", top: 1113, bottom: 3053, parts: [["Group 2147241264"]] },
    { name: "baidu-1062-17047", top: 2177, bottom: 3998, parts: [["Group 2147241265"]] },
    { name: "baidu-1062-17326", top: 3408, bottom: 6196, parts: [["Group 2147241267"]] },
    { name: "baidu-1064-13", top: 6086, bottom: 7131, parts: [["Rectangle 2131354604_2", "Group 2147241271"]] },
    { name: "baidu-1062-17466", top: 6951, bottom: 7913, parts: [["Group 2147241270"]] },
    { name: "baidu-1088-242", top: 7974, bottom: 8951, parts: [["Group 2147241272"]] },
    { name: "baidu-1088-243", top: 9056, bottom: 10342, parts: [["Group 2147241273"]] },
    // Keep the exact decoded IDs from Figma's SVG, including its UTF-8 byte spelling.
    { name: "baidu-1048-16345", top: 10341, bottom: 12324, parts: [["\u00e7\u0099\u00be\u00e5\u00ba\u00a69"]] },
    { name: "baidu-1048-16468", top: 12323, bottom: 13474, parts: [["\u00e7\u0099\u00be\u00e5\u00ba\u00a610"]] },
  ];

  // Original Quye chapter/card groups from node 1100:309. Keep the cover,
  // decorative paper and labels static; only complete cards/devices move.
  // When a chapter's children are selected, its parent is never animated too.
  const QUYE_REVEAL_CARDS = [
    { name: "quye-introduction", top: 1732, bottom: 2335, parts: [["Group 2147241294"]] },
    { name: "quye-design-goals", top: 2332, bottom: 2646, parts: [["Group 2147241281"]] },
    { name: "quye-gray-card-stack", top: 2863, bottom: 3818, parts: [
      ["Group 528"], ["Group 529"], ["Group 530"],
    ] },
    { name: "quye-design-language", top: 3627, bottom: 5683, parts: [["Group 2147241293"]] },
    { name: "quye-typography", top: 5696, bottom: 6503, parts: [["Group 2147241292"]] },
    { name: "quye-icons", top: 6589, bottom: 7647, parts: [["Group 2147241300"]] },
    { name: "quye-visual-elements", top: 7644, bottom: 8459, parts: [["Group 2147241307"]] },
    { name: "quye-visual-strip", top: 8550, bottom: 9212, parts: [["Group 2147241308"]] },
    { name: "quye-ip-design", top: 9371, bottom: 11596, parts: [["Group 2147241309"]] },
    { name: "quye-ip-introduction", top: 11685, bottom: 12258, parts: [["Group 2147241317"]] },
    { name: "quye-ip-profile", top: 12257, bottom: 13334, parts: [["Group 2147241318"]] },
    { name: "quye-ip-scenes", top: 12806, bottom: 14869, parts: [["Group 2147241319"]] },
    { name: "quye-interaction-introduction", top: 15062, bottom: 15527, parts: [["Group 2147241322"]] },
    { name: "quye-outdoor-square", top: 15588, bottom: 16679, parts: [["Group 2147241321"]] },
    { name: "quye-ai-assistant", top: 16739, bottom: 17755, parts: [["Group 2147241323"]] },
    { name: "quye-ai-phone-sequence", top: 17920, bottom: 18619, parts: [
      ["Group 655"], ["Group 653"], ["Group 654"],
    ] },
    { name: "quye-game-interaction", top: 18830, bottom: 20027, parts: [["Group 2147241325"]] },
    // The final group continues below the original clipped canvas.
    { name: "quye-closing", top: 20096, bottom: 21190, parts: [["Group 2147241327"]] },
  ];

  // Complete original groups from the AI efficiency study (1022:10464).
  // The background and first-screen introduction remain stationary.
  const AI_EFFICIENCY_REVEAL_CARDS = [
    { name: "ai-efficiency-flow", top: 1037, bottom: 1896, parts: [["Group 2147226801"]] },
    { name: "ai-efficiency-validation", top: 2020, bottom: 3124, parts: [["Group 2147241199"]] },
    { name: "ai-efficiency-tools", top: 3221, bottom: 4196, parts: [
      ["Group 2147241204"], ["Group 2147241205"],
    ] },
  ];

  const WORK_CARDS = [
    {
      src: "./assets/work-card-01.png",
      alt: "抖音｜超级福袋 C 侧互动链路体验升级",
      detail: {
        title: "抖音 · 超级福袋 C 侧互动链路体验升级",
        images: [{
          src: "./assets/douyin-super-lucky-bag-v2.png",
          alt: "抖音超级福袋 C 侧互动链路体验升级完整项目展示",
          width: 1668,
          height: 12854,
          // Original Figma layers preserve complete cards during animation.
          layeredArtwork: "./assets/douyin-layered-prepared.svg",
          layeredArtworkKey: "douyin",
          layeredArtworkBundle: "./assets/douyin-layered-offline.js",
        }],
        placeholderHeight: 2037,
      },
    },
    {
      src: "./assets/work-card-02.png",
      coverColor: "#fd7214",
      coverImageBackground: "transparent",
      // The supplied 823 × 484 export adds 24px around its 775 × 436 card.
      coverInset: 24,
      alt: "联想｜想帮帮 AI智能体检工具",
      detail: {
        title: "联想 · 想帮帮 AI智能体检工具",
        images: [{
          src: "./assets/lenovo-ai-service-v2.png",
          alt: "联想想帮帮 AI智能体检工具完整项目展示",
          width: 1668,
          height: 19614,
          layeredArtwork: "./assets/lenovo-layered-v2-prepared.svg",
          layeredArtworkKey: "lenovo",
          layeredArtworkBundle: "./assets/lenovo-layered-v2-offline.js",
          revealCards: LENOVO_REVEAL_CARDS,
        }],
        placeholderHeight: 2037,
      },
    },
    {
      src: "./assets/work-card-03.png",
      coverColor: "#0351ff",
      alt: "百度｜广告投放平台出价竞争力诊断改版",
      detail: {
        title: "百度 · 广告投放平台出价竞争力诊断改版",
        images: [{
          src: "./assets/baidu-bid-diagnosis.png",
          alt: "百度广告投放平台出价竞争力诊断改版完整项目展示",
          width: 1668,
          height: 13474,
          layeredArtwork: "./assets/baidu-layered-prepared.svg",
          layeredArtworkKey: "baidu",
          layeredArtworkBundle: "./assets/baidu-layered-offline.js",
          revealCards: BAIDU_REVEAL_CARDS,
        }],
        placeholderHeight: 2037,
      },
    },
    {
      src: "./assets/work-card-04.png",
      alt: "趣野｜户外社交 App",
      detail: {
        title: "趣野 · 户外社交 App",
        images: [{
          src: "./assets/quye-outdoor-social.png",
          alt: "趣野户外社交 App 完整项目展示",
          // Preserve Figma's original high-resolution export, without slicing.
          width: 2580,
          height: 32768,
          designWidth: 1668,
          designHeight: 21189.681640625,
          layeredArtwork: "./assets/quye-layered-prepared.svg",
          layeredArtworkKey: "quye",
          rejectLayeredAncestry: true,
          revealCards: QUYE_REVEAL_CARDS,
        }],
        placeholderHeight: 2037,
      },
    },
    {
      src: "./assets/work-card-05.png",
      coverColor: "#050505",
      coverImageBackground: "transparent",
      // The supplied 823 × 484 export adds 24px around its 775 × 436 card.
      coverInset: 24,
      alt: "AI 效率实践｜方案预筛、风格生成与交互动效",
      detail: {
        title: "AI 效率实践 · 方案预筛、风格生成与交互动效",
        images: [{
          src: "./assets/ai-work-efficiency-v2.png",
          alt: "如何用 AI 提升工作效率：AB 方案预筛、批量生成目标风格、准确描述交互动效完整展示",
          width: 1668,
          height: 4244,
          layeredArtwork: "./assets/ai-efficiency-layered-v2-prepared.svg",
          layeredArtworkKey: "ai-efficiency",
          rejectLayeredAncestry: true,
          revealCards: AI_EFFICIENCY_REVEAL_CARDS,
        }],
        placeholderHeight: 2037,
      },
    },
  ];

  const container = document.getElementById("workCarousel");
  if (!container) return;

  const gsap = window.gsap;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const events = new AbortController();
  const COUNT = WORK_CARDS.length;
  const WIDTH = 775;
  const HEIGHT = 436;
  const CENTER_X = 496.5;
  const CENTER_Y = 554;
  const SIDE_X = 381.764;
  const SIDE_Y_DISTANCE = 518.135;
  const SIDE_Y_CORRECTION = -0.402;
  const X_DISTANCE = CENTER_X - SIDE_X;
  const RADIUS =
    (SIDE_Y_DISTANCE * SIDE_Y_DISTANCE + X_DISTANCE * X_DISTANCE) /
    (2 * X_DISTANCE);
  const STEP_ANGLE = 2 * Math.atan(X_DISTANCE / SIDE_Y_DISTANCE);
  const state = { position: 0, reveal: 0 };

  let paused = false;
  let destroyed = false;
  let hoverDirection = 0;
  let repeatTimer = 0;
  let tween = null;
  let fallbackFrame = 0;
  let lastAnnouncedIndex = -1;
  let enabled = false;
  let pointerEnteredAt = 0;
  let selectedIndex = null;
  let wheelDistance = 0;
  let wheelReverseDistance = 0;
  let lastWheelTime = 0;
  let wheelDirection = 0;
  let wheelConsumed = false;
  let lastStepDirection = 0;

  const resetWheelGesture = () => {
    wheelDistance = 0;
    wheelReverseDistance = 0;
    lastWheelTime = 0;
    wheelDirection = 0;
    wheelConsumed = false;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const smoothstep = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const wrap = (value) => ((value % COUNT) + COUNT) % COUNT;
  const wrapSlot = (value) => wrap(value + COUNT / 2) - COUNT / 2;

  const cards = WORK_CARDS.map((work, index) => {
    const card = document.createElement("figure");
    card.className = "work-carousel__card";
    card.dataset.cardIndex = String(index);
    card.setAttribute("role", "button");
    card.setAttribute("aria-roledescription", "作品卡片");
    card.setAttribute("aria-label", `打开${work.detail.title}，第 ${index + 1} 张，共 ${COUNT} 张`);
    card.setAttribute("aria-haspopup", "dialog");
    card.setAttribute("aria-controls", "workDetail");
    card.setAttribute("aria-expanded", "false");
    card.tabIndex = -1;
    // Keep the orbit/fixed hit area on the figure; hover moves only its artwork.
    const surface = document.createElement("div");
    surface.className = "work-carousel__surface";
    if (work.coverColor) surface.style.backgroundColor = work.coverColor;
    if (work.src) {
      const image = document.createElement("img");
      image.src = work.src;
      image.alt = "";
      image.draggable = false;
      image.decoding = "async";
      const coverInset = Number(work.coverInset);
      if (Number.isFinite(coverInset) && coverInset > 0) {
        image.style.width = `${WIDTH + coverInset * 2}px`;
        image.style.height = `${HEIGHT + coverInset * 2}px`;
        image.style.transform = `translate(${-coverInset}px, ${-coverInset}px)`;
      }
      if (work.coverImageBackground) {
        image.addEventListener("load", () => {
          surface.style.backgroundColor = work.coverImageBackground;
        }, { once: true, signal: events.signal });
      }
      image.addEventListener("error", () => {
        if (work.coverImageBackground) surface.style.backgroundColor = work.coverColor || "";
        image.remove();
      }, {
        once: true,
        signal: events.signal,
      });
      surface.append(image);
    }
    card.append(surface);
    container.append(card);
    return card;
  });

  const makeControl = (direction, label, className) => {
    const control = document.createElement("button");
    control.type = "button";
    control.className = `work-carousel__control ${className}`;
    control.setAttribute("aria-label", label);
    control.dataset.direction = String(direction);
    container.append(control);
    return control;
  };
  const previousControl = makeControl(
    -1,
    "上一张作品",
    "work-carousel__control--previous",
  );
  const nextControl = makeControl(
    1,
    "下一张作品",
    "work-carousel__control--next",
  );
  const status = document.createElement("p");
  status.className = "work-carousel__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  container.append(status);

  const clearRepeat = () => {
    window.clearTimeout(repeatTimer);
    repeatTimer = 0;
  };

  const updateAccessibility = () => {
    const nextEnabled = state.reveal >= 0.985 && !paused;
    if (nextEnabled !== enabled) {
      enabled = nextEnabled;
      container.inert = !enabled;
      container.setAttribute("aria-hidden", String(!enabled));
      container.classList.toggle("is-interactive", enabled);
      if (!enabled) {
        hoverDirection = 0;
        clearRepeat();
        resetWheelGesture();
      }
    }
    const active = wrap(Math.round(state.position));
    cards.forEach((card, index) => {
      card.tabIndex = enabled && index === active ? 0 : -1;
      card.setAttribute("aria-current", index === active ? "true" : "false");
      card.setAttribute("aria-expanded", String(index === selectedIndex));
      card.setAttribute("aria-disabled", String(
        !enabled || index !== active || Boolean(tween || fallbackFrame) ||
        Math.abs(wrapSlot(index - state.position)) > 0.001,
      ));
    });
    // Preview only a settled central project card, never a passing orbit card.
    // Pause/detail entry and scene collapse also restore the original record.
    window.portfolioWorkRecordPreview?.setEnabled(
      enabled && (active === 0 || active === 1 || active === 3 || active === 4) && selectedIndex === null && !tween &&
      !fallbackFrame && Math.abs(wrapSlot(active - state.position)) < 0.001,
      active,
    );
  };

  const render = () => {
    const reveal = smoothstep(state.reveal);
    const overallAlpha = smoothstep(state.reveal / 0.3);
    const active = wrap(Math.round(state.position));
    container.style.visibility = state.reveal <= 0.001 ? "hidden" : "visible";
    container.dataset.activeIndex = String(active);
    container.dataset.position = state.position.toFixed(4);
    container.dataset.reveal = state.reveal.toFixed(4);
    cards.forEach((card, index) => {
      const slot = wrapSlot(index - state.position);
      const distance = Math.abs(slot);
      const arcAngle = slot * STEP_ANGLE;
      const sineRatio = Math.sin(arcAngle) / Math.sin(STEP_ANGLE);
      const targetX = CENTER_X - RADIUS + RADIUS * Math.cos(arcAngle);
      const targetY =
        CENTER_Y +
        RADIUS * Math.sin(arcAngle) +
        SIDE_Y_CORRECTION * Math.abs(sineRatio);
      const depth = Math.min(distance, 2);
      const targetScaleX = 1 - (1 - 686.956 / WIDTH) * depth;
      const targetScaleY = 1 - (1 - 386.291 / HEIGHT) * depth;
      const alpha =
        overallAlpha * (1 - 0.5 * Math.min(distance, 1)) *
        (1 - smoothstep((distance - 1.06) / 0.69));
      const x = mix(-405 - distance * 18, targetX, reveal);
      const y = mix(CENTER_Y + slot * 44, targetY, reveal);
      const rotation = mix(-12 + slot * 5, slot * 15, reveal);
      const scaleX = mix(0.63, targetScaleX, reveal);
      const scaleY = mix(0.63, targetScaleY, reveal);

      card.style.transform =
        `translate3d(${(x - WIDTH / 2).toFixed(3)}px, ` +
        `${(y - HEIGHT / 2).toFixed(3)}px, 0) ` +
        `rotate(${rotation.toFixed(3)}deg) ` +
        `scale(${scaleX.toFixed(5)}, ${scaleY.toFixed(5)})`;
      card.style.opacity = alpha.toFixed(4);
      card.style.visibility = alpha < 0.001 ? "hidden" : "visible";
      card.style.zIndex = String(10 - Math.round(distance * 2));
      card.dataset.slot = slot.toFixed(4);
      card.setAttribute("aria-hidden", String(alpha < 0.001));
      card.classList.toggle("is-current", index === active);
    });
    updateAccessibility();
  };

  const announce = () => {
    const active = wrap(Math.round(state.position));
    if (active !== lastAnnouncedIndex) {
      status.textContent = `第 ${active + 1} 张作品，共 ${COUNT} 张`;
      lastAnnouncedIndex = active;
    }
  };

  const scheduleRepeat = () => {
    clearRepeat();
    if (!hoverDirection || !enabled || motionQuery.matches || destroyed) return;
    repeatTimer = window.setTimeout(() => step(hoverDirection), 270);
  };

  const onStepComplete = () => {
    tween = null;
    fallbackFrame = 0;
    container.classList.remove("is-rotating");
    // Rebase only at a whole slot, keeping every card's wrapped geometry equal.
    state.position = wrap(Math.round(state.position));
    render();
    if (cards.includes(document.activeElement)) {
      cards[wrap(Math.round(state.position))].focus({ preventScroll: true });
    }
    announce();
    scheduleRepeat();
  };

  const step = (direction) => {
    if (!enabled || destroyed) return;
    lastStepDirection = direction;
    clearRepeat();
    tween?.kill();
    if (fallbackFrame) cancelAnimationFrame(fallbackFrame);
    fallbackFrame = 0;
    const target =
      direction > 0
        ? Math.floor(state.position + 0.00001) + 1
        : Math.ceil(state.position - 0.00001) - 1;
    const distance = Math.abs(target - state.position);
    const duration = 0.88 * Math.max(0.45, Math.min(distance, 1));
    container.classList.add("is-rotating");
    if (motionQuery.matches) {
      state.position = target;
      onStepComplete();
    } else if (gsap) {
      tween = gsap.to(state, {
        position: target,
        duration,
        ease: "power2.inOut",
        overwrite: true,
        onUpdate: render,
        onComplete: onStepComplete,
      });
    } else {
      // Keep a file:// preview functional even if the optional GSAP file fails.
      const start = state.position;
      let elapsed = 0;
      let previous = performance.now();
      const frame = (now) => {
        if (!paused) elapsed += now - previous;
        previous = now;
        const progress = Math.min(1, elapsed / (duration * 1000));
        state.position = mix(start, target, smoothstep(progress));
        render();
        if (progress < 1) fallbackFrame = requestAnimationFrame(frame);
        else onStepComplete();
      };
      fallbackFrame = requestAnimationFrame(frame);
    }
  };

  // The visible artwork, including side cards with pointer-events disabled,
  // owns wheel gestures. The rest of the stage keeps its scene navigation.
  const handleWheel = (event) => {
    if (!enabled || paused || destroyed || selectedIndex !== null ||
        event.ctrlKey || event.metaKey ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
        event.target?.closest?.(".site-header, [role='dialog']")) return false;

    const x = event.clientX;
    const y = event.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y) ||
        !cards.some((card) => {
          if (card.style.visibility === "hidden" || Number(card.style.opacity) < 0.05) return false;
          const bounds = card.getBoundingClientRect();
          return x >= bounds.left && x <= bounds.right &&
            y >= bounds.top && y <= bounds.bottom;
        })) return false;

    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * units;
    const direction = Math.sign(delta);
    const now = performance.now();
    if (now - lastWheelTime > 220) resetWheelGesture();
    lastWheelTime = now;

    if (wheelConsumed) {
      // Ignore trackpad momentum, but allow an intentional opposite gesture
      // to reverse the current tween from its live position.
      if (direction === wheelDirection) {
        wheelReverseDistance = 0;
        return true;
      }
      wheelReverseDistance += delta;
      if (Math.abs(wheelReverseDistance) < 28) return true;
      wheelConsumed = false;
      wheelDirection = direction;
      wheelDistance = wheelReverseDistance;
      wheelReverseDistance = 0;
    } else {
      if (direction !== wheelDirection) {
        wheelDistance = 0;
        wheelDirection = direction;
      }
      wheelDistance += delta;
    }

    if (Math.abs(wheelDistance) < 24) return true;
    wheelDistance = 0;
    wheelConsumed = true;
    hoverDirection = 0;
    clearRepeat();
    // Hover zones may already have started this exact move on pointer entry.
    if ((tween || fallbackFrame) && direction === lastStepDirection) return true;
    step(direction);
    return true;
  };

  [previousControl, nextControl].forEach((control) => {
    const direction = Number(control.dataset.direction);
    control.addEventListener(
      "pointerenter",
      (event) => {
        if (event.pointerType !== "mouse" || !enabled) return;
        hoverDirection = direction;
        pointerEnteredAt = performance.now();
        step(direction);
      },
      { signal: events.signal },
    );
    control.addEventListener(
      "pointerleave",
      () => {
        if (hoverDirection === direction) hoverDirection = 0;
        clearRepeat();
      },
      { signal: events.signal },
    );
    control.addEventListener(
      "click",
      (event) => {
        // A mouse click during the entry-triggered step need not move twice.
        if (event.detail > 0 && hoverDirection === direction &&
            performance.now() - pointerEnteredAt < 1000) return;
        step(direction);
      },
      { signal: events.signal },
    );
  });

  const openCard = (index) => {
    // Only a settled central card can expand. A passing card must never open
    // mid-orbit, including during rapid hover-direction changes.
    if (!enabled || destroyed || selectedIndex !== null || tween || fallbackFrame ||
        Math.abs(wrapSlot(index - state.position)) > 0.001) return;
    const card = cards[index];
    window.portfolioWorkDetail?.open({
      index,
      work: WORK_CARDS[index],
      card,
      surface: card.querySelector(".work-carousel__surface"),
    });
  };

  cards.forEach((card, index) => {
    card.addEventListener("click", () => openCard(index), { signal: events.signal });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) openCard(index);
    }, { signal: events.signal });
  });

  container.addEventListener(
    "keydown",
    (event) => {
      let direction = 0;
      if (["ArrowDown", "ArrowRight"].includes(event.key)) direction = 1;
      if (["ArrowUp", "ArrowLeft"].includes(event.key)) direction = -1;
      if (!direction || !enabled) return;
      event.preventDefault();
      event.stopPropagation();
      hoverDirection = 0;
      clearRepeat();
      step(direction);
    },
    { signal: events.signal },
  );

  motionQuery.addEventListener("change", () => {
    hoverDirection = 0;
    clearRepeat();
    if (motionQuery.matches && tween) tween.progress(1);
  }, { signal: events.signal });

  const api = {
    getActiveCard() { return cards[wrap(Math.round(state.position))]; },
    getActiveIndex() { return wrap(Math.round(state.position)); },
    handleWheel,
    getWork(index) {
      return Number.isInteger(index) && index >= 0 && index < COUNT
        ? WORK_CARDS[index]
        : null;
    },
    setSelectedHidden(index) {
      if (destroyed) return;
      resetWheelGesture();
      selectedIndex = Number.isInteger(index) && index >= 0 && index < COUNT
        ? index
        : null;
      cards.forEach((card, cardIndex) => {
        card.querySelector(".work-carousel__surface").classList.toggle(
          "is-detail-selected", cardIndex === selectedIndex,
        );
      });
      updateAccessibility();
    },
    setReveal(progress) {
      if (destroyed) return;
      state.reveal = clamp(Number(progress) || 0, 0, 1);
      container.classList.toggle("is-revealing", state.reveal > 0 && state.reveal < 1);
      render();
      if (enabled) announce();
    },
    setPaused(value) {
      if (destroyed) return;
      paused = Boolean(value);
      resetWheelGesture();
      hoverDirection = 0;
      clearRepeat();
      if (paused) tween?.pause();
      else tween?.resume();
      render();
    },
    next() { step(1); },
    previous() { step(-1); },
    destroy() {
      destroyed = true;
      window.portfolioWorkRecordPreview?.destroy();
      events.abort();
      clearRepeat();
      tween?.kill();
      if (fallbackFrame) cancelAnimationFrame(fallbackFrame);
      container.replaceChildren();
      if (window.portfolioWorkCarousel === api) delete window.portfolioWorkCarousel;
    },
  };
  window.portfolioWorkCarousel = api;
  render();
})();
