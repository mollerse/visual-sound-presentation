import { GLOBAL_BUTTONS, MESSAGES, VALUES } from "@mollerse/midi-control/devices/nanokontrol.js";

import misterGame from "../assets/mister-game.mp3";
import traces from "../assets/traces.mp3";
import noMoreLies from "../assets/no-more-lies.mp3";
import popcorn from "../assets/popcorn.mp3";

import { BLACK, WHITE } from "./util/colors.js";

const FFT_SIZE = 2048;
const CANVAS_RESOLUTION_SCALE = 2;
const LINE_WIDTH = 0.5;
const SAMPLE_NAME_FONT = "40px sans-serif";
const SAMPLE_SOURCES = {
  "mister-game": misterGame,
  "no-more-lies": noMoreLies,
  popcorn,
  traces,
};
const SAMPLE_NAMES = {
  "mister-game": "Klapto - Mister Game",
  "no-more-lies": "NIKOLINA - No More Lies",
  popcorn: "Hot Butter - Popcorn",
  traces: "DHG - Traces of Reality",
};

/** @import {MidiControl} from '@mollerse/midi-control' */
/** @import {StartFn, StopFn} from '../types.d.ts' */

/** @type {number} */
let WIDTH;
/** @type {number} */
let HEIGHT;

const NAME = "Spectrogram";

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
/** @type {AnalyserNode} */
let analyser;
/** @type {Uint8Array} */
let frequencyDomainData;
let drawX = 0;
let animationFrameID;
let controlsReady = false;
let sampleName = "";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {MidiControl} controls
 * @param {AudioContext} context
 * @param {HTMLElement} canvasSlide
 */
async function init(canvas, controls, context, canvasSlide) {
  let audioSourceKey = canvasSlide.dataset.src;

  if (!audioSourceKey) {
    throw new Error("Spectrogram canvas-slide is missing data-src");
  }

  let audioSource = SAMPLE_SOURCES[audioSourceKey];

  if (!audioSource) {
    throw new Error(`Unknown spectrogram audio source: ${audioSource}`);
  }

  sampleName = SAMPLE_NAMES[audioSourceKey];

  WIDTH = canvas.clientWidth || canvas.width;
  HEIGHT = canvas.clientHeight || canvas.height;
  canvas.width = WIDTH * CANVAS_RESOLUTION_SCALE;
  canvas.height = HEIGHT * CANVAS_RESOLUTION_SCALE;

  canvasContext = canvas.getContext("2d");
  canvasContext.setTransform(CANVAS_RESOLUTION_SCALE, 0, 0, CANVAS_RESOLUTION_SCALE, 0, 0);
  resetCanvas();

  initControls(controls);
  await initAudio(context, audioSource);
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
  animationFrameID = null;
  controlsReady = false;
  sampleName = "";
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
  }

  controlsReady = true;
}

function updateFFTSize() {
  if (!analyser) return;

  analyser.fftSize = FFT_SIZE;
  frequencyDomainData = new Uint8Array(analyser.frequencyBinCount);
}

/**
 * @param {AudioContext} context
 * @param {string} audioSource
 */
async function initAudio(context, audioSource) {
  audioContext = context;
  audio = new Audio(audioSource);
  audio.crossOrigin = "anonymous";
  audio.addEventListener("ended", stopPlayback);
  source = audioContext.createMediaElementSource(audio);
  analyser = audioContext.createAnalyser();

  updateFFTSize();

  source.connect(analyser);
  analyser.connect(audioContext.destination);
}

function resetCanvas() {
  canvasContext.fillStyle = BLACK;
  canvasContext.fillRect(0, 0, WIDTH, HEIGHT);
  drawX = 0;
  drawSampleName(sampleName);
}

async function startPlayback() {
  if (!controlsReady || !audio) return;

  stopPlayback();
  resetCanvas();
  audio.currentTime = 0;
  await audio.play();
  drawLoop();
}

function stopPlayback() {
  cancelAnimationFrame(animationFrameID);
  animationFrameID = null;
}

function drawSample() {
  analyser.getByteFrequencyData(frequencyDomainData);
  let interestingFrequencies = frequencyDomainData.slice(20, 512);
  canvasContext.lineWidth = LINE_WIDTH;

  let stepY = (0.9 * HEIGHT) / interestingFrequencies.length;
  let offsetY = 0.1 * HEIGHT;

  for (let y = 0; y < interestingFrequencies.length; y++) {
    let amplitude = frequencyDomainData[y] / 255;

    let hue = Math.floor(amplitude * 360);

    canvasContext.strokeStyle = `hsl(${hue}, 100%, 50%)`;
    canvasContext.beginPath();
    canvasContext.moveTo(drawX, offsetY + stepY * y);
    canvasContext.lineTo(drawX, offsetY + stepY * (y + 1));
    canvasContext.stroke();
  }

  drawX += LINE_WIDTH;
}

/**
 * @param {string} sampleName
 */
function drawSampleName(sampleName) {
  canvasContext.fillStyle = WHITE;
  canvasContext.font = SAMPLE_NAME_FONT;
  canvasContext.textAlign = "left";
  canvasContext.textBaseline = "top";
  canvasContext.fillText(sampleName, 0, 0);
}

function drawLoop() {
  drawSample();
  animationFrameID = requestAnimationFrame(drawLoop);
}

/** @type {StartFn} */
async function start(canvas, controls, audioContext, canvasSlide) {
  await init(canvas, controls, audioContext, canvasSlide);
}

/** @type {StopFn} */
function stop() {
  c.deactivateBinding(NAME);
  cleanUp();
}

export default { start, stop };
