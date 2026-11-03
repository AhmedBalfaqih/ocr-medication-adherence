import { expect, test } from 'vitest';
import { HttpError, parseId } from '@/lib/http';

test('a positive whole number id is read as a number', () => {
  expect(parseId('42')).toBe(42);
  expect(parseId('2147483647')).toBe(2147483647);
});

test('a bad id is treated as not found', () => {
  for (const value of ['abc', '0', '-1', '1.5', '', undefined, '2147483648']) {
    expect(() => parseId(value)).toThrow(HttpError);
    expect(() => parseId(value)).toThrow(
      expect.objectContaining({ status: 404, code: 'NOT_FOUND' }),
    );
  }
});
