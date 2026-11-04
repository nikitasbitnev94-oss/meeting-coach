import { errorText } from '../../src/ui/diag';
import { SourceError } from '../../src/capture/source';

test('текст ошибки занятой камеры', () => {
  expect(errorText(new SourceError('busy'))).toBe('Камера занята другой программой. Откройте встречу в этом же браузере.');
});
test('прочие ошибки — их сообщение', () => expect(errorText(new Error('сбой'))).toBe('сбой'));
