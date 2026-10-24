import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { processCsv } from '../pipeline/run.js';
import { SchemaError } from '../pipeline/validate.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/mini_VEH0120_UK.csv', import.meta.url));
const HEADER = 'BodyType,Make,GenModel,Model,Fuel,LicenceStatus,2015 Q2,2015 Q1,2014 Q4,2014 Q3';

const fromText = (text) => Readable.from([text]);

describe('processCsv', () => {
  it('slices the fixture end to end', async () => {
    const { index, files, meta, warnings } = await processCsv(createReadStream(FIXTURE), { minRows: 1 });

    expect(meta).toEqual({ latestQuarter: '2015 Q2', firstQuarter: '2014 Q3', rowCount: 10, modelFiles: 5 });
    expect(warnings).toEqual([]);
    expect(index.makes.map((m) => m.name)).toEqual(['FORD', 'LYNK & CO', 'MERCEDES-BENZ']);
    expect(files.map((f) => f.path)).toEqual([
      'models/ford/ford-fiesta.json',
      'models/ford/ford-focus.json',
      'models/ford/ford-ka.json',
      'models/lynk-and-co/lynk-and-co-01.json',
      'models/mercedes-benz/mercedes-benz-a-class.json',
    ]);
  });

  it('keeps SORN counts alongside licensed ones', async () => {
    const { files } = await processCsv(createReadStream(FIXTURE), { minRows: 1 });
    const fiesta = files.find((f) => f.data.genModel === 'FORD FIESTA');
    const zetec = fiesta.data.variants.find((v) => v.model === 'FIESTA ZETEC' && v.fuel === 'Petrol');
    expect(zetec.sorn).toEqual({ from: 0, values: [1, 1, 1, 1] });
  });

  it('keeps quoted model names intact', async () => {
    const { files } = await processCsv(createReadStream(FIXTURE), { minRows: 1 });
    const merc = files.find((f) => f.data.make === 'MERCEDES-BENZ');
    expect(merc.data.variants[0].model).toBe('A 180 "SPORT"');
  });

  it('handles CRLF line endings like the real file', async () => {
    const csv = `${HEADER}\r\nCars,FORD,FORD KA,KA,Petrol,Licensed,1,2,3,4\r\n`;
    const { files } = await processCsv(fromText(csv), { minRows: 1 });
    expect(files[0].data.variants[0].licensed.values).toEqual([4, 3, 2, 1]);
  });

  it('lists every bad row with its line number', async () => {
    const csv = [
      HEADER,
      'Cars,FORD,FORD KA,KA,Petrol,Licensed,1,2,3,4',
      'Cars,FORD,FORD KA,KA,Petrol,Scrapped,1,2,3,4',
      'Cars,FORD,FORD KA,KA,Petrol,Licensed,1,-2,3',
    ].join('\n');

    const err = await processCsv(fromText(csv), { minRows: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(SchemaError);
    expect(err.problems).toEqual([
      'line 3: unknown LicenceStatus "Scrapped"',
      'line 4: has 9 cells, expected 10',
    ]);
  });

  it('fails on a changed header before reading any rows', async () => {
    const csv = `${HEADER.replace('GenModel', 'Range')}\nCars,FORD,FORD KA,KA,Petrol,Licensed,1,2,3,4`;
    await expect(processCsv(fromText(csv), { minRows: 1 })).rejects.toThrow('found "Range"');
  });

  it('fails on an empty file', async () => {
    await expect(processCsv(fromText(''), { minRows: 1 })).rejects.toThrow('file is empty');
  });

  it('collects new fuel types as warnings', async () => {
    const csv = `${HEADER}\nCars,FORD,FORD KA,KA,Ammonia,Licensed,1,2,3,4`;
    const { warnings } = await processCsv(fromText(csv), { minRows: 1 });
    expect(warnings).toEqual(['new fuel type "Ammonia" (1 rows)']);
  });
});
