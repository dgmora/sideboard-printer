// Run with: node pdf.test.js
const assert = require('node:assert/strict');
const { inflateSync } = require('node:zlib');
const { guideSize, pageFor, pdfPlacement, buildPDF, dropAlpha, deflate } = require('./pdf.js');
const { EXAMPLE_SHEET, parseData, buildPivot, layoutCard, generateCardSVG } = require('./guide.js');

const svgFor = sheet => generateCardSVG(layoutCard('DnT', buildPivot(parseData(sheet), '')));
const placementOf = sheet => {
  const size = guideSize(svgFor(sheet));
  const page = pageFor(size);
  return { page, ...Object.fromEntries(Object.entries(pdfPlacement(page, size)).map(([key, mm]) => [key, +mm.toFixed(2)])) };
};
const portrait = { width: 210, height: 279.4 };
const landscape = { width: 279.4, height: 210 };

assert.deepEqual(placementOf('md,sb,Card,Elves\n4,,Island,-1'), { page: portrait, x: 73, y: 95, width: 64, height: 89.4 });
assert.deepEqual(placementOf(EXAMPLE_SHEET), { page: portrait, x: 41, y: 95, width: 128, height: 89.4 });
assert.deepEqual(placementOf('md,sb,Card,A,,B,,C\n4,,Island,-1,,-1,,-1'), { page: portrait, x: 9, y: 95, width: 192, height: 89.4 });
assert.deepEqual(placementOf('md,sb,Card,A,,B,,C,,D\n4,,Island,-1,,-1,,-1,,-1'), { page: landscape, x: 11.7, y: 60.3, width: 256, height: 89.4 });
assert.throws(() => pageFor({ width: 320, height: 89.4 }), /320 × 89.4 mm and does not fit on A4 or Letter paper/);

(async () => {
  assert.deepEqual(dropAlpha(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 0])), new Uint8Array([1, 2, 3, 4, 5, 6]));
  const pixels = new Uint8Array(3000).fill(255);
  assert.deepEqual(new Uint8Array(inflateSync(await deflate(pixels))), pixels);

  const image = new Uint8Array([0x78, 0x9c, 0x03, 0x00]);
  const blob = buildPDF(image, { width: 2976, height: 2079 }, portrait, { x: 42, y: 12, width: 126, height: 88 });
  const pdf = Buffer.from(await blob.arrayBuffer()).toString('latin1');

  assert.equal(blob.type, 'application/pdf');
  assert.match(pdf, /\/MediaBox \[0 0 595.28 792\]/);
  assert.ok(pdf.startsWith('%PDF-1.6\n'), 'PrintScaling needs PDF 1.6');
  assert.match(pdf, /\/PrintScaling \/None/);
  assert.match(pdf, /\/Width 2976 \/Height 2079 .* \/FlateDecode \/Length 4 >>\nstream\nx\x9c\x03\x00\nendstream/);
  // 126 × 88 mm, 42 mm from the left and 12 mm from the top, in points from the bottom left
  assert.match(pdf, /q 357.17 0 0 249.45 119.06 508.54 cm \/Guide Do Q/);
  // A 100 mm line 12 mm below the guide, centred on the 210 mm page
  assert.match(pdf, /q 0.5 w 155.91 474.52 m 439.37 474.52 l /);
  assert.match(pdf, /\/Font << \/Helvetica 6 0 R >>/);

  const xref = +pdf.match(/startxref\n(\d+)/)[1];
  assert.ok(pdf.startsWith('xref\n0 7\n', xref));
  const offsets = [...pdf.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map(m => +m[1]);
  assert.deepEqual(offsets.map(offset => pdf.slice(offset, offset + 7)), ['1 0 obj', '2 0 obj', '3 0 obj', '4 0 obj', '5 0 obj', '6 0 obj']);
  console.log('ok');
})().catch(err => { console.error(err); process.exitCode = 1; });
