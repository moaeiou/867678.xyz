export function onFuckxterPageReady(callback: () => void): void {
  let pageLoadSeen = false;

  const run = () => {
    pageLoadSeen = true;
    callback();
  };

  document.addEventListener("astro:page-load", run);

  const initialFallback = () => {
    if (!pageLoadSeen) run();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialFallback, {
      once: true,
    });
  } else {
    initialFallback();
  }
}
