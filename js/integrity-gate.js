/* 
   First-Time Integrity Gate
   This is a simple integrity gate that will show a popup to the user
   once per device before the user can interact with the app. The user must
   acknowledge the terms before they can proceed. The agreement is remembered
   in localStorage so returning users are not shown it again.
 */

(function () {
    "use strict";

    const STORAGE_KEY = "mantiq_integrity_ack_v1";

    let hasAcknowledged = false;
    try {
        hasAcknowledged = localStorage.getItem(STORAGE_KEY) === "true";
    } catch (e) {
        // It is possible that localStorage is not available, in those cases we will not show the popup.
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
                // It is possible that localStorage is not available, in those cases we will not remember the acknowledgement.
            }
            popup.style.display = "none";
            document.body.classList.remove("integrity-locked");
        }, { once: true });
    });
})();
