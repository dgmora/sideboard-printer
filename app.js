// ─── UI ───────────────────────────────────────────────────────────────────────

// GitHub Pages can't send a frame-ancestors header, so the page hides itself inside other sites' frames
if (window.top !== window.self) document.body.hidden = true;

const textarea    = document.getElementById('data-input');
const sheetLinks  = document.getElementById('sheet-links');
const sheetStatus = document.getElementById('sheet-status');
const sheetUpdated = document.getElementById('sheet-updated');
const updatedAt  = document.getElementById('updated-at');
const reloadBtn  = document.getElementById('reload-btn');
const sheetsSection = document.getElementById('sheets-section');
const pasteSection  = document.getElementById('paste-section');
const deckSelect  = document.getElementById('deck-select');
const layoutSelect = document.getElementById('layout');
const textSize    = document.getElementById('text-size');
const previewSize = document.getElementById('preview-size');
const previewSizeDescription = document.getElementById('preview-size-description');
const svgContainer = document.getElementById('svg-container');
const downloadBtn = document.getElementById('download-btn');
const downloadTitle = downloadBtn.title;
const shareBtn    = document.getElementById('share-btn');
const shareMenu   = document.getElementById('share-menu');
const shareLive   = document.getElementById('share-live');
const shareSnapshot = document.getElementById('share-snapshot');
const previewLabel = document.getElementById('preview-label');
const previewNotices = document.getElementById('preview-notices');
const convertPrompt = document.getElementById('convert-prompt');
const copyPromptBtn = document.getElementById('copy-prompt');

let records    = [];
let guides     = [];
let currentSVG = '';
let currentDeck = '';

const shared = new URLSearchParams(location.search);
const sharedGuide = shared.has('sheet') && { id: shared.get('sheet'), gid: shared.get('tab') ?? '0' };
const pastedGuide = shared.get('paste');
const pastedName  = shared.get('name') ?? '';

const usingSheets = () => document.querySelector('input[name="source"]:checked').value === 'sheets';
const guideKey = guide => `${guide.id}:${guide.gid}`;
const selectedGuide = () => guides.find(g => guideKey(g) === deckSelect.value);

// Every dgmora.github.io project shares this storage, hence the prefix. Unprefixed keys predate it.
function load(key) {
  try { return localStorage.getItem(`sbg:${key}`) ?? localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function save(key, value) {
  try { localStorage.setItem(`sbg:${key}`, value); } catch {}
}

function cardOptions() {
  return { textPt: Number(textSize.value), layout: layoutSelect.value };
}

function updateTextSizes(title, pivot) {
  const max = maxTextPt(title, pivot, layoutSelect.value);
  const previous = Number(textSize.value) || preferredTextPt;
  const sizes = Array.from({ length: Math.max(0, Math.floor(max) - 5) }, (_, i) => i + 6);
  if (previous >= 6 && previous <= max && !sizes.includes(previous)) sizes.push(previous);
  if (!sizes.includes(max)) sizes.push(max);
  sizes.sort((a, b) => a - b);
  textSize.replaceChildren(...sizes.map(size => new Option(`${size} pt`, size)));
  textSize.value = String(Math.min(previous, max));
  if (!textSize.value) textSize.value = String(max);
}

function showExample() {
  const example = document.getElementById('example-template').content.cloneNode(true);
  example.querySelector('.example-card').innerHTML =
    generateCardSVG(layoutCard('', buildPivot(parseData(EXAMPLE_SHEET), ''), cardOptions()));
  svgContainer.replaceChildren(example);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderPreview() {
  const deck  = usingSheets() ? selectedGuide()?.name : deckSelect.value;
  const pivot = getDecks(records).includes(deck) && buildPivot(records, deck);

  if (!pivot || pivot.cards.length === 0) {
    currentSVG = '';
    currentDeck = '';
    previewNotices.hidden = true;
    previewNotices.replaceChildren();
    downloadBtn.disabled = true;
    shareMenu.hidePopover?.();
    shareBtn.disabled = true;
    if ((usingSheets() ? sheetLinks : textarea).value.trim()) {
      previewLabel.textContent = 'Preview';
      svgContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⬡</div>
          <p>No cards found. The first row of a guide starts with md, sb, Card.</p>
        </div>`;
    } else {
      previewLabel.textContent = 'Example';
      showExample();
    }
    return;
  }

  updateTextSizes(deck, pivot);
  const card  = layoutCard(deck, pivot, cardOptions());
  currentSVG  = generateCardSVG(card);
  currentDeck = deck;
  svgContainer.innerHTML = currentSVG;
  const tooWide = printProblem(currentSVG);
  downloadBtn.disabled = Boolean(tooWide);
  downloadBtn.title = tooWide || downloadTitle;
  shareBtn.disabled = false;
  previewLabel.textContent = deck || 'Preview';
  const shrunk = card.textPt < Number(textSize.value) ? `Text shrunk to ${card.textPt.toFixed(1)} pt to fit ${card.shrinkAxis} in a card.` : '';
  previewNotices.replaceChildren(...[
    shrunk && ['warning', shrunk],
    tooWide && ['error', tooWide],
  ].filter(Boolean).map(([type, message]) => {
    const notice = document.createElement('p');
    notice.className = `preview-notice preview-notice-${type}`;
    notice.textContent = message;
    return notice;
  }));
  previewNotices.hidden = !previewNotices.childElementCount;
}

function printProblem(svg) {
  try {
    pageFor(guideSize(svg));
    return '';
  } catch (error) {
    const tips = [
      Number(textSize.value) > 6 && 'smaller text',
      layoutSelect.value !== 'left' && 'card names once, on the left',
    ].filter(Boolean);
    return `The PDF can't be printed: ${error.message}.` + (tips.length ? ` Try ${tips.join(' or ')}.` : '');
  }
}

function fillDeckSelect(options) {
  const prev = deckSelect.value || (sharedGuide && guideKey(sharedGuide)) || load('deck');
  deckSelect.parentElement.hidden = options.length < 2;
  deckSelect.replaceChildren(...options.map(({ value, label }) => new Option(label, value)));
  if (options.some(o => o.value === prev)) deckSelect.value = prev;
}

function refreshDeckList() {
  records = parseData(textarea.value).map(r => ({ ...r, deck: r.deck || pastedName }));
  fillDeckSelect(getDecks(records).map(d => ({ value: d, label: d })));
  renderPreview();
}

// ── Google Sheets ─────────────────────────────────────────────────────────────

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchTabs(link) {
  const id = sheetId(link);
  if (!id) throw new Error(`Not a Google Sheets link: ${link}`);
  const tabs = parseTabs(await fetchText(`https://docs.google.com/spreadsheets/d/${id}/htmlview`));
  const linkedTab = { name: 'Sheet', gid: link.match(/[#&?]gid=(\d+)/)?.[1] ?? '0' };
  return (tabs.length ? tabs : [linkedTab]).map(tab => ({ id, ...tab }));
}

// Fetches finish in any order, so each load bumps this and drops its result once a newer one started
let latestLoad = 0;
let linksStatus = '';

async function loadGuides() {
  const run = ++latestLoad;
  const links = sheetLinks.value.split('\n').map(l => l.trim()).filter(Boolean);
  const failed = [];
  const lists = await Promise.all(links.map(link => fetchTabs(link).catch(() => { failed.push(link); return []; })));
  if (run !== latestLoad) return;
  guides = lists.flat();
  const notLinks = failed.filter(link => !sheetId(link));
  const unreadable = failed.filter(sheetId);
  linksStatus = [
    notLinks.length && `${notLinks.join(', ')} isn't a spreadsheet link. Copy the link from the Share button in Google Sheets.`,
    unreadable.length && `Can't read ${unreadable.join(', ')}. Share it as "Anyone with the link can view".`,
  ].filter(Boolean).join(' ');
  sheetStatus.textContent = linksStatus;
  fillDeckSelect(guides.map(g => ({ value: guideKey(g), label: g.name })));
  await loadGuide();
}

async function loadGuide() {
  const run = ++latestLoad;
  const guide = selectedGuide();
  if (!guide) {
    sheetUpdated.hidden = true;
    return renderPreview();
  }
  let csv = null;
  try {
    csv = await fetchText(`https://docs.google.com/spreadsheets/d/${guide.id}/export?format=csv&gid=${guide.gid}`);
  } catch {}
  if (run !== latestLoad) return;
  records = csv === null ? [] : parseData(csv).map(r => ({ ...r, deck: guide.name }));
  sheetStatus.textContent = [linksStatus, csv === null && `Can't read the "${guide.name}" tab.`].filter(Boolean).join(' ');
  loadedAt = csv === null ? null : Date.now();
  clearInterval(loadedAtTimer);
  showLoadedAt();
  loadedAtTimer = setInterval(showLoadedAt, 10000);
  sheetUpdated.hidden = false;
  reloadBtn.disabled = false;
  reloadBtn.textContent = 'Reload';
  renderPreview();
}

let loadedAt = null;
let loadedAtTimer;
const timeAgo = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function showLoadedAt() {
  const seconds = Math.floor((Date.now() - loadedAt) / 1000);
  const ago = seconds < 60 ? timeAgo.format(-(seconds - seconds % 10), 'second') : timeAgo.format(-Math.floor(seconds / 60), 'minute');
  updatedAt.textContent = loadedAt === null ? '' : `Updated ${ago} ·`;
}

function applySource() {
  const sheets = usingSheets();
  sheetsSection.hidden = !sheets;
  shareLive.hidden = !sheets;
  pasteSection.hidden = sheets;
  records = [];
  latestLoad++;
  if (sheets) loadGuides();
  else refreshDeckList();
}

// ── Events ────────────────────────────────────────────────────────────────────

function debounce(fn) {
  let timer;
  return () => { clearTimeout(timer); timer = setTimeout(fn, 280); };
}

textarea.addEventListener('input', debounce(refreshDeckList));

sheetLinks.addEventListener('input', debounce(() => {
  save('links', sheetLinks.value);
  loadGuides();
}));

for (const radio of document.querySelectorAll('input[name="source"]')) {
  radio.addEventListener('change', () => {
    save('source', radio.value);
    applySource();
  });
}

// Google can't push sheet edits to this page, so refetch every minute and when the user comes back to it
const refetchIfShown = () => { if (document.visibilityState === 'visible' && usingSheets()) loadGuides(); };
document.addEventListener('visibilitychange', refetchIfShown);
setInterval(refetchIfShown, 60000);

reloadBtn.addEventListener('click', () => {
  reloadBtn.disabled = true;
  reloadBtn.textContent = 'Reloading…';
  loadGuides();
});

deckSelect.addEventListener('change', () => {
  save('deck', deckSelect.value);
  if (usingSheets()) loadGuide();
  else renderPreview();
});
const savedTextSize = [shared.get('size'), load('textSize')].find(Boolean);
const preferredTextPt = (TEXT_SIZES_PT[savedTextSize] ?? Number(savedTextSize)) || Number(textSize.value);
textSize.value = String(preferredTextPt);
layoutSelect.value = [shared.get('names'), load('layout')].find(layout => LAYOUTS.includes(layout)) ?? layoutSelect.value;
previewSize.value = ['actual', 'fit'].includes(load('previewSize')) ? load('previewSize') : 'actual';
svgContainer.dataset.size = previewSize.value;
const previewSizeDescriptions = {
  actual: 'Shows the guide at print scale. Each face is 64 × 89.4 mm (card size).',
  fit: 'Scales the guide to fit the available space.',
};
previewSizeDescription.textContent = previewSizeDescriptions[previewSize.value];
previewSize.addEventListener('change', () => {
  svgContainer.dataset.size = previewSize.value;
  previewSizeDescription.textContent = previewSizeDescriptions[previewSize.value];
  save('previewSize', previewSize.value);
});
for (const [select, key] of [[textSize, 'textSize'], [layoutSelect, 'layout']]) {
  select.addEventListener('change', () => {
    save(key, select.value);
    renderPreview();
  });
}

downloadBtn.addEventListener('click', async () => {
  if (!currentSVG) return;
  const filename = `${currentDeck || 'sideboard'}_guide.pdf`;
  downloadBtn.disabled = true;
  try {
    triggerDownload(await createGuidePDF(currentSVG), filename);
  } catch (error) {
    alert(`Could not create the PDF: ${error.message}`);
  } finally {
    downloadBtn.disabled = !currentSVG;
  }
});

function pageLink(params) {
  const url = new URL(location.pathname, location.origin);
  url.search = new URLSearchParams({ ...params, size: textSize.value, names: layoutSelect.value }).toString().replaceAll('%2C', ',');
  return url.href;
}

shareLive.addEventListener('click', () => {
  const guide = selectedGuide();
  if (!guide) return;
  shareLink(shareLive, pageLink({ sheet: guide.id, tab: guide.gid }));
});

shareSnapshot.addEventListener('click', () => {
  const name = currentDeck ? { name: currentDeck } : {};
  shareLink(shareSnapshot, pageLink({ paste: toMatrixCsv(records, currentDeck), ...name }));
});

function shareLink(option, link) {
  copyText(option.querySelector('.menu-option-name'), link, 'Link copied ✓')
    .then(() => setTimeout(() => shareMenu.hidePopover?.(), 900));
}

copyPromptBtn.addEventListener('click', () => copyText(copyPromptBtn, convertPrompt.textContent, 'Prompt copied'));

function copyText(label, text, doneLabel) {
  label.dataset.label ??= label.textContent;
  return navigator.clipboard.writeText(text).then(
    () => {
      label.textContent = doneLabel;
      setTimeout(() => { label.textContent = label.dataset.label; }, 1500);
    },
    () => prompt('Copy this:', text)
  );
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url));
}

sheetLinks.value = sharedGuide
  ? `https://docs.google.com/spreadsheets/d/${sharedGuide.id}/edit#gid=${sharedGuide.gid}`
  : load('links');
if (pastedGuide !== null) {
  try {
    textarea.value = decodePaste(pastedGuide);
  } catch {
    textarea.placeholder = "Couldn't read the guide in this link. Paste your sheet here";
  }
}
convertPrompt.querySelector('.page-url').textContent = location.origin + location.pathname;
const source = pastedGuide !== null || (!sharedGuide && load('source') === 'paste') ? 'paste' : 'sheets';
document.querySelector(`input[name="source"][value="${source}"]`).checked = true;
applySource();
