// Run with: node guide.test.js
const assert = require('node:assert');
const { parseData, getDecks, buildPivot, unbalanced, layoutCard, maxTextPt, generateCardSVG, sheetId, parseTabs, toMatrixCsv, decodeBase64, decodePaste } = require('./guide.js');

const faceNames = pivot => pivot.faces.map(face => face.map(o => o.name));
const labels = pivot => pivot.cards.map(c => c.label);
const matchup = (pivot, index) => {
  const opponent = pivot.faces.flat()[index];
  return Object.fromEntries(pivot.cards.filter(c => c.values.has(opponent.key)).map(c => [c.label, c.values.get(opponent.key)]));
};
const roundTrip = (records, deck = '') => buildPivot(parseData(toMatrixCsv(records, deck)), '');

const matrix = [
  'md\tsb\tCard\tStasis\tElves\t\tGoblins',
  '1\t2\tAbeyance\t2\t\t\t-1',
  '4\t\tSwords to Plowshares\t-4',
  '\t4\tMeddling Mage\t+2*\t\t\t1',
  '\t\tTotal\t0\t\t0',
].join('\n');

const records = parseData(matrix);
assert.deepStrictEqual(getDecks(records), ['']);

const pivot = buildPivot(records, '');
assert.deepStrictEqual(faceNames(pivot), [['Stasis', 'Elves'], ['Goblins']]);
assert.deepStrictEqual(labels(pivot), ['1 Abeyance', '4 Swords to Plowshares', '2 Abeyance', '4 Meddling Mage']);
assert.strictEqual(pivot.firstSideboard, 2);
assert.deepStrictEqual(matchup(pivot, 0), { '4 Swords to Plowshares': '-4', '2 Abeyance': '+2', '4 Meddling Mage': '+2*' });
assert.deepStrictEqual(matchup(pivot, 2), { '1 Abeyance': '-1', '4 Meddling Mage': '+1' });

assert.deepStrictEqual(unbalanced(pivot), []);
assert.deepStrictEqual(unbalanced(buildPivot(parseData('md\tsb\tX\tElves\tAluren\n4\t\tIsland\t-1\t+1'), '')), ['Aluren +1']);

const sameCounts = buildPivot(parseData('md,sb,Card,Elves,Goblins\n2,2,Path to Exile,-2,2'), '');
assert.deepStrictEqual(labels(sameCounts), ['2 Path to Exile', '2 Path to Exile']);
assert.strictEqual(sameCounts.firstSideboard, 1);
assert.deepStrictEqual(sameCounts.cards.map(c => [...c.values.values()]), [['-2'], ['+2']]);

const playDraw = buildPivot(parseData('md,sb,Card,Elves,,Elves\n4,,Island,-1,,\n,2,Pyroblast,,,2'), '');
assert.deepStrictEqual(faceNames(playDraw), [['Elves'], ['Elves']]);
assert.deepStrictEqual(unbalanced(playDraw), ['Elves +2']);

const typographic = buildPivot(parseData('md,sb,Card,Elves,Burn\n4,,Island,−1,–2'), '');
assert.deepStrictEqual(typographic.cards[0].values, new Map([[3, '-1'], [4, '-2']]));

const totals = buildPivot(parseData('md,sb,Card,Elves\n4,,Island,-1\n,,Totals,-1\n,,TOTAL:,-1'), '');
assert.deepStrictEqual(labels(totals), ['4 Island']);

const builtInNames = buildPivot(parseData('md,sb,Card,constructor\n1,,__proto__,-1\n1,,toString,-1'), '');
assert.deepStrictEqual(labels(builtInNames), ['1 __proto__', '1 toString']);
assert.deepStrictEqual(unbalanced(builtInNames), []);

assert.deepStrictEqual(parseData('Date,Event,Opponent,Result,Notes\n2024-01-01,FNM,Elves,2-1,good'), []);
assert.deepStrictEqual(parseData('<script>var a=[1,2,3,4,5]</script>'), []);

const long = parseData('deck\topponent\tcard\tmaindeck\tdelta\nDnT\tDelver\tPath\t0\t1');
assert.deepStrictEqual(labels(buildPivot(long, 'DnT')), ['Path']);
assert.deepStrictEqual(matchup(buildPivot(long, 'DnT'), 0), { Path: '+1' });

const csv = [
  'md,sb,Card,Stasis,Elves,,Goblins',
  '1,2,Abeyance,2,,,-1',
  '4,,Swords to Plowshares,-4',
  ',4,Meddling Mage,+2*,,,1',
  ',,,,,,',
  ',,Total,"=SUM(D2:D4,0)",,"=SUM(F2:F4,0)"',
].join('\r\n');
assert.deepStrictEqual(parseData(csv), records);

const quoted = parseData('md,sb,X,Elves\n1,,"Jace, the Mind Sculptor",-1');
assert.deepStrictEqual(labels(buildPivot(quoted, '')), ['1 Jace, the Mind Sculptor']);
assert.deepStrictEqual(parseData('md, sb, X, Elves\n1, , "Jace, the Mind Sculptor", -1'), quoted);

const pastedWithQuotes = parseData('md\tsb\tX\tElves\n1\t\t"Say ""Hi""\nTwice"\t-1');
assert.deepStrictEqual(labels(buildPivot(pastedWithQuotes, '')), ['1 Say "Hi"\nTwice']);

assert.deepStrictEqual(labels(buildPivot(parseData('\nmd\tsb\tCard\tElves\n4\t\tIsland\t-1'), '')), ['4 Island']);

const blankRowSplit = buildPivot(parseData([
  'md\tsb\tCard\tElves',
  '4\t\tIsland\t-2',
  '\t\t\t',
  '2\t\tExalted Angel\t2',
].join('\n')), '');
assert.deepStrictEqual(labels(blankRowSplit), ['4 Island', '2 Exalted Angel']);
assert.strictEqual(blankRowSplit.firstSideboard, 1);

const manyOpponents = Array.from({ length: 12 }, (_, i) => `Opp ${i}`);
const wideRecords = parseData(`md\tsb\tCard\t${manyOpponents.join('\t')}\n4\t\tIsland\t-1`);
const wide = buildPivot(wideRecords, '');
assert.deepStrictEqual(faceNames(wide), [manyOpponents]);
const cardFaces = card => card.faces.map(f => [f.names, f.opponents.map(o => o.name)]);
assert.deepStrictEqual(cardFaces(layoutCard('', wide, { textPt: 7 })), [['left', manyOpponents]]);
assert.deepStrictEqual(cardFaces(layoutCard('', wide, { textPt: 8 })), [['left', manyOpponents.slice(0, 6)], ['left', manyOpponents.slice(6)]]);
assert.deepStrictEqual(cardFaces(layoutCard('', pivot, { textPt: 8 })), [['left', ['Stasis', 'Elves']], ['left', ['Goblins']]]);
assert.strictEqual(layoutCard('', wide, { textPt: 8 }).textPt, 8);
assert.deepStrictEqual(cardFaces(layoutCard('', wide, { textPt: 8, layout: 'outside' })), [['left', manyOpponents.slice(0, 6)], ['right', manyOpponents.slice(6)]]);

const twenty = Array.from({ length: 20 }, (_, i) => `Opp ${i}`);
const twentyWide = buildPivot(parseData(`md,sb,Card,${twenty.join(',')}\n4,,Island,-1`), '');
assert.deepStrictEqual(cardFaces(layoutCard('', twentyWide, { textPt: 8, layout: 'left' })), [['left', twenty.slice(0, 11)], [null, twenty.slice(11)]]);
assert.deepStrictEqual(cardFaces(layoutCard('', twentyWide, { textPt: 8, layout: 'middle' })), [[null, twenty.slice(0, 10)], ['only', []], [null, twenty.slice(10)]]);
assert.deepStrictEqual(layoutCard('', twentyWide, { textPt: 8, layout: 'middle' }).faces.map(f => f.align), ['right', 'center', 'left']);
for (const layout of ['left', 'middle']) {
  assert.strictEqual(generateCardSVG(layoutCard('', twentyWide, { textPt: 8, layout })).match(/>4 Island</g).length, 1);
}
assert.deepStrictEqual(cardFaces(layoutCard('', wide, { layout: 'middle' })), [[null, manyOpponents.slice(0, 6)], ['only', []], [null, manyOpponents.slice(6)]]);
assert.deepStrictEqual(cardFaces(layoutCard('', pivot, { layout: 'left' })), [['left', ['Stasis', 'Elves']], [null, ['Goblins']]]);

const manyCards = Array.from({ length: 30 }, (_, i) => `4,,Card ${i},-1`);
const verticallyShrunk = layoutCard('', buildPivot(parseData(['md,sb,Card,Elves', ...manyCards].join('\n')), ''), { textPt: 8 });
assert.ok(verticallyShrunk.textPt < 6);
assert.strictEqual(verticallyShrunk.shrinkAxis, 'vertically');
const horizontallyShrunk = layoutCard('', buildPivot(parseData(`md,sb,Card,Elves\n4,,${'Very long card name '.repeat(5)},-1`), ''), { textPt: 8 });
assert.ok(horizontallyShrunk.textPt < 8);
assert.strictEqual(horizontallyShrunk.shrinkAxis, 'horizontally');

const maxFourFaceText = maxTextPt('', twentyWide, 'left');
assert.strictEqual(layoutCard('', twentyWide, { textPt: maxFourFaceText, layout: 'left' }).faces.length <= 4, true);
assert.strictEqual(layoutCard('', twentyWide, { textPt: maxFourFaceText + 0.1, layout: 'left' }).faces.length > 4, true);

const single = buildPivot(parseData('md\tsb\tCard\tElves\n4\t\tIsland\t-1'), '');
const singleSVG = generateCardSVG(layoutCard('', single));
assert.match(singleSVG, /width="64mm"/);
assert.match(singleSVG, />Total</);
assert.match(generateCardSVG(layoutCard('DnT', single)), />DnT</);

const tallCards = Array.from({ length: 22 }, (_, i) => `4,,Card ${i},-1`);
const tall = layoutCard('DnT', buildPivot(parseData(['md,sb,Card,Elves', ...tallCards].join('\n')), ''), { textPt: 7 });
assert.strictEqual(tall.title, '');
assert.strictEqual(tall.textPt, 7);
assert.doesNotMatch(generateCardSVG(tall), />DnT</);

const foldX = svg => [...svg.matchAll(/<line x1="(\d+)"[^>]*stroke-dasharray/g)].map(m => +m[1]);
assert.deepStrictEqual(foldX(singleSVG), []);
assert.deepStrictEqual(foldX(generateCardSVG(layoutCard('', buildPivot(parseData('md,sb,Card,A,,B,,C\n4,,Island,-1,,-1,,-1'), '')))), [640, 1280]);

assert.strictEqual(sheetId('https://docs.google.com/spreadsheets/d/1Bx-i_9/edit#gid=12'), '1Bx-i_9');
assert.strictEqual(sheetId('https://example.com/d/1Bx'), null);
assert.strictEqual(sheetId('https://docs.google.com/spreadsheets/d/e/2PACX-1vQ/pubhtml'), null);

const htmlview = [
  'var items = [];',
  'items.push({name: "Death \\x26 Taxes", pageUrl: "https:\\/\\/docs.google.com\\/x?headers\\x3dtrue&gid=0", gid: "0",initialSheet: ("0" == gid)});',
  'items.push({name: "Sneak \\"n\\" Show \\u00e9", pageUrl: "https:\\/\\/docs.google.com\\/x?gid=77", gid: "77",initialSheet: ("77" == gid)});',
].join('');
assert.deepStrictEqual(parseTabs(htmlview), [
  { name: 'Death & Taxes', gid: '0' },
  { name: 'Sneak "n" Show é', gid: '77' },
]);
assert.deepStrictEqual(parseTabs('<html></html>'), []);

const sharedGuide = 'md,sb,Card,Elves\n4,,Æther Vial,-1*';
assert.strictEqual(decodeBase64(Buffer.from(sharedGuide).toString('base64')), sharedGuide);
assert.strictEqual(decodeBase64(new URLSearchParams('paste=Pj4+Pw==').get('paste')), '>>>?');
assert.strictEqual(decodeBase64('Pj4-Pw'), '>>>?');
assert.throws(() => decodeBase64('not base64!'));
assert.strictEqual(decodePaste(Buffer.from(sharedGuide).toString('base64url')), sharedGuide);
assert.strictEqual(decodePaste(new URLSearchParams(`paste=${encodeURIComponent(sharedGuide)}`).get('paste')), sharedGuide);
assert.strictEqual(decodePaste(new URLSearchParams('paste=md,sb,Card,Elves%0A4,,Æther Vial,-1*').get('paste')), sharedGuide);

const withNotes = parseData(`${matrix}\n\t\t\tNotes:\n\t\t\t\tKeep "Jace, the Mind Sculptor" in`);
const snapshot = toMatrixCsv(withNotes, '');
assert.doesNotMatch(snapshot, /Notes|Total/);
assert.deepStrictEqual(labels(roundTrip(withNotes)), labels(pivot));
assert.deepStrictEqual(faceNames(roundTrip(withNotes)), faceNames(pivot));
assert.deepStrictEqual(matchup(roundTrip(withNotes), 2), matchup(pivot, 2));
assert.deepStrictEqual(labels(roundTrip(quoted)), labels(buildPivot(quoted, '')));
assert.deepStrictEqual(faceNames(roundTrip(wideRecords)), faceNames(wide));
assert.deepStrictEqual(matchup(roundTrip(long, 'DnT'), 0), { Path: '+1' });
assert.deepStrictEqual(roundTrip(parseData('md,sb,Card,Elves,Goblins\n2,2,Path to Exile,-2,2')).cards, sameCounts.cards);
assert.deepStrictEqual(faceNames(roundTrip(parseData('md,sb,Card,"Bant\tSpirits"\n4,,Island,-1'))), [['Bant\tSpirits']]);

console.log('ok');
