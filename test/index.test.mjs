/**
 * `npm test`: the extension in the headless μClient host (@runmu.sh/dev/test), with a happy-dom document for the
 * panel. The headless `mu.scene.watch` fires once at subscribe only, so `setup()` wraps it with a live one.
 * `setup({ legacy: true })` removes `mu.menus.kind` and `mu.panels.focus`, as a 1.12 or 1.13 host has neither.
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
const { validate } = await import('./schema.mjs');

const win = new Window();
globalThis.window = win;
globalThis.document = win.document;
globalThis.HTMLElement = win.HTMLElement;
globalThis.Node = win.Node;

const BLANK = { known: false, id: '', title: '', area: '', desc: '', atmosphere: '', pose: '', exits: [], present: [], items: [], extras: {} };
const CHAPEL = { id: '9', title: 'Chapel of Ash', area: 'The Undercroft', desc: 'Soot on every pew.', atmosphere: 'Cold air.', pose: 'Ivo kneels.', exits: ['north', 'down', 'west'], present: ['Brother Ivo'], items: [{ id: '7', name: 'a rust-hound', hostile: true }, { id: '8', name: 'a candle' }] };

/** A host whose scene watch re-fires on `scene(sid, patch)`, and whose menu targets are counted. */
async function setup({ legacy = false, ...hostOpts } = {}) {
  const opts = { legacy };
  const host = createHost({ root: ROOT, sessions: [{ id: 's1', worldId: 'w1' }], ...hostOpts });
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
  // SDK 1.14 kinds as the host checks them: only a registered kind is published, and its data matches the schema.
  const kinds = new Map();
  if (opts.legacy) host.mu.menus.kind = undefined;
  else host.mu.menus.kind = (spec) => { kinds.set(spec.id, spec); return () => kinds.delete(spec.id); };
  host.mu.menus.target = (el, t) => {
    if (!opts.legacy && !kinds.has(t.kind)) throw new Error(`menus.target(${t.kind}): not a registered kind`);
    const r = { el, t, live: true }; targets.push(r); return () => { r.live = false; };
  };
  if (opts.legacy) host.mu.panels.focus = undefined;
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
  return { host, ext, scene, targets, touches, watchers, mount, kinds };
}

const heads = (el) => [...el.querySelectorAll('.sec-head')].map((x) => x.textContent);
const exits = (el) => [...el.querySelectorAll('[data-testid=scene-exits] button')].map((b) => b.textContent.replace('▸', ''));

test('registration: Scene, right top, order 10, singleton, show auto; the manifest declares it, read-output and send-commands', async () => {
  const { host } = await setup();
  assert.deepEqual([...host.panels.keys()], ['scene']);
  const { id, title, defaultPosition, order, singleton, show } = host.panels.get('scene');
  assert.deepEqual({ id, title, defaultPosition, order, singleton, show }, { id: 'scene', title: 'Scene', defaultPosition: 'right-top', order: 10, singleton: true, show: 'auto' });
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.muclient.contributes, {
    panels: [{ id: 'scene', title: 'Scene', order: 10, defaultPosition: 'right-top', singleton: true }],
    commands: [{ id: 'focus.scene', title: 'Go to scene', keys: ['Alt+R'] }],
  });
  assert.deepEqual(pkg.muclient.capabilities, ['read-output', 'send-commands'], 'read-output for the room text (1.3)');
  assert.equal(pkg.muclient.api, '^1.12', 'menus.kind and panels.focus are guarded, so 1.12 hosts still load it');
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
  // Room.Info is the adapters' (the host's scene model), not the extension's: alone it does nothing here.
  host.gmcp('s1', 'Room.Info', { num: 1, name: 'x' });
  assert.equal(touches.length, 2);
  assert.deepEqual(host.live().filter((k) => k === 'gmcp.on' || k === 'lines.stage'), ['gmcp.on', 'gmcp.on', 'gmcp.on', 'lines.stage'], 'Room.Info (to step aside), Room.Name, Player.Context and the room-text stage');
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

test('context targets: each exit is scene.exit, each room item scene.item; redrawn and unmounted ones are released', async () => {
  const { host, scene, targets, mount } = await setup();
  const p = mount();
  scene('s1', CHAPEL);
  const live = () => targets.filter((t) => t.live).map((t) => t.t);
  assert.deepEqual(live(), [
    { kind: 'scene.item', sid: 's1', data: { item: { id: '7', name: 'a rust-hound', hostile: true } } },
    { kind: 'scene.item', sid: 's1', data: { item: { id: '8', name: 'a candle' } } },
    { kind: 'scene.exit', sid: 's1', data: { exit: 'north' } },
    { kind: 'scene.exit', sid: 's1', data: { exit: 'down' } },
    { kind: 'scene.exit', sid: 's1', data: { exit: 'west' } },
  ]);
  assert.equal(targets.find((t) => t.t.data.exit === 'west').el.tagName, 'BUTTON');
  scene('s1', { exits: ['up'], items: [] });
  assert.deepEqual(live(), [{ kind: 'scene.exit', sid: 's1', data: { exit: 'up' } }], 'the old targets go with the old rows');
  p.off();
  assert.deepEqual(live(), []);
  await host.unload();
});

test('context kinds: scene.item and scene.exit registered with titles and schemas the published data passes; disposed on unload', async () => {
  const { host, scene, targets, mount, kinds } = await setup();
  assert.deepEqual([...kinds.values()].map(({ id, title }) => ({ id, title })), [{ id: 'scene.item', title: 'Scene item' }, { id: 'scene.exit', title: 'Exit' }]);
  assert.deepEqual(kinds.get('scene.item').schema.required, ['item']);
  assert.deepEqual(kinds.get('scene.exit').schema.required, ['exit']);
  const p = mount();
  scene('s1', CHAPEL);
  for (const { t } of targets) assert.equal(validate(kinds.get(t.kind).schema, t.data), null, JSON.stringify(t));
  assert.match(validate(kinds.get('scene.exit').schema, { exit: 3 }), /expected string/);
  assert.match(validate(kinds.get('scene.item').schema, { name: 'x' }), /item/);
  p.off();
  await host.unload();
  assert.equal(kinds.size, 0, 'both kinds are disposed');
});

test('an older host (no menus.kind, no panels.focus): the 1.12 kinds scene-exit / scene-item, and no focus.scene command', async () => {
  const { host, scene, targets, mount } = await setup({ legacy: true });
  assert.equal(host.commands.has('focus.scene'), false, 'the 1.12/1.13 host binds Alt+R itself');
  const p = mount();
  scene('s1', CHAPEL);
  assert.deepEqual(targets.filter((t) => t.live).map((t) => t.t), [
    { kind: 'scene-item', sid: 's1', item: { id: '7', name: 'a rust-hound', hostile: true } },
    { kind: 'scene-item', sid: 's1', item: { id: '8', name: 'a candle' } },
    { kind: 'scene-exit', sid: 's1', exit: 'north' },
    { kind: 'scene-exit', sid: 's1', exit: 'down' },
    { kind: 'scene-exit', sid: 's1', exit: 'west' },
  ]);
  assert.equal(host.errors.length, 0);
  p.off();
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('Alt+R: focus.scene (Go to scene, group Focus, while a session is open) calls mu.panels.focus("scene")', async () => {
  const { host } = await setup();
  const c = host.commands.get('focus.scene');
  assert.deepEqual({ title: c.title, keys: c.keys, group: c.group, when: c.when }, { title: 'Go to scene', keys: ['Alt+R'], group: 'Focus', when: 'session' });
  host.mu.commands.run('focus.scene');
  assert.deepEqual(host.calls.filter((x) => x.path === 'panels.focus'), [{ path: 'panels.focus', args: ['scene'] }]);
  assert.equal(host.errors.length, 0);
  await host.unload();
  assert.equal(host.commands.has('focus.scene'), false, 'unregistered on unload');
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

// ─── 1.3: the room from the game's text (Evennia: Underspire sends only Room.Name and Player.Context) ──────────
const ext = await import(pathToFileURL(join(ROOT, 'dist/index.js')).href).catch(() => null);
const room = ext ?? (await setup()).ext;
const INTAKE = [
  'Usage: . <first-person text>',
  '',
  'Shard intake',
  'A vast data space, humming with virtual activity.',
  '',
  'The intake terminal is installed here.',
  '',
  '^A2PGUE is standing here. You are standing here.',
  'There are exits to the san junipero (back).',
];

test('roomOf: an Evennia look → title, description, who is here (not you), exits by name; anything else → null', () => {
  const { roomOf, exitsOf, peopleOf } = room;
  assert.deepEqual(roomOf(INTAKE), { title: 'Shard intake', desc: 'A vast data space, humming with virtual activity.', exits: ['san junipero'], present: ['^A2PGUE'] });
  assert.deepEqual(roomOf(['San Junipero', 'The club is made of glass.', '', 'You are standing here.', 'There are exits to the shard intake (intake) and Shard services (s).']),
    { title: 'San Junipero', desc: 'The club is made of glass.', exits: ['shard intake', 'Shard services'], present: [] });
  assert.equal(roomOf(['Shard intake', 'A vast data space.']), null, 'no exits line: not a room (yet)');
  assert.equal(roomOf(['You say, "hi."', 'There are exits to the well.']), null, 'no title line');
  assert.deepEqual(exitsOf('There are exits to the market (m), the well, and the gate (g).'), ['market', 'well', 'gate']);
  assert.deepEqual(exitsOf('There is an exit to Shard services (s).'), ['Shard services']);
  assert.deepEqual(exitsOf('Exits: north, south and up'), ['north', 'south', 'up']);
  assert.equal(exitsOf('There are no exits here, says Ivo.'), null);
  assert.deepEqual(peopleOf('Ash and Ivo are sitting here. Mox is lying here. You are standing here.'), ['Ash', 'Ivo', 'Mox']);
});

test('Player.Context and Room.Name: title, pose and presence (without you), above the adapters', () => {
  const { contextOf, roomNameOf, TEXT_PRIORITY } = room;
  assert.deepEqual(contextOf({ room: 'Shard intake', pose_line: '', presence: ['^A2PGUE', 'Mox', ''], character: 'Mox' }), { title: 'Shard intake', pose: '', present: ['^A2PGUE'] });
  assert.equal(contextOf('x'), null);
  assert.equal(roomNameOf('Shard intake'), 'Shard intake');
  assert.equal(roomNameOf({ name: ' Market ' }), 'Market');
  assert.equal(TEXT_PRIORITY, 10, 'over the MSDP adapter\'s present: [] on a room name; released when the game sends a full room');
});

test('live: Room.Name, then the look text fills the scene; a typed command starts over; Room.Info turns it off', async () => {
  const { host, mount } = await setup();
  const provided = [];
  const real = host.mu.scene.provide;
  host.mu.scene.provide = (sid, patch, opts) => { provided.push({ sid, patch, priority: opts?.priority }); return real(sid, patch, opts); };
  host.gmcp('s1', 'Room.Name', 'Shard intake');
  // Underspire mirrors Room.Name into MSDP room_name: not a full room, the reader stays on.
  host.msdp('s1', 'room_name', 'Shard intake');
  assert.deepEqual(provided.at(-1), { sid: 's1', patch: { title: 'Shard intake' }, priority: 10 });
  for (const l of INTAKE) host.line('s1', l);
  assert.deepEqual(provided.at(-1).patch, { title: 'Shard intake', desc: 'A vast data space, humming with virtual activity.', exits: ['san junipero'], present: ['^A2PGUE'] }, 'same room: pose and items kept');
  // A move: the auto-look of the next room.
  for (const l of ['San Junipero', 'The club is made of glass.', '', 'You are standing here.', 'There are exits to the shard intake (intake).']) host.line('s1', l);
  assert.deepEqual(provided.at(-1).patch, { title: 'San Junipero', desc: 'The club is made of glass.', exits: ['shard intake'], present: [], pose: '', items: [] });
  // An echo between the title and the exits line: the block is broken, nothing is read.
  const n = provided.length;
  host.line('s1', 'Market'); host.line('s1', 'look', 'echo'); host.line('s1', ''); host.line('s1', 'There are exits to the gate.');
  assert.equal(provided.length, n);
  // Off when the game sends its own room package: the provider is released.
  let released = 0;
  host.mu.scene.provide = (sid, patch, opts) => { provided.push({ sid, patch, priority: opts?.priority }); real(sid, patch, opts); return () => { released++; }; };
  host.gmcp('s1', 'Room.Name', 'Shard intake');
  const m = provided.length;
  host.gmcp('s1', 'Room.Info', { num: 1, name: 'Chapel' });
  assert.equal(released, 1, 'Room.Info releases the text provider');
  host.gmcp('s1', 'Room.Name', 'Elsewhere');
  for (const l of INTAKE) host.line('s1', l);
  assert.equal(provided.length, m, 'Room.Info: the adapters own the scene');
  await host.unload();
  assert.deepEqual(host.live(), []);
  void mount;
});

test('setting: "Read the room from the game text" off → nothing from text or Room.Name', async () => {
  const { host } = await setup({ settings: { fromText: false } });
  const provided = [];
  host.mu.scene.provide = (sid, patch) => { provided.push(patch); return () => {}; };
  host.gmcp('s1', 'Room.Name', 'Shard intake');
  host.gmcp('s1', 'Player.Context', { room: 'Shard intake', presence: ['A'] });
  for (const l of INTAKE) host.line('s1', l);
  assert.deepEqual(provided, []);
  assert.equal(host.settingsSchema.items[0].key, 'fromText');
  await host.unload();
});

test('reload: the room name (replayed) seeds the scene from the newest look the client holds', async () => {
  const { host } = await setup();
  const provided = [];
  host.mu.lines.recent = () => [
    ...['Shard intake', 'A vast data space.', '', 'There are exits to the san junipero (back).'].map((text) => ({ text, kind: 'output' })),
    { text: 'san junipero', kind: 'echo' },
    ...['San Junipero', 'The club is made of glass.', '', 'Ash is standing here. You are standing here.', 'There are exits to the shard intake (intake).', 'You earned 1 experience.'].map((text) => ({ text, kind: 'output' })),
  ];
  host.mu.scene.provide = (sid, patch) => { provided.push(patch); return () => {}; };
  host.gmcp('s1', 'Room.Name', 'San Junipero');
  assert.deepEqual(provided, [{ title: 'San Junipero' }, { title: 'San Junipero', desc: 'The club is made of glass.', exits: ['shard intake'], present: ['Ash'] }]);
  host.gmcp('s1', 'Player.Context', { room: 'San Junipero', presence: [] });
  assert.equal(provided.length, 3, 'once per session');
  await host.unload();
});
