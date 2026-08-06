/**
 * Vercel Web Analytics — mirrors @vercel/analytics `inject()` for static HTML.
 * Loads `/_vercel/insights/script.js` after deploy (requires Analytics enabled on the Vercel project).
 */
(function () {
  if (typeof window === "undefined") return;
  if (!window.va) {
    window.va = function () {
      if (!window.vaq) window.vaq = [];
      window.vaq.push(arguments);
    };
  }
  var src = "/_vercel/insights/script.js";
  if (document.head.querySelector('script[src*="/_vercel/insights/script"]')) return;
  var script = document.createElement("script");
  script.src = src;
  script.defer = true;
  script.dataset.sdkn = "@vercel/analytics";
  script.dataset.sdkv = "2.0.1";
  script.onerror = function () {
    console.log(
      "[Vercel Web Analytics] Failed to load " +
        src +
        ". Enable Web Analytics on this Vercel project and redeploy."
    );
  };
  document.head.appendChild(script);
})();
