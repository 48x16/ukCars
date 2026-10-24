// Reads entries out of a zip file on disk without unpacking it. DVSA's MOT zips are several
// gigabytes (zip64), so entries are streamed straight from the file.

import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX32 = 0xffffffff;

const u64 = (buf, at) => Number(buf.readBigUInt64LE(at));

async function readAt(file, position, length) {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await file.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

/** Where the central directory is, from the end-of-central-directory record (zip64 aware). */
async function directory(file, size) {
  const tailLength = Math.min(size, 65_557); // 22-byte record plus the longest possible comment
  const tail = await readAt(file, size - tailLength, tailLength);
  let at = tail.length - 22;
  while (at >= 0 && tail.readUInt32LE(at) !== EOCD) at--;
  if (at < 0) throw new Error('Not a zip file: no end of central directory');

  let count = tail.readUInt16LE(at + 10);
  let length = tail.readUInt32LE(at + 12);
  let offset = tail.readUInt32LE(at + 16);
  if (offset === MAX32 || length === MAX32 || count === 0xffff) {
    if (tail.readUInt32LE(at - 20) !== ZIP64_LOCATOR) throw new Error('Zip64 locator missing');
    const record = await readAt(file, u64(tail, at - 20 + 8), 56);
    if (record.readUInt32LE(0) !== ZIP64_EOCD) throw new Error('Zip64 end of central directory missing');
    count = u64(record, 32);
    length = u64(record, 40);
    offset = u64(record, 48);
  }
  return { count, length, offset };
}

/** Lists a zip's entries: name, compression method, sizes and where the entry starts. */
export async function listEntries(path) {
  const file = await open(path);
  try {
    const { size } = await file.stat();
    const dir = await directory(file, size);
    const buf = await readAt(file, dir.offset, dir.length);
    const entries = [];
    let at = 0;
    for (let i = 0; i < dir.count; i++) {
      if (buf.readUInt32LE(at) !== CENTRAL) throw new Error('Corrupt zip central directory');
      const nameLength = buf.readUInt16LE(at + 28);
      const extraLength = buf.readUInt16LE(at + 30);
      const commentLength = buf.readUInt16LE(at + 32);
      const entry = {
        name: buf.toString('utf8', at + 46, at + 46 + nameLength),
        method: buf.readUInt16LE(at + 10),
        compressedSize: buf.readUInt32LE(at + 20),
        size: buf.readUInt32LE(at + 24),
        headerOffset: buf.readUInt32LE(at + 42),
      };
      // Zip64 extra field: 64-bit values, present only for the fields that are maxed out above.
      let x = at + 46 + nameLength;
      const extraEnd = x + extraLength;
      while (x + 4 <= extraEnd) {
        const id = buf.readUInt16LE(x);
        const length = buf.readUInt16LE(x + 2);
        if (id === 0x0001) {
          let v = x + 4;
          for (const key of ['size', 'compressedSize', 'headerOffset']) {
            if (entry[key] === MAX32) {
              entry[key] = u64(buf, v);
              v += 8;
            }
          }
        }
        x += 4 + length;
      }
      entries.push(entry);
      at = extraEnd + commentLength;
    }
    return entries;
  } finally {
    await file.close();
  }
}

/** A readable stream of one entry's uncompressed bytes. */
export async function openEntry(path, entry) {
  const file = await open(path);
  let header;
  try {
    header = await readAt(file, entry.headerOffset, 30);
  } finally {
    await file.close();
  }
  if (header.readUInt32LE(0) !== LOCAL) throw new Error(`Corrupt zip entry ${entry.name}`);
  const start = entry.headerOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  if (entry.compressedSize === 0) return Readable.from([]);
  const raw = createReadStream(path, { start, end: start + entry.compressedSize - 1, highWaterMark: 1 << 20 });
  if (entry.method === 0) return raw;
  if (entry.method === 8) return raw.pipe(createInflateRaw());
  throw new Error(`Unsupported compression method ${entry.method} in ${entry.name}`);
}
