(() => {
  "use strict";

  let attachedMap = null;
  let lastState = "";

  function getMap() {
    return window.tx_dlf_viewer?.map || null;
  }

  function getImageExtent(map) {
    const layers = map.getLayers?.().getArray?.() || [];
    for (const layer of layers) {
      const source = layer.getSource?.();
      const extent = source?.getImageExtent?.() || source?.getTileGrid?.()?.getExtent?.();
      if (extent?.length === 4) return extent;
    }
    return null;
  }

  function imageToCoordinate(point, extent) {
    return [extent ? extent[0] + point.x : point.x, extent ? extent[3] - point.y : -point.y];
  }

  function coordinateToImage(coordinate, extent) {
    return {
      x: coordinate[0] - (extent?.[0] || 0),
      y: (extent?.[3] || 0) - coordinate[1]
    };
  }

  function project(points) {
    const map = getMap();
    if (!map) return [];
    const extent = getImageExtent(map);
    return points.map(point => {
      const pixel = map.getPixelFromCoordinate(imageToCoordinate(point, extent));
      return { x: pixel[0], y: pixel[1] };
    });
  }

  function unproject(points) {
    const map = getMap();
    if (!map) return [];
    const extent = getImageExtent(map);
    return points.map(point => coordinateToImage(map.getCoordinateFromPixel([point.x, point.y]), extent));
  }

  function sendProjectionResult(type, requestId, points) {
    window.postMessage({ type: `${type}_RESULT`, requestId, points }, "*");
  }

  function sendState() {
    const map = getMap();
    if (!map) return;

    const view = map.getView?.();
    const state = JSON.stringify({
      center: view?.getCenter?.(),
      resolution: view?.getResolution?.(),
      rotation: view?.getRotation?.(),
      page: new URL(window.location.href).searchParams.get("tx_dlf[page]") || "1"
    });
    if (state === lastState) return;
    lastState = state;
    window.postMessage({ type: "DFG_VIEW_CHANGED" }, "*");
  }

  function attachMap(map) {
    if (map === attachedMap) return;
    attachedMap = map;
    map.on?.("moveend", sendState);
    map.on?.("change:size", sendState);
    sendState();
  }

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    if (event.data?.type === "DFG_PROJECT_IMAGE_POINTS") {
      sendProjectionResult(event.data.type, event.data.requestId, project(event.data.points));
    }
    if (event.data?.type === "DFG_UNPROJECT_SCREEN_POINTS") {
      sendProjectionResult(event.data.type, event.data.requestId, unproject(event.data.points));
    }
  });

  setInterval(() => {
    const map = getMap();
    if (map) attachMap(map);
  }, 250);
})();