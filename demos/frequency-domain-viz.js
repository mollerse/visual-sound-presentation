import { CYAN, WHITE } from "./util/colors.js";

const AXIS_PADDING_LEFT = 44;
const AXIS_PADDING_RIGHT = 12;
const AXIS_PADDING_TOP = 12;
const AXIS_PADDING_BOTTOM = 36;
const AXIS_LABEL_FONT = "12px sans-serif";
const AXIS_COLOR = WHITE;
const FREQUENCY_TICK_RATIOS = [0, 0.25, 0.5, 0.75, 1];

/** @typedef {"linear" | "log"} FrequencyScale */

/**
 * @param {number} frequency
 */
function formatFrequency(frequency) {
  if (frequency >= 1000) {
    return `${(frequency / 1000).toFixed(1)} kHz`;
  }

  return `${Math.round(frequency)} Hz`;
}

/**
 * @param {number} frequencyBinCount
 * @param {number} sampleRate
 * @param {number} minFrequency
 * @param {number} maxFrequency
 */
function getFrequencyTicks(frequencyBinCount, sampleRate, minFrequency, maxFrequency, scale = "linear") {
  let bucketWidth = sampleRate / 2 / frequencyBinCount;

  return FREQUENCY_TICK_RATIOS.map((ratio) => {
    let frequency =
      scale === "log"
        ? minFrequency * Math.pow(maxFrequency / minFrequency, ratio)
        : minFrequency + ratio * (maxFrequency - minFrequency);
    let index = Math.round(frequency / bucketWidth - 0.5);

    return {
      label: formatFrequency((index + 0.5) * bucketWidth),
      ratio,
    };
  });
}

/**
 * @param {number} frequency
 * @param {number} minFrequency
 * @param {number} maxFrequency
 */
function getLogFrequencyRatio(frequency, minFrequency, maxFrequency) {
  return Math.log(frequency / minFrequency) / Math.log(maxFrequency / minFrequency);
}

/**
 * @param {CanvasRenderingContext2D} canvasContext
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {{label: string, ratio: number}[]} frequencyTicks
 */
function drawAxes(canvasContext, x, y, width, height, frequencyTicks) {
  canvasContext.strokeStyle = AXIS_COLOR;
  canvasContext.fillStyle = AXIS_COLOR;
  canvasContext.lineWidth = 1;
  canvasContext.font = AXIS_LABEL_FONT;
  canvasContext.textBaseline = "middle";

  canvasContext.beginPath();
  canvasContext.moveTo(x, y);
  canvasContext.lineTo(x, y + height);
  canvasContext.lineTo(x + width, y + height);

  for (let tick of frequencyTicks) {
    let tickX = x + tick.ratio * width;
    canvasContext.moveTo(tickX, y + height);
    canvasContext.lineTo(tickX, y + height + 6);
  }

  canvasContext.stroke();

  canvasContext.textAlign = "center";
  canvasContext.textBaseline = "top";
  for (let tick of frequencyTicks) {
    let tickX = x + tick.ratio * width;
    canvasContext.fillText(tick.label, tickX, y + height + 10);
  }

  canvasContext.textAlign = "center";
  canvasContext.fillText("Frequency", x + width / 2, y + height + 24);

  canvasContext.save();
  canvasContext.textBaseline = "middle";
  canvasContext.translate(x - 32, y + height / 2);
  canvasContext.rotate(-Math.PI / 2);
  canvasContext.fillText("Magnitude", 0, 0);
  canvasContext.restore();
}

/**
 * @param {CanvasRenderingContext2D} canvasContext
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} frequencyData
 * @param {number} sampleRate
 * @param {number} minFrequency
 * @param {number} maxFrequency
 * @param {{frequencyScale?: FrequencyScale}} [options]
 */
export function drawFrequencyDomainViz(
  canvasContext,
  x,
  y,
  width,
  height,
  frequencyData,
  sampleRate,
  minFrequency,
  maxFrequency,
  options = {},
) {
  let frequencyScale = options.frequencyScale ?? "linear";
  let plotX = x + AXIS_PADDING_LEFT;
  let plotY = y + AXIS_PADDING_TOP;
  let plotWidth = width - AXIS_PADDING_LEFT - AXIS_PADDING_RIGHT;
  let plotHeight = height - AXIS_PADDING_TOP - AXIS_PADDING_BOTTOM;
  let maxAvailableFrequency = sampleRate / 2;
  let windowMinFrequency = Math.min(minFrequency, maxAvailableFrequency);
  let windowMaxFrequency = Math.min(maxFrequency, maxAvailableFrequency);
  let bucketWidth = sampleRate / 2 / frequencyData.length;
  if (frequencyScale === "log") {
    windowMinFrequency = Math.max(windowMinFrequency, bucketWidth / 2);
  }
  let startIndex = Math.max(0, Math.floor(windowMinFrequency / bucketWidth - 0.5));
  let endIndex = Math.min(frequencyData.length - 1, Math.ceil(windowMaxFrequency / bucketWidth - 0.5));
  let visibleBinCount = endIndex - startIndex + 1;
  let barWidth = plotWidth / visibleBinCount;

  drawAxes(
    canvasContext,
    plotX,
    plotY,
    plotWidth,
    plotHeight,
    getFrequencyTicks(
      frequencyData.length,
      sampleRate,
      windowMinFrequency,
      windowMaxFrequency,
      frequencyScale,
    ),
  );

  for (let i = startIndex; i <= endIndex; i++) {
    let barHeight = (frequencyData[i] / 255) * plotHeight;
    let barX = plotX + (i - startIndex) * barWidth;
    let drawnBarWidth = Math.max(1, barWidth - 1);

    if (frequencyScale === "log") {
      let binMinFrequency = Math.max(i * bucketWidth, windowMinFrequency);
      let binMaxFrequency = Math.min((i + 1) * bucketWidth, windowMaxFrequency);
      let binStartRatio = getLogFrequencyRatio(binMinFrequency, windowMinFrequency, windowMaxFrequency);
      let binEndRatio = getLogFrequencyRatio(binMaxFrequency, windowMinFrequency, windowMaxFrequency);

      barX = plotX + binStartRatio * plotWidth;
      drawnBarWidth = Math.max(1, (binEndRatio - binStartRatio) * plotWidth - 1);
    }

    canvasContext.fillStyle = CYAN;
    canvasContext.fillRect(
      barX,
      plotY + plotHeight - barHeight,
      drawnBarWidth,
      barHeight,
    );
  }
}
