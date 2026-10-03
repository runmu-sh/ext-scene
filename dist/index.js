// src/index.ts
import { defineExtension, h } from "@muclient/sdk";

// src/types.ts
var ITEM_KIND = "scene.item";
var EXIT_KIND = "scene.exit";

// src/index.ts
var COPY = {
  title: "Scene",
  awaiting: "No room yet",
  present: "Present",
  exits: "Exits",
  none: "none",
  hostile: "hostile",
  go: (dir) => `go ${dir}`,
  focus: "Go to scene",
  itemKind: "Scene item",
  exitKind: "Exit"
};
var KIND_SCHEMAS = {
  [ITEM_KIND]: {
    type: "object",
    required: ["item"],
    properties: { item: { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" }, hostile: { type: "boolean" } } } }
  },
  [EXIT_KIND]: { type: "object", required: ["exit"], properties: { exit: { type: "string" } } }
};
var R = '.ext-panel[data-ext="scene"] .mu-scene';
var SCENE_CSS = `
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
var HOST_CSS = { secHead: "sec-head", secClose: "sec-close", empty: "empty", glow: "glow-text" };
function presentOf(s) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const n of s.present ?? []) if (!seen.has(n)) {
    seen.add(n);
    out.push({ name: n });
  }
  for (const it of s.items ?? []) if (!seen.has(it.name)) {
    seen.add(it.name);
    out.push(it.hostile ? { name: it.name, hostile: true } : { name: it.name });
  }
  return out;
}
var sigil = () => h("span", { class: "sigil", "aria-hidden": "true" }, "\u25B8");
function renderScene(s, go, opts = {}) {
  const c = { ...HOST_CSS, ...opts.css };
  const mark = (el, what) => {
    opts.target?.(el, what);
    return el;
  };
  if (!s || !s.known) return [h("p", { class: `${c.empty} awaiting`, "data-testid": "scene-empty" }, COPY.awaiting)];
  const head = (label) => h("div", { class: c.secHead, role: "heading", "aria-level": "3" }, label, h("span", { class: c.secClose, "aria-hidden": "true" }));
  const out = [h("h3", { class: `title ${c.glow}`, role: "heading", "aria-level": "2", "data-testid": "scene-title" }, s.title)];
  if (s.area) out.push(h("div", { class: "area", "data-testid": "scene-area" }, s.area));
  if (s.atmosphere) out.push(h("p", { class: "atmo" }, s.atmosphere));
  if (s.desc) out.push(h("p", { class: "desc" }, s.desc));
  if (s.pose) out.push(h("p", { class: "pose" }, s.pose));
  out.push(head(COPY.present));
  const items = new Map((s.items ?? []).map((it) => [it.name, it]));
  const people = new Set(s.present ?? []);
  const present = presentOf(s);
  if (present.length) {
    const ul = h("ul", { class: "list", "data-testid": "scene-present" });
    for (const p of present) {
      const it = people.has(p.name) ? void 0 : items.get(p.name);
      const li = h("li", { class: "entity-ref", "data-item-id": it?.id || void 0 }, sigil(), p.name, p.hostile ? h("span", { class: "hostile" }, COPY.hostile) : null);
      ul.append(it ? mark(li, { item: it }) : mark(li, { person: p.name }));
    }
    out.push(ul);
  } else out.push(h("p", { class: `${c.empty} none` }, COPY.none));
  if (s.exits.length) {
    out.push(head(COPY.exits));
    const ul = h("ul", { class: "list", "data-testid": "scene-exits" });
    for (const dir of s.exits) {
      const b = h("button", { class: "exit", type: "button", title: COPY.go(dir), onclick: () => go(dir) }, sigil(), dir);
      ul.append(h("li", {}, mark(b, { exit: dir })));
    }
    out.push(ul);
  }
  return out;
}
var index_default = defineExtension({
  activate(ctx) {
    const mu = ctx.mu;
    mu.ui.style(SCENE_CSS);
    const css = { secHead: mu.ui.css.secHead, secClose: mu.ui.css.secClose, empty: mu.ui.css.empty, glow: mu.ui.css.glow };
    const kinds = typeof mu.menus.kind === "function";
    if (kinds) {
      ctx.subscriptions.push(
        mu.menus.kind({ id: ITEM_KIND, title: COPY.itemKind, schema: KIND_SCHEMAS[ITEM_KIND] }),
        mu.menus.kind({ id: EXIT_KIND, title: COPY.exitKind, schema: KIND_SCHEMAS[EXIT_KIND] })
      );
    }
    const exitTarget = (sid, exit) => kinds ? { kind: EXIT_KIND, sid, data: { exit } } : { kind: "scene-exit", sid, exit };
    const itemTarget = (sid, item) => kinds ? { kind: ITEM_KIND, sid, data: { item } } : { kind: "scene-item", sid, item };
    const mount = (host, pc) => {
      const root = h("section", { class: "mu-scene", "aria-label": COPY.title, "data-focus-region": "scene", tabindex: "-1", "data-testid": "scene" });
      host.append(root);
      const sid = pc.sid;
      if (!sid) {
        root.replaceChildren(...renderScene(null, () => {
        }, { css }));
        return () => root.remove();
      }
      const go = (dir) => {
        void mu.sessions.send(dir, { sid });
      };
      let targets = [];
      const untarget = () => {
        for (const d of targets) d();
        targets = [];
      };
      const target = (el, what) => {
        if ("exit" in what) targets.push(mu.menus.target(el, exitTarget(sid, what.exit)));
        else if ("item" in what) targets.push(mu.menus.target(el, itemTarget(sid, what.item)));
      };
      let room = null;
      const off = mu.scene.watch((s) => {
        const moved = !s.known || !s.id || s.id !== room;
        room = s.known && s.id ? s.id : null;
        const top = root.scrollTop;
        untarget();
        root.replaceChildren(...renderScene(s, go, { css, target }));
        root.scrollTop = moved ? 0 : top;
      }, sid);
      return () => {
        off();
        untarget();
        root.remove();
      };
    };
    mu.panels.register({ id: "scene", title: COPY.title, singleton: true, defaultPosition: "right-top", order: 10, show: "auto", mount });
    if (typeof mu.panels.focus === "function") {
      mu.commands.register({ id: "focus.scene", title: COPY.focus, keys: ["Alt+R"], group: "Focus", when: "session", run: () => {
        mu.panels.focus?.("scene");
      } });
    }
    ctx.subscriptions.push(mu.sessions.each((s) => {
      let done = false;
      return mu.scene.watch((v) => {
        if (!done && v.known) {
          done = true;
          mu.panels.touch("scene", s.id);
        }
      }, s.id);
    }));
  }
});
export {
  COPY,
  EXIT_KIND,
  ITEM_KIND,
  KIND_SCHEMAS,
  SCENE_CSS,
  index_default as default,
  presentOf,
  renderScene
};
