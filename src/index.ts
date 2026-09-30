/**
 * Scene (@runmu.sh/ext-scene): the Scene panel (R-SCENE, R-HUD-LOC, style bible §7 "Scene panel"), moved out of
 * the world-panels core onto the SDK. The host still tracks the room per session (GMCP Room.* and
 * Char.Items.*, MSDP, `mu.scene.set`); this extension only draws it, through `mu.scene.watch`.
 *
 * Composed as Underspire's room panel: title (uppercase glow, bottom rule), area, atmosphere (italic dim),
 * description, pose line (italic with a left rule), then ┤EXITS├ and ┤PRESENT├ section heads over ▸
 * lists; "none" when a list is empty and NO ROOM YET (an uppercase tracked faint label, 09-29) before any room arrives. An exit is a button
 * that sends the direction. A marketplace extension; once installed it takes the Scene slot of the default layout (R-LAYOUT).
 */
import { defineExtension, type Dispose, type Mu, type PanelMountCtx, type SceneView } from '@muclient/sdk';

export const COPY = {
  title: 'Scene',
  awaiting: 'No room yet',
  present: 'Present',
  exits: 'Exits',
  none: 'none',
  hostile: 'hostile',
  go: (dir: string) => `go ${dir}`,
};

/** Tokens only (R-ARCH-7). Every rule is under `.mu-scene`. */
export const SCENE_CSS = `
.mu-scene { height: 100%; overflow-y: auto; background: var(--bg-elev); padding: .7rem .85rem 1rem; font-size: .9rem; color: var(--fg); box-sizing: border-box; }
.mu-scene:focus { outline: none; }
.mu-scene .title { margin: 0 0 .5rem; padding-bottom: .4rem; font-weight: 400; font-size: .9rem; letter-spacing: .16em; text-transform: uppercase; color: var(--accent-bright); border-bottom: 1px solid var(--border-bright); }
.mu-scene .area { font-size: .66rem; letter-spacing: .2em; text-transform: uppercase; color: var(--fg-faint); margin: -.2rem 0 .4rem; }
.mu-scene .atmo { color: var(--fg-dim); font-style: italic; margin: 0 0 .4rem; }
.mu-scene .desc { margin: 0 0 .4rem; white-space: pre-wrap; }
.mu-scene .pose { color: var(--fg-dim); font-style: italic; margin: 0 0 .5rem; padding-left: .5rem; border-left: 2px solid var(--border-bright); }
.mu-scene .list { list-style: none; margin: 0; padding: 0; }
.mu-scene .list li { padding: .08rem 0; color: var(--fg); }
.mu-scene .sigil { color: var(--accent); margin-right: .6ch; }
.mu-scene .exit { color: inherit; text-align: left; transition: color .12s ease; }
.mu-scene .exit:hover { color: var(--accent-bright); }
.mu-scene .exit:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 1px; }
.mu-scene .hostile { color: var(--alert); font-size: .72rem; margin-left: 6px; }
.mu-scene .none { margin: .1rem 0; font-style: normal; }
.mu-scene .awaiting { margin: 0; color: var(--fg-faint); font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }
`;

type Props = Record<string, string | boolean | undefined>;
function el(tag: string, props: Props = {}, ...kids: Array<Node | string | null | false>): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k !== null && k !== false) e.append(k);
  return e;
}

/** People first, then room items, each name once (as the reference does). Exported for tests. */
export function presentOf(s: Pick<SceneView, 'present' | 'items'>): Array<{ name: string; hostile?: boolean }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; hostile?: boolean }> = [];
  for (const n of s.present) if (!seen.has(n)) { seen.add(n); out.push({ name: n }); }
  for (const it of s.items) if (!seen.has(it.name)) { seen.add(it.name); out.push(it.hostile ? { name: it.name, hostile: true } : { name: it.name }); }
  return out;
}

const sectionHead = (label: string) => el('div', { class: 'sec-head', role: 'heading', 'aria-level': '3' }, label, el('span', { class: 'sec-close', 'aria-hidden': 'true' }));
const sigil = () => el('span', { class: 'sigil', 'aria-hidden': 'true' }, '▸');

/** The panel's children for one scene; `go` sends an exit. Exported for tests. */
export function renderScene(s: SceneView | null, go: (dir: string) => void): HTMLElement[] {
  if (!s || !s.known) return [el('p', { class: 'empty awaiting', 'data-testid': 'scene-empty' }, COPY.awaiting)];
  const out: HTMLElement[] = [el('h3', { class: 'title glow-text', role: 'heading', 'aria-level': '2', 'data-testid': 'scene-title' }, s.title)];
  if (s.area) out.push(el('div', { class: 'area', 'data-testid': 'scene-area' }, s.area));
  if (s.atmosphere) out.push(el('p', { class: 'atmo' }, s.atmosphere));
  if (s.desc) out.push(el('p', { class: 'desc' }, s.desc));
  if (s.pose) out.push(el('p', { class: 'pose' }, s.pose));

  out.push(sectionHead(COPY.exits));
  if (s.exits.length) {
    const ul = el('ul', { class: 'list', 'data-testid': 'scene-exits' });
    for (const dir of s.exits) {
      const b = el('button', { class: 'exit', type: 'button', title: COPY.go(dir) }, sigil(), dir);
      b.addEventListener('click', () => go(dir));
      ul.append(el('li', {}, b));
    }
    out.push(ul);
  } else out.push(el('p', { class: 'empty none' }, COPY.none));

  out.push(sectionHead(COPY.present));
  const present = presentOf(s);
  if (present.length) {
    const ul = el('ul', { class: 'list', 'data-testid': 'scene-present' });
    for (const p of present) ul.append(el('li', {}, sigil(), p.name, p.hostile ? el('span', { class: 'hostile' }, COPY.hostile) : null));
    out.push(ul);
  } else out.push(el('p', { class: 'empty none' }, COPY.none));
  return out;
}

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    mu.ui.style(SCENE_CSS);

    const mount = (host: HTMLElement, pc: PanelMountCtx): Dispose => {
      const root = el('section', { class: 'mu-scene', 'aria-label': COPY.title, 'data-focus-region': 'scene', tabindex: '-1', 'data-testid': 'scene' });
      host.append(root);
      const sid = pc.sid;
      const go = (dir: string) => { if (sid) void mu.sessions.send(dir, sid); };
      if (!sid) { root.replaceChildren(...renderScene(null, go)); return () => root.remove(); }
      const off = mu.scene.watch((s) => root.replaceChildren(...renderScene(s, go)), sid);
      return () => { off(); root.remove(); };
    };

    mu.panels.register({ id: 'scene', title: COPY.title, singleton: true, defaultPosition: 'right-top', order: 10, mount });
    // R-AUTO-PANELS: the first Room.* of a session adds the panel (once per world on this device).
    mu.gmcp.on('Room', (_d, { sid }) => mu.panels.autoAdd('scene', sid));
  },
});
