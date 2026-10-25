import { describe, expect, it } from 'vitest';
import { createFaultCounter, faultLookup } from '../pipeline/mot-faults.js';

const groups = [
  'test_item_id|test_class_id|parent_id|test_item_set_section_id|item_name',
  '0|4|0|0|Vehicle',
  '5430|4|0|5430|Brakes',
  '20003|4|0|20003|BRAKES', // the current scheme's section: the same, by name
  '20449|4|0|20449|Tyres',
  '20449|1|0|20449|Tyres', // a motorbike section: left out
].join('\n');
const details = [
  'rfr_id|test_class_id|test_item_id|minor_item|rfr_deficiency_category|rfr_desc|rfr_loc_marker|rfr_insp_manual_desc|rfr_advisory_text|test_item_set_section_id',
  '100|4|1|N|Major|worn|N|a brake pad worn below 1.5mm||20003',
  '101|4|1|N|Pre-EU Directive|out of balance|N|||5430',
  '102|4|2|N|Major|worn|N|a brake pad worn below 1.5mm||20003', // the same words, another axle
  '200|4|1|N|Major|tread depth|N|tread depth below 1.6mm||20449',
].join('\n');

const RESULT_HEAD = ['test_id', 'test_class_id', 'test_type', 'test_result', 'make', 'model', 'fuel_type', 'first_use_date', 'test_date'];
const result = (id, outcome, { model = 'FIESTA', fuel = 'PE', firstUse = '2015-01-01', cls = '4', type = 'NT' } = {}) => [String(id), cls, type, outcome, 'FORD', model, fuel, firstUse, '2025-06-01'];
const item = (id, reason, type = 'F') => [String(id), String(reason), type, '1', '', '2025-06-01T10:00:00.000Z'];

describe('MOT failure reasons', () => {
  it('reads car reasons, merging old and new sections of the same name, with readable text', () => {
    const lookup = faultLookup(details, groups);
    expect(lookup.sections.map((s) => s.label)).toEqual(['Brakes', 'Tyres']);
    expect(lookup.reasons.get(100)).toEqual({ section: 0, text: 'A brake pad worn below 1.5mm' });
    expect(lookup.reasons.get(101)).toEqual({ section: 0, text: 'Out of balance' }); // falls back to the short description
    expect(lookup.reasons.get(200).section).toBe(1);
  });

  it('ticks each failed first test’s sections once, by model, age band and fuel', () => {
    const counter = createFaultCounter(faultLookup(details, groups));
    counter.results.header(RESULT_HEAD);
    counter.results.row(result(3_000_000_000, 'F')); // a big id: still fits
    counter.results.row(result(5, 'PRS', { fuel: 'EL', firstUse: '2005-01-01' }));
    counter.results.row(result(7, 'P'));
    counter.results.row(result(9, 'F', { type: 'RT' })); // a retest: left out
    counter.results.row(result(11, 'F', { cls: '1' })); // a motorbike: left out
    counter.results.row(result(13, 'F', { firstUse: '2024-01-01' })); // under three: left out
    counter.sortTests();
    counter.items.header(['test_id', 'rfr_id', 'rfr_type_code', 'mot_test_rfr_location_type_id', 'dangerous_mark', 'completed_date']);
    counter.items.row(item(3_000_000_000, 100));
    counter.items.row(item(3_000_000_000, 101)); // the same section again: counted once
    counter.items.row(item(3_000_000_000, 200));
    counter.items.row(item(5, 200, 'P'));
    counter.items.row(item(5, 100, 'A')); // an advisory: not a failure
    counter.items.row(item(9, 100)); // the retest
    counter.items.row(item(5, 102)); // same fault as 100, in other words
    counter.items.row(item(5, 999)); // a reason the lookup doesn't know
    const r = counter.result();
    expect(r.tests).toEqual({ all: 3, failed: 2, withReasons: 2 });
    expect(r.national).toEqual([2, 2]);
    expect(r.bands.map((b) => b.counts)).toEqual([[0, 0], [0, 0], [1, 1], [1, 1]]);
    expect(r.fuels.find((f) => f.id === 'electric').counts).toEqual([1, 1]);
    expect(r.rows).toMatchObject({ read: 8, failing: 7, matched: 5, unknownReason: 1 }); // the retest's item fails, but isn't a first test
    // Commonest first (the two at 2 can come in either order).
    expect(r.defects.map((d) => d.count)).toEqual([2, 2, 1]);
    expect(r.defects.find((d) => d.text === 'A brake pad worn below 1.5mm').ids).toEqual([100, 102]);
    expect(r.defects.find((d) => d.ids.includes(200)).count).toBe(2);
    expect(r.models).toEqual([]); // under 100 tests: too few to keep
  });

  it('names missing columns', () => {
    const counter = createFaultCounter(faultLookup(details, groups));
    expect(() => counter.results.header(['test_id'])).toThrow(/missing columns: test_class_id/);
  });
});
