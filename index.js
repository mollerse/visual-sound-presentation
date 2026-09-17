import Reveal from "reveal.js";
import RevealHighlight from "reveal.js/plugin/highlight";

import { init as initControls } from "./lib/controls.js";
import { CanvasSlide } from "./lib/canvas-slide.js";

let deck = new Reveal({
  controls: false,
  progress: false,
  slideNumber: false,
  hash: true,
  history: true,
  disableLayout: true,
  display: "flex",
  transition: "none",
  plugins: [RevealHighlight],
});

deck.initialize();
await initControls();

customElements.define("canvas-slide", CanvasSlide);

// @ts-ignore Types aren't defined properly in reveal.js
deck.on("slidechanged", function ({ previousSlide, currentSlide }) {
  if (previousSlide && previousSlide.classList.contains("demo")) {
    let canvasSlide = previousSlide.querySelector("canvas-slide");
    document.body.classList.remove("demo");
    canvasSlide.stop();
  }

  if (currentSlide.classList.contains("demo")) {
    let canvasSlide = currentSlide.querySelector("canvas-slide");
    document.body.classList.add("demo");
    canvasSlide.start();
  }
});

if (deck.getCurrentSlide().classList.contains("demo")) {
  let canvasSlide = deck.getCurrentSlide().querySelector("canvas-slide");
  document.body.classList.add("demo");
  canvasSlide.start();
}

// Set a scale based on available width
function scale() {
  let baseWidth = 1920;

  let { width } = document.body.getBoundingClientRect();

  let scale = width / baseWidth;

  document.documentElement.style.setProperty("--scale", `${scale}`);
}

scale();
window.addEventListener("resize", scale);
