const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

test(
  'stores a 1 GiB sparse media file as a streaming ZIP with bounded RSS',
  { timeout: 180000 },
  async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'bsap-zip-'));
    const size = 1024 * 1024 * 1024;

    try {
      const path = join(root, 'large.mp4');
      const handle = await fs.open(path, 'w');

      await handle.truncate(size);
      await handle.close();

      const { ZipArchive } = await import('archiver');
      const archive = new ZipArchive({ store: true });
      const baseline = process.memoryUsage().rss;
      let peak = baseline;
      let bytes = 0;
      let tail = Buffer.alloc(0);
      const sink = new Writable({
        write(chunk, encoding, done) {
          bytes += chunk.length;
          tail = Buffer.concat([tail, chunk]).subarray(-256);
          peak = Math.max(peak, process.memoryUsage().rss);
          done();
        },
      });
      const streaming = pipeline(archive, sink);

      archive.file(path, { name: 'large.mp4' });

      await archive.finalize();
      await streaming;

      assert.ok(bytes > size && bytes < size + 1024);
      assert.equal(tail.readUInt32LE(tail.length - 22), 0x06054b50);

      const central = tail.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));

      assert.ok(central >= 0);
      assert.equal(tail.readUInt16LE(central + 10), 0);
      assert.equal(tail.readUInt32LE(central + 24), size);
      assert.ok(
        peak - baseline < 256 * 1024 * 1024,
        `RSS grew by ${peak - baseline}`,
      );

      console.log(`ZIP bytes=${bytes}; RSS growth=${peak - baseline}`);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);
