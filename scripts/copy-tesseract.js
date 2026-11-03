// Copies the OCR worker, engine and English data into public/ so no OCR file comes from a CDN
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const OUTPUT_FOLDER = path.join(import.meta.dirname, '..', 'public', 'tesseract');

// Tesseract.js 7 picks one of these for each browser and engine mode, so all six are served
const CORE_VARIANTS = [
  'tesseract-core.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

function stop(message) {
  console.error(`Could not copy the OCR files: ${message}`);
  process.exit(1);
}

function packageFolder(require, name) {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    stop(`the package ${name} is not installed. Run npm install.`);
  }
}

function isCoreFile(file) {
  if (file.endsWith('.wasm')) return true;
  return file.startsWith('tesseract-core') && file.endsWith('.wasm.js');
}

function copyInto(file, folder) {
  if (!existsSync(file)) stop(`${file} is missing.`);
  mkdirSync(folder, { recursive: true });
  copyFileSync(file, path.join(folder, path.basename(file)));
}

const require = createRequire(import.meta.url);
const tesseractFolder = packageFolder(require, 'tesseract.js');
// Resolved from tesseract.js, so this is the core copy it really loads
const requireFromTesseract = createRequire(path.join(tesseractFolder, 'package.json'));
const coreFolder = packageFolder(requireFromTesseract, 'tesseract.js-core');
const languageFolder = packageFolder(require, '@tesseract.js-data/eng');

copyInto(path.join(tesseractFolder, 'dist', 'worker.min.js'), OUTPUT_FOLDER);

const coreFiles = readdirSync(coreFolder).filter(isCoreFile);
for (const variant of CORE_VARIANTS) {
  if (!coreFiles.includes(variant)) stop(`${variant} is missing from tesseract.js-core.`);
}
for (const file of coreFiles) {
  copyInto(path.join(coreFolder, file), path.join(OUTPUT_FOLDER, 'core'));
}

// The LSTM only data, which matches createWorker('eng', 1)
copyInto(
  path.join(languageFolder, '4.0.0_best_int', 'eng.traineddata.gz'),
  path.join(OUTPUT_FOLDER, 'lang'),
);

console.log(`OCR files copied: 1 worker, ${coreFiles.length} core, 1 language.`);
