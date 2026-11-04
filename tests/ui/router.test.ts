import { route, match } from '../../src/ui/router';

const a = () => {}; const b = () => {};
route('/', a);
route('/report/:id', b);

test('корень', () => expect(match('#/')?.render).toBe(a));
test('параметр маршрута', () => expect(match('#/report/abc%20d')).toEqual({ render: b, params: ['abc d'] }));
test('неизвестный маршрут → null', () => expect(match('#/nope/1/2')).toBeNull());
