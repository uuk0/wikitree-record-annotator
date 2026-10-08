(() => {
  "use strict";

  const site = "dfg-viewer";
  let currentViewerContainer = null;

  function getViewerContainer() {
    return document.querySelector("#tx-dfgviewer-map-0 .ol-viewport");
  }

  function injectPageScript() {
    if (document.getElementById("wta-dfg-viewer-page-script")) return;

    const script = document.createElement("script");
    script.id = "wta-dfg-viewer-page-script";
    script.src = chrome.runtime.getURL("src/sites/dfg-viewer-page.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  function waitForViewerReady() {
    const container = getViewerContainer();
    if (container?.querySelector("canvas")) {
      currentViewerContainer = container;
      injectPageScript();
      initOverlay();
      return;
    }

    setTimeout(waitForViewerReady, 200);
  }

  function getPageKey(href) {
    try {
      const url = new URL(href);
      const book = url.searchParams.get("tx_dlf[id]");
      const page = Number(url.searchParams.get("tx_dlf[page]"));
      if (!book) return null;

      return {
        site,
        book,
        page: Number.isFinite(page) && page > 0 ? String(page) : "1"
      };
    } catch (error) {
      return null;
    }
  }

  function getCurrentPageKey() {
    return getPageKey(window.location.href);
  }

  async function getReferenceFromPage() {
    const title = document.querySelector(
      ".tx-dlf-metadata-titledata dd.tx-dlf-title, .metadata-title h2"
    )?.textContent?.trim();
    return title || document.title.trim() || null;
  }

  function getCleanPageUrl() {
    const key = getCurrentPageKey();
    if (!key) return window.location.href;
    return buildUrlFromBookPage(key.book, key.page);
  }

  function buildUrlFromBookPage(book, page) {
    const url = new URL("https://dfg-viewer.de/show");
    url.searchParams.set("tx_dlf[id]", book);
    url.searchParams.set("tx_dlf[page]", page);
    url.searchParams.set("tx_dlf[double]", "0");
    return url.toString();
  }

  function requestPageProjection(type, points) {
    const requestId = crypto.randomUUID();

    return new Promise(resolve => {
      function onMessage(event) {
        if (event.source !== window || event.data?.type !== `${type}_RESULT`) return;
        if (event.data.requestId !== requestId) return;
        window.removeEventListener("message", onMessage);
        resolve(event.data.points || []);
      }

      window.addEventListener("message", onMessage);
      window.postMessage({ type, requestId, points }, "*");
    });
  }

  function projectImagePoints(imagePoints) {
    return requestPageProjection("DFG_PROJECT_IMAGE_POINTS", imagePoints);
  }

  function unprojectScreenPoints(screenPoints) {
    return requestPageProjection("DFG_UNPROJECT_SCREEN_POINTS", screenPoints);
  }

  function initializeViewportTracking() {
    window.addEventListener("message", event => {
      if (event.source !== window) return;
      if (event.data?.type !== "DFG_VIEW_CHANGED") return;

      const container = getViewerContainer();
      if (container && container !== currentViewerContainer) {
        currentViewerContainer = container;
        const host = container.parentElement;
        host.appendChild(overlay.getAnnotationLayerElement());
        host.appendChild(overlay.getOverlayElement());
      }

      overlay.renderAnnotations();
    });
  }

  const provider = {
    site,
    waitForViewerReady,
    getViewerContainer,
    getPageKey,
    getCurrentPageKey,
    getReferenceFromPage,
    getCleanPageUrl,
    buildUrlFromBookPage,
    projectImagePoints,
    unprojectScreenPoints,
    initializeViewportTracking,
    getToolbarPosition: () => ({ top: "7px", left: "50%" })
  };

  window.archiveProviders ??= [];
  window.archiveProviders.push(provider);
})();