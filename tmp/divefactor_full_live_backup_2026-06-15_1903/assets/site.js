const bubbleHost = document.querySelector("[data-bubbles]");

if (bubbleHost) {
  for (let index = 0; index < 14; index += 1) {
    const bubble = document.createElement("span");
    const size = Math.floor(Math.random() * 28) + 14;
    bubble.className = "bubble";
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${Math.random() * 100}%`;
    bubble.style.animationDuration = `${Math.random() * 14 + 12}s`;
    bubble.style.animationDelay = `${Math.random() * 8}s`;
    bubbleHost.appendChild(bubble);
  }
}

const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
}

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = new Date().getFullYear();
});
