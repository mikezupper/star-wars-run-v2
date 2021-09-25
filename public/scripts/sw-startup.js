if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("scripts/sw.js", { scope: "/" });
  });
}
