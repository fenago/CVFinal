// Smart Document Scanner: main-thread app (owner: Juniper, frontend-engineer).
// Wires Wren's states (docs/ux-spec.md) to Forge's worker client and Ledger's db.js.
// The main thread never calls cv.*: all OpenCV work happens in scanner.worker.js.
import { createScanner } from './scanner-client.js';
import * as db from './db.js';

const $ = (sel) => document.querySelector(sel);
const el = {
  body: document.body,
  stage: $('#stage'), prompt: $('#prompt'), promptTitle: $('#prompt-title'),
  work: $('#work'), workImg: $('#work-img'),
  result: $('#result'), beforeImg: $('#before-img'), resultImg: $('#result-img'), outline: $('#outline'),
  fallback: $('#fallback-notice'), nameInput: $('#name-input'), download: $('#download-btn'), metaLine: $('#meta-line'),
  librarySection: $('#library-section'), library: $('#library'), libraryCount: $('#library-count'),
  storageLine: $('#storage-line'),
  fileInput: $('#file-input'),
  status: $('#status'), toasts: $('#toasts'),
  banner: $('#banner'), bannerText: $('#banner-text'), bannerBtn: $('#banner-btn'),
  cameraSheet: $('#camera-sheet'), video: $('#camera-video'), cameraError: $('#camera-error'),
  cameraCapture: $('#camera-capture'), cameraChoose: $('#camera-choose'), cameraHint: $('#camera-hint'),
  resetConfirm: $('#reset-confirm'),
};

const STAGES = { finding: [1, 'Finding the page…'], flattening: [2, 'Flattening…'], cleaning: [3, 'Cleaning up…'], encoding: [4, 'Saving…'] };
const ICON = {
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="12" cy="12" r="2.5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
  ok: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.5"/></svg>',
};

const app = {
  scannerReady: false,
  busy: false,
  mode: 'bw',
  lastInput: null,          // { blob, nameHint } for Try Again
  currentId: null,          // scan shown in the stage
  stageUrls: [],            // object URLs used by the stage (revoked on change)
  libraryUrls: [],          // object URLs used by library cards (revoked on re-render)
  cancelled: false,
};

// ---------------------------------------------------------------- state + status
function setState(state) { el.body.dataset.state = state; }

/** Render the status pill. opts: { tone:'busy'|'ok'|'error'|'info', text, sub, progress:[n, of], actions:[{label, onClick, kind}] } */
function setStatus({ tone = 'info', text, sub, progress, actions = [] }) {
  el.status.dataset.tone = tone;
  el.status.replaceChildren();
  if (tone === 'busy') el.status.append(Object.assign(document.createElement('span'), { className: 'spinner', ariaHidden: 'true' }));
  else if (tone === 'ok' || tone === 'error') {
    const i = document.createElement('span'); i.className = 'pill-icon'; i.innerHTML = tone === 'ok' ? ICON.ok : ICON.error;
    el.status.append(i);
  }
  const box = document.createElement('span'); box.className = 'pill-text';
  const t = document.createElement('span'); t.id = 'status-text'; t.textContent = text; box.append(t);
  if (sub) { const s = document.createElement('span'); s.className = 'pill-sub'; s.textContent = sub; box.append(s); }
  if (progress) {
    const p = document.createElement('progress'); p.max = progress[1]; p.value = progress[0];
    p.setAttribute('aria-label', 'Scan progress'); box.append(p);
  }
  el.status.append(box);
  for (const a of actions) {
    const b = document.createElement('button'); b.type = 'button';
    b.className = `btn ${a.kind || 'btn-secondary'}`; b.textContent = a.label; b.id = a.id || '';
    b.addEventListener('click', a.onClick); el.status.append(b);
  }
}

function toast(text, { action, timeout = 3500 } = {}) {
  const t = document.createElement('div'); t.className = 'toast glass';
  const span = document.createElement('span'); span.textContent = text; t.append(span);
  let timer;
  const close = () => { clearTimeout(timer); t.remove(); };
  if (action) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-plain'; b.textContent = action.label;
    if (action.id) b.id = action.id;
    b.addEventListener('click', () => { close(); action.onClick(); });
    t.append(b);
  }
  el.toasts.append(t);
  timer = setTimeout(close, timeout);
  return close;
}

function showBanner(text, { reload = false } = {}) {
  el.bannerText.textContent = text;
  el.bannerBtn.hidden = !reload;
  el.banner.hidden = false;
}
function hideBanner() { el.banner.hidden = true; }

function setControlsEnabled(on) {
  for (const b of document.querySelectorAll('.needs-scanner button, button.needs-scanner')) {
    b.disabled = !on;
  }
}

function readyStatus() {
  setStatus({ tone: 'ok', text: 'Ready' });
}

// ---------------------------------------------------------------- scanner
const scanner = createScanner();
window.__scanner = scanner;          // test hook (QA heap check); not used by the UI
let slowTimer = setTimeout(() => {
  if (!app.scannerReady && el.body.dataset.state === 'loading') {
    setStatus({ tone: 'busy', text: 'Loading the scanner…', sub: 'First load can take a moment on slow connections.' });
  }
}, 8000);

scanner.onStatus((s, detail) => {
  if (s === 'loading' || s === 'restarting') {
    app.scannerReady = false;
    if (!app.busy) { setState('loading'); setControlsEnabled(false); setStatus({ tone: 'busy', text: 'Loading the scanner…' }); }
  } else if (s === 'ready') {
    app.scannerReady = true;
    clearTimeout(slowTimer);
    setControlsEnabled(true);
    if (!app.busy && (el.body.dataset.state === 'loading' || el.body.dataset.state === 'error')) {
      setState(el.result.hidden ? 'ready' : 'done');
      readyStatus();
    }
  } else if (s === 'failed') {
    app.scannerReady = false;
    if (app.cancelled) return;
    setState('error');
    setControlsEnabled(false);
    setStatus({
      tone: 'error', text: "Couldn't load the scanner. Check your connection and try again.",
      actions: [{ label: 'Try Again', id: 'retry-load-btn', onClick: () => scanner.restart() }],
    });
  }
});

// ---------------------------------------------------------------- stage views
function revokeStageUrls() { app.stageUrls.forEach((u) => URL.revokeObjectURL(u)); app.stageUrls = []; }
function stageUrl(blob) { const u = URL.createObjectURL(blob); app.stageUrls.push(u); return u; }

function showPrompt() {
  revokeStageUrls();
  app.currentId = null;
  el.prompt.hidden = false; el.work.hidden = true; el.result.hidden = true;
  el.stage.classList.toggle('compact', !el.librarySection.hidden);
}

function showWorking(blob) {
  revokeStageUrls();
  el.workImg.src = stageUrl(blob);
  el.prompt.hidden = true; el.result.hidden = true; el.work.hidden = false;
  el.stage.classList.remove('compact');
}

function drawOutline(corners, w, h) {
  el.outline.replaceChildren();
  if (!corners || !w || !h) return;
  el.outline.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const ns = 'http://www.w3.org/2000/svg';
  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('points', corners.map((p) => p.join(',')).join(' '));
  poly.setAttribute('fill', 'rgb(10 132 255 / .12)');
  poly.setAttribute('stroke', '#0a84ff');
  poly.setAttribute('stroke-width', '3');                 // screen pixels (non-scaling stroke)
  poly.setAttribute('stroke-linejoin', 'round');
  poly.setAttribute('vector-effect', 'non-scaling-stroke');
  el.outline.append(poly);
}

function fileExt(blob) { return blob.type === 'image/png' ? 'png' : 'jpg'; }
function safeFileName(name) { return (name || 'scan').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'scan'; }

/** Show a scan (fresh or from the library) in the Done layout. */
function showResult(rec) {
  revokeStageUrls();
  app.currentId = rec.id || null;
  // The outline is drawn in the photo's pixel space; the SVG viewBox matches the stored original.
  el.outline.replaceChildren();
  el.beforeImg.onload = () => drawOutline(rec.corners, el.beforeImg.naturalWidth, el.beforeImg.naturalHeight);
  el.beforeImg.src = stageUrl(rec.original);
  el.resultImg.src = stageUrl(rec.result);
  el.nameInput.value = rec.name;
  el.download.href = stageUrl(rec.result);
  el.download.download = `${safeFileName(rec.name)}.${fileExt(rec.result)}`;
  el.download.setAttribute('aria-label', `Download ${rec.name}`);
  el.fallback.hidden = !(rec.method === 'minAreaRect' || rec.method === 'full');
  const when = new Date(rec.createdAt || Date.now());
  el.metaLine.textContent = `${rec.width} × ${rec.height} px · ${formatDate(when)}` + (rec.ms ? ` · scanned in ${(rec.ms / 1000).toFixed(1)} s` : '');
  el.prompt.hidden = true; el.work.hidden = true; el.result.hidden = false;
  el.stage.classList.remove('compact');
}

// ---------------------------------------------------------------- scanning
function formatDate(d) {
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function defaultName(hint) {
  const base = (hint || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  const generic = !base || /^(img|image|photo|dsc|pxl|screenshot|scan)\s*\d*/i.test(base) || /^\d+$/.test(base);
  return `${generic ? 'Scan' : base.charAt(0).toUpperCase() + base.slice(1)} – ${formatDate(new Date())}`;
}

async function startScan(blob, nameHint) {
  if (app.busy) return;
  if (!app.scannerReady) { toast('The scanner is still loading. Try again in a moment.'); return; }
  app.busy = true; app.cancelled = false;
  app.lastInput = { blob, nameHint };
  setControlsEnabled(false);
  setState('working');
  showWorking(blob);
  const cancelAction = [{ label: 'Cancel', id: 'cancel-btn', onClick: cancelScan }];
  setStatus({ tone: 'busy', text: 'Finding the page…', progress: [0, 4], actions: cancelAction });

  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (_) {
    showPrompt();                           // nothing to preview: don't leave a broken image on the stage
    return scanFailed("That file isn't a photo this browser can open. Try a JPEG or PNG.", false);
  }

  let r;
  try {
    r = await scanner.scan(bitmap, { mode: app.mode }, (stage) => {
      if (app.cancelled) return;
      const [n, text] = STAGES[stage] || [0, 'Working…'];
      setStatus({ tone: 'busy', text, progress: [n, 4], actions: cancelAction });
    });
  } catch (e) {
    if (app.cancelled) return;
    return scanFailed(/took too long/.test(e.message) ? 'This is taking longer than expected, so the scanner was restarted.' : "Couldn't scan this photo. Try another photo, or try again.", true);
  }
  if (app.cancelled) return;

  const rec = {
    name: defaultName(nameHint), createdAt: Date.now(),
    original: r.original, result: r.result, thumb: r.thumb,
    width: r.width, height: r.height, corners: r.corners, method: r.method, ms: r.ms,
  };
  let saved = true;
  try {
    rec.id = await db.addScan(rec);
  } catch (e) {
    saved = false;
    setStatus({ tone: 'error', text: e.name === 'QuotaExceededError' ? e.message : "Couldn't save this scan. You can still download it." });
  }
  app.busy = false;
  setControlsEnabled(true);
  showResult(rec);
  setState('done');
  if (saved) {
    readyStatus();
    toast('Saved to Library.');
    if (!app.askedPersist) { app.askedPersist = true; db.requestPersistence(); }   // Ledger's review: ask once
    await refreshLibrary();
  }
  el.nameInput.focus({ preventScroll: true });
  el.result.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function scanFailed(message, canRetry) {
  app.busy = false;
  setControlsEnabled(app.scannerReady);
  setState('error');
  const actions = [];
  if (canRetry) actions.push({ label: 'Try Again', id: 'retry-btn', kind: 'btn-primary', onClick: () => { const l = app.lastInput; if (l) startScan(l.blob, l.nameHint); } });
  actions.push({ label: 'Choose Another Photo', id: 'choose-another-btn', onClick: () => el.fileInput.click() });
  setStatus({ tone: 'error', text: message, actions });
}

function cancelScan() {
  if (!app.busy) return;
  app.cancelled = true;
  app.busy = false;
  scanner.restart();                       // kills the worker mid-scan; a fresh one loads (cached opencv.js)
  showPrompt();
  setState('loading');
  toast('Scan cancelled.');
  scanner.ready.then(() => { app.cancelled = false; }, () => { app.cancelled = false; });
}

// ---------------------------------------------------------------- library
async function refreshLibrary() {
  let scans = [];
  try { scans = await db.listScans(); } catch (e) { console.warn('Library unavailable:', e); }
  app.libraryUrls.forEach((u) => URL.revokeObjectURL(u));
  app.libraryUrls = [];
  const url = (b) => { const u = URL.createObjectURL(b); app.libraryUrls.push(u); return u; };

  el.librarySection.hidden = scans.length === 0;
  el.libraryCount.textContent = scans.length ? `· ${scans.length}` : '';
  el.promptTitle.textContent = scans.length ? 'Scan a page' : 'Scan your first page';
  if (!el.prompt.hidden) el.stage.classList.toggle('compact', scans.length > 0);

  el.library.replaceChildren(...scans.map((s) => {
    const li = document.createElement('li');
    li.className = 'scan-card'; li.dataset.scanId = s.id;
    const thumbBtn = document.createElement('button');
    thumbBtn.type = 'button'; thumbBtn.className = 'thumb-btn';
    thumbBtn.setAttribute('aria-label', `Open ${s.name}`);
    const img = document.createElement('img'); img.className = 'thumb'; img.alt = ''; img.loading = 'lazy'; img.src = url(s.thumb);
    thumbBtn.append(img);
    const meta = document.createElement('div'); meta.className = 'meta';
    const name = document.createElement('div'); name.className = 'name'; name.textContent = s.name; name.title = s.name;
    const date = document.createElement('time'); date.className = 'date'; date.dateTime = new Date(s.createdAt).toISOString(); date.textContent = formatDate(new Date(s.createdAt));
    meta.append(name, date);
    const actions = document.createElement('div'); actions.className = 'card-actions';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'icon-btn open-btn'; open.innerHTML = ICON.open; open.setAttribute('aria-label', `Open ${s.name}`);
    const dl = document.createElement('a'); dl.className = 'icon-btn download-link'; dl.innerHTML = ICON.download;
    dl.href = url(s.result); dl.download = `${safeFileName(s.name)}.${fileExt(s.result)}`; dl.setAttribute('aria-label', `Download ${s.name}`);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'icon-btn danger delete-btn'; del.innerHTML = ICON.trash; del.setAttribute('aria-label', `Delete ${s.name}`);
    actions.append(open, dl, del);
    li.append(thumbBtn, meta, actions);
    const openIt = () => { if (app.busy) return; showResult(s); setState('done'); readyStatus(); el.stage.scrollIntoView({ block: 'start' }); el.nameInput.focus({ preventScroll: true }); };
    thumbBtn.addEventListener('click', openIt);
    open.addEventListener('click', openIt);
    del.addEventListener('click', () => removeScan(s, li));
    return li;
  }));
  updateStorageLine();
}

async function removeScan(rec, li) {
  const next = li.nextElementSibling || li.previousElementSibling;
  try { await db.deleteScan(rec.id); } catch (e) { toast("Couldn't delete this scan. Try again."); return; }
  if (app.currentId === rec.id) { showPrompt(); setState(app.scannerReady ? 'ready' : 'loading'); }
  await refreshLibrary();
  const nextId = next && next.dataset.scanId;
  const target = nextId ? el.library.querySelector(`[data-scan-id="${CSS.escape(nextId)}"] .open-btn`) : null;
  (target || document.querySelector('#prompt-choose-btn')).focus({ preventScroll: true });
  toast('Scan deleted.', {
    timeout: 6000,
    action: { label: 'Undo', id: 'toast-undo', onClick: async () => {
      const copy = { ...rec }; delete copy.id;
      try { await db.addScan(copy); await refreshLibrary(); } catch (_) { toast("Couldn't restore the scan."); }
    } },
  });
}

async function updateStorageLine() {
  const est = await db.estimateStorage();
  if (est && typeof est.usage === 'number') {
    const mb = est.usage / 1048576;
    el.storageLine.textContent = `Using ${mb < 0.1 ? '< 0.1' : mb.toFixed(1)} MB on this device. Scans are saved in this browser only.`;
  }
}

// ---------------------------------------------------------------- inputs
function pickFile() { if (!app.busy && app.scannerReady) el.fileInput.click(); }
el.fileInput.addEventListener('change', () => {
  const f = el.fileInput.files && el.fileInput.files[0];
  el.fileInput.value = '';                 // allow picking the same file again
  if (f) startScan(f, f.name);
});
for (const id of ['#choose-btn', '#prompt-choose-btn', '#camera-choose']) {
  $(id).addEventListener('click', () => { if (id === '#camera-choose') closeCamera(); pickFile(); });
}
$('#again-btn').addEventListener('click', () => { showPrompt(); setState('ready'); pickFile(); });

async function useSample(file, label) {
  if (app.busy || !app.scannerReady) return;
  try {
    const res = await fetch(`samples/${file}`);
    if (!res.ok) throw new Error(res.statusText);
    startScan(await res.blob(), label);
  } catch (_) { toast("Couldn't load the sample photo."); }
}
$('#sample-receipt').addEventListener('click', () => useSample('receipt.jpg', 'Receipt'));
$('#sample-letter').addEventListener('click', () => useSample('letter.jpg', 'Letter'));

// Drag and drop onto the stage, and paste.
let dragDepth = 0, dropHint = null;
el.stage.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault(); dragDepth++;
  if (!dropHint) { dropHint = document.createElement('div'); dropHint.className = 'drop-hint'; dropHint.textContent = 'Drop to scan'; el.stage.append(dropHint); el.stage.classList.add('dragging'); }
});
el.stage.addEventListener('dragover', (e) => { if (dropHint) e.preventDefault(); });
const endDrag = () => { dragDepth = 0; if (dropHint) { dropHint.remove(); dropHint = null; } el.stage.classList.remove('dragging'); };
el.stage.addEventListener('dragleave', () => { if (--dragDepth <= 0) endDrag(); });
el.stage.addEventListener('drop', (e) => {
  e.preventDefault(); endDrag();
  const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) startScan(f, f.name);
});
window.addEventListener('paste', (e) => {
  if (e.target === el.nameInput) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  const f = item && item.getAsFile();
  if (f) startScan(f, 'Pasted image');
});

// Mode (B&W / Grayscale), remembered in IndexedDB settings.
for (const r of document.querySelectorAll('input[name="mode"]')) {
  r.addEventListener('change', () => { if (r.checked) { app.mode = r.value; db.setSetting('mode', r.value).catch(() => {}); } });
}

// Rename (Enter or leaving the field saves).
async function commitName() {
  const name = el.nameInput.value.trim();
  if (!app.currentId || !name) return;
  try {
    await db.renameScan(app.currentId, name);
    el.download.download = `${safeFileName(name)}.${el.download.download.split('.').pop()}`;
    await refreshLibrary();
  } catch (_) { toast("Couldn't rename this scan."); }
}
el.nameInput.addEventListener('change', commitName);
el.nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.nameInput.blur(); } });

// ---------------------------------------------------------------- camera
let stopCamera = null;
async function openCamera() {
  if (app.busy || !app.scannerReady) return;
  el.cameraError.hidden = true; el.cameraChoose.hidden = true; el.cameraCapture.disabled = true;
  el.video.hidden = false; el.cameraHint.hidden = false;
  el.cameraSheet.showModal();
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('insecure'); err.name = window.isSecureContext ? 'NotFoundError' : 'SecurityError'; throw err;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    stopCamera = () => { stream.getTracks().forEach((t) => t.stop()); stopCamera = null; };
    if (!el.cameraSheet.open) { stopCamera(); return; }   // closed while the prompt was up
    el.video.srcObject = stream;
    await el.video.play();
    el.cameraCapture.disabled = false;
  } catch (e) {
    const msg = e.name === 'NotAllowedError' ? "Camera access is off. Allow it in your browser's site settings, or choose a photo instead."
      : e.name === 'SecurityError' ? 'The camera needs a secure (https) page.'
      : e.name === 'NotReadableError' ? 'The camera is being used by another app. Close it, or choose a photo instead.'
      : 'No camera was found. Choose a photo instead.';
    el.cameraError.textContent = msg; el.cameraError.hidden = false;
    el.cameraChoose.hidden = false; el.video.hidden = true; el.cameraHint.hidden = true;
  }
}
function closeCamera() {
  if (stopCamera) stopCamera();
  el.video.srcObject = null;
  if (el.cameraSheet.open) el.cameraSheet.close();
}
$('#camera-btn').addEventListener('click', openCamera);
$('#prompt-camera-btn').addEventListener('click', openCamera);
$('#camera-cancel').addEventListener('click', closeCamera);
el.cameraSheet.addEventListener('close', () => { if (stopCamera) stopCamera(); el.video.srcObject = null; });
el.cameraCapture.addEventListener('click', () => {
  const v = el.video;
  if (!v.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  closeCamera();
  c.toBlob((blob) => { if (blob) startScan(blob, 'Camera'); }, 'image/jpeg', 0.92);
});

// ---------------------------------------------------------------- reset + DB events
$('#reset-btn').addEventListener('click', () => el.resetConfirm.showModal());
$('#reset-cancel').addEventListener('click', () => el.resetConfirm.close());
$('#reset-ok').addEventListener('click', async () => {
  el.resetConfirm.close();
  app.resetting = true;
  setStatus({ tone: 'busy', text: 'Resetting…' });
  revokeStageUrls();
  app.libraryUrls.forEach((u) => URL.revokeObjectURL(u));
  try {
    await db.resetAppData();
    location.reload();
  } catch (e) {
    app.resetting = false;
    setStatus({ tone: 'error', text: "Couldn't reset. Close other Scanner tabs and try again, or clear site data in your browser settings." });
  }
});

db.onDbEvent((type, detail) => {
  if (type === 'blocked') {
    if (detail && detail.during === 'reset') setStatus({ tone: 'busy', text: 'Close other Scanner tabs to finish resetting.' });
    else showBanner('Scanner is open in another tab with an older version. Close the other tab to finish updating.');
  } else if (type === 'unblocked') {
    hideBanner();
  } else if (type === 'versionchange') {
    if (!app.resetting) showBanner('Scanner was updated in another tab. Reload to keep using your library.', { reload: true });
  } else if (type === 'closed') {
    if (!app.resetting) showBanner('Your library was closed by the browser. Reload to continue.', { reload: true });
  }
});
el.bannerBtn.addEventListener('click', () => location.reload());

// ---------------------------------------------------------------- boot
(async function boot() {
  setControlsEnabled(false);
  try {
    app.mode = await db.getSetting('mode', 'bw');
    const r = document.querySelector(`input[name="mode"][value="${app.mode === 'gray' ? 'gray' : 'bw'}"]`);
    if (r) r.checked = true;
  } catch (_) { /* settings are optional */ }
  await refreshLibrary();
  showPrompt();
  // Free object URLs if the page is being thrown away.
  window.addEventListener('pagehide', () => { revokeStageUrls(); app.libraryUrls.forEach((u) => URL.revokeObjectURL(u)); });
})();
