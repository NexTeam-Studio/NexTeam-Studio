const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

const yearNode = document.querySelector("[data-year]");
if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const bubbleHost = document.querySelector("[data-bubbles]");
if (bubbleHost) {
  for (let index = 0; index < 20; index += 1) {
    const bubble = document.createElement("span");
    const size = Math.random() * 18 + 8;
    bubble.className = "bubble";
    bubble.style.width = size + "px";
    bubble.style.height = size + "px";
    bubble.style.left = Math.random() * 100 + "%";
    bubble.style.animationDuration = Math.random() * 12 + 12 + "s";
    bubble.style.animationDelay = Math.random() * 10 + "s";
    bubbleHost.appendChild(bubble);
  }
}