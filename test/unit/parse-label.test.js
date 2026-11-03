import { expect, test } from 'vitest';
import { CHECK_BELOW_CONFIDENCE, parseLabel } from '@/features/ocr/parse-label';

// Made up label text only; never a real product photo or a real person's data
const LABEL = 'VITAMEDOL\nTablets 500 mg\nTake as directed';
const SURE = 95;
const UNSURE = CHECK_BELOW_CONFIDENCE - 1;

// Tesseract style blocks from lines of [word, confidence] pairs
function blocksFrom(lines) {
  const tesseractLines = lines.map((words) => ({
    text: `${words.map(([text]) => text).join(' ')}\n`,
    words: words.map(([text, confidence]) => ({ text, confidence })),
  }));
  return [{ paragraphs: [{ lines: tesseractLines }] }];
}

test('a dose is found in each common form, at the end or in the middle of a line', () => {
  for (const dose of ['500 mg', '0.5mg', '5 mL', '1,000 IU', '2.5%']) {
    expect(parseLabel({ text: `VITAMEDOL\nStrength ${dose}` }).dosage).toBe(dose);
    expect(parseLabel({ text: `VITAMEDOL\n${dose} in each dose` }).dosage).toBe(dose);
  }
});

test('the first dose is kept exactly as printed', () => {
  expect(parseLabel({ text: 'VITAMEDOL\nEach tablet 0,5 MG' }).dosage).toBe('0,5 MG');
  expect(parseLabel({ text: 'VITAMEDOL\nCapsules 1,000 IU' }).dosage).toBe('1,000 IU');
  expect(parseLabel({ text: `${LABEL}\nNo more than 4 g a day` }).dosage).toBe('500 mg');
});

test('a label with no dose leaves the dose empty and marked for checking', () => {
  const result = parseLabel({ text: 'VITAMEDOL\nTake with 2 glasses of water\nBatch 7741' });
  expect(result.dosage).toBe('');
  expect(result.check.dosage).toBe(true);
});

test('the name is the longest line of letters above the dose', () => {
  const result = parseLabel({
    text: '| 2 4 |\nRx\nVITAMEDOL FORTE\nTablets 500 mg\nTake as directed with food',
  });
  expect(result.name).toBe('VITAMEDOL FORTE');

  const longInstruction = parseLabel({
    text: 'VITAMEDOL\nTablets 500 mg\nTake as directed by your pharmacist',
  });
  expect(longInstruction.name).toBe('VITAMEDOL');
});

test('notes hold the other lines but not the name', () => {
  expect(parseLabel({ text: LABEL }).notes).toBe('Tablets 500 mg\nTake as directed');
});

test('notes are capped at 500 characters', () => {
  const warning = 'Keep out of reach of children. '.repeat(30);
  const result = parseLabel({ text: `${LABEL}\n${warning}` });
  expect(result.notes.length).toBeLessThanOrEqual(500);
  expect(result.notes.startsWith('Tablets 500 mg\nTake as directed\nKeep out of reach')).toBe(true);
});

test('sure words leave both fields unmarked', () => {
  const blocks = blocksFrom([
    [['VITAMEDOL', SURE]],
    [
      ['Tablets', SURE],
      ['500', SURE],
      ['mg', SURE],
    ],
  ]);
  const result = parseLabel({ text: LABEL, blocks });
  expect(result.name).toBe('VITAMEDOL');
  expect(result.dosage).toBe('500 mg');
  expect(result.check).toEqual({ name: false, dosage: false });
});

test('unsure words mark the name and the dose for checking', () => {
  const blocks = blocksFrom([
    [['VITAMEDOL', UNSURE]],
    [
      ['Tablets', SURE],
      ['500', UNSURE],
      ['mg', UNSURE],
    ],
  ]);
  expect(parseLabel({ text: LABEL, blocks }).check).toEqual({ name: true, dosage: true });
});

test('a confidence right at the threshold is not marked', () => {
  const blocks = blocksFrom([
    [['VITAMEDOL', CHECK_BELOW_CONFIDENCE]],
    [
      ['500', CHECK_BELOW_CONFIDENCE],
      ['mg', CHECK_BELOW_CONFIDENCE],
    ],
  ]);
  expect(parseLabel({ text: LABEL, blocks }).check).toEqual({ name: false, dosage: false });
});

test('only the words of the dose decide whether it is marked', () => {
  const sureDose = blocksFrom([
    [['VITAMEDOL', SURE]],
    [
      ['Tablets', 0],
      ['500', SURE],
      ['mg', SURE],
    ],
  ]);
  expect(parseLabel({ text: LABEL, blocks: sureDose }).check.dosage).toBe(false);

  const unsureDose = blocksFrom([
    [['VITAMEDOL', SURE]],
    [
      ['Tablets', SURE],
      ['500', UNSURE],
      ['mg', UNSURE],
    ],
  ]);
  expect(parseLabel({ text: LABEL, blocks: unsureDose }).check.dosage).toBe(true);
});

test('with blocks the name is the surest line of letters above the dose', () => {
  const blocks = blocksFrom([
    [['VITAMEDOL', SURE]],
    [
      ['Paracetamol', UNSURE],
      ['tablets', UNSURE],
    ],
    [
      ['500', SURE],
      ['mg', SURE],
    ],
  ]);
  expect(parseLabel({ text: '', blocks }).name).toBe('VITAMEDOL');
});

test('text without blocks fills the fields and marks both for checking', () => {
  for (const blocks of [undefined, null]) {
    expect(parseLabel({ text: LABEL, blocks })).toEqual({
      name: 'VITAMEDOL',
      dosage: '500 mg',
      notes: 'Tablets 500 mg\nTake as directed',
      check: { name: true, dosage: true },
    });
  }
});

test('empty text gives empty fields that are marked for checking', () => {
  for (const data of [{ text: '' }, { text: '  \n \n' }, { text: '', blocks: [] }, {}]) {
    expect(parseLabel(data)).toEqual({
      name: '',
      dosage: '',
      notes: '',
      check: { name: true, dosage: true },
    });
  }
});
