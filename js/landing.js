(function () {
  "use strict";

  /* ---------- mobile nav ---------- */
  var burger = document.getElementById("burgerBtn");
  var menu = document.getElementById("mobileMenu");
  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        menu.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- APK download toast ---------- */
  var toast = document.getElementById("apkToast");
  var toastTimer = null;
  var apkLinks = document.querySelectorAll(".js-apk-download");

  function showToast() {
    if (!toast) return;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 4000);
  }

  apkLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      // The link itself is a direct file URL, so the browser's own download
      // proceeds as normal; this toast is just a bit of reassurance while
      // that kicks off in the background.
      showToast();
    });
  });
})();
