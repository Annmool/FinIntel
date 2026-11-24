import { calculateMA, calculateRSI } from './indicators';

test('RSI needs 15 usable closes and treats a valid flat window as neutral', () => {
  const flat = Array.from({ length: 15 }, () => ({ close: '100' }));
  expect(calculateRSI(flat)).toBe('50.00');
  expect(calculateRSI(flat.slice(1))).toBeNull();
  flat[7] = { close: '100oops' };
  expect(calculateRSI(flat)).toBeNull();
});

test('the 20-period average starts at the twentieth candle and includes its close', () => {
  const candles = Array.from({ length: 21 }, (_, index) => ({ time: index + 1, close: index + 1 }));
  expect(calculateMA(candles.slice(0, 19))).toEqual([]);
  expect(calculateMA(candles)).toEqual([{ time: 20, value: 10.5 }, { time: 21, value: 11.5 }]);
});
