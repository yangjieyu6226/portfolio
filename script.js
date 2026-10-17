(() => {
  const DESIGN_WIDTH = 1920;
  const DESIGN_HEIGHT = 1080;
  const BASE_SPEED = 360 / 20;

  const root = document.documentElement;
  const stage = document.getElementById("stage");
  const machine = document.querySelector(".machine");
  const siteHeader = document.querySelector(".site-header");
  const aboutLink = document.querySelector('.nav a[href="#about"]');
  const workLink = document.querySelector('.nav a[href="#work"]');
  const contactLink = document.querySelector('.nav a[href="#contact"]');
  const homeLink = document.querySelector(".brand");
  const record = document.getElementById("record");
  const projectRecords = document.querySelectorAll("[data-project-record]");
  const recordHotspot = document.getElementById("recordHotspot");
  const faderControl = document.getElementById("faderControl");
  const faderHandle = document.getElementById("faderHandle");
  const tagsZone = document.getElementById("tagsZone");
  const tagWhite = tagsZone.querySelector(".tag-white");
  const tagBlue = tagsZone.querySelector(".tag-blue");
  const portfolioModal = document.getElementById("portfolioModal");
  const portfolioModalBackdrop = document.getElementById(
    "portfolioModalBackdrop",
  );
  const modalWhiteCard = document.getElementById("modalWhiteCard");
  const modalWhiteCardVisual = document.getElementById("modalWhiteCardVisual");
  const modalWhiteCardHotspot = document.getElementById("modalWhiteCardHotspot");
  const modalBlueCard = document.getElementById("modalBlueCard");
  const modalIdRig = document.getElementById("modalIdRig");
  const modalIdRigHotspot = document.getElementById("modalIdRigHotspot");
  const pixelTrail = document.getElementById("pixelTrail");
  const pixelContext = pixelTrail.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });

  const FADER_HEIGHT = 460;
  const FADER_HANDLE_CENTER = 47.5;
  const FADER_MIN = 42;
  const FADER_MAX = 338;

  let angle = 0;
  let speed = BASE_SPEED;
  let transition = null;
  let previousTime = performance.now();
  let faderPosition = FADER_MAX;
  let faderTarget = FADER_MAX;
  let faderVelocity = 0;
  let faderPointerId = null;
  let faderDragOffset = 0;
  let modalState = "closed";
  let modalTimer = 0;
  let modalAnimationTimer = 0;
  let modalReturnFocus = null;
  let profileNavigationFrame = 0;
  let profileNavigationToken = 0;
  let pixelTrailFrame = 0;
  let lastTrailPoint = null;

  const pixelStamps = [];
  const pixelMotionPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const PIXEL_GRID = 14;
  const MAX_PIXEL_STAMPS = 32;
  const GLITCH_PALETTE = [
    "255, 255, 255",
    "255, 255, 255",
    "255, 255, 255",
    "0, 0, 0",
    "0, 0, 0",
    "0, 0, 0",
    "53, 116, 255",
    "210, 82, 255",
  ];

  const easeInOutCubic = (value) =>
    value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;

  const resizeStage = () => {
    const scale = Math.min(
      window.innerWidth / DESIGN_WIDTH,
      window.innerHeight / DESIGN_HEIGHT,
    );
    root.style.setProperty("--stage-scale", scale.toFixed(6));
  };

  const transitionSpeed = (targetSpeed, duration) => {
    transition = {
      from: speed,
      to: targetSpeed,
      duration,
      elapsed: 0,
    };
  };

  const clamp = (value, minimum, maximum) =>
    Math.min(Math.max(value, minimum), maximum);

  const pointerYInFader = (event) => {
    const bounds = faderControl.getBoundingClientRect();
    return (event.clientY - bounds.top) * (FADER_HEIGHT / bounds.height);
  };

  const setFaderTarget = (nextTarget) => {
    faderTarget = clamp(nextTarget, FADER_MIN, FADER_MAX);
  };

  const renderFader = () => {
    faderHandle.style.transform = `translate3d(0, ${faderPosition.toFixed(3)}px, 0)`;
    const value = Math.round(
      ((FADER_MAX - faderPosition) / (FADER_MAX - FADER_MIN)) * 100,
    );
    faderHandle.setAttribute("aria-valuenow", String(value));
    faderHandle.dataset.value = String(value);
  };

  const updateFader = (deltaMs) => {
    const deltaSeconds = Math.min(deltaMs / 1000, 0.032);
    const stiffness = faderPointerId === null ? 175 : 225;
    const damping = faderPointerId === null ? 23 : 27;

    faderVelocity +=
      (faderTarget - faderPosition) * stiffness * deltaSeconds;
    faderVelocity *= Math.exp(-damping * deltaSeconds);
    faderPosition += faderVelocity * deltaSeconds;

    if (
      Math.abs(faderTarget - faderPosition) < 0.015 &&
      Math.abs(faderVelocity) < 0.015
    ) {
      faderPosition = faderTarget;
      faderVelocity = 0;
    }

    renderFader();
  };

  const setRecordHovered = (hovered) => {
    machine.classList.toggle("is-record-hovered", hovered);
    transitionSpeed(hovered ? 0 : BASE_SPEED, hovered ? 1200 : 1000);
  };

  const clearPixelTrail = () => {
    pixelStamps.length = 0;
    lastTrailPoint = null;
    if (pixelTrailFrame) cancelAnimationFrame(pixelTrailFrame);
    pixelTrailFrame = 0;
    pixelContext.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  };

  const createPixelStamp = (x, y, energy, now) => {
    const cells = [];
    const radius = 2 + Math.round(energy * 0.55);
    const checkerMode = Math.random() < 0.34;

    for (let gridY = -radius; gridY <= radius; gridY += 1) {
      for (let gridX = -radius; gridX <= radius; gridX += 1) {
        const distance = Math.hypot(gridX, gridY) / (radius + 0.35);
        if (distance > 1) continue;

        if (checkerMode) {
          if (Math.random() < distance * 0.14) continue;
        } else if (Math.random() > 0.76 - distance * 0.5) {
          continue;
        }

        const shapeRoll = Math.random();
        let width = 14;
        let height = 14;

        if (!checkerMode && shapeRoll > 0.74) {
          width = shapeRoll > 0.9 ? 42 : 28;
          height = shapeRoll > 0.9 ? 5 : 7;
        } else if (!checkerMode && shapeRoll > 0.62) {
          width = 7;
          height = 24;
        } else if (!checkerMode && shapeRoll < 0.18) {
          width = height = 9;
        }

        cells.push({
          x: gridX * PIXEL_GRID + (PIXEL_GRID - width) / 2,
          y: gridY * PIXEL_GRID + (PIXEL_GRID - height) / 2,
          width,
          height,
          color: checkerMode
            ? (gridX + gridY + radius) % 2 === 0
              ? "255, 255, 255"
              : "0, 0, 0"
            : GLITCH_PALETTE[Math.floor(Math.random() * GLITCH_PALETTE.length)],
          opacity: checkerMode
            ? 0.58 + Math.random() * 0.32
            : 0.42 + Math.random() * 0.46,
          delay: Math.random() * 72 + distance * 34,
        });
      }
    }

    if (!checkerMode && Math.random() < 0.7) {
      const signalColorRoll = Math.random();
      cells.push({
        x: -radius * PIXEL_GRID - 8 - Math.random() * 20,
        y: (Math.floor(Math.random() * (radius * 2 + 1)) - radius) * PIXEL_GRID,
        width: 40 + Math.random() * 36,
        height: Math.random() > 0.5 ? 5 : 7,
        color:
          signalColorRoll > 0.9
            ? "210, 82, 255"
            : signalColorRoll > 0.8
              ? "53, 116, 255"
              : signalColorRoll > 0.42
                ? "255, 255, 255"
                : "0, 0, 0",
        opacity: 0.48 + Math.random() * 0.34,
        delay: Math.random() * 45,
      });
    }

    pixelStamps.push({
      x: Math.round(x / PIXEL_GRID) * PIXEL_GRID,
      y: Math.round(y / PIXEL_GRID) * PIXEL_GRID,
      born: now,
      life: 520 + Math.random() * 220,
      cells,
    });

    if (pixelStamps.length > MAX_PIXEL_STAMPS) pixelStamps.shift();
  };

  const drawPixelTrail = (now) => {
    pixelContext.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    for (let stampIndex = pixelStamps.length - 1; stampIndex >= 0; stampIndex -= 1) {
      const stamp = pixelStamps[stampIndex];
      const stampAge = now - stamp.born;

      if (stampAge > stamp.life + 90) {
        pixelStamps.splice(stampIndex, 1);
        continue;
      }

      for (const cell of stamp.cells) {
        const cellAge = stampAge - cell.delay;
        if (cellAge <= 0) continue;

        const progress = Math.min(cellAge / stamp.life, 1);
        const entrance = Math.min(cellAge / 42, 1);
        const opacity = cell.opacity * entrance * Math.pow(1 - progress, 1.75);
        if (opacity < 0.012) continue;

        pixelContext.fillStyle = `rgba(${cell.color}, ${opacity.toFixed(3)})`;
        pixelContext.fillRect(
          stamp.x + cell.x,
          stamp.y + cell.y,
          cell.width,
          cell.height,
        );
      }
    }

    if (pixelStamps.length) {
      pixelTrailFrame = requestAnimationFrame(drawPixelTrail);
    } else {
      pixelTrailFrame = 0;
    }
  };

  const addPixelTrailPoint = (event) => {
    if (
      pixelMotionPreference.matches ||
      event.pointerType === "touch" ||
      !pixelContext
    ) {
      return;
    }

    const bounds = stage.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (DESIGN_WIDTH / bounds.width);
    const y = (event.clientY - bounds.top) * (DESIGN_HEIGHT / bounds.height);
    if (x < 0 || x > DESIGN_WIDTH || y < 0 || y > DESIGN_HEIGHT) return;

    const now = performance.now();
    if (!lastTrailPoint) {
      createPixelStamp(x, y, 0.55, now);
    } else {
      const distance = Math.hypot(x - lastTrailPoint.x, y - lastTrailPoint.y);
      const elapsed = Math.max(now - lastTrailPoint.time, 8);
      if (distance < 4 && elapsed < 38) return;

      const steps = Math.min(7, Math.max(1, Math.ceil(distance / 24)));
      const energy = clamp(distance / elapsed / 1.25, 0.38, 1);
      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps;
        createPixelStamp(
          lastTrailPoint.x + (x - lastTrailPoint.x) * progress,
          lastTrailPoint.y + (y - lastTrailPoint.y) * progress,
          energy,
          now - (steps - step) * 8,
        );
      }
    }

    lastTrailPoint = { x, y, time: now };
    if (!pixelTrailFrame) pixelTrailFrame = requestAnimationFrame(drawPixelTrail);
  };

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const readRotation = (element) => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return 0;
    const values = transform.match(/^matrix\(([^)]+)\)$/)?.[1]
      .split(",")
      .map(Number);
    if (!values || values.length < 2) return 0;
    return Math.atan2(values[1], values[0]) * (180 / Math.PI);
  };

  const createRotationSpring = (
    element,
    { stiffness = 120, damping = 7.5 } = {},
  ) => {
    let angle = 0;
    let velocity = 0;
    let target = 0;
    let activeDamping = damping;
    let previousTime = 0;
    let animationFrame = 0;

    const stop = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      previousTime = 0;
      element.classList.remove("is-animating");
    };

    const setInstant = (nextAngle) => {
      stop();
      angle = nextAngle;
      target = nextAngle;
      velocity = 0;
      activeDamping = damping;
      element.style.transform = `rotate(${nextAngle}deg)`;
    };

    const tick = (time) => {
      const elapsed = previousTime
        ? Math.min((time - previousTime) / 1000, 0.034)
        : 1 / 60;
      previousTime = time;

      const acceleration = stiffness * (target - angle) - activeDamping * velocity;
      velocity += acceleration * elapsed;
      angle += velocity * elapsed;
      element.style.transform = `rotate(${angle}deg)`;

      const settled =
        Math.abs(target - angle) < 0.015 && Math.abs(velocity) < 0.04;
      if (settled) {
        angle = target;
        velocity = 0;
        element.style.transform = `rotate(${target}deg)`;
        animationFrame = 0;
        previousTime = 0;
        element.classList.remove("is-animating");
        return;
      }

      animationFrame = requestAnimationFrame(tick);
    };

    const setTarget = (nextTarget, reducedTarget = nextTarget, exitDamping = damping) => {
      if (prefersReducedMotion()) {
        setInstant(reducedTarget);
        return;
      }

      target = nextTarget;
      activeDamping = exitDamping;
      element.classList.add("is-animating");
      if (!animationFrame) {
        previousTime = 0;
        animationFrame = requestAnimationFrame(tick);
      }
    };

    const kick = (nextVelocity, nextTarget = 0) => {
      if (prefersReducedMotion()) {
        setInstant(nextTarget);
        return;
      }

      target = nextTarget;
      velocity = nextVelocity;
      activeDamping = damping;
      element.classList.add("is-animating");
      if (!animationFrame) {
        previousTime = 0;
        animationFrame = requestAnimationFrame(tick);
      }
    };

    return {
      getAngle: () => angle,
      kick,
      reset: () => setInstant(0),
      setInstant,
      setTarget,
    };
  };

  const modalWhiteCardSpring = createRotationSpring(modalWhiteCardVisual);
  const modalIdRigSpring = createRotationSpring(modalIdRig, {
    stiffness: 115,
    damping: 8.5,
  });

  const animateModalWhiteCard = (hovered, closing = false) => {
    modalWhiteCardSpring.setTarget(hovered ? -4.7 : 0, hovered ? -2 : 0, closing ? 22 : undefined);
  };

  const animateModalIdRig = (hovered, closing = false) => {
    modalIdRigSpring.setTarget(hovered ? -4.8 : 0, hovered ? -2 : 0, closing ? 22 : undefined);
  };

  const setBackgroundInert = (inert) => {
    machine.inert = inert;
    siteHeader.inert = inert;
    machine.toggleAttribute("inert", inert);
    siteHeader.toggleAttribute("inert", inert);
    window.portfolioWorkCarousel?.setPaused(inert);
    window.portfolioWorkScroll?.setPaused(inert);
  };

  const clearModalTimers = () => {
    window.clearTimeout(modalTimer);
    window.clearTimeout(modalAnimationTimer);
  };

  const sharedCardHomes = new Map();
  const withSharedCardBrightness = (filter, brightness = "1") =>
    `${filter === "none" ? "" : `${filter} `}brightness(${brightness})`;
  const measureSharedCardHome = (source) => {
    const sourceStyle = getComputedStyle(source);
    const machineStyle = getComputedStyle(machine);
    const localMatrix = new DOMMatrix(sourceStyle.transform === "none" ? undefined : sourceStyle.transform);
    const machineMatrix = new DOMMatrix(machineStyle.transform === "none" ? undefined : machineStyle.transform);
    const origin = sourceStyle.transformOrigin.split(" ").map(Number.parseFloat);
    // Source and shared clone have identical base layout and pivot. Compose
    // the machine's live transform around that pivot (not the card center).
    const x = tagsZone.offsetLeft + source.offsetLeft + origin[0];
    const y = tagsZone.offsetTop + source.offsetTop + origin[1];
    const homeMatrix = new DOMMatrix().translate(-x, -y)
      .multiply(machineMatrix).translate(x, y).multiply(localMatrix);
    return { transform: homeMatrix.toString(), filter: sourceStyle.filter };
  };
  const seedSharedCard = (clone, source) => {
    const home = measureSharedCardHome(source);
    sharedCardHomes.set(clone, source);
    clone.style.transition = "none";
    clone.style.transform = home.transform;
    clone.style.filter = withSharedCardBrightness(home.filter);
  };

  const releaseSharedCards = () => {
    [modalWhiteCard, modalBlueCard].forEach((card) => {
      card.style.removeProperty("transition");
      card.style.removeProperty("transform");
      card.style.removeProperty("filter");
    });
  };

  const settleModalAnimation = (nextState) => {
    const delay = prefersReducedMotion() ? 110 : 680;
    modalAnimationTimer = window.setTimeout(() => {
      if (modalState !== nextState) return;
      portfolioModal.classList.remove("is-animating");
      if (nextState === "opening") modalState = "open";
    }, delay);
  };

  const openPortfolioModal = () => {
    if (modalState === "open" || modalState === "opening") return;
    if (window.portfolioWorkScroll && !window.portfolioWorkScroll.canOpenProfile()) return;

    clearModalTimers();
    const activeElement = document.activeElement;
    modalReturnFocus =
      modalReturnFocus ||
      (activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : tagsZone);

    if (modalState === "closed") {
      setBackgroundInert(true);
      modalIdRigSpring.setInstant(0);
      seedSharedCard(modalWhiteCard, tagWhite);
      seedSharedCard(modalBlueCard, tagBlue);
      portfolioModal.hidden = false;
      portfolioModal.classList.add("is-mounted", "is-animating");
      stage.classList.add("is-modal-active");
      void portfolioModal.offsetWidth;
    } else {
      portfolioModal.classList.add("is-animating");
    }

    modalState = "opening";
    portfolioModal.setAttribute("aria-hidden", "false");
    tagsZone.setAttribute("aria-expanded", "true");

    requestAnimationFrame(() => {
      if (modalState !== "opening") return;
      releaseSharedCards();
      portfolioModal.classList.add("is-open");
      portfolioModal.classList.remove("is-closing");
      modalIdRigSpring.kick(120, 0);
      portfolioModal.focus({ preventScroll: true });
      settleModalAnimation("opening");
    });
  };

  const finishPortfolioModalClose = () => {
    if (modalState !== "closing") return;
    // The backdrop remains dark through the card's return. Restore the flat
    // home mask synchronously before removing that backdrop, so no bright
    // frame can appear between the two independent layers.
    stage.classList.remove("is-modal-active");
    window.portfolioHomeSpotlight?.resetToResting?.();
    portfolioModal.hidden = true;
    portfolioModal.classList.remove("is-mounted", "is-animating", "is-closing");
    setBackgroundInert(false);
    portfolioModal.setAttribute("aria-hidden", "true");
    modalWhiteCardSpring.reset();
    modalIdRigSpring.reset();
    releaseSharedCards();
    modalState = "closed";

    const returnTarget = modalReturnFocus;
    modalReturnFocus = null;
    if (returnTarget instanceof HTMLElement && returnTarget.isConnected) {
      returnTarget.focus({ preventScroll: true });
    }
  };

  const closePortfolioModal = () => {
    if (modalState === "closed" || modalState === "closing") return;

    clearModalTimers();
    modalState = "closing";
    portfolioModal.classList.add("is-animating", "is-closing");
    portfolioModal.classList.remove("is-open");
    sharedCardHomes.forEach((source, card) => {
      // Opening can capture a half-expanded hover pose. The return destination
      // must be the hidden source card's current resting pose instead.
      const home = measureSharedCardHome(source);
      card.style.transform = home.transform;
      card.style.filter = withSharedCardBrightness(
        home.filter,
        "var(--modal-return-brightness)",
      );
    });
    animateModalWhiteCard(false, true);
    animateModalIdRig(false, true);
    tagsZone.setAttribute("aria-expanded", "false");

    modalTimer = window.setTimeout(
      finishPortfolioModalClose,
      prefersReducedMotion() ? 120 : 650,
    );
  };

  const cancelPendingProfileNavigation = () => {
    profileNavigationToken += 1;
    cancelAnimationFrame(profileNavigationFrame);
    profileNavigationFrame = 0;
  };

  const openProfileFromHeader = (event) => {
    event.preventDefault();
    if (modalState !== "closed" || stage.classList.contains("is-work-detail-active")) return;
    cancelPendingProfileNavigation();
    const request = profileNavigationToken;
    const workScroll = window.portfolioWorkScroll;
    if (!workScroll || workScroll.canOpenProfile()) {
      openPortfolioModal();
      return;
    }

    // The shared profile card belongs to the home composition. Bring the
    // existing scene back first, then open it only after the scroll settles.
    workScroll.navigate(0);
    const started = performance.now();
    const waitForHome = () => {
      profileNavigationFrame = 0;
      if (request !== profileNavigationToken || modalState !== "closed" ||
          stage.classList.contains("is-work-detail-active") ||
          stage.dataset.workTarget === "1" || performance.now() - started > 2500) return;
      if (workScroll.canOpenProfile()) openPortfolioModal();
      else profileNavigationFrame = requestAnimationFrame(waitForHome);
    };
    profileNavigationFrame = requestAnimationFrame(waitForHome);
  };

  const closeWorkFromRightBlank = (event) => {
    const workScroll = window.portfolioWorkScroll;
    if (!workScroll || event.defaultPrevented || stage.dataset.workTarget !== "1" ||
        workScroll.getProgress() < 0.55 || workScroll.getDetailProgress() > 0 ||
        stage.classList.contains("is-work-detail-active") ||
        stage.classList.contains("is-modal-active")) return;
    // The carousel stays fully interactive. Do not turn a card, control, nav
    // link, fader or hanging tag click into a scene-dismiss gesture.
    if (!event.target?.closest || event.target.closest(
      '.site-header, .work-carousel, .fader-control, .tags-zone, .sticker-zone, ' +
      '.portfolio-modal, .work-detail, a, button, [role="button"], [role="slider"]',
    )) return;
    const bounds = stage.getBoundingClientRect();
    if (!Number.isFinite(bounds.width) || bounds.width <= 0) return;
    const x = (event.clientX - bounds.left) * DESIGN_WIDTH / bounds.width;
    if (!Number.isFinite(x) || x < 930 || x > DESIGN_WIDTH) return;
    workScroll.navigate(0);
  };

  const animate = (now) => {
    const deltaMs = Math.min(now - previousTime, 64);
    previousTime = now;

    if (transition) {
      transition.elapsed = Math.min(
        transition.elapsed + deltaMs,
        transition.duration,
      );
      const progress = transition.elapsed / transition.duration;
      const eased = easeInOutCubic(progress);
      speed = transition.from + (transition.to - transition.from) * eased;

      if (progress >= 1) {
        speed = transition.to;
        transition = null;
      }
    }

    angle = (angle + speed * (deltaMs / 1000)) % 360;
    record.style.transform = `rotate(${angle.toFixed(4)}deg)`;
    projectRecords.forEach((artwork) => { artwork.style.transform = record.style.transform; });
    record.dataset.angle = angle.toFixed(4);
    record.dataset.speed = speed.toFixed(4);
    record.dataset.transitioning = String(Boolean(transition));
    updateFader(deltaMs);
    requestAnimationFrame(animate);
  };

  const beginFaderDrag = (event) => {
    event.preventDefault();
    faderPointerId = event.pointerId;
    faderDragOffset = pointerYInFader(event) - faderPosition;
    faderVelocity *= 0.35;
    faderHandle.classList.add("is-dragging");
    faderHandle.setPointerCapture(event.pointerId);
  };

  const moveFader = (event) => {
    if (event.pointerId !== faderPointerId) return;
    setFaderTarget(pointerYInFader(event) - faderDragOffset);
  };

  const endFaderDrag = (event) => {
    if (event.pointerId !== faderPointerId) return;
    faderPointerId = null;
    faderHandle.classList.remove("is-dragging");
    if (faderHandle.hasPointerCapture(event.pointerId)) {
      faderHandle.releasePointerCapture(event.pointerId);
    }
  };

  faderControl.addEventListener("pointerdown", (event) => {
    if (event.target === faderHandle || faderHandle.contains(event.target)) {
      return;
    }
    event.preventDefault();
    faderHandle.focus({ preventScroll: true });
    faderVelocity *= 0.25;
    setFaderTarget(pointerYInFader(event) - FADER_HANDLE_CENTER);
  });

  faderHandle.addEventListener("pointerdown", beginFaderDrag);
  window.addEventListener("pointermove", moveFader);
  window.addEventListener("pointerup", endFaderDrag);
  window.addEventListener("pointercancel", endFaderDrag);
  faderHandle.addEventListener("lostpointercapture", endFaderDrag);

  faderHandle.addEventListener("keydown", (event) => {
    const steps = {
      ArrowUp: -18,
      ArrowDown: 18,
      PageUp: -56,
      PageDown: 56,
    };

    if (event.key === "Home") {
      event.preventDefault();
      setFaderTarget(FADER_MIN);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setFaderTarget(FADER_MAX);
      return;
    }

    if (steps[event.key] !== undefined) {
      event.preventDefault();
      setFaderTarget(faderTarget + steps[event.key]);
    }
  });

  recordHotspot.addEventListener("pointerenter", () => setRecordHovered(true));
  recordHotspot.addEventListener("pointerleave", () => setRecordHovered(false));
  stage.addEventListener("pointermove", addPixelTrailPoint, { passive: true });
  stage.addEventListener("pointerleave", () => {
    lastTrailPoint = null;
  });
  pixelMotionPreference.addEventListener("change", clearPixelTrail);
  tagsZone.addEventListener("click", openPortfolioModal);
  [aboutLink, contactLink].forEach((link) => {
    link?.addEventListener("click", openProfileFromHeader);
  });
  workLink?.addEventListener("click", cancelPendingProfileNavigation);
  homeLink?.addEventListener("click", cancelPendingProfileNavigation);
  stage.addEventListener("click", closeWorkFromRightBlank);
  tagsZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openPortfolioModal();
  });
  portfolioModalBackdrop.addEventListener("click", closePortfolioModal);
  const bindModalHoverMotion = (hotspot, animateTarget) => {
    const enter = () => {
      if (modalState === "open") {
        animateTarget(true);
      }
    };
    const leave = () => animateTarget(false);
    hotspot.addEventListener("pointerenter", enter);
    hotspot.addEventListener("pointerleave", leave);
    hotspot.addEventListener("mouseenter", enter);
    hotspot.addEventListener("mouseleave", leave);
  };
  bindModalHoverMotion(modalWhiteCardHotspot, animateModalWhiteCard);
  bindModalHoverMotion(modalIdRigHotspot, animateModalIdRig);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && profileNavigationFrame) {
      cancelPendingProfileNavigation();
    }
    if (event.key === "Escape" && modalState !== "closed") {
      event.preventDefault();
      closePortfolioModal();
    }
  });
  window.addEventListener("resize", resizeStage, { passive: true });
  document.addEventListener("visibilitychange", () => {
    previousTime = performance.now();
    if (document.hidden) clearPixelTrail();
  });

  window.__portfolioDebug = {
    getRecordState: () => ({ angle, speed, transitioning: Boolean(transition) }),
    setRecordHovered,
    getScale: () => Number.parseFloat(
      getComputedStyle(root).getPropertyValue("--stage-scale"),
    ),
    openPortfolioModal,
    closePortfolioModal,
    getModalState: () => modalState,
    getModalWhiteCardRotation: () => readRotation(modalWhiteCardVisual),
    getModalIdRigRotation: () => readRotation(modalIdRig),
    getPixelTrailState: () => ({
      stamps: pixelStamps.length,
      running: Boolean(pixelTrailFrame),
    }),
  };

  resizeStage();
  renderFader();
  requestAnimationFrame(animate);
})();
