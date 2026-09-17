import {
  BUTTONS,
  GLOBAL_BUTTONS,
  KNOBS,
  LIGHTS,
  MESSAGES,
  SLIDERS,
  VALUES,
} from "@mollerse/midi-control/devices/nanokontrol.js";

import { drawFrequencyDomainViz } from "./frequency-domain-viz.js";
import { drawTimeDomainViz } from "./time-domain-viz.js";
import { BLACK } from "./util/colors.js";

const GAIN_WEIGHTS = [0.4, 0.3, 0.2, 0.1];
const FREQUENCIES = [10, 110, 220, 440];
const OSCILLATOR_GAIN_MIN = 0;
const OSCILLATOR_GAIN_MAX = 1;
const OSCILLATOR_GAIN_STEP = 0.05;
const OSCILLATOR_FREQUENCY_MIN = 0;
const OSCILLATOR_FREQUENCY_MAX = 1000;
const OSCILLATOR_FREQUENCY_STEP = 10;
const OSCILLATOR_TYPES = ["sine", "triangle", "square", "sawtooth"];
const FFT_SIZE = 32768;
const FREQUENCY_WINDOW_WIDTH_MIN = 500;
const FREQUENCY_WINDOW_WIDTH_MAX = 24000;
const FREQUENCY_WINDOW_POSITION_MIN = 0;
const FREQUENCY_WINDOW_POSITION_MAX = FREQUENCY_WINDOW_WIDTH_MAX - FREQUENCY_WINDOW_WIDTH_MIN;
const TIME_DOMAIN_SAMPLES = 512;
const CANVAS_RESOLUTION_SCALE = 2;

/** @import {MidiControl} from '@mollerse/midi-control' */
/** @import {StartFn, StopFn} from '../types.d.ts' */

/** @type {number} */
let WIDTH;
/** @type {number} */
let HEIGHT;

const NAME = "FFT";

/** @type {MidiControl} */
let c;
/** @type {AudioContext} */
let audioContext;
/** @type {CanvasRenderingContext2D} */
let canvasContext;

let source, outputGain, analyser;
let frequencyData, timeDomainData, timeDomainSnapshot;
let timeDomainSnapshotDirty = true;
let speakersConnected;
let oscillators = [];

/**
 * @param {HTMLCanvasElement} canvas
 * @param {MidiControl} controls
 * @param {AudioContext} context
 */
function init(canvas, controls, audioContext) {
  WIDTH = canvas.clientWidth || canvas.width;
  HEIGHT = canvas.clientHeight || canvas.height;
  canvas.width = WIDTH * CANVAS_RESOLUTION_SCALE;
  canvas.height = HEIGHT * CANVAS_RESOLUTION_SCALE;

  canvasContext = canvas.getContext("2d");
  canvasContext.setTransform(CANVAS_RESOLUTION_SCALE, 0, 0, CANVAS_RESOLUTION_SCALE, 0, 0);

  initControls(controls);
  initAudio(audioContext);
}

function cleanUp() {
  source.dispose();
  analyser.disconnect();
  outputGain.disconnect();
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
      "speakerOutput",
      { initial: false },
      {
        keyId: BUTTONS[1].recArm,
        messageType: MESSAGES.button,
        value: VALUES.button.down,
        onChange: updateSpeakerOutput,
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

    c.addNumberValue(
      "oscillatorTypeIndex",
      { initial: 0, min: 0, max: OSCILLATOR_TYPES.length - 1, step: 1 },
      {
        keyId: [GLOBAL_BUTTONS.track.next, GLOBAL_BUTTONS.track.previous],
        messageType: MESSAGES.button,
        value: VALUES.button.down,
        onChange: updateOscillatorType,
      },
    );

    FREQUENCIES.forEach((frequency, index) => {
      c.addBooleanValue(
        `oscillator${index + 1}Enabled`,
        { initial: true },
        {
          keyId: BUTTONS[index + 2].recArm,
          messageType: MESSAGES.button,
          value: VALUES.button.down,
          onChange: () => updateOscillatorGain(index),
        },
      );

      c.addNumberValue(
        `oscillator${index + 1}Gain`,
        {
          initial: GAIN_WEIGHTS[index],
          min: OSCILLATOR_GAIN_MIN,
          max: OSCILLATOR_GAIN_MAX,
          step: OSCILLATOR_GAIN_STEP,
        },
        {
          keyId: KNOBS[index + 2],
          messageType: MESSAGES.knob,
          onChange: () => updateOscillatorGain(index),
        },
      );

      c.addNumberValue(
        `oscillator${index + 1}Frequency`,
        {
          initial: frequency,
          min: OSCILLATOR_FREQUENCY_MIN,
          max: OSCILLATOR_FREQUENCY_MAX,
          step: OSCILLATOR_FREQUENCY_STEP,
        },
        {
          keyId: SLIDERS[index + 2],
          messageType: MESSAGES.slider,
          onChange: () => updateOscillatorFrequency(index),
        },
      );
    });
  }
}

function updateFFTSize() {
  if (!analyser) return;

  analyser.fftSize = FFT_SIZE;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);
  timeDomainData = new Uint8Array(analyser.fftSize);
  timeDomainSnapshotDirty = true;
}

function getFrequencyWindow() {
  let startFrequency = c.getNumberValue("frequencyWindowPosition");
  let width = c.getNumberValue("frequencyWindowWidth");

  return {
    minFrequency: startFrequency,
    maxFrequency: startFrequency + width,
  };
}

function getOscillatorType() {
  return OSCILLATOR_TYPES[Math.round(c.getNumberValue("oscillatorTypeIndex"))];
}

function updateOscillatorType() {
  let type = getOscillatorType();

  for (let { oscillator } of oscillators) {
    oscillator.type = type;
  }

  timeDomainSnapshotDirty = true;
}

/** @param {number} index */
function getOscillatorFrequencyControlName(index) {
  return `oscillator${index + 1}Frequency`;
}

/** @param {number} index */
function getOscillatorEnabledControlName(index) {
  return `oscillator${index + 1}Enabled`;
}

/** @param {number} index */
function getOscillatorGainControlName(index) {
  return `oscillator${index + 1}Gain`;
}

/** @param {number} index */
function updateOscillatorFrequency(index) {
  let oscillator = oscillators[index]?.oscillator;
  if (!oscillator || !audioContext) return;

  oscillator.frequency.setValueAtTime(
    c.getNumberValue(getOscillatorFrequencyControlName(index)),
    audioContext.currentTime,
  );
  timeDomainSnapshotDirty = true;
}

/** @param {number} index */
function getOscillatorGain(index) {
  if (!c.getBooleanValue(getOscillatorEnabledControlName(index))) return 0;

  return c.getNumberValue(getOscillatorGainControlName(index));
}

/** @param {number} index */
function updateOscillatorGain(index) {
  let gain = oscillators[index]?.gain;
  if (!gain || !audioContext) return;

  let isEnabled = c.getBooleanValue(getOscillatorEnabledControlName(index));

  gain.gain.setValueAtTime(getOscillatorGain(index), audioContext.currentTime);
  c.send(MESSAGES.light, BUTTONS[index + 2].recArm, isEnabled ? LIGHTS.on : LIGHTS.off);
  timeDomainSnapshotDirty = true;
}

/**
 * @param {AudioContext} context
 */
function createStackedOscillatorSource(context) {
  let output = context.createGain();
  oscillators = GAIN_WEIGHTS.map((weight, index) => {
    let oscillator = context.createOscillator();
    let gain = context.createGain();

    oscillator.type = getOscillatorType();
    oscillator.frequency.value = c.getNumberValue(getOscillatorFrequencyControlName(index));
    gain.gain.value = getOscillatorGain(index);

    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start();

    return { oscillator, gain };
  });

  oscillators.forEach((_, index) => updateOscillatorGain(index));

  return {
    /** @param {AudioNode} node */
    connect(node) {
      output.connect(node);
    },
    dispose() {
      for (let { oscillator, gain } of oscillators) {
        oscillator.stop();
        oscillator.disconnect();
        gain.disconnect();
      }
      output.disconnect();
    },
  };
}

/** @param {AudioContext} context */
function initAudio(context) {
  audioContext = context;
  source = createStackedOscillatorSource(audioContext, c);
  analyser = audioContext.createAnalyser();
  outputGain = audioContext.createGain();

  outputGain.gain.value = 1;
  analyser.maxDecibels = 0;
  analyser.minDecibels = -100;

  updateFFTSize();

  source.connect(analyser);
  source.connect(outputGain);

  updateSpeakerOutput();
}

function updateSpeakerOutput() {
  if (!outputGain || !audioContext) return;

  let shouldConnect = c.getBooleanValue("speakerOutput");

  if (shouldConnect && !speakersConnected) {
    outputGain.connect(audioContext.destination);
    speakersConnected = true;
    c.send(MESSAGES.light, BUTTONS[1].recArm, LIGHTS.on);
  }

  if (!shouldConnect && speakersConnected) {
    outputGain.disconnect(audioContext.destination);
    speakersConnected = false;
    c.send(MESSAGES.light, BUTTONS[1].recArm, LIGHTS.off);
  }
}

function updateTimeDomainSnapshot() {
  analyser.getByteTimeDomainData(timeDomainData);

  timeDomainSnapshot = timeDomainData.slice(-TIME_DOMAIN_SAMPLES);
  timeDomainSnapshotDirty = false;
}

function frame() {
  canvasContext.fillStyle = BLACK;
  canvasContext.fillRect(0, 0, WIDTH, HEIGHT);

  analyser.getByteFrequencyData(frequencyData);

  if (timeDomainSnapshotDirty || !timeDomainSnapshot) {
    updateTimeDomainSnapshot();
  }

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

/** @type {StopFn} */
function start(canvas, controls, audioContext) {
  init(canvas, controls, audioContext);
  render();
}

/** @type {StartFn} */
function stop() {
  cancelAnimationFrame(rafID);
  c.deactivateBinding(NAME);

  cleanUp();
}

export default { start, stop };
