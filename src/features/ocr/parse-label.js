// FR8 CIR4 Turn the text read from a label into draft fields that the patient checks

// A field under this mean word confidence is marked for checking; the OCR experiment will test it
export const CHECK_BELOW_CONFIDENCE = 70;

// The name is looked for in this many lines at the top of the label
const NAME_LINES = 3;

const NOTES_MAX_LENGTH = 500;

// 500 mg, 0.5mg, 5 mL, 1,000 IU or 2.5%; the % sign needs no word boundary after it
const DOSE_PATTERN = /\b\d+(?:[.,]\d+)?\s?(?:(?:mg|mcg|µg|g|ml|mL|IU)\b|%)/i;

export function parseLabel({ text, blocks } = {}) {
  const lines = blocks?.length ? linesFromBlocks(blocks) : linesFromText(text);
  const dose = findDose(lines);
  const nameLine = findNameLine(lines, dose);

  const name = nameLine ? nameLine.text : '';
  const dosage = dose ? dose.text : '';
  const otherLines = lines.filter((line) => line !== nameLine).map((line) => line.text);
  const notes = otherLines.join('\n').slice(0, NOTES_MAX_LENGTH).trim();

  return {
    name,
    dosage,
    notes,
    check: {
      name: needsCheck(name, nameLine ? meanConfidence(nameLine.words) : null),
      dosage: needsCheck(dosage, dose ? dose.confidence : null),
    },
  };
}

// Text alone has no confidence, so its lines carry no words
function linesFromText(text) {
  const lines = [];
  for (const textLine of (text ?? '').split('\n')) {
    const lineText = textLine.trim();
    if (lineText !== '') lines.push({ text: lineText, words: [] });
  }
  return lines;
}

// The line text is rebuilt from its words, so each word's place in the line is known
function linesFromBlocks(blocks) {
  const lines = [];
  for (const block of blocks) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const lineText = line.words.map((word) => word.text).join(' ');
        if (lineText.trim() !== '') lines.push({ text: lineText, words: line.words });
      }
    }
  }
  return lines;
}

// The first dose on the label, kept exactly as printed (DR2)
function findDose(lines) {
  const lineIndex = lines.findIndex((line) => DOSE_PATTERN.test(line.text));
  if (lineIndex === -1) return null;

  const line = lines[lineIndex];
  const match = line.text.match(DOSE_PATTERN);
  const words = wordsInside(line.words, match.index, match.index + match[0].length);
  return { text: match[0], lineIndex, confidence: meanConfidence(words) };
}

// The words that overlap the dose, such as 500 and mg; words are joined by one space
function wordsInside(words, start, end) {
  const inside = [];
  let wordStart = 0;
  for (const word of words) {
    const wordEnd = wordStart + word.text.length;
    if (wordStart < end && wordEnd > start) inside.push(word);
    wordStart = wordEnd + 1;
  }
  return inside;
}

// The name is printed above the dose, so only the first lines before it are looked at
function findNameLine(lines, dose) {
  const lastLine = dose ? Math.min(dose.lineIndex, NAME_LINES) : NAME_LINES;
  const candidates = lines.slice(0, lastLine).filter(isMostlyLetters);
  let best = null;
  for (const line of candidates) {
    if (!best || isBetterName(line, best)) best = line;
  }
  return best;
}

// More than half of the characters, spaces aside, are letters
function isMostlyLetters(line) {
  const letters = line.text.match(/\p{L}/gu) ?? [];
  const characters = line.text.replace(/\s/g, '');
  return letters.length * 2 > characters.length;
}

// With word confidence the surest line wins; with text alone the longest line wins
function isBetterName(line, best) {
  if (line.words.length > 0) return meanConfidence(line.words) > meanConfidence(best.words);
  return line.text.length > best.text.length;
}

function meanConfidence(words) {
  if (words.length === 0) return null;
  let total = 0;
  for (const word of words) total += word.confidence;
  return total / words.length;
}

// An empty field, or one read with unknown or low confidence, is marked for checking (DR3)
function needsCheck(value, confidence) {
  if (value === '') return true;
  if (confidence === null) return true;
  return confidence < CHECK_BELOW_CONFIDENCE;
}
