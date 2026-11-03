// FR7 CIR3 Read the label in the browser, so the image never leaves the device

// Served from public/tesseract by scripts/copy-tesseract.js, so nothing loads from a CDN
const ASSETS = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core', // a folder, so Tesseract.js picks the build this browser supports
  langPath: '/tesseract/lang',
};

export async function recognizeLabel(image, onProgress) {
  // Loaded here, so it only ever runs in the browser
  const { createWorker } = await import('tesseract.js');

  // createWorker never settles if the language data fails, so its error handler ends the wait
  let stopWaiting;
  const workerFailed = new Promise((resolve, reject) => {
    stopWaiting = reject;
  });

  // Engine 1 is LSTM only, which matches the copied 4.0.0_best_int English data
  const worker = await Promise.race([
    createWorker('eng', 1, {
      ...ASSETS,
      logger: (message) => {
        if (message.status === 'recognizing text') onProgress?.(message.progress);
      },
      errorHandler: (error) => stopWaiting(new Error(String(error))),
    }),
    workerFailed,
  ]);
  try {
    // Blocks hold each word's confidence, which marks the fields to check
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    return data;
  } finally {
    await worker.terminate();
  }
}
