import { CYAN, WHITE } from "./util/colors.js";

const AXIS_PADDING_LEFT = 44;
const AXIS_PADDING_RIGHT = 12;
const AXIS_PADDING_TOP = 12;
const AXIS_PADDING_BOTTOM = 36;
const AXIS_LABEL_FONT = "12px sans-serif";
const AXIS_COLOR = WHITE;

/**
 * @param {CanvasRenderingContext2D} canvasContext
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
function drawAxes(canvasContext, x, y, width, height) {
  canvasContext.strokeStyle = AXIS_COLOR;
  canvasContext.fillStyle = AXIS_COLOR;
  canvasContext.lineWidth = 1;
  canvasContext.font = AXIS_LABEL_FONT;
  canvasContext.textBaseline = "middle";

  canvasContext.beginPath();
  canvasContext.moveTo(x, y);
  canvasContext.lineTo(x, y + height);
  canvasContext.lineTo(x + width, y + height);
  canvasContext.stroke();

  canvasContext.textAlign = "center";
  canvasContext.fillText("Time", x + width / 2, y + height + 24);

  canvasContext.save();
  canvasContext.translate(x - 32, y + height / 2);
  canvasContext.rotate(-Math.PI / 2);
  canvasContext.fillText("Amplitude", 0, 0);
  canvasContext.restore();
}

/**
 * @param {CanvasRenderingContext2D} canvasContext
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} timeDomainData
 */
export function drawTimeDomainViz(canvasContext, x, y, width, height, timeDomainData) {
  let plotX = x + AXIS_PADDING_LEFT;
  let plotY = y + AXIS_PADDING_TOP;
  let plotWidth = width - AXIS_PADDING_LEFT - AXIS_PADDING_RIGHT;
  let plotHeight = height - AXIS_PADDING_TOP - AXIS_PADDING_BOTTOM;

  drawAxes(canvasContext, plotX, plotY, plotWidth, plotHeight);

  canvasContext.strokeStyle = CYAN;
  canvasContext.lineWidth = 2;
  canvasContext.beginPath();

  for (let i = 0; i < timeDomainData.length; i++) {
    let dataX = timeDomainData.length === 1 ? 0 : i / (timeDomainData.length - 1);
    let dataY = timeDomainData[i] / 255;
    let pointX = plotX + dataX * plotWidth;
    let pointY = plotY + dataY * plotHeight;

    if (i === 0) {
      canvasContext.moveTo(pointX, pointY);
    } else {
      canvasContext.lineTo(pointX, pointY);
    }
  }

  canvasContext.stroke();
}
