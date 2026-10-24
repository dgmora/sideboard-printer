// ─── Data Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse sideboard data into an array of records. Accepts two layouts, as CSV or TSV:
 *   long:   deck · opponent · card · maindeck (1/0) · delta, one row per change
 *   matrix: count · Maindeck · opponent columns, then a Sideboard section.
 *   Legacy md · sb · Card matrices are also accepted.
 * Anything else, like a spreadsheet tab that isn't a guide, gives no records.
 */
function parseData(text) {
  const rows = toRows(text);
  while (rows.length && !rows[0].some(c => c)) rows.shift();
  const layout = rows[0]?.[0].toLowerCase();
  if (layout === 'md' || /^maindeck$/i.test(rows[0]?.[1] ?? '')) return parseMatrix(rows);
  if (layout === 'deck') return parseLong(rows.slice(1));
  return [];
}

/**
 * Split text into trimmed cells: tab-separated if the first non-blank line has
 * a tab outside quotes, comma-separated otherwise. Quoted cells may hold
 * delimiters, newlines and "".
 */
function toRows(text) {
  const firstLine = text.split('\n').find(line => line.trim()) ?? '';
  const delimiter = firstLine.replace(/"[^"]*"/g, '').includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    }
    else if (ch === '"' && !cell.trim()) { quoted = true; cell = ''; }
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  row.push(cell);
  rows.push(row);
  // Invisible spacers keep unused Google Sheets headers inclined. They are
  // formatting placeholders, not matchup names or note content.
  return rows.map(r => r.map(c => c.trim().replace(/^\u200b+$/, '')));
}

/**
 * A change as '+2', '-1' or '+1*' (optional), or '' when the value isn't one.
 * Typographic minus signs count as cuts.
 */
function parseDelta(value) {
  const n = parseInt(value.replace(/[−–—]/g, '-').replace(/[^0-9-]/g, ''), 10);
  if (!n) return '';
  return (n > 0 ? '+' : '') + n + (/[*?]/.test(value) ? '*' : '');
}

function parseLong(rows) {
  const records = [];
  for (const cells of rows) {
    if (cells.length < 5 || !cells[0]) continue;
    records.push({
      deck:     cells[0],
      opponent: cells[1],
      card:     cells[2],
      name:     cells[2],
      maindeck: parseInt(cells[3], 10) || 0,
      delta:    parseDelta(cells[4]),
    });
  }
  return records;
}

/**
 * A blank header column splits the matchups onto the two faces of a folded card.
 * Cards below the first blank row are sideboard cards, counted from md or sb.
 * Above it, a card in both main and sideboard gets a row in each section: cuts
 * come from the main copies, additions from the sideboard.
 * A '*' or '?' on a value marks an optional change.
 */
function parseMatrix(rows) {
  const header = rows[0];
  const singleCount = /^maindeck$/i.test(header[1] ?? '');
  const nameColumn = singleCount ? 1 : 2;

  const columns = [];
  let face = 0;
  for (let i = nameColumn + 1; i < header.length; i++) {
    if (header[i]) columns.push({ column: i, opponent: header[i], face });
    else if (columns.at(-1)?.face === face) face++;
  }
  const columnAt = new Map(columns.map(c => [c.column, c]));

  // Card-less records keep every opponent column, in header order, even without changes
  const records = columns.map(c => ({ deck: '', ...c, card: null }));
  let pastBlankRow = false;
  let pastTotal = false;
  rows.slice(1).forEach((cells, row) => {
    if (!cells.some(c => c)) { if (!singleCount) pastBlankRow = true; return; }
    const md   = parseInt(cells[0], 10) || 0;
    const sb   = parseInt(cells[1], 10) || 0;
    const name = cells[nameColumn] || '';
    if (/^sideboard$/i.test(name)) { pastBlankRow = true; return; }
    if (/^totals?:?$/i.test(name)) { pastTotal = true; return; }
    if (pastTotal) {
      // Legacy templates keep instructions below their totals; only the new
      // sectioned layout treats these rows as printable matchup notes.
      if (singleCount && (name || columns.some(c => cells[c.column]))) records.push({ deck: '', note: true, row, name,
        values: columns.map(c => [c.column, cells[c.column] || '']) });
      return;
    }
    if (!name) return;

    cells.forEach((value, i) => {
      const column = columnAt.get(i);
      const delta = column && parseDelta(value);
      if (!delta) return;
      const fromSideboard = pastBlankRow || (!singleCount && sb > 0 && (delta[0] === '+' || md === 0));
      const count = singleCount ? md : fromSideboard ? sb || md : md;
      records.push({
        deck:     '',
        ...column,
        row,
        card:     count ? `${count} ${name}` : name,
        name,
        maindeck: fromSideboard ? 0 : 1,
        delta,
      });
    });
  });
  return records;
}

/**
 * Return unique deck names in order of first appearance.
 */
function getDecks(records) {
  const seen = new Set();
  const decks = [];
  for (const r of records) {
    if (!seen.has(r.deck)) { seen.add(r.deck); decks.push(r.deck); }
  }
  return decks;
}

/**
 * Build the card table for one deck:
 *   cards          – rows as { label, name, maindeck, values }, maindeck first, then
 *                    alphabetical; values maps an opponent key to its change
 *   faces          – opponents as { key, name }, split where the sheet splits them
 *   firstSideboard – index of the first sideboard row, -1 if none
 * Opponents are keyed by sheet column, so two columns with the same name stay apart.
 */
function buildPivot(records, deckName) {
  const deckRecords = records.filter(r => r.deck === deckName);
  const opponentKey = r => r.column ?? r.opponent;

  const opponents = new Map();
  const faces = [];
  for (const r of deckRecords.filter(r => !r.note)) {
    if (opponents.has(opponentKey(r))) continue;
    const opponent = { key: opponentKey(r), name: r.opponent };
    opponents.set(opponent.key, opponent);
    (faces[r.face || 0] ||= []).push(opponent);
  }

  const rows = new Map();
  for (const r of deckRecords.filter(r => r.card)) {
    const key = `${r.row ?? r.card}|${r.maindeck}`;
    if (!rows.has(key)) rows.set(key, { label: r.card, name: r.name, maindeck: r.maindeck, values: new Map() });
    rows.get(key).values.set(opponentKey(r), r.delta);
  }
  const cards = [...rows.values()].sort((a, b) => b.maindeck - a.maindeck || a.name.localeCompare(b.name));
  const firstSideboard = cards.findIndex(c => !c.maindeck);

  const notes = deckRecords.filter(r => r.note).map(r => ({ label: r.name, values: new Map(r.values) }));
  return { cards, faces, firstSideboard, notes };
}

function matchupTotal(cards, opponent) {
  return cards.reduce((sum, card) => sum + (parseInt(card.values.get(opponent.key), 10) || 0), 0);
}

/**
 * Matchups that bring in more cards than they take out, as "opponent +n".
 */
function unbalanced({ cards, faces }) {
  return faces.flat()
    .map(opponent => [opponent.name, matchupTotal(cards, opponent)])
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${name} +${n}`);
}

// ─── SVG Generation ───────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Red for cuts, green for additions; optional ones faded
function valueStyle(value) {
  const color = value.includes('-') ? '#6C1600' : '#166C00';
  return (value.includes('*') ? 'font-style:italic;fill-opacity:0.45;' : '') + `fill:${color}`;
}

// ─── Card Sheet ───────────────────────────────────────────────────────────────

const FOLD = { font: 34, valueFont: 30, titleFont: 40, row: 46, col: 50, title: 50 };
const TEXT_SIZES_PT = { small: 6, medium: 7, large: 8 };
const MAX_FACES = 4;
const UNITS_PER_PT = 254 / 72;

let measureContext;
function textWidth(s, size) {
  if (typeof document !== 'object') return s.length * size * 0.56;
  measureContext ||= document.createElement('canvas').getContext('2d');
  measureContext.font = `${size}px sans-serif`;
  return measureContext.measureText(s).width;
}

function splitEvenly(opponents, perFace) {
  const count = Math.ceil(opponents.length / perFace);
  const size = Math.ceil(opponents.length / count);
  return Array.from({ length: count }, (_, i) => opponents.slice(i * size, (i + 1) * size));
}

const EXAMPLE_SHEET = [
  ['13', 'Maindeck', 'Delver', 'Burn', 'Reanimator', 'Storm', '', 'Elves', 'Lands', 'Show and Tell', 'Eldrazi'],
  ['4', 'Swords to Plowshares', '', '', '', '-2', '', '', '-2', '-2'],
  ['4', 'Thalia, Guardian of Thraben', '', '', '', '', '', '-1', '', '', '-2'],
  ['3', 'Flickerwisp', '-1', '-2', '-1'],
  ['2', 'Mirran Crusader', '', '', '-1', '-2', '', '', '', '-2'],
  ['14', 'Sideboard'],
  ['2', 'Path to Exile', '+1', '', '', '', '', '+1*', '', '', '+2'],
  ['2', 'Kor Firewalker', '', '+2'],
  ['2', 'Rest in Peace', '', '', '+2'],
  ['2', 'Ethersworn Canonist', '', '', '', '+2'],
  ['2', 'Surgical Extraction', '', '', '', '+2'],
  ['2', "Council's Judgment", '', '', '', '', '', '', '+2', '+2'],
  ['2', 'Containment Priest', '', '', '', '', '', '', '', '+2'],
  ['', 'Total'],
].map(row => row.join('\t')).join('\n');

/**
 * Where the card names go:
 *   every   – on every face, left of its matchups
 *   outside – on every face, on the outer edge of a two-face card
 *   left    – once, on the first face; the matchups run on over the next faces
 *   middle  – once, on a face of their own between two flaps of matchups
 */
const LAYOUTS = ['every', 'outside', 'left', 'middle'];

function arrangeFaces(sheetFaces, layout, capacity) {
  if (layout === 'left') {
    const faces = [];
    for (const face of sheetFaces) {
      for (let i = 0; i < face.length;) {
        const names = faces.length ? null : 'left';
        faces.push({ opponents: face.slice(i, i += capacity(names)), names });
      }
    }
    return faces;
  }
  let columns = sheetFaces.flatMap(face => splitEvenly(face, capacity(layout === 'middle' ? null : 'left')));
  if (layout === 'middle') {
    if (columns.length === 1) columns = splitEvenly(columns[0], Math.ceil(columns[0].length / 2));
    const faces = columns.map(opponents => ({ opponents, names: null }));
    faces.splice(Math.floor(faces.length / 2), 0, { opponents: [], names: 'only' });
    return faces;
  }
  return columns.map((opponents, i) => ({ opponents, names: layout === 'outside' && i === 1 ? 'right' : 'left' }));
}

/**
 * Fit a guide on 64 × 89.4 mm card faces with card names at textPt points.
 * A sheet face with more matchups than fit at that size is spread over more
 * faces. When the cards or the title still don't fit, the text shrinks:
 * textPt then holds the size it prints at, below the one asked for.
 * Faces of one continuous table hug the folds between them.
 */
// Wrap note text before rotating it into a matchup column. Each note row
// reserves enough column width to keep the text at a readable size.
function noteLines(value) {
  return String(value).split('\n').flatMap(line => {
    const parts = [];
    let rest = line;
    while (rest.length > 12) {
      const space = rest.lastIndexOf(' ', 12);
      const end = space > 0 ? space : 12;
      parts.push(rest.slice(0, end));
      rest = rest.slice(end).trimStart();
    }
    return [...parts, rest];
  });
}

function layoutCard(title, { cards, faces: sheetFaces, firstSideboard, notes = [] }, { textPt = TEXT_SIZES_PT.medium, layout = 'every' } = {}) {
  const { font } = FOLD;
  const noteCol = Math.max(FOLD.col, ...notes.flatMap(n => [...n.values.values()].map(v => noteLines(v).length * 24 + 8)));
  const rowLabels = [...cards.map(c => c.label), 'Total', ...notes.map(n => n.label)];
  const nameW   = Math.max(...rowLabels.map(l => textWidth(l, font))) + 16;
  const headerH = Math.max(...sheetFaces.flat().map(o => textWidth(o.name, font))) + 16;
  const halfW = 640, sheetH = 894, margin = 10;
  const wanted = textPt * UNITS_PER_PT / font;
  const availableH = sheetH - 2 * margin;
  if (title && (FOLD.title + headerH + (cards.length + 1) * FOLD.row + notes.length * 180) * wanted > availableH) title = '';
  const titleW  = title ? textWidth(title, FOLD.titleFont) : 0;
  const tableY  = (title ? FOLD.title : 0) + headerH;

  // 10 units per mm
  const usable = (halfW - 2 * margin) / wanted;
  const namesWidth = names => (names ? nameW : 0);
  // Face boundaries follow the data columns. Inclined headers may cross a fold
  // or be clipped at the outer edge; their overhang does not consume a column.
  const capacity = names => Math.max(1, Math.floor((usable - namesWidth(names)) / noteCol));
  const continuous = (layout === 'left' || layout === 'middle');
  const faces = arrangeFaces(sheetFaces, layout, capacity).map((face, fi, all) => ({
    ...face,
    align: !continuous || all.length === 1 ? 'center' : fi === 0 ? 'right' : fi === all.length - 1 ? 'left' : 'center',
  }));
  const naturalW = Math.max(titleW, ...faces.map(f => namesWidth(f.names) + f.opponents.length * noteCol));
  const naturalH = tableY + (cards.length + 1) * FOLD.row + notes.length * 180;
  const widthScale = (halfW - 2 * margin) / naturalW;
  const heightScale = availableH / naturalH;
  const scale = Math.min(wanted, widthScale, heightScale);

  return {
    title, cards, faces, firstSideboard, notes, noteCol, rowLabels, nameW, headerH, tableY, halfW, sheetH, margin, scale,
    textPt: scale < wanted * 0.999 ? scale * font / UNITS_PER_PT : textPt,
    shrinkAxis: scale < wanted * 0.999 ? (heightScale <= widthScale ? 'vertically' : 'horizontally') : '',
  };
}

function maxTextPt(title, pivot, layout = 'every') {
  let max = 1;
  for (let tenths = 10; tenths <= 720; tenths++) {
    const textPt = tenths / 10;
    const card = layoutCard(title, pivot, { textPt, layout });
    if (card.faces.length <= MAX_FACES && card.textPt >= textPt - 0.001) max = textPt;
  }
  return max;
}

/**
 * Card faces side by side, to fold between them. Every face shares the same
 * rows, and the table stretches its rows or columns to fill the faces up to a
 * 1 mm margin. An empty title leaves no title row.
 */
function generateCardSVG(layout) {
  const { title, cards, faces, firstSideboard, notes, noteCol, rowLabels, nameW, headerH, tableY, halfW, sheetH, margin, scale } = layout;
  const { font } = FOLD;
  const sheetW = halfW * faces.length;
  const faceW = (halfW - 2 * margin) / scale;
  const faceH = (sheetH - 2 * margin) / scale;
  const noteHeight = 180;
  const row = (faceH - tableY - notes.length * noteHeight) / (cards.length + 1);
  const namesWidth = names => (names ? nameW : 0);
  const fill = faces.filter(f => f.opponents.length).map(f => (faceW - namesWidth(f.names)) / f.opponents.length);
  const col = Math.max(noteCol, Math.min(...fill));
  const baseline = (ri, size) => tableY + ri * row + (row + size * 0.7) / 2;

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${64 * faces.length}mm" height="89.4mm" viewBox="0 0 ${sheetW} ${sheetH}">`,
    `  <rect width="${sheetW}" height="${sheetH}" fill="#ffffff" stroke="#bbbbbb" stroke-width="2"/>`,
  ];

  faces.forEach(({ opponents, names, align }, fi) => {
    const x0 = fi * halfW + margin;
    const y0 = margin;
    const namesW = names === 'only' ? faceW : namesWidth(names);
    const tableW = namesW + opponents.length * col;
    const left   = { left: 0, center: (faceW - tableW) / 2, right: faceW - tableW }[align];
    const colsX  = names === 'right' ? left : left + namesW;
    const [nameX, anchor] = {
      left:  [colsX - 12, 'end'],
      right: [colsX + opponents.length * col + 12, 'start'],
      only:  [faceW / 2, 'middle'],
    }[names] ?? [];


    lines.push(`  <g transform="translate(${x0.toFixed(1)},${y0.toFixed(1)}) scale(${scale.toFixed(4)})" font-family="sans-serif">`);
    if (title) lines.push(`    <text x="${faceW / 2}" y="${FOLD.title * 0.8}" font-size="${FOLD.titleFont}" text-anchor="middle">${escapeXml(title)}</text>`);

    opponents.forEach((opp, i) => {
      const x = colsX + i * col;
      if (i % 2 === 0) lines.push(`    <rect x="${x}" y="${tableY}" width="${col}" height="${faceH - tableY}" fill="#f3f3f3"/>`);
      const slant = headerH * 0.27;
      lines.push(`    <polygon points="${x},${tableY} ${x + col},${tableY} ${x + col + slant},${tableY - headerH} ${x + slant},${tableY - headerH}" fill="${i % 2 === 0 ? '#f3f3f3' : '#ffffff'}"/>`);
      const tx = x + col / 2 + font * 0.35;
      lines.push(`    <text x="${tx}" y="${tableY - 8}" transform="rotate(-75,${tx},${tableY - 8})" font-size="${font}">${escapeXml(opp.name)}</text>`);
    });

    rowLabels.forEach((label, ri) => {
      const y = tableY + Math.min(ri, cards.length + 1) * row + Math.max(0, ri - cards.length - 1) * noteHeight;
      const thick = ri === firstSideboard && ri > 0;
      lines.push(`    <line x1="${left}" y1="${y}" x2="${left + tableW}" y2="${y}" stroke="rgb(40,40,40)" ` +
        `stroke-width="${thick ? 4 : 2}" stroke-opacity="${thick ? 0.8 : 0.2}"/>`);
      if (names) lines.push(`    <text x="${nameX}" y="${ri <= cards.length ? baseline(ri, font) : y + font}" font-size="${font}" text-anchor="${anchor}">${escapeXml(label)}</text>`);
    });

    opponents.forEach((opp, i) => {
      const cx = colsX + i * col + col / 2;
      cards.forEach((card, ri) => {
        const value = card.values.get(opp.key);
        if (!value) return;
        lines.push(`    <text x="${cx}" y="${baseline(ri, FOLD.valueFont)}" font-size="${FOLD.valueFont}" text-anchor="middle" ` +
          `style="${valueStyle(value)}">${escapeXml(value.replace('*', ''))}</text>`);
      });
      const total = matchupTotal(cards, opp);
      const style = total > 0 ? 'font-weight:bold;fill:#C00000' : 'fill:#888888';
      lines.push(`    <text x="${cx}" y="${baseline(cards.length, FOLD.valueFont)}" font-size="${FOLD.valueFont}" text-anchor="middle" ` +
        `style="${style}">${total > 0 ? '+' : ''}${total}</text>`);
    });

    notes.forEach((note, ni) => {
      const y = tableY + (cards.length + 1) * row + ni * noteHeight;
      opponents.forEach((opp, i) => {
        const value = note.values.get(opp.key);
        if (!value) return;
        const x = colsX + (i + 0.5) * col;
        const parts = noteLines(value);
        const size = Math.min(24, (col - 8) / parts.length,
          ...parts.map(part => (noteHeight - 16) / Math.max(1, textWidth(part, 1))));
        parts.forEach((part, j) => lines.push(`    <text x="${x + (j - (parts.length - 1) / 2) * size}" y="${y + noteHeight - 8}" transform="rotate(-90,${x + (j - (parts.length - 1) / 2) * size},${y + noteHeight - 8})" font-size="${size}">${escapeXml(part)}</text>`));
      });
    });
    lines.push(`  </g>`);
  });

  // Keep the folding guides visible over any header that crosses a face edge.
  for (let fold = halfW; fold < sheetW; fold += halfW) {
    lines.push(`  <line x1="${fold}" y1="0" x2="${fold}" y2="${sheetH}" stroke="#bbbbbb" stroke-width="2" stroke-dasharray="12,10"/>`);
  }
  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

/**
 * The id in a spreadsheet's edit or share link. "Publish to web" links (/d/e/…)
 * carry a different id that can't be read as CSV, so they give null.
 */
function sheetId(link) {
  return link.match(/\/spreadsheets\/d\/(?!e\/)([\w-]+)/)?.[1] ?? null;
}

/**
 * Tabs listed in a spreadsheet's htmlview page, as [{ name, gid }].
 * ponytail: scrapes Google's undocumented htmlview page; switch to the Sheets API (needs a key) if it breaks.
 */
function parseTabs(html) {
  const tabs = [];
  for (const [, name, gid] of html.matchAll(/items\.push\(\{name: "((?:[^"\\]|\\.)*)",.*?gid: "(\d+)"/g)) {
    tabs.push({ name: unescapeJs(name), gid });
  }
  return tabs;
}

function unescapeJs(str) {
  try {
    return JSON.parse(`"${str.replace(/\\x([0-9a-f]{2})/gi, '\\u00$1')}"`);
  } catch {
    return str;
  }
}

// ─── Shared links ─────────────────────────────────────────────────────────────

/**
 * One deck's guide as matrix CSV, leaving out anything else in its sheet.
 */
function toMatrixCsv(records, deckName) {
  const { cards, faces, firstSideboard, notes } = buildPivot(records, deckName);
  const opponents = faces.flatMap((face, i) => (i ? [null, ...face] : face));
  const line = cells => cells.map(csvCell).join(',');

  const countOf = card => card.label.slice(0, card.label.length - card.name.length).trim();
  const sectionTotal = maindeck => cards.filter(card => Boolean(card.maindeck) === maindeck)
    .reduce((sum, card) => sum + (parseInt(countOf(card), 10) || 0), 0);
  const lines = [line([String(sectionTotal(true)), 'Maindeck', ...opponents.map(o => o?.name ?? '')])];
  cards.forEach((card, i) => {
    if (i === firstSideboard) lines.push(line([String(sectionTotal(false)), 'Sideboard']));
    const deltas = opponents.map(o => (o && card.values.get(o.key)) || '');
    lines.push(line([countOf(card), card.name, ...deltas]));
  });
  lines.push(line(['', 'Total', ...opponents.map(o => o ? String(matchupTotal(cards, o)) : '')]));
  notes.forEach(note => lines.push(line(['', note.label, ...opponents.map(o => o ? note.values.get(o.key) || '' : '')])));
  return lines.join('\n');
}

function csvCell(value) {
  return /[",\t\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * UTF-8 text from base64 or base64url. Accepts spaces for '+', which a query
 * string decodes an unescaped '+' into.
 */
function decodeBase64(text) {
  const base64 = text.replace(/[ -]/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
}

// Base64 never contains commas, tabs or line breaks, so a guide with any of them came in as plain text
function decodePaste(text) {
  return /[,\t\n]/.test(text) ? text : decodeBase64(text);
}

if (typeof module === 'object') {
  module.exports = { EXAMPLE_SHEET, TEXT_SIZES_PT, LAYOUTS, parseData, getDecks, buildPivot, unbalanced, layoutCard, maxTextPt, generateCardSVG, sheetId, parseTabs, toMatrixCsv, decodeBase64, decodePaste };
}
