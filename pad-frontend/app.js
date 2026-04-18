window.addEventListener("pointermove", (event) => {
  if (stationTimelineInteraction) {
    updateStationTimelineSelection(event.clientX);
  }
  if (narrationNodeInteraction) {
    updateNarrationNodeInteraction(event.clientX);
  }
  if (!sceneEditorInteraction) return;
  updateSceneEditorInteraction(event);
});

window.addEventListener("pointerup", () => {
  endStationTimelineSelection();
  endNarrationNodeInteraction();
  void endSceneEditorInteraction();
});

window.addEventListener("pointercancel", () => {
  endStationTimelineSelection();
  endNarrationNodeInteraction();
  void endSceneEditorInteraction();
});

window.addEventListener("keydown", (event) => {
  const key = String(event && event.key ? event.key : "").trim().toLowerCase();
  if (state.mode !== "demo") return;
  if (key === "h") {
    event.preventDefault();
    setMode("ops");
  }
});

window.addEventListener("online", () => {
  state.online = true;
  void loadCurrentHall();
});

window.addEventListener("offline", () => {
  state.online = false;
  render();
});
window.addEventListener("resize", () => {
  syncMobileAnnotateToolsHeight();
});
window.addEventListener("scroll", () => {
  syncMobileAnnotateToolsHeight();
});

void bootstrapApp();
