// frontend/js/app.js
// ================================
// General UI Logic (NO AR HERE)
// ================================

console.log("app.js loaded");

// Utility: safe element getter
function $(id) {
  return document.getElementById(id);
}

// ================================
// Navigation helper (if you have multiple pages/sections)
// ================================
window.goToPage = function(pageId) {
  const pages = document.querySelectorAll(".page");
  pages.forEach(p => p.style.display = "none");

  const target = $(pageId);
  if (target) target.style.display = "block";
};

// ================================
// Example: Menu toggle (if you have a hamburger menu)
// ================================
const menuBtn = $("menuBtn");
const menuPanel = $("menuPanel");

if (menuBtn && menuPanel) {
  menuBtn.addEventListener("click", () => {
    menuPanel.classList.toggle("open");
  });
}

// ================================
// Toast message / alert helper
// ================================
window.showToast = function(msg) {
  alert(msg);
};

// ================================
// Form submission example
// ================================
const contactForm = $("contactForm");

if (contactForm) {
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Form submitted!");
  });
}

// ================================
// Generic button triggers
// ================================
const helpButtons = document.querySelectorAll("[data-help]");
helpButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const message = btn.getAttribute("data-help") || "Help info";
    alert(message);
  });
});

// ================================
// Smooth Scroll (if needed)
// ================================
window.scrollToSection = function(id) {
  const section = $(id);
  if (section) {
    section.scrollIntoView({ behavior: "smooth" });
  }
};

// ================================
// Cleanup / future hooks
// ================================
console.log("UI initialized (app.js)");
