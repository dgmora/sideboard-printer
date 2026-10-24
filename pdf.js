// ─── Print-ready PDF ──────────────────────────────────────────────────────────
// The PDF is written by hand so the page loads no library. The guide goes in as
// a 600 dpi image because the fonts every PDF viewer has can't show non-Latin names.
// The page is as wide as A4 and as tall as Letter, so it fits either paper and no print dialog shrinks it.
// It turns sideways for guides too wide to stand upright.
const PORTRAIT_MM = { width: 210, height: 279.4 };
const LANDSCAPE_MM = { width: 279.4, height: 210 };
const DPI = 600;
const MM_TO_PT = 72 / 25.4;
const RULER_MM = 100;
const CARD_FACE_WIDTH_MM = 64;

function guideSize(svg) {
  const [, width, height] = svg.match(/<svg[^>]* width="([\d.]+)mm" height="([\d.]+)mm"/) ?? [];
  if (!width) throw new Error('the guide has no size in millimetres');
  return { width: +width, height: +height };
}

function pageFor({ width, height }) {
  const page = [PORTRAIT_MM, LANDSCAPE_MM].find(page => width <= page.width && height <= page.height);
  if (!page) {
    const faces = width / CARD_FACE_WIDTH_MM;
    const maxFaces = Math.floor(LANDSCAPE_MM.width / CARD_FACE_WIDTH_MM);
    throw new Error(`the guide has ${faces} card faces, but a page fits at most ${maxFaces} horizontally`);
  }
  return page;
}

function pdfPlacement(page, { width, height }) {
  return { x: (page.width - width) / 2, y: (page.height - height) / 2, width, height };
}

async function renderPixels(svg, { width, height }) {
  const pixels = { width: Math.round(width / 25.4 * DPI), height: Math.round(height / 25.4 * DPI) };
  // Sizing the SVG in pixels keeps browsers from upscaling a low-resolution bitmap
  const sized = svg.replace(/ width="[\d.]+mm" height="[\d.]+mm"/, ` width="${pixels.width}" height="${pixels.height}"`);
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
  await image.decode();
  const canvas = document.createElement('canvas');
  Object.assign(canvas, pixels);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, pixels.width, pixels.height).data;
  return { image: await deflate(dropAlpha(rgba)), pixels };
}

function dropAlpha(rgba) {
  const rgb = new Uint8Array(rgba.length / 4 * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return rgb;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const pt = mm => +(mm * MM_TO_PT).toFixed(2);

function rulerDrawing(page, { y, height }) {
  const left = (page.width - RULER_MM) / 2;
  const base = page.height - (y + height + 12);
  const tick = (mm, length) => `${pt(left + mm)} ${pt(base)} m ${pt(left + mm)} ${pt(base + length)} l`;
  const ticks = Array.from({ length: RULER_MM / 10 + 1 }, (_, i) => tick(i * 10, i % 5 ? 2 : 4));
  return [
    `q 0.5 w ${pt(left)} ${pt(base)} m ${pt(left + RULER_MM)} ${pt(base)} l ${ticks.join(' ')} S Q`,
    `BT /Helvetica 8 Tf ${pt(left)} ${pt(base - 5)} Td (This line is ${RULER_MM} mm long. If it measures less, print again at 100% scale or Actual size.) Tj ET`,
  ].join('\n');
}

function buildPDF(image, pixels, page, placement) {
  const { x, y, width, height } = placement;
  const draw = `q ${pt(width)} 0 0 ${pt(height)} ${pt(x)} ${pt(page.height - y - height)} cm /Guide Do Q\n${rulerDrawing(page, placement)}`;
  const objects = [
    // PrintScaling /None makes print dialogs start at actual size instead of fit to page
    '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(page.width)} ${pt(page.height)}] /Resources << /XObject << /Guide 4 0 R >> /Font << /Helvetica 6 0 R >> >> /Contents 5 0 R >>`,
    [`<< /Type /XObject /Subtype /Image /Width ${pixels.width} /Height ${pixels.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`, image, '\nendstream'],
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  const encoder = new TextEncoder();
  const chunks = [];
  let size = 0;
  const write = part => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    size += bytes.length;
  };

  write('%PDF-1.6\n');
  const offsets = objects.map((body, i) => {
    const offset = size;
    write(`${i + 1} 0 obj\n`);
    [body].flat().forEach(write);
    write('\nendobj\n');
    return offset;
  });
  const xref = size;
  write(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach(offset => write(`${String(offset).padStart(10, '0')} 00000 n \n`));
  write(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

async function createGuidePDF(svg) {
  const size = guideSize(svg);
  const page = pageFor(size);
  const { image, pixels } = await renderPixels(svg, size);
  return buildPDF(image, pixels, page, pdfPlacement(page, size));
}

if (typeof module === 'object') {
  module.exports = { guideSize, pageFor, pdfPlacement, buildPDF, dropAlpha, deflate };
}
