/**
 * `npm test`: the extension in the headless μClient host (@runmu.sh/dev/test), with a happy-dom document for the
 * panel. The headless `mu.scene.watch` fires once at subscribe only, so `setup()` wraps it with a live one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function find() {
  if (process.env.MUCLIENT_DEV_TEST) return process.env.MUCLIENT_DEV_TEST;
  try { return createRequire(join(ROOT, 'package.json')).resolve('@runmu.sh/dev/test'); } catch { /* next */ }
  throw new Error('@runmu.sh/dev/test was not found. Run npm install (it is in the @runmu.sh/dev devDependency).');
}
const { createHost } = await import(pathToFileURL(find()).href);

const win = new Window();
globalThis.window = win;
globalThis.document = win.document;
globalThis.HTMLElement = win.HTMLElement;
globalThis.Node = win.Node;

const BLANK = { known: false, id: '', title: '', area: '', desc: '', atmosphere: '', pose: '', exits: [], present: [], items: [], extras: {} };
const CHAPEL = { id: '9', title: 'Chapel of Ash', area: 'The Undercroft', desc: 'Soot on every pew.', atmosphere: 'Cold air.', pose: 'Ivo kneels.', exits: ['north', 'down', 'west'], present: ['Brother Ivo'], items: [{ id: '7', name: 'a rust-hound', hostile: true }, { id: '8', name: 'a candle' }] };

/** A host whose scene watch re-fires on `scene(sid, patch)`, and whose menu targets are counted. */
async function setup(opts = {}) {
  const host = createHost({ root: ROOT, sessions: [{ id: 's1', worldId: 'w1' }], ...opts });
  const scenes = new Map();
  const watchers = new Set();
  const view = (sid) => ({ ...BLANK, ...(scenes.get(sid) ?? {}) });
  host.mu.scene.watch = (fn, sid = 's1') => { const w = { fn, sid }; watchers.add(w); fn(view(sid)); return () => watchers.delete(w); };
  host.mu.scene.get = (sid = 's1') => view(sid);
  const scene = (sid, patch, replace = false) => {
    scenes.set(sid, { ...(replace ? {} : scenes.get(sid) ?? {}), ...patch, known: true });
    for (const w of [...watchers]) if (w.sid === sid) w.fn(view(sid));
  };
  const targets = [];
  host.mu.menus.target = (el, t) => { const r = { el, t, live: true }; targets.push(r); return () => { r.live = false; }; };
  // The headless host maps every css name to itself; μClient's are these (clients/web sdk.ts UI_CSS).
  host.mu.ui.css = { ...host.mu.ui.css, secHead: 'sec-head', secClose: 'sec-close', empty: 'empty', glow: 'glow-text' };
  const touches = [];
  host.mu.panels.touch = (id, sid) => { touches.push([id, sid]); };
  const ext = await host.load('src/index.ts');
  const mount = (sid = 's1') => {
    const el = document.createElement('div');
    document.body.append(el);
    const off = host.panels.get('scene').mount(el, { sid, worldId: 'w1', params: {} });
    const q = (s) => el.querySelector(s);
    return { el, off, q, root: () => q('[data-testid=scene]') };
  };
  return { host, ext, scene, targets, touches, watchers, mount };
}

const heads = (el) => [...el.querySelectorAll('.sec-head')].map((x) => x.textContent);
const exits = (el) => [...el.querySelectorAll('[data-testid=scene-exits] button')].map((b) => b.textContent.replace('▸', ''));

test('registration: Scene, right top, order 10, singleton, show auto; the manifest declares it and send-commands only', async () => {
  const { host } = await setup();
  assert.deepEqual([...host.panels.keys()], ['scene']);
  const { id, title, defaultPosition, order, singleton, show } = host.panels.get('scene');
  assert.deepEqual({ id, title, defaultPosition, order, singleton, show }, { id: 'scene', title: 'Scene', defaultPosition: 'right-top', order: 10, singleton: true, show: 'auto' });
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.muclient.contributes, { panels: [{ id: 'scene', title: 'Scene', order: 10, defaultPosition: 'right-top', singleton: true }] });
  assert.deepEqual(pkg.muclient.capabilities, ['send-commands']);
  assert.equal(pkg.muclient.api, '^1.12');
  assert.equal(host.errors.length, 0);
  await host.unload();
  assert.deepEqual(host.live(), [], 'everything registered through mu is disposed');
});

test('auto-add: touch once per session, the first time its scene knows a room, from any source (an MSDP-only session too)', async () => {
  const { host, scene, touches } = await setup();
  assert.deepEqual(touches, [], 'nothing before a room');
  scene('s1', { title: 'Chapel of Ash', exits: ['north'] });
  scene('s1', { present: ['Ivo'] });
  scene('s1', { id: '10', title: 'Ossuary Walk' }, true);
  assert.deepEqual(touches, [['scene', 's1']], 'once, however many updates follow');
  // A session that opens later, fed by MSDP (ROOM_NAME / ROOM_EXITS through the MSDP adapter): no GMCP at all.
  host.open({ id: 's2', worldId: 'w2', options: ['MSDP'] });
  assert.deepEqual(touches.length, 1);
  scene('s2', { title: 'Market Square', exits: ['e', 'w'] });
  assert.deepEqual(touches, [['scene', 's1'], ['scene', 's2']]);
  // No GMCP handler at all: a Room.* message alone does nothing.
  host.gmcp('s1', 'Room.Info', { num: 1, name: 'x' });
  assert.equal(touches.length, 2);
  assert.deepEqual(host.live().filter((r) => r.kind === 'gmcp.on'), []);
  await host.unload();
});

test('closing a session drops its watch; unload drops them all', async () => {
  const { host, watchers } = await setup();
  host.open({ id: 's2', worldId: 'w2' });
  assert.equal(watchers.size, 2);
  host.close('s2');
  assert.equal(watchers.size, 1);
  await host.unload();
  assert.equal(watchers.size, 0);
});

test('empty: NO ROOM YET before a room, and with no session', async () => {
  const { host, mount } = await setup();
  const a = mount('s1');
  assert.equal(a.q('[data-testid=scene-empty]').textContent, 'No room yet');
  assert.equal(a.q('[data-testid=scene-empty]').className, 'empty awaiting');
  const b = mount(null);
  assert.equal(b.q('[data-testid=scene-empty]').textContent, 'No room yet');
  a.off(); b.off();
  assert.equal(a.root(), null, 'unmount removes the root');
  await host.unload();
});

test('a room: title, area, atmosphere, description, pose, then ┤PRESENT├ and ┤EXITS├', async () => {
  const { host, scene, mount } = await setup();
  const p = mount();
  scene('s1', CHAPEL);
  const root = p.root();
  assert.equal(root.dataset.focusRegion, 'scene');
  assert.equal(root.getAttribute('aria-label'), 'Scene');
  assert.equal(root.getAttribute('tabindex'), '-1');
  assert.equal(p.q('[data-testid=scene-title]').textContent, 'Chapel of Ash');
  assert.equal(p.q('[data-testid=scene-title]').className, 'title glow-text');
  assert.equal(p.q('[data-testid=scene-area]').textContent, 'The Undercroft');
  assert.deepEqual([...root.children].map((c) => c.className || c.tagName), ['title glow-text', 'area', 'atmo', 'desc', 'pose', 'sec-head', 'list', 'sec-head', 'list']);
  assert.deepEqual(heads(root), ['Present', 'Exits'], 'Present before Exits, as the reference');
  assert.equal(root.querySelector('.sec-head').getAttribute('aria-level'), '3');
  assert.deepEqual(exits(root), ['north', 'down', 'west']);
  const rows = [...p.q('[data-testid=scene-present]').children];
  assert.deepEqual(rows.map((li) => li.textContent.replace('▸', '')), ['Brother Ivo', 'a rust-houndhostile', 'a candle']);
  assert.deepEqual(rows.map((li) => li.dataset.itemId ?? null), [null, '7', '8']);
  assert.equal(p.q('[data-testid=scene-present] .hostile').textContent, 'hostile');
  assert.equal(p.q('[data-testid=scene-exits] button').getAttribute('title'), 'go north');
  p.off();
  await host.unload();
});

test('no exits: no ┤EXITS├ at all; nobody present: "none"', async () => {
  const { host, scene, mount } = await setup();
  const p = mount();
  scene('s1', { title: 'Sealed Crypt' });
  assert.deepEqual(heads(p.root()), ['Present']);
  assert.equal(p.q('[data-testid=scene-exits]'), null);
  assert.equal(p.q('[data-testid=scene-present]'), null);
  assert.equal(p.q('.none').textContent, 'none');
  assert.equal(p.q('.none').className, 'empty none');
  p.off();
  await host.unload();
});

test('an exit click sends the direction to that session, with no key (twice is twice)', async () => {
  const { host, scene, mount } = await setup();
  host.open({ id: 's2', worldId: 'w1' });
  scene('s2', CHAPEL);
  const p = mount('s2');
  const b = [...p.el.querySelectorAll('[data-testid=scene-exits] button')];
  b[2].click(); b[2].click(); b[0].click();
  assert.deepEqual(host.sends('command'), [{ kind: 'command', sid: 's2', text: 'west' }, { kind: 'command', sid: 's2', text: 'west' }, { kind: 'command', sid: 's2', text: 'north' }]);
  p.off();
  await host.unload();
});

test('context targets: each exit is scene-exit, each room item scene-item; redrawn and unmounted ones are released', async () => {
  const { host, scene, targets, mount } = await setup();
  const p = mount();
  scene('s1', CHAPEL);
  const live = () => targets.filter((t) => t.live).map((t) => t.t);
  assert.deepEqual(live(), [
    { kind: 'scene-item', sid: 's1', item: { id: '7', name: 'a rust-hound', hostile: true } },
    { kind: 'scene-item', sid: 's1', item: { id: '8', name: 'a candle' } },
    { kind: 'scene-exit', sid: 's1', exit: 'north' },
    { kind: 'scene-exit', sid: 's1', exit: 'down' },
    { kind: 'scene-exit', sid: 's1', exit: 'west' },
  ]);
  assert.equal(targets.find((t) => t.t.exit === 'west').el.tagName, 'BUTTON');
  scene('s1', { exits: ['up'], items: [] });
  assert.deepEqual(live(), [{ kind: 'scene-exit', sid: 's1', exit: 'up' }], 'the old targets go with the old rows');
  p.off();
  assert.deepEqual(live(), []);
  await host.unload();
});

test('scroll: an update in the same room keeps it; a move resets it; no room id resets on every update', async () => {
  const { host, scene, mount } = await setup();
  const p = mount();
  scene('s1', CHAPEL);
  const root = p.root();
  root.scrollTop = 120;
  scene('s1', { present: ['Brother Ivo', 'Orrin'] }); // Room.Players in the same room
  assert.equal(root.scrollTop, 120, 'kept');
  assert.match(p.q('[data-testid=scene-present]').textContent, /Orrin/);
  scene('s1', { id: '10', title: 'Ossuary Walk', present: [], items: [], exits: ['east'] });
  assert.equal(root.scrollTop, 0, 'a move resets');
  assert.equal(p.q('[data-testid=scene-title]').textContent, 'Ossuary Walk');
  assert.equal(p.q('[data-testid=scene-present]'), null);
  root.scrollTop = 80;
  scene('s1', { id: '', present: ['Kest'] });
  assert.equal(root.scrollTop, 0, 'no id: every update may be a move');
  p.off();
  await host.unload();
});

test('exports: presentOf dedupes people first; renderScene keeps its 1.0 signature', async () => {
  const { presentOf, renderScene, COPY } = await loadSource();
  assert.deepEqual(presentOf({ present: ['a', 'b'], items: [{ id: '1', name: 'b' }, { id: '2', name: 'c', hostile: true }] }), [{ name: 'a' }, { name: 'b' }, { name: 'c', hostile: true }]);
  assert.deepEqual(presentOf({ present: ['a', 'a'], items: [] }), [{ name: 'a' }]);
  const sent = [];
  const out = renderScene({ ...BLANK, known: true, title: 'T', exits: ['n'] }, (d) => sent.push(d));
  assert.deepEqual(out.map((e) => e.className), ['title glow-text', 'sec-head', 'empty none', 'sec-head', 'list']);
  out[4].querySelector('button').click();
  assert.deepEqual(sent, ['n']);
  assert.equal(renderScene(null, () => {})[0].textContent, COPY.awaiting);
  assert.equal(renderScene(null, () => {}, { css: { empty: 'x-empty' } })[0].className, 'x-empty awaiting');
});

test('style: every rule is scoped under .ext-panel[data-ext="scene"], theme tokens only, no radius', async () => {
  const { SCENE_CSS } = await loadSource();
  const rules = SCENE_CSS.split('\n').filter((l) => l.trim());
  for (const r of rules) assert.ok(r.startsWith('.ext-panel[data-ext="scene"] .mu-scene'), r);
  assert.doesNotMatch(SCENE_CSS, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, 'no literal colours');
  assert.doesNotMatch(SCENE_CSS, /border-radius/);
  assert.doesNotMatch(SCENE_CSS, /transition:(?![^;]*\.12s)/, 'transitions are .12s');
});

/** The source module, bundled with the SDK's own `h` (so the exports can be called outside a host). */
async function loadSource() {
  const req = createRequire(join(ROOT, 'package.json'));
  const esbuild = await import(pathToFileURL(req.resolve('esbuild')).href);
  const r = await esbuild.build({
    entryPoints: [join(ROOT, 'src/index.ts')], bundle: true, format: 'esm', write: false, platform: 'neutral', logLevel: 'silent',
    plugins: [{ name: 'sdk', setup(b) { b.onResolve({ filter: /^@muclient\/sdk$/ }, () => ({ path: req.resolve('@muclient/sdk'), })); } }],
    mainFields: ['module', 'main'], conditions: ['import', 'default'],
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64');
  return import(url);
}
