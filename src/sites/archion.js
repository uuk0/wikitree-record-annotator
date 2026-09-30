(() => {
  "use strict";

  const site = "archion";
  let currentPage = null;
  let currentViewerContainer = null;

  function injectPageScript() {
    if (document.getElementById("wta-archion-page-script")) return;

    const script = document.createElement("script");
    script.id = "wta-archion-page-script";
    script.src = chrome.runtime.getURL("src/sites/archion-page.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  function getViewerContainer() {
    return document.querySelector(".zoom-container");
  }

  function alignOverlayLayers(container) {
    const host = container.parentElement;
    const hostRect = host.getBoundingClientRect();
    const viewerRect = container.getBoundingClientRect();
    const layerStyles = {
      position: "absolute",
      left: `${viewerRect.left - hostRect.left}px`,
      top: `${viewerRect.top - hostRect.top}px`,
      right: "auto",
      bottom: "auto",
      width: `${viewerRect.width}px`,
      height: `${viewerRect.height}px`
    };

    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }

    Object.assign(overlay.getAnnotationLayerElement().style, layerStyles);
    Object.assign(overlay.getOverlayElement().style, layerStyles);
  }

  function waitForViewerReady() {
    const container = getViewerContainer();
    if (container?.querySelector(".zoom-tiles")) {
      currentViewerContainer = container;
      injectPageScript();
      initOverlay();
      alignOverlayLayers(container);
      return;
    }

    setTimeout(waitForViewerReady, 200);
  }

  function getCurrentPageNumber() {
    const selected = document.querySelector(".page-select option:checked");
    const page = Number(selected?.textContent?.trim());
    return Number.isFinite(page) && page > 0 ? page : 1;
  }

  function getPageKey(href) {
    try {
      const url = new URL(href);
      const pathMatch = url.pathname.match(/\/viewer\/churchRegister\/(\d+)/i);
      const book = url.searchParams.get("uid") || pathMatch?.[1];
      if (!book) return null;

      const page = Number(url.searchParams.get("page"));
      return { site, book, page: Number.isFinite(page) && page > 0 ? String(page) : "1" };
    } catch (error) {
      return null;
    }
  }

  function getCurrentPageKey() {
    const key = getPageKey(window.location.href);
    if (!key) return null;

    return {
      ...key,
      page: String(currentPage || getCurrentPageNumber())
    };
  }

  async function getReferenceFromPage() {
    const title = document.querySelector("title")?.textContent?.trim();
    return title || null;
  }

  function getCleanPageUrl() {
    const key = getCurrentPageKey();
    if (!key) return window.location.href;
    return buildUrlFromBookPage(key.book, key.page);
  }

  async function projectImagePoints(imagePoints) {
    return requestPageProjection("ARCHION_PROJECT_IMAGE_POINTS", imagePoints);
  }

  async function unprojectScreenPoints(screenPoints) {
    return requestPageProjection("ARCHION_UNPROJECT_SCREEN_POINTS", screenPoints);
  }

  function requestPageProjection(type, points) {
    const requestId = crypto.randomUUID();

    return new Promise(resolve => {
      function onMessage(event) {
        if (event.source !== window || event.data?.type !== `${type}_RESULT`) return;
        if (event.data.requestId !== requestId) return;
        window.removeEventListener("message", onMessage);
        resolve(event.data.points);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ type, requestId, points }, "*");
    });
  }

  function initializeViewportTracking() {
    window.addEventListener("message", event => {
      if (event.source !== window || event.data?.type !== "ARCHION_VIEW_CHANGED") return;

      currentPage = event.data.page;
      const container = getViewerContainer();
      if (container && container !== currentViewerContainer) {
        currentViewerContainer = container;
        const host = container.parentElement;
        host.appendChild(overlay.getAnnotationLayerElement());
        host.appendChild(overlay.getOverlayElement());
      }

      if (container) alignOverlayLayers(container);

      overlay.renderAnnotations();
    });
  }

  function buildUrlFromBookPage(book, page) {
    const url = new URL("https://www.archion.de/de/viewer");
    url.searchParams.set("uid", book);
    url.searchParams.set("page", page);
    return url.toString();
  }

  const _provider = {
    waitForViewerReady,
    getViewerContainer,
    getReferenceFromPage,
    getCleanPageUrl,
    initializeViewportTracking,
    site,
    getPageKey,
    getCurrentPageKey,
    buildUrlFromBookPage,
    projectImagePoints,
    unprojectScreenPoints,
    getToolbarPosition: () => ({ top: "7px", left: "50%" })
  };

  window.archiveProviders ??= [];
  window.archiveProviders.push(_provider);
})();