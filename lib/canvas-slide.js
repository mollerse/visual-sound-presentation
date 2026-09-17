import fft from "../demos/fft.js";
import beat from "../demos/beat.js";
import musicFft from "../demos/music-fft.js";
import sinusoids from "../demos/sinusoids.js";
import spectrogram from "../demos/spectrogram.js";

import { controls } from "./controls.js";

/** @type {AudioContext?} */
let audioContext = null;

/** @type {Record.<import("../types.d.ts").AvailableDemo, import("../types.d.ts").CanvasDemo>} */
let availableDemos = {
  beat,
  fft,
  "music-fft": musicFft,
  sinusoids,
  spectrogram,
};

function getAudioContext() {
  audioContext ??= new AudioContext();
  return audioContext;
}

export class CanvasSlide extends HTMLElement {
  /** @type {import("../types.d.ts").CanvasDemo?} */
  #demo = null;
  /** @type {HTMLCanvasElement?} */
  #canvas = null;

  constructor() {
    super();
  }

  connectedCallback() {
    let demoType = /** @type {import("../types.d.ts").AvailableDemo} */ (this.dataset.demo);
    this.#demo = availableDemos[demoType];

    this.#canvas = document.createElement("canvas");
    this.appendChild(this.#canvas);

    let width = 1600;

    this.#canvas.height = (9 / 16) * width;
    this.#canvas.width = width;
  }

  async start() {
    if (this.#demo == null) return;
    if (this.#canvas == null) return;

    let audioContext = getAudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    await this.#demo.start(this.#canvas, controls, audioContext, this);
  }

  stop() {
    if (this.#demo == null) return;

    this.#demo.stop();
  }
}
