(() => {
  "use strict";

  // Original Figma layers, not cropped bitmap bands. Sibling wrappers keep
  // each path, mask and image in its original paint order and coordinates.
  const CARDS = [
    { name: "intro-stack", top: 1021, bottom: 4273, parts: [
      ["Rectangle 1"],
      ["Rectangle 3", "Live Dot", "LIVE Text"],
      ["Rectangle 2"],
    ] },
    // This complete content group includes a logo already visible on the
    // cover. Keep it still on open without suppressing the paper entrances.
    { name: "intro-content", top: 721, bottom: 2163, parts: [["Group 2147241249"]] },
    { name: "pain-points", top: 2254, bottom: 3361, parts: [["Group 2147241248"]] },
    { name: "strategy", top: 3468, bottom: 4233, parts: [["Group 2147241250"]] },
    { name: "solution-cover", top: 4284, bottom: 5436, parts: [["Group 2147241251"]] },
    { name: "solution-stack", top: 5208, bottom: 12854, companionClips: {
      "Rectangle 279335026": "bgblur_1_1029_11591_clip_path",
      "Rectangle 2131354573": "bgblur_2_1029_11591_clip_path",
    }, parts: [
      ["Rectangle 279335026"],
      ["Rectangle 2131354573", "image 1636406181", "image 1636406180", "Group 2147241330"],
    ] },
    { name: "task-panel", top: 6213, bottom: 6787, parts: [["Group 2147241331"]] },
    { name: "task-flow", top: 6873, bottom: 7583, parts: [["Group 2147241332"]] },
    { name: "task-summary", top: 7560, bottom: 7867, parts: [["Group 2147241333"]] },
    { name: "entry-card", top: 7859, bottom: 8883, parts: [[
      "Rectangle 346241232", "Frame 2147224562_5", "Rectangle 346241231_7", "Frame-5",
      "Frame 1312324379", "Frame 1312324381", "Frame 2147241168", "Frame 2147241167",
      "Group 2147241140", "Frame 2147241175_2", "Frame 2147241176_5", "Title_34",
      "Body_6", "Body_7", "Body_8", "Body_9", "Body_10", "Body_11", "Mask group_16",
      "Group 2147241127_2", "Vector 574_2", "Group 2147241170", "Vector 392349023",
      "Vector 392349024", "Vector 392349025", "Group 2147241174", "Group 2147241175",
      "Group 2147241176",
    ]] },
    { name: "feedback-card", top: 8839, bottom: 10046, parts: [["Group 2147241334"]] },
    { name: "efficiency-card", top: 9911, bottom: 10938, parts: [["Group 2147241335"]] },
    { name: "emotion-stack", top: 10986, bottom: 12854, parts: [
      ["Rectangle 2131354590_3"],
      ["Rectangle 346241233_6"],
      ["Rectangle 2131354589_2", "Group 2147241338", "Title_48", "Group 2147241337", "Group 2147241336"],
    ] },
    { name: "result-card", top: 12146, bottom: 12740, parts: [["Group 2147241339"]] },
  ];
  const NS = "http://www.w3.org/2000/svg";
  const XLINK = "http://www.w3.org/1999/xlink";
  const REVEAL_DISTANCE = 96;
  const REVEAL_DURATION = 1.4;
  const REVEAL_STAGGER = 0.18;
  const offlineBundleLoads = new Map();

  // The first three local-file artworks load their exact SVG string only on
  // demand. Share script loads across opens without blocking the homepage.
  const loadOfflineBundle = (url) => {
    let loading = offlineBundleLoads.get(url);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.addEventListener("load", () => {
          script.remove();
          resolve();
        }, { once: true });
        script.addEventListener("error", () => {
          script.remove();
          reject(new Error("Offline layered artwork unavailable"));
        }, { once: true });
        document.head.append(script);
      });
      offlineBundleLoads.set(url, loading);
      loading.catch(() => {
        if (offlineBundleLoads.get(url) === loading) offlineBundleLoads.delete(url);
      });
    }
    return loading;
  };

  const revealCardsFor = (image, height) => {
    if (!image.dataset.revealCards) return CARDS;
    try {
      const definitions = JSON.parse(image.dataset.revealCards);
      const names = new Set();
      const layers = new Set();
      if (!Array.isArray(definitions) || !definitions.every((card) => {
        if (!card || typeof card.name !== "string" || !card.name.trim() ||
            names.has(card.name) || !Number.isFinite(card.top) ||
            !Number.isFinite(card.bottom) || card.top < 0 ||
            card.bottom <= card.top || card.bottom > height ||
            !Array.isArray(card.parts) || !card.parts.length) return false;
        names.add(card.name);
        return card.parts.every((part) => Array.isArray(part) && part.length > 0 &&
          part.every((id) => {
            if (typeof id !== "string" || !id.trim() || layers.has(id)) return false;
            layers.add(id);
            return true;
          }));
      })) return CARDS;
      return definitions;
    } catch {
      return CARDS;
    }
  };

  window.createPortfolioDetailMotion = ({ content, panel, gsap, motionQuery }) => {
    if (!gsap || motionQuery.matches) return () => {};
    const events = new AbortController();
    const artworks = [];
    const cards = [];
    let frame = 0;
    let disposed = false;

    // The exported PNG is the exact, reliable resting surface. Only show the
    // editable SVG while a complete Figma card is about to enter or is moving;
    // a browser paint failure in a very tall SVG must not persist after motion.
    const syncArtworkVisibility = (artwork) => {
      const top = panel.scrollTop;
      const bottom = top + panel.clientHeight;
      const active = cards.some((card) => {
        if (card.artwork !== artwork) return false;
        if (card.state === "revealing") return true;
        if (card.state !== "armed") return false;
        const offset = artwork.offsetTop + content.parentElement.offsetTop;
        return offset + card.top <= bottom + 64 &&
          offset + card.bottom > top;
      });
      artwork.classList.toggle("is-reveal-active", active);
    };

    const reset = (card) => {
      card.tween?.kill();
      card.tween = null;
      card.state = "armed";
      card.parts.forEach((targets) => gsap.set(targets, { y: REVEAL_DISTANCE }));
      card.wrappers.forEach((node) => { node.dataset.revealState = "armed"; });
    };
    const settle = (card) => {
      card.tween?.kill();
      card.tween = null;
      card.state = "shown";
      card.wrappers.forEach((node) => { node.dataset.revealState = "shown"; });
      syncArtworkVisibility(card.artwork);
      gsap.set(card.wrappers, { clearProps: "transform,opacity,willChange" });
    };
    const reveal = (card) => {
      card.state = "revealing";
      card.plays += 1;
      card.wrappers.forEach((node) => {
        node.dataset.revealState = "revealing";
        node.dataset.revealPlays = String(card.plays);
      });
      card.tween = gsap.timeline({
        defaults: { duration: REVEAL_DURATION, ease: "sine.inOut", overwrite: "auto" },
        onComplete: () => settle(card),
      });
      card.parts.forEach((targets, index) => {
        card.tween.to(targets, { y: 0 }, index * REVEAL_STAGGER);
      });
    };
    const update = () => {
      frame = 0;
      if (disposed) return;
      const top = panel.scrollTop;
      const bottom = top + panel.clientHeight;
      cards.forEach((card) => {
        const offset = card.artwork.offsetTop + content.parentElement.offsetTop;
        const start = offset + card.top;
        const end = offset + card.bottom;
        // Wait for one fifth of the viewport to show the original card in
        // either scroll direction, rather than playing beyond a screen edge.
        const entryDepth = Math.min(panel.clientHeight * 0.2, end - start);
        const visibleHeight = Math.min(end, bottom) - Math.max(start, top);
        // Include the armed downward offset when leaving through the top.
        // Resetting too soon would put a moved card's tail back on screen.
        // A long black card stays shown while any lower body is still visible.
        if (start > bottom + 64 || end + REVEAL_DISTANCE < top - 64) {
          if (card.state !== "armed") reset(card);
        } else if (card.state === "armed" && visibleHeight >= entryDepth) {
          reveal(card);
        }
      });
      artworks.forEach(({ artwork }) => syncArtworkVisibility(artwork));
    };
    const schedule = () => {
      if (!disposed && !document.hidden && !frame) frame = requestAnimationFrame(update);
    };

    const enhance = async (image) => {
      let artworkRecord = null;
      const artworkCards = [];
      try {
        const sourceURL = new URL(image.dataset.layeredArtwork || ".", document.baseURI);
        const sourceKey = image.dataset.layeredArtworkKey;
        let bundledSource = window.portfolioLayeredArtworkSources?.[sourceKey];
        if (sourceURL.protocol === "file:" && image.dataset.layeredArtworkBundle &&
            !(typeof bundledSource === "string" && bundledSource.trim())) {
          const bundleURL = new URL(image.dataset.layeredArtworkBundle, document.baseURI).href;
          await loadOfflineBundle(bundleURL);
          if (disposed || !image.isConnected || !content.contains(image)) return;
          bundledSource = window.portfolioLayeredArtworkSources?.[sourceKey];
          if (!(typeof bundledSource === "string" && bundledSource.trim())) {
            offlineBundleLoads.delete(bundleURL);
            throw new Error("Offline layered artwork did not register its source");
          }
        }
        let sourceText;
        // A local script can provide the same original SVG without requiring
        // file:// fetch support. HTTP and missing bundles keep the existing
        // fetch path and the unchanged PNG remains the fallback throughout.
        if (typeof bundledSource === "string" && bundledSource.trim()) sourceText = bundledSource;
        else {
          const response = await fetch(sourceURL, { signal: events.signal });
          if (!response.ok) throw new Error("Layered artwork unavailable");
          sourceText = await response.text();
        }
        if (disposed || !image.isConnected || !content.contains(image)) return;
        const source = new DOMParser().parseFromString(sourceText, "image/svg+xml");
        const svg = document.importNode(source.documentElement, true);
        // Pixel-capped PNG exports can differ from Figma's logical canvas.
        // Validate against the design dimensions when supplied, allowing only
        // the small decimal rounding introduced by the SVG export itself.
        const width = Number(image.dataset.designWidth ?? image.getAttribute("width"));
        const height = Number(image.dataset.designHeight ?? image.getAttribute("height"));
        const svgWidth = Number(svg.getAttribute("width"));
        const svgHeight = Number(svg.getAttribute("height"));
        if (svg.namespaceURI !== NS || !Number.isFinite(width) || width <= 0 ||
            !Number.isFinite(height) || height <= 0 ||
            !Number.isFinite(svgWidth) || svgWidth <= 0 ||
            !Number.isFinite(svgHeight) || svgHeight <= 0 ||
            Math.abs(svgWidth - width) > 0.5 || Math.abs(svgHeight - height) > 0.5) return;
        const verticalScale = height / svgHeight;
        const nodes = new Map(Array.from(svg.querySelectorAll("[id]"), (node) => [node.id, node]));
        // Resolve the entire configuration before changing the displayed DOM.
        // Each work uses its own exported layers; missing layers must not leave
        // a half-built animation or remove another artwork's enhancement.
        const definitions = revealCardsFor(image, svgHeight).map((definition) => ({
          definition,
          layers: definition.parts.map((ids) => ids.map((id) => {
            const node = nodes.get(id);
            if (!node) throw new Error(`Missing original Figma layer: ${id}`);
            const companionClip = definition.companionClips?.[id];
            const members = [node];
            if (companionClip !== undefined) {
              // Figma emits backdrop blur as an unlabelled adjacent sibling,
              // not a child of the paper path. Move the whole painted pair.
              const companion = node.previousElementSibling;
              const blurContent = companion?.firstElementChild;
              const style = blurContent?.getAttribute("style") || "";
              const actualClip = style.match(/(?:^|;)\s*clip-path\s*:\s*url\(\s*["']?#([^\s"')]+)["']?\s*\)/)?.[1];
              if (typeof companionClip !== "string" || !companionClip.trim() ||
                  companion?.localName !== "foreignObject" ||
                  blurContent?.localName !== "div" || actualClip !== companionClip ||
                  nodes.get(companionClip)?.localName !== "clipPath") {
                throw new Error(`Missing original Figma blur companion: ${id}`);
              }
              members.unshift(companion);
            }
            return { id, node, members, companionClip };
          })),
        }));
        const selectedNodes = definitions.flatMap(({ layers }) =>
          layers.flat().flatMap(({ members }) => members));
        if (new Set(selectedNodes).size !== selectedNodes.length) {
          throw new Error("An original Figma layer cannot belong to two animation wrappers");
        }
        if (image.dataset.rejectLayeredAncestry === "true") {
          for (let index = 0; index < selectedNodes.length; index += 1) {
            for (let other = index + 1; other < selectedNodes.length; other += 1) {
              if (selectedNodes[index].contains(selectedNodes[other]) ||
                  selectedNodes[other].contains(selectedNodes[index])) {
                throw new Error("A Figma group and its child cannot both be animated");
              }
            }
          }
        }
        if (sourceKey === "douyin") {
          // This export contains six HTML backdrop filters inside the giant
          // SVG. Two sit below identical opaque paper paths; the four smaller
          // ones add only local blur. They can make Chromium lose ordinary SVG
          // paint during a moving frame. Keep the Figma source and static PNG
          // unchanged, and omit only these live blur surfaces while animating.
          const expectedClips = new Set([1, 2, 4, 10, 11, 12]
            .map((number) => `bgblur_${number}_1029_11591_clip_path`));
          const blurs = Array.from(svg.querySelectorAll("foreignObject"));
          const foundClips = new Set();
          if (blurs.length !== expectedClips.size || !blurs.every((node) => {
            const style = node.firstElementChild?.getAttribute("style") || "";
            const clip = style.match(/clip-path\s*:\s*url\(#([^\s)]+)\)/)?.[1];
            if (!/backdrop-filter\s*:\s*blur\(/.test(style) ||
                !expectedClips.has(clip) || foundClips.has(clip) ||
                nodes.get(clip)?.localName !== "clipPath") return false;
            foundClips.add(clip);
            return true;
          })) {
            throw new Error("Unexpected Douyin backdrop layer structure");
          }
          blurs.forEach((node) => node.remove());
          definitions.forEach(({ layers }) => layers.flat().forEach((layer) => {
            layer.members = layer.members.filter((node) => node.localName !== "foreignObject");
          }));
        }
        // Resources resolve against the export, not the HTML page.
        await Promise.all(Array.from(svg.querySelectorAll("image"), async (node) => {
          const href = node.getAttribute("href") || node.getAttributeNS(XLINK, "href");
          if (!href) return;
          const url = new URL(href, sourceURL).href;
          node.setAttributeNS(XLINK, "href", url);
          node.setAttribute("href", url);
          const preload = new Image();
          preload.src = url;
          await preload.decode();
        }));
        if (disposed || !image.isConnected || !content.contains(image)) return;
        const artwork = document.createElement("div");
        artwork.className = "work-detail__artwork";
        artwork.style.height = `${height}px`;
        image.before(artwork);
        artwork.append(image);
        svg.classList.add("work-detail__layered-artwork");
        svg.setAttribute("aria-hidden", "true");
        artwork.append(svg);
        artworkRecord = { artwork, image };
        artworks.push(artworkRecord);
        definitions.forEach(({ definition, layers }) => {
          const parts = layers.map((part) => part.map(({ id, members, companionClip }) => {
            const wrapper = document.createElementNS(NS, "g");
            wrapper.dataset.revealCard = definition.name;
            wrapper.dataset.figmaLayer = id;
            if (companionClip) wrapper.dataset.figmaCompanionClip = companionClip;
            // Insert at the first member so blur → paper paint order and all
            // original styles/masks survive both the animation and y=0 state.
            members[0].before(wrapper);
            wrapper.append(...members);
            return wrapper;
          }));
          const card = {
            ...definition,
            top: definition.top * verticalScale,
            bottom: definition.bottom * verticalScale,
            artwork, parts, wrappers: parts.flat(), state: "shown", plays: 0, tween: null,
          };
          cards.push(card);
          artworkCards.push(card);
          // Preserve the current reading position on open and async loading.
          const start = artwork.offsetTop + content.parentElement.offsetTop + card.top;
          if (start >= panel.scrollTop + panel.clientHeight) reset(card);
          else settle(card);
        });
        // Switch only after the whole original artwork and all images are ready.
        artwork.classList.add("is-reveal-ready");
        syncArtworkVisibility(artwork);
      } catch (error) {
        artworkCards.forEach((card) => {
          card.tween?.kill();
          const index = cards.indexOf(card);
          if (index !== -1) cards.splice(index, 1);
        });
        if (artworkRecord) {
          artworkRecord.artwork.replaceWith(image);
          const index = artworks.indexOf(artworkRecord);
          if (index !== -1) artworks.splice(index, 1);
        }
        if (error.name !== "AbortError" && !disposed) {
          console.warn("Keeping the original portfolio artwork:", error.message);
        }
      }
    };

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      events.abort();
      cards.forEach((card) => card.tween?.kill());
      artworks.forEach(({ artwork, image }) => artwork.replaceWith(image));
      cards.length = 0;
      artworks.length = 0;
    };
    content.querySelectorAll("img[data-layered-artwork], img[data-layered-artwork-key]").forEach(enhance);
    panel.addEventListener("scroll", schedule, { passive: true, signal: events.signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        cards.forEach((card) => {
          if (card.state === "revealing") settle(card);
        });
      } else schedule();
    }, { signal: events.signal });
    motionQuery.addEventListener("change", () => {
      if (motionQuery.matches) dispose();
    }, { signal: events.signal });
    return dispose;
  };
})();
