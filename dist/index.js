// src/index.ts
import { defineExtension } from "@muclient/sdk";
var COPY = {
  title: "Scene",
  awaiting: "No room yet",
  present: "Present",
  exits: "Exits",
  none: "none",
  hostile: "hostile",
  go: (dir) => `go ${dir}`
};
var SCENE_CSS = `
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
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === void 0 || v === false) continue;
    if (k === "class") e.className = String(v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const k of kids) if (k !== null && k !== false) e.append(k);
  return e;
}
function presentOf(s) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const n of s.present) if (!seen.has(n)) {
    seen.add(n);
    out.push({ name: n });
  }
  for (const it of s.items) if (!seen.has(it.name)) {
    seen.add(it.name);
    out.push(it.hostile ? { name: it.name, hostile: true } : { name: it.name });
  }
  return out;
}
var sectionHead = (label) => el("div", { class: "sec-head", role: "heading", "aria-level": "3" }, label, el("span", { class: "sec-close", "aria-hidden": "true" }));
var sigil = () => el("span", { class: "sigil", "aria-hidden": "true" }, "\u25B8");
function renderScene(s, go) {
  if (!s || !s.known) return [el("p", { class: "empty awaiting", "data-testid": "scene-empty" }, COPY.awaiting)];
  const out = [el("h3", { class: "title glow-text", role: "heading", "aria-level": "2", "data-testid": "scene-title" }, s.title)];
  if (s.area) out.push(el("div", { class: "area", "data-testid": "scene-area" }, s.area));
  if (s.atmosphere) out.push(el("p", { class: "atmo" }, s.atmosphere));
  if (s.desc) out.push(el("p", { class: "desc" }, s.desc));
  if (s.pose) out.push(el("p", { class: "pose" }, s.pose));
  out.push(sectionHead(COPY.exits));
  if (s.exits.length) {
    const ul = el("ul", { class: "list", "data-testid": "scene-exits" });
    for (const dir of s.exits) {
      const b = el("button", { class: "exit", type: "button", title: COPY.go(dir) }, sigil(), dir);
      b.addEventListener("click", () => go(dir));
      ul.append(el("li", {}, b));
    }
    out.push(ul);
  } else out.push(el("p", { class: "empty none" }, COPY.none));
  out.push(sectionHead(COPY.present));
  const present = presentOf(s);
  if (present.length) {
    const ul = el("ul", { class: "list", "data-testid": "scene-present" });
    for (const p of present) ul.append(el("li", {}, sigil(), p.name, p.hostile ? el("span", { class: "hostile" }, COPY.hostile) : null));
    out.push(ul);
  } else out.push(el("p", { class: "empty none" }, COPY.none));
  return out;
}
var index_default = defineExtension({
  activate(ctx) {
    const mu = ctx.mu;
    mu.ui.style(SCENE_CSS);
    const mount = (host, pc) => {
      const root = el("section", { class: "mu-scene", "aria-label": COPY.title, "data-focus-region": "scene", tabindex: "-1", "data-testid": "scene" });
      host.append(root);
      const sid = pc.sid;
      const go = (dir) => {
        if (sid) void mu.sessions.send(dir, sid);
      };
      if (!sid) {
        root.replaceChildren(...renderScene(null, go));
        return () => root.remove();
      }
      const off = mu.scene.watch((s) => root.replaceChildren(...renderScene(s, go)), sid);
      return () => {
        off();
        root.remove();
      };
    };
    mu.panels.register({ id: "scene", title: COPY.title, singleton: true, defaultPosition: "right-top", order: 10, mount });
    mu.gmcp.on("Room", (_d, { sid }) => mu.panels.autoAdd("scene", sid));
  }
});
export {
  COPY,
  SCENE_CSS,
  index_default as default,
  presentOf,
  renderScene
};
