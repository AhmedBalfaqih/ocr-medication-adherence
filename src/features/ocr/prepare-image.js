// FR7 Turn a camera frame or a photo into a clear gray picture for reading

// Small pictures are scaled up until the shorter side reaches this, as Tesseract likes large text
const MIN_SHORT_SIDE = 1000;
// Larger pictures only slow the reading down, so the longer side stops here
const MAX_LONG_SIDE = 2000;
// A white margin helps Tesseract find text that runs to the edge
const BORDER = 10;

export function prepareImage(source) {
  const { width, height } = sourceSize(source);
  if (!width || !height) throw new Error('The picture is not ready yet. Please try again.');

  const scale = scaleFor(width, height);
  const drawWidth = Math.round(width * scale);
  const drawHeight = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = drawWidth + BORDER * 2;
  canvas.height = drawHeight + BORDER * 2;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, BORDER, BORDER, drawWidth, drawHeight);
  makeGray(context, canvas.width, canvas.height);
  return canvas;
}

// A video and an image name their pixel size differently
function sourceSize(source) {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return { width: source.naturalWidth, height: source.naturalHeight };
}

// The cap on the longer side wins, so a long thin picture never becomes huge
function scaleFor(width, height) {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  let scale = 1;
  if (shortSide < MIN_SHORT_SIDE) scale = MIN_SHORT_SIDE / shortSide;
  if (longSide * scale > MAX_LONG_SIDE) scale = MAX_LONG_SIDE / longSide;
  return scale;
}

// Each pixel becomes its brightness, with the usual weights for red, green and blue
function makeGray(context, width, height) {
  const picture = context.getImageData(0, 0, width, height);
  const pixels = picture.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
    pixels[index] = gray;
    pixels[index + 1] = gray;
    pixels[index + 2] = gray;
  }
  context.putImageData(picture, 0, 0);
}
