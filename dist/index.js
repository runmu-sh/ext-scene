// src/index.ts
import { defineExtension, h } from "@muclient/sdk";

// src/types.ts
var ITEM_KIND = "scene.item";
var EXIT_KIND = "scene.exit";

// src/room.ts
var EXITS_RE = /^(?:there (?:are|is) (?:an? )?(?:exits?|ways?(?: out)?) (?:to|leading to) |(?:obvious )?exits?: )(.+?)\.?$/i;
var HERE_RE = /^(.+?) (?:is|are) (?:[a-z]+ )?here\.?$/i;
var MAX_TITLE = 80;
function exitsOf(line) {
  const m = EXITS_RE.exec(line.trim());
  if (!m) return null;
  const out = [];
  for (let part of m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/)) {
    part = part.replace(/\s*\([^)]*\)\s*$/, "").replace(/^the\s+/i, "").trim();
    if (part && !out.includes(part)) out.push(part);
  }
  return out;
}
function peopleOf(line) {
  const out = [];
  for (const s of line.trim().split(/(?<=\.)\s+/)) {
    const m = HERE_RE.exec(s);
    if (!m) continue;
    for (const n of m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/)) {
      const name = n.trim();
      if (name && !/^you$/i.test(name) && !out.includes(name)) out.push(name);
    }
  }
  return out;
}
var looksTitle = (t) => t.length > 0 && t.length <= MAX_TITLE && !/[.!?:;,"')>\]]$/.test(t);
function roomOf(lines, maxSections = 4) {
  if (!lines.length) return null;
  const exits = exitsOf(lines[lines.length - 1]);
  if (!exits) return null;
  const sections = [[]];
  for (const raw of lines.slice(0, -1)) {
    const l = raw.trim();
    if (l) sections[sections.length - 1].push(l);
    else if (sections[sections.length - 1].length) sections.push([]);
  }
  if (!sections[sections.length - 1].length) sections.pop();
  if (!sections.length) return null;
  const tail = sections[sections.length - 1];
  const people = tail.some((l) => peopleOf(l).length || /^you (?:are|is) [a-z ]*here\.?$/i.test(l));
  for (let i = sections.length - 1; i >= Math.max(0, sections.length - maxSections); i--) {
    const sec = sections[i];
    let t = -1;
    for (let j = sec.length - 1; j >= 0; j--) if (looksTitle(sec[j]) && !HERE_RE.test(sec[j])) {
      t = j;
      break;
    }
    if (t < 0) continue;
    if (i === sections.length - 1 && people) continue;
    const present = people ? [...new Set(tail.flatMap(peopleOf))] : [];
    return { title: sec[t], desc: sec.slice(t + 1).join("\n"), exits, present };
  }
  return null;
}
function roomNameOf(data) {
  if (typeof data === "string") return data.trim();
  if (data && typeof data === "object" && typeof data.name === "string") return data.name.trim();
  return "";
}
function contextOf(data) {
  if (!data || typeof data !== "object") return null;
  const d = data;
  const me = typeof d.character === "string" ? d.character.trim().toLowerCase() : "";
  const patch = {};
  if (typeof d.room === "string" && d.room.trim()) patch.title = d.room.trim();
  if (typeof d.pose_line === "string") patch.pose = d.pose_line.trim();
  if (Array.isArray(d.presence)) patch.present = [...new Set(d.presence.filter((n) => typeof n === "string" && !!n.trim() && n.trim().toLowerCase() !== me).map((n) => n.trim()))];
  return Object.keys(patch).length ? patch : null;
}

// src/index.ts
var TEXT_PRIORITY = 10;
var KEEP = 40;
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
    mu.settings.define({
      title: "Scene",
      items: [{
        key: "fromText",
        label: "Read the room from the game text",
        default: true,
        kind: "toggle",
        scope: "both",
        hint: "For games that send only the room name over GMCP (Evennia games such as Underspire): the description, who is here and the exits come from the room text. A game that sends GMCP Room.Info is unaffected."
      }]
    });
    const fromText = (sid) => mu.settings.get("fromText", { sid }) !== false;
    const hasRoom = (sid) => mu.gmcp.state("Room.Info", sid) !== void 0 || mu.msdp.state("ROOM_EXITS", sid) !== void 0 || mu.msdp.state("ROOM_VNUM", sid) !== void 0;
    const given = /* @__PURE__ */ new Map();
    const give = (sid, patch) => {
      given.set(sid, mu.scene.provide(sid, patch, { priority: TEXT_PRIORITY }));
    };
    const release = (sid) => {
      given.get(sid)?.();
      given.delete(sid);
    };
    const seen = /* @__PURE__ */ new Map();
    const titles = /* @__PURE__ */ new Map();
    const seeded = /* @__PURE__ */ new Set();
    const seed = (sid) => {
      if (seeded.has(sid) || hasRoom(sid) || !fromText(sid)) return;
      seeded.add(sid);
      let lines = [];
      try {
        lines = mu.lines.recent(sid, { limit: 120 });
      } catch {
        return;
      }
      for (let end = lines.length - 1; end >= 0; end--) {
        if (lines[end].kind === "echo" || !exitsOf(lines[end].text)) continue;
        let start = end;
        while (start > 0 && end - start < KEEP && lines[start - 1].kind !== "echo") start--;
        const room = roomOf(lines.slice(start, end + 1).map((l) => l.text));
        if (room) {
          titles.set(sid, room.title ?? "");
          give(sid, room);
        }
        return;
      }
    };
    ctx.subscriptions.push(
      mu.gmcp.on("Room.Info", (_d, m) => release(m.sid)),
      mu.msdp.on("ROOM_EXITS", (_v, m) => release(m.sid)),
      mu.msdp.on("ROOM_VNUM", (_v, m) => release(m.sid)),
      mu.gmcp.on("Room.Name", (d, m) => {
        const title = roomNameOf(d);
        if (!title || hasRoom(m.sid) || !fromText(m.sid)) return;
        if (titles.get(m.sid) !== title) {
          titles.set(m.sid, title);
          give(m.sid, { title });
        }
        seed(m.sid);
      }),
      mu.gmcp.on("Player.Context", (d, m) => {
        const patch = contextOf(d);
        if (!patch || hasRoom(m.sid) || !fromText(m.sid)) return;
        if (patch.title) titles.set(m.sid, patch.title);
        give(m.sid, patch);
        seed(m.sid);
      }),
      // Observe: read only, live lines only (not backlog). A typed command starts a new block.
      mu.lines.stage({
        id: "room-text",
        phase: "observe",
        run: (line, c) => {
          if (line.kind === "echo") {
            seen.delete(c.sid);
            return;
          }
          if (line.kind !== "output" && line.kind !== "prompt") return;
          const buf = seen.get(c.sid) ?? [];
          buf.push(line.text);
          if (buf.length > KEEP) buf.splice(0, buf.length - KEEP);
          seen.set(c.sid, buf);
          const room = roomOf(buf);
          if (!room) return;
          seen.delete(c.sid);
          seeded.add(c.sid);
          if (hasRoom(c.sid) || !fromText(c.sid)) return;
          const moved = titles.get(c.sid) !== room.title;
          titles.set(c.sid, room.title ?? "");
          give(c.sid, moved ? { ...room, pose: "", items: [] } : room);
        }
      }),
      mu.sessions.each((s) => () => {
        seen.delete(s.id);
        titles.delete(s.id);
        given.delete(s.id);
        seeded.delete(s.id);
      })
    );
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
  TEXT_PRIORITY,
  contextOf,
  index_default as default,
  exitsOf,
  peopleOf,
  presentOf,
  renderScene,
  roomNameOf,
  roomOf
};
