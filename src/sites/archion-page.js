(() => {
  "use strict";

  let attachedViewer = null;
  let lastState = "";

  function getViewer() {
    const container = document.querySelector(".zoom-container");
    if (!container || !window.jQuery) return null;

    const viewer = window.jQuery(container);
    if (!viewer.data("tilezoom.settings")) return null;
    return { container, viewer };
  }

  function getScale(settings, holderInner) {
    const imageWidth = Number(settings.width);
    const displayedWidth = holderInner.offsetWidth;

    if (imageWidth > 0 && displayedWidth > 0) {
      return displayedWidth / imageWidth;
    }

    const nativeLevels = Number(settings.nativeLevels);
    const level = Number(settings.level);
    const levelScale = Math.pow(0.5, nativeLevels - 1 - level);

    return Number.isFinite(levelScale) && levelScale > 0 ? levelScale : 1;
  }

  function getTransformOrigin(element) {
    const origin = getComputedStyle(element).transformOrigin.split(" ");
    const width = element.getBoundingClientRect().width;
    const height = element.getBoundingClientRect().height;

    return origin.slice(0, 2).map((value, index) => {
      if (value.endsWith("%")) {
        const percentage = parseFloat(value);
        if (Number.isFinite(percentage)) {
          return percentage / 100 * (index === 0 ? width : height);
        }
      }
      const pixels = parseFloat(value);
      return Number.isFinite(pixels) ? pixels : (index === 0 ? width / 2 : height / 2);
    });
  }

  function getContext() {
    const viewer = getViewer();
    if (!viewer) return null;

    const settings = viewer.viewer.data("tilezoom.settings");
    const holder = settings.holder[0];
    const holderInner = settings.holderInner[0];
    const transform = getComputedStyle(holderInner).transform;
    let matrix = new DOMMatrix(transform === "none" ? undefined : transform);
    const matrixValues = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
    if (!matrixValues.every(Number.isFinite)) {
      matrix = new DOMMatrix();
    }
    const origin = getTransformOrigin(holderInner);
    const scale = getScale(settings, holderInner);
    const holderStyle = getComputedStyle(holder);
    const holderInnerStyle = getComputedStyle(holderInner);
    const baseX = (parseFloat(holderStyle.left) || 0) + (parseFloat(holderInnerStyle.left) || 0);
    const baseY = (parseFloat(holderStyle.top) || 0) + (parseFloat(holderInnerStyle.top) || 0);

    return { ...viewer, settings, matrix, origin, scale, baseX, baseY };
  }

  function rotatePoint(point, context, inverse = false) {
    const local = new DOMPoint(point.x - context.origin[0], point.y - context.origin[1]);
    const matrix = inverse ? context.matrix.inverse() : context.matrix;
    const rotated = matrix.transformPoint(local);
    return {
      x: rotated.x + context.origin[0],
      y: rotated.y + context.origin[1]
    };
  }

  function project(points) {
    const context = getContext();
    if (!context) return [];

    return points.map(point => {
      const rotated = rotatePoint({ x: point.x * context.scale, y: point.y * context.scale }, context);
      return {
        x: context.baseX + rotated.x,
        y: context.baseY + rotated.y
      };
    });
  }

  function unproject(points) {
    const context = getContext();
    if (!context) return [];

    return points.map(point => {
      const local = rotatePoint({
        x: point.x - context.baseX,
        y: point.y - context.baseY
      }, context, true);
      return { x: local.x / context.scale, y: local.y / context.scale };
    });
  }

  function sendProjectionResult(type, requestId, points) {
    window.postMessage({ type: `${type}_RESULT`, requestId, points }, "*");
  }

  function getCurrentViewport(context) {
    const scale = context.scale;
    const holderStyle = getComputedStyle(context.settings.holder[0]);
    let x = -Math.floor(parseFloat(holderStyle.left) / scale);
    let y = -Math.floor(parseFloat(holderStyle.top) / scale);
    const width = Math.ceil(context.container.clientWidth / scale);
    const height = Math.ceil(context.container.clientHeight / scale);

    return { x, y, w: width, h: height };
  }

  function sendState() {
    const context = getContext();
    if (!context) return;

    const viewport = getCurrentViewport(context);
    const degree = context.settings.degree;
    const page = Number(document.querySelector(".page-select option:checked")?.textContent?.trim()) || 1;
    const state = JSON.stringify({ viewport, degree, page });
    if (state === lastState) return;

    lastState = state;

    window.postMessage({ type: "ARCHION_VIEW_CHANGED", viewport, page }, "*");
  }

  function eventListener() {
    requestAnimationFrame(sendState);
  }

  function attach(viewer) {
    if (viewer.container === attachedViewer) return;
    attachedViewer = viewer.container;

    ["mousedown", "mouseup", "wheel", "touchstart", "touchend"].forEach(type => {
      viewer.container.removeEventListener(type, eventListener, { passive: true });
      viewer.container.addEventListener(type, eventListener, { passive: true });
    });
    new MutationObserver(() => requestAnimationFrame(sendState)).observe(viewer.container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });
    sendState();
  }

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    if (event.data?.type === "ARCHION_PROJECT_IMAGE_POINTS") {
      sendProjectionResult(event.data.type, event.data.requestId, project(event.data.points));
    }
    if (event.data?.type === "ARCHION_UNPROJECT_SCREEN_POINTS") {
      sendProjectionResult(event.data.type, event.data.requestId, unproject(event.data.points));
    }
  });

  setInterval(() => {
    const viewer = getViewer();
    if (viewer) attach(viewer);
    sendState();
  }, 250);

  const requestedPage = Number(new URL(window.location.href).searchParams.get("page"));
  if (requestedPage > 0) {
    const pageTimer = setInterval(() => {
      const select = document.querySelector(".page-select");
      if (!select || !select.options[requestedPage - 1]) return;
      select.value = String(requestedPage - 1);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      clearInterval(pageTimer);
    }, 250);
  }
})();