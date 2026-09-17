import {
  GLOBAL_BUTTONS,
  KNOBS,
  MESSAGES,
  SLIDERS,
  VALUES,
} from "@mollerse/midi-control/devices/nanokontrol.js";

import misterGame from "../assets/mister-game.mp3";
import traces from "../assets/traces.mp3";
import noMoreLies from "../assets/no-more-lies.mp3";
import popcorn from "../assets/popcorn.mp3";

import { drawFrequencyDomainViz } from "./frequency-domain-viz.js";
import { drawTimeDomainViz } from "./time-domain-viz.js";
import { BLACK } from "./util/colors.js";

const FFT_SIZE = 32768;
const FREQUENCY_WINDOW_WIDTH_MIN = 500;
const FREQUENCY_WINDOW_WIDTH_MAX = 24000;
const FREQUENCY_WINDOW_POSITION_MIN = 0;
const FREQUENCY_WINDOW_POSITION_MAX = FREQUENCY_WINDOW_WIDTH_MAX - FREQUENCY_WINDOW_WIDTH_MIN;
const TIME_DOMAIN_SAMPLES = 512;
const CANVAS_RESOLUTION_SCALE = 2;
const SAMPLE_SOURCES = {
  "mister-game": misterGame,
  "no-more-lies": noMoreLies,
  popcorn,
  traces,
};

/** @import {MidiControl} from '@mollerse/midi-control' */
/** @import {StartFn, StopFn} from '../types.d.ts' */

/** @type {number} */
let WIDTH;
/** @type {number} */
let HEIGHT;

const NAME = "Music FFT";

/** @type {MidiControl} */
let c;
/** @type {AudioContext} */
let audioContext;
/** @type {CanvasRenderingContext2D} */
let canvasContext;

/** @type {MediaElementAudioSourceNode?} */
let source;
/** @type {HTMLAudioElement?} */
let audio;
let analyser;
let frequencyData, timeDomainData, timeDomainSnapshot;
let controlsReady = false;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {MidiControl} controls
 * @param {AudioContext} context
 * @param {HTMLElement} canvasSlide
 */
async function init(canvas, controls, audioContext, canvasSlide) {
  let audioSourceKey = canvasSlide.dataset.src;

  if (!audioSourceKey) {
    throw new Error("Music FFT canvas-slide is missing data-src");
  }

  let audioSource = SAMPLE_SOURCES[audioSourceKey];

  if (!audioSource) {
    throw new Error(`Unknown music FFT audio source: ${audioSourceKey}`);
  }

  WIDTH = canvas.clientWidth || canvas.width;
  HEIGHT = canvas.clientHeight || canvas.height;
  canvas.width = WIDTH * CANVAS_RESOLUTION_SCALE;
  canvas.height = HEIGHT * CANVAS_RESOLUTION_SCALE;

  canvasContext = canvas.getContext("2d");
  canvasContext.setTransform(CANVAS_RESOLUTION_SCALE, 0, 0, CANVAS_RESOLUTION_SCALE, 0, 0);

  initControls(controls);
  initAudio(audioContext, audioSource);
}

function cleanUp() {
  stopPlayback();
  audio?.removeEventListener("ended", stopPlayback);
  audio?.pause();

  source?.disconnect();
  analyser?.disconnect();

  audio = null;
  source = null;
  analyser = null;
  controlsReady = false;
}

/**
 * @param {MidiControl} controls
 */
function initControls(controls) {
  c = controls;
  controlsReady = false;

  try {
    c.activateBinding(NAME);
  } catch {
    c.createBinding(NAME);

    c.addBooleanValue(
      "play",
      { initial: false },
      {
        keyId: GLOBAL_BUTTONS.play,
        messageType: MESSAGES.button,
        value: VALUES.button.down,
        onChange: startPlayback,
      },
    );

    c.addNumberValue(
      "frequencyWindowWidth",
      {
        initial: FREQUENCY_WINDOW_WIDTH_MIN,
        min: FREQUENCY_WINDOW_WIDTH_MIN,
        max: FREQUENCY_WINDOW_WIDTH_MAX,
        step: 1,
      },
      {
        keyId: KNOBS[1],
        messageType: MESSAGES.knob,
      },
    );

    c.addNumberValue(
      "frequencyWindowPosition",
      {
        initial: FREQUENCY_WINDOW_POSITION_MIN,
        min: FREQUENCY_WINDOW_POSITION_MIN,
        max: FREQUENCY_WINDOW_POSITION_MAX,
        step: 1,
      },
      {
        keyId: SLIDERS[1],
        messageType: MESSAGES.slider,
      },
    );
  }

  controlsReady = true;
}

function updateFFTSize() {
  if (!analyser) return;

  analyser.fftSize = FFT_SIZE;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);
  timeDomainData = new Uint8Array(analyser.fftSize);
}

function getFrequencyWindow() {
  let startFrequency = c.getNumberValue("frequencyWindowPosition");
  let width = c.getNumberValue("frequencyWindowWidth");

  return {
    minFrequency: startFrequency,
    maxFrequency: startFrequency + width,
  };
}

/**
 * @param {AudioContext} context
 * @param {string} audioSource
 */
function initAudio(context, audioSource) {
  audioContext = context;
  audio = new Audio(audioSource);
  audio.crossOrigin = "anonymous";
  audio.addEventListener("ended", stopPlayback);
  source = audioContext.createMediaElementSource(audio);
  analyser = audioContext.createAnalyser();

  analyser.maxDecibels = 0;
  analyser.minDecibels = -100;

  updateFFTSize();

  source.connect(analyser);
  analyser.connect(audioContext.destination);
}

async function startPlayback() {
  if (!controlsReady || !audio) return;

  stopPlayback();
  audio.currentTime = 0;
  await audio.play();
}

function stopPlayback() {
  audio?.pause();
}

function updateTimeDomainSnapshot() {
  analyser.getByteTimeDomainData(timeDomainData);

  timeDomainSnapshot = timeDomainData.slice(-TIME_DOMAIN_SAMPLES);
}

function frame() {
  canvasContext.fillStyle = BLACK;
  canvasContext.fillRect(0, 0, WIDTH, HEIGHT);

  analyser.getByteFrequencyData(frequencyData);

  updateTimeDomainSnapshot();

  let halfWidth = WIDTH / 2;
  let frequencyWindow = getFrequencyWindow();

  drawFrequencyDomainViz(
    canvasContext,
    0,
    0,
    halfWidth,
    HEIGHT,
    frequencyData,
    audioContext.sampleRate,
    Math.max(frequencyWindow.minFrequency, 0),
    Math.min(frequencyWindow.maxFrequency, 24000),
  );
  drawTimeDomainViz(canvasContext, halfWidth, 0, halfWidth, HEIGHT, timeDomainSnapshot);
}

/** @type {number} */
let rafID;
let t0 = 0;

/**
 * @param {number} t
 * @returns {void}
 */
function render(t = 0) {
  // FPS clamp
  let deltaT = t - t0;
  rafID = requestAnimationFrame(render);
  if (t0 && deltaT < 16) {
    return;
  }

  frame(t);

  t0 = t;
}

/** @type {StartFn} */
async function start(canvas, controls, audioContext, canvasSlide) {
  await init(canvas, controls, audioContext, canvasSlide);
  render();
}

/** @type {StopFn} */
function stop() {
  cancelAnimationFrame(rafID);
  c.deactivateBinding(NAME);

  cleanUp();
}

export default { start, stop };
