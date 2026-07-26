/* ==========================================================================
   Academic Integrity Gate
   Shows a mandatory, blocking acknowledgement once per device before the
   user can interact with the app. Agreement is remembered in localStorage
   so returning users are not shown it again.
   ========================================================================== */
(function () {
    "use strict";

    const STORAGE_KEY = "mantiq_integrity_ack_v1";

    let hasAcknowledged = false;
    try {
        hasAcknowledged = localStorage.getItem(STORAGE_KEY) === "true";
    } catch (e) {
        // If storage is unavailable, fail open rather than trap the user
        // behind a gate that can never be dismissed.
        hasAcknowledged = true;
    }

    if (hasAcknowledged) return;

    document.addEventListener("DOMContentLoaded", function () {
        const popup = document.getElementById("integrity-popup");
        const agreeBtn = document.getElementById("integrity-agree-btn");
        if (!popup || !agreeBtn) return;

        document.body.classList.add("integrity-locked");
        popup.style.display = "flex";

        agreeBtn.addEventListener("click", function () {
            try {
                localStorage.setItem(STORAGE_KEY, "true");
            } catch (e) {
                // Non-fatal: the user simply sees the gate again next visit.
            }
            popup.style.display = "none";
            document.body.classList.remove("integrity-locked");
        }, { once: true });
    });
})();
