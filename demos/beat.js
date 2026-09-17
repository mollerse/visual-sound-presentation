import { GLOBAL_BUTTONS, MESSAGES, VALUES } from "@mollerse/midi-control/devices/nanokontrol.js";
import Meyda from "meyda";
import { BLACK, WHITE, PINK, CYAN } from "./util/colors.js";
import { RingBuffer } from "./util/ringbuffer.js";
import { normalize } from "./util/tools.js";

import misterGame from "../assets/mister-game.mp3";
import traces from "../assets/traces.mp3";
import noMoreLies from "../assets/no-more-lies.mp3";
import popcorn from "../assets/popcorn.mp3";
import misterGameExtended from "../assets/mister-game-extended.mp3";

const SAMPLE_SOURCES = {
  "mister-game": misterGame,
  "mister-game-extended": misterGameExtended,
  "no-more-lies": noMoreLies,
  popcorn,
  traces,
};

const FFT_SIZE = Math.pow(2, 9);
const MEYDA_BUFFER_SIZE = FFT_SIZE;
const CANVAS_RESOLUTION_SCALE = 2;
const CANVAS_ASPECT_RATIO = 9 / 16;
const HISTORY_LENGTH = 128;
const HISTORY_SAMPLE_INTERVAL = 10;

/** @import {MidiControl} from '@mollerse/midi-control' */
/** @import {StartFn, StopFn} from '../types.d.ts' */

const NAME = "DiscoBeat";

/** @type {MidiControl} */
let c;
/** @type {AudioContext} */
let audioContext;
/** @type {CanvasRenderingContext2D} */
let canvasContext;
/** @type {AnalyserNode} */
let analyser;
/** @type {import('meyda/dist/esm/meyda-wa.js').MeydaAnalyzer} */
let meydaAnalyzer;
/** @type {MediaElementAudioSourceNode?} */
let source;
/** @type {HTMLAudioElement?} */
let audio;
/** @type {Uint8Array} */
let audioData;
/** @type {number} */
let animationFrameID;
/** @type {RingBuffer} */
let ringbuffer = new RingBuffer(HISTORY_LENGTH, FFT_SIZE);

let width = 0;
let height = 0;
let lastHistorySampleTime = 0;
let energy = 0;
let discoEnergy = 0;

/** @param {HTMLCanvasElement} canvas */
function initCanvas(canvas) {
  width = canvas.clientWidth || canvas.width;
  height = width * CANVAS_ASPECT_RATIO;
  canvas.width = width * CANVAS_RESOLUTION_SCALE;
  canvas.height = height * CANVAS_RESOLUTION_SCALE;

  canvasContext = canvas.getContext("2d");
  canvasContext.setTransform(CANVAS_RESOLUTION_SCALE, 0, 0, CANVAS_RESOLUTION_SCALE, 0, 0);
}

/**
 * @param {MidiControl} controls
 */
function initControls(controls) {
  c = controls;

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
}

/** @param {Partial<import('meyda').MeydaFeaturesObject>} features */
function detectBeat(features) {
  energy = features.rms || 0;
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
  analyser.fftSize = FFT_SIZE;
  audioData = new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);
  analyser.connect(audioContext.destination);
  meydaAnalyzer = Meyda.createMeydaAnalyzer({
    audioContext,
    source,
    bufferSize: MEYDA_BUFFER_SIZE,
    featureExtractors: ["rms"],
    callback: detectBeat,
  });
}

async function startPlayback() {
  if (!audio) return;

  stopPlayback();
  audio.currentTime = 0;
  lastHistorySampleTime = 0;
  meydaAnalyzer.start();
  await audio.play();
  render();
}

function stopPlayback() {
  meydaAnalyzer?.stop();
  audio?.pause();
}

function amp(d) {
  let v = normalize(0, 255, d);
  let threshold = 0.65;
  return v < threshold ? 0 : normalize(threshold, 1, v);
}

function applyPerspective(depth) {
  let vanishingX = width / 2;
  let vanishingY = height * 0.5;

  let scale = 1 / (1 + depth * 3);

  canvasContext.translate(vanishingX, vanishingY);
  canvasContext.scale(scale, scale);
  canvasContext.translate(-vanishingX, -vanishingY);
}

function drawDisco() {
  discoEnergy += (energy - discoEnergy) * (energy > discoEnergy ? 0.45 : 0.08);

  let centerX = width / 2;
  let centerY = height * 0.38;
  let radius = 0.5 * Math.min(width, height) * (0.17 + discoEnergy * 0.5);
  let rotation = performance.now() * 0.001;
  let latitudeCount = 7;
  let longitudeCount = 12;
  let cameraDistance = radius * 4;

  function project(x, y, z) {
    let scale = cameraDistance / (cameraDistance - z);
    return {
      x: centerX + x * scale,
      y: centerY + y * scale,
      scale,
    };
  }

  function rotate(x, z) {
    let cos = Math.cos(rotation);
    let sin = Math.sin(rotation);
    return {
      x: x * cos - z * sin,
      z: x * sin + z * cos,
    };
  }

  canvasContext.save();
  canvasContext.lineWidth = 1.2;
  canvasContext.strokeStyle = WHITE;
  canvasContext.shadowColor = PINK;
  canvasContext.shadowBlur = 20 + discoEnergy * 80;

  for (let i = 1; i < latitudeCount; i++) {
    let latitude = -Math.PI / 2 + (Math.PI * i) / latitudeCount;
    let y = Math.sin(latitude) * radius;
    let ringRadius = Math.cos(latitude) * radius;

    canvasContext.beginPath();
    for (let j = 0; j <= 96; j++) {
      let angle = (Math.PI * 2 * j) / 96;
      let point = rotate(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius);
      let projected = project(point.x, y, point.z);

      if (j === 0) {
        canvasContext.moveTo(projected.x, projected.y);
      } else {
        canvasContext.lineTo(projected.x, projected.y);
      }
    }
    canvasContext.stroke();
  }

  for (let i = 0; i < longitudeCount; i++) {
    let longitude = (Math.PI * 2 * i) / longitudeCount;

    canvasContext.beginPath();
    for (let j = 0; j <= 96; j++) {
      let latitude = -Math.PI / 2 + (Math.PI * j) / 96;
      let y = Math.sin(latitude) * radius;
      let ringRadius = Math.cos(latitude) * radius;
      let point = rotate(Math.cos(longitude) * ringRadius, Math.sin(longitude) * ringRadius);
      let projected = project(point.x, y, point.z);

      if (j === 0) {
        canvasContext.moveTo(projected.x, projected.y);
      } else {
        canvasContext.lineTo(projected.x, projected.y);
      }
    }
    canvasContext.stroke();
  }

  canvasContext.strokeStyle = CYAN;
  canvasContext.shadowColor = CYAN;
  canvasContext.beginPath();
  canvasContext.arc(centerX, centerY, radius * 1.02, 0, Math.PI * 2);
  canvasContext.stroke();
  canvasContext.restore();
}

function drawLines() {
  canvasContext.strokeStyle = CYAN;
  canvasContext.lineWidth = 1;

  let yPrime = height;
  let data = ringbuffer.buffer.toReversed();

  let xMin = -width / 2;
  let xMax = width + width / 2;

  for (let i = 0; i < data.length; i++) {
    let lineData = data[i];

    let xStep = width / lineData.length;
    let yMax = height / 2;
    let depth = i / Math.max(1, data.length - 1);

    canvasContext.save();
    applyPerspective(depth);

    canvasContext.beginPath();
    canvasContext.moveTo(xMin, yPrime - amp(lineData[0]) * yMax);
    for (let j = 0; j < lineData.length; j++) {
      canvasContext.lineTo(xMin + xStep * j, yPrime - amp(lineData[j]) * yMax);
    }

    canvasContext.lineTo(width / 2 + xStep, yPrime);

    canvasContext.moveTo(xMax, yPrime - amp(lineData[0]) * yMax);
    for (let j = lineData.length; j > -1; j--) {
      canvasContext.lineTo(
        width / 2 + j * xStep,
        yPrime - amp(lineData[lineData.length - j]) * yMax,
      );
    }
    canvasContext.stroke();
    canvasContext.restore();
  }
}

function render(time = 0) {
  animationFrameID = requestAnimationFrame(render);

  if (!lastHistorySampleTime || time - lastHistorySampleTime >= HISTORY_SAMPLE_INTERVAL) {
    analyser.getByteFrequencyData(audioData);
    let interestingFrequencies = audioData.slice(1, 107);
    ringbuffer.push(interestingFrequencies);
    lastHistorySampleTime = time;
  }

  canvasContext.fillStyle = BLACK;
  canvasContext.fillRect(0, 0, width, height);

  drawLines();
  drawDisco();
}

function cleanUp() {
  cancelAnimationFrame(animationFrameID);
  stopPlayback();
  audio?.removeEventListener("ended", stopPlayback);
  source?.disconnect();
  analyser?.disconnect();

  audio = null;
  source = null;
  analyser = null;
  meydaAnalyzer = null;
  lastHistorySampleTime = 0;
  energy = 0;
  discoEnergy = 0;
  ringbuffer = new RingBuffer(HISTORY_LENGTH, FFT_SIZE);
}

/** @type {StartFn} */
async function start(canvas, controls, audioContext, canvasSlide) {
  let audioSourceKey = canvasSlide.dataset.src;

  if (!audioSourceKey) {
    throw new Error("Beat2 canvas-slide is missing data-src");
  }

  let audioSource = SAMPLE_SOURCES[audioSourceKey];

  if (!audioSource) {
    throw new Error(`Unknown beat2 audio source: ${audioSourceKey}`);
  }

  initControls(controls);
  initCanvas(canvas);
  initAudio(audioContext, audioSource);
}

/** @type {StopFn} */
function stop() {
  c.deactivateBinding(NAME);
  cleanUp();
}

export default { start, stop };
