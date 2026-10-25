import { describe, expect, it } from 'vitest';
import { areaOf, summarise } from '../src/mot-times-calc.js';

describe('quiet times for an MOT', () => {
  it('takes the area letters from a postcode, a district or an area', () => {
    expect(areaOf('bn1 1aa')).toBe('BN');
    expect(areaOf('SW1A')).toBe('SW');
    expect(areaOf('G')).toBe('G');
    expect(areaOf('m1 1ae')).toBe('M');
    expect(areaOf('123')).toBeNull();
    expect(areaOf('ABC')).toBeNull();
  });

  it('finds the busiest slot and the quietest weekday slot among open hours', () => {
    const grid = new Array(7 * 24).fill(0);
    const set = (d, h, v) => (grid[d * 24 + h] = v);
    for (let d = 0; d < 6; d++) for (let h = 9; h < 17; h++) set(d, h, 100);
    set(1, 10, 300); // Tuesday 10:00 is busiest
    set(4, 16, 30); // Friday 16:00 is quietest
    set(5, 9, 10); // Saturday is quieter still, but isn't a weekday
    set(2, 3, 1); // a stray 3am test isn't an "open" hour
    const month = [5, 4, 9, 3, 3, 3, 3, 3, 8, 3, 3, 1];
    const s = summarise({ grid, month });
    expect(s.open).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(s.busiest).toMatchObject({ d: 1, h: 10 });
    expect(s.quietest).toMatchObject({ d: 4, h: 16 });
    expect(s.busiestDay.name).toBe('Tuesday');
    expect(s.quietestWeekday.name).toBe('Friday');
    expect(s.busiestMonth.name).toBe('March');
    expect(s.quietestMonth.name).toBe('December');
  });
});
