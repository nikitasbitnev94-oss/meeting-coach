import { reasonOf } from '../../src/capture/source';

test('причины ошибок getUserMedia', () => {
  expect(reasonOf({ name: 'NotAllowedError' })).toBe('denied');
  expect(reasonOf({ name: 'NotReadableError' })).toBe('busy');
  expect(reasonOf({ name: 'NotFoundError' })).toBe('missing');
  expect(reasonOf(new Error('x'))).toBeNull();
});
