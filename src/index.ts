/**
 * Scene (@runmu.sh/ext-scene): the Scene panel. The host tracks the room per session (the room adapters fill
 * `mu.scene` from GMCP Room.* and Char.Items.*, MSDP, or `mu.scene.set`); this extension only draws it, through
 * `mu.scene.watch`, so it works the same on every protocol.
 *
 * Composed as Underspire's room panel: title (uppercase glow, bottom rule), area, atmosphere (italic dim),
 * description, pose line (italic with a left rule), then ┤PRESENT├ over a ▸ list ("none" when empty) and, when the
 * room has exits, ┤EXITS├ over a ▸ list. Before any room it reads NO ROOM YET. An exit is a button that sends the
 * direction; exits and room items are context-menu targets for other extensions, of the kinds `scene.exit` and
 * `scene.item` this extension registers (SDK 1.14). On an older host they are the 1.12 kinds `scene-exit` and
 * `scene-item`.
 *
 * Alt+R (`focus.scene`, Go to scene) focuses the panel through `mu.panels.focus` (SDK 1.14). Before 1.14 the host
 * binds Alt+R itself, so the command is registered only when `mu.panels.focus` exists.
 *
 * Shown 'auto': the panel joins Views and adds itself (right top) the first time a session knows its room; the
 * player can set it off / auto / on per world (the host's "Show panel" row).
 */
import { defineExtension, h, type ContextTarget, type Dispose, type JsonSchema, type Mu, type PanelMountCtx, type SceneView } from '@muclient/sdk';
import type { PresentEntry, RenderOptions, SceneCopy, SceneCss } from './types';
import { EXIT_KIND, ITEM_KIND } from './types';

export type { PresentEntry, RenderOptions, SceneCopy, SceneCss, SceneExitData, SceneItemData } from './types';
export { EXIT_KIND, ITEM_KIND } from './types';

export const COPY: SceneCopy = {
  title: 'Scene',
  awaiting: 'No room yet',
  present: 'Present',
  exits: 'Exits',
  none: 'none',
  hostile: 'hostile',
  go: (dir: string) => `go ${dir}`,
  focus: 'Go to scene',
  itemKind: 'Scene item',
  exitKind: 'Exit',
};

/** The `data` schemas of the two context kinds, checked by the host on every `mu.menus.target` call. */
export const KIND_SCHEMAS: Record<typeof ITEM_KIND | typeof EXIT_KIND, JsonSchema> = {
  [ITEM_KIND]: {
    type: 'object', required: ['item'],
    properties: { item: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' }, hostile: { type: 'boolean' } } } },
  },
  [EXIT_KIND]: { type: 'object', required: ['exit'], properties: { exit: { type: 'string' } } },
};

const R = '.ext-panel[data-ext="scene"] .mu-scene';
/** Theme tokens only. Every rule is under `.ext-panel[data-ext="scene"] .mu-scene`; the section heads are the host's `.sec-head`. */
export const SCENE_CSS = `
${R} { height: 100%; overflow-y: auto; background: var(--bg-elev); padding: .7rem .85rem 1rem; font-family: var(--font-mono); font-size: .9rem; color: var(--fg); box-sizing: border-box; }
${R}:focus { outline: none; }
${R} .title { margin: 0 0 .5rem; padding-bottom: .4rem; font-weight: 400; font-size: .9rem; letter-spacing: .16em; text-transform: uppercase; color: var(--accent-bright); border-bottom: 1px solid var(--border-bright); }
${R} .area { font-size: .66rem; letter-spacing: .2em; text-transform: uppercase; color: var(--fg-faint); margin: -.2rem 0 .4rem; }
${R} .atmo { color: var(--fg-dim); font-style: italic; margin: 0 0 .4rem; }
${R} .desc { margin: 0 0 .4rem; white-space: pre-wrap; }
${R} .pose { color: var(--fg-dim); font-style: italic; margin: 0 0 .5rem; padding-left: .5rem; border-left: 2px solid var(--border-bright); }
${R} .list { list-style: none; margin: 0; padding: 0; }
${R} .list li { padding: .08rem 0; color: var(--fg); }
${R} .sigil { color: var(--accent); margin-right: .6ch; }
${R} .exit { display: inline-flex; align-items: center; min-height: 24px; color: inherit; text-align: left; transition: color .12s ease; }
${R} .exit:hover { color: var(--accent-bright); }
${R} .exit:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: -2px; }
${R} .hostile { color: var(--alert); font-size: .72rem; margin-left: 6px; }
${R} .none { margin: .1rem 0; font-style: normal; color: var(--fg-faint); }
${R} .awaiting { margin: 0; color: var(--fg-faint); font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }
`;

/** The host's class names (`mu.ui.css`), used when `renderScene` is called without them. */
const HOST_CSS: SceneCss = { secHead: 'sec-head', secClose: 'sec-close', empty: 'empty', glow: 'glow-text' };

/** People first, then room items, each name once (as the reference does). Exported for tests. */
export function presentOf(s: Pick<SceneView, 'present' | 'items'>): PresentEntry[] {
  const seen = new Set<string>();
  const out: PresentEntry[] = [];
  for (const n of s.present ?? []) if (!seen.has(n)) { seen.add(n); out.push({ name: n }); }
  for (const it of s.items ?? []) if (!seen.has(it.name)) { seen.add(it.name); out.push(it.hostile ? { name: it.name, hostile: true } : { name: it.name }); }
  return out;
}

const sigil = () => h('span', { class: 'sigil', 'aria-hidden': 'true' }, '▸');

/**
 * The panel's children for one scene; `go` sends an exit. Exported for tests. The 1.0 signature
 * `renderScene(s, go)` still works; `opts` (1.1) passes the host classes and a context-target hook.
 */
export function renderScene(s: SceneView | null, go: (dir: string) => void, opts: RenderOptions = {}): HTMLElement[] {
  const c: SceneCss = { ...HOST_CSS, ...opts.css };
  const mark = (el: HTMLElement, what: Parameters<NonNullable<RenderOptions['target']>>[1]) => { opts.target?.(el, what); return el; };
  if (!s || !s.known) return [h('p', { class: `${c.empty} awaiting`, 'data-testid': 'scene-empty' }, COPY.awaiting)];
  const head = (label: string) => h('div', { class: c.secHead, role: 'heading', 'aria-level': '3' }, label, h('span', { class: c.secClose, 'aria-hidden': 'true' }));
  const out: HTMLElement[] = [h('h3', { class: `title ${c.glow}`, role: 'heading', 'aria-level': '2', 'data-testid': 'scene-title' }, s.title)];
  if (s.area) out.push(h('div', { class: 'area', 'data-testid': 'scene-area' }, s.area));
  if (s.atmosphere) out.push(h('p', { class: 'atmo' }, s.atmosphere));
  if (s.desc) out.push(h('p', { class: 'desc' }, s.desc));
  if (s.pose) out.push(h('p', { class: 'pose' }, s.pose));

  // ┤PRESENT├ always (with "none"), then ┤EXITS├ only when there are exits, as the reference.
  out.push(head(COPY.present));
  const items = new Map((s.items ?? []).map((it) => [it.name, it] as const));
  const people = new Set(s.present ?? []);
  const present = presentOf(s);
  if (present.length) {
    const ul = h('ul', { class: 'list', 'data-testid': 'scene-present' });
    for (const p of present) {
      const it = people.has(p.name) ? undefined : items.get(p.name);
      const li = h('li', { class: 'entity-ref', 'data-item-id': it?.id || undefined }, sigil(), p.name, p.hostile ? h('span', { class: 'hostile' }, COPY.hostile) : null);
      ul.append(it ? mark(li, { item: it }) : mark(li, { person: p.name }));
    }
    out.push(ul);
  } else out.push(h('p', { class: `${c.empty} none` }, COPY.none));

  if (s.exits.length) {
    out.push(head(COPY.exits));
    const ul = h('ul', { class: 'list', 'data-testid': 'scene-exits' });
    for (const dir of s.exits) {
      const b = h('button', { class: 'exit', type: 'button', title: COPY.go(dir), onclick: () => go(dir) }, sigil(), dir);
      ul.append(h('li', {}, mark(b, { exit: dir })));
    }
    out.push(ul);
  }
  return out;
}

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    mu.ui.style(SCENE_CSS);
    const css: SceneCss = { secHead: mu.ui.css.secHead, secClose: mu.ui.css.secClose, empty: mu.ui.css.empty, glow: mu.ui.css.glow };

    // SDK 1.14 registered kinds; a 1.12 or 1.13 host has no `menus.kind` and gets the old flat kinds.
    const kinds = typeof mu.menus.kind === 'function';
    if (kinds) {
      ctx.subscriptions.push(
        mu.menus.kind({ id: ITEM_KIND, title: COPY.itemKind, schema: KIND_SCHEMAS[ITEM_KIND] }),
        mu.menus.kind({ id: EXIT_KIND, title: COPY.exitKind, schema: KIND_SCHEMAS[EXIT_KIND] }),
      );
    }
    const exitTarget = (sid: string, exit: string): ContextTarget => (kinds ? { kind: EXIT_KIND, sid, data: { exit } } : { kind: 'scene-exit', sid, exit });
    const itemTarget = (sid: string, item: SceneView['items'][number]): ContextTarget => (kinds ? { kind: ITEM_KIND, sid, data: { item } } : { kind: 'scene-item', sid, item });

    const mount = (host: HTMLElement, pc: PanelMountCtx): Dispose => {
      const root = h('section', { class: 'mu-scene', 'aria-label': COPY.title, 'data-focus-region': 'scene', tabindex: '-1', 'data-testid': 'scene' });
      host.append(root);
      const sid = pc.sid;
      if (!sid) { root.replaceChildren(...renderScene(null, () => {}, { css })); return () => root.remove(); }
      // A click is the player's: no key (north twice is twice), and never blocked by replay.
      const go = (dir: string) => { void mu.sessions.send(dir, { sid }); };
      let targets: Array<() => void> = [];
      const untarget = () => { for (const d of targets) d(); targets = []; };
      const target: RenderOptions['target'] = (el, what) => {
        if ('exit' in what) targets.push(mu.menus.target(el, exitTarget(sid, what.exit)));
        else if ('item' in what) targets.push(mu.menus.target(el, itemTarget(sid, what.item)));
      };
      let room: string | null = null;
      const off = mu.scene.watch((s) => {
        // A move resets the scroll; an update in the same room (someone arrives) keeps it. No id: every update may be a move.
        const moved = !s.known || !s.id || s.id !== room;
        room = s.known && s.id ? s.id : null;
        const top = root.scrollTop;
        untarget();
        root.replaceChildren(...renderScene(s, go, { css, target }));
        root.scrollTop = moved ? 0 : top;
      }, sid);
      return () => { off(); untarget(); root.remove(); };
    };

    mu.panels.register({ id: 'scene', title: COPY.title, singleton: true, defaultPosition: 'right-top', order: 10, show: 'auto', mount });
    // Alt+R. A 1.12 or 1.13 host registers `focus.scene` itself (registering it again throws there), and has no `panels.focus`.
    if (typeof mu.panels.focus === 'function') {
      mu.commands.register({ id: 'focus.scene', title: COPY.focus, keys: ['Alt+R'], group: 'Focus', when: 'session', run: () => { mu.panels.focus?.('scene'); } });
    }
    // Listed and auto-added once per session, the first time its scene knows a room: GMCP, MSDP or a provider alike.
    ctx.subscriptions.push(mu.sessions.each((s) => {
      let done = false;
      return mu.scene.watch((v) => { if (!done && v.known) { done = true; mu.panels.touch('scene', s.id); } }, s.id);
    }));
  },
});
