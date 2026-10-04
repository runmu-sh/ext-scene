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
      }),
      mu.gmcp.on("Player.Context", (d, m) => {
        const patch = contextOf(d);
        if (!patch || hasRoom(m.sid) || !fromText(m.sid)) return;
        if (patch.title) titles.set(m.sid, patch.title);
        give(m.sid, patch);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2luZGV4LnRzIiwgInNyYy90eXBlcy50cyIsICJzcmMvcm9vbS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBTY2VuZSAoQHJ1bm11LnNoL2V4dC1zY2VuZSk6IHRoZSBTY2VuZSBwYW5lbC4gVGhlIGhvc3QgdHJhY2tzIHRoZSByb29tIHBlciBzZXNzaW9uICh0aGUgcm9vbSBhZGFwdGVycyBmaWxsXG4gKiBgbXUuc2NlbmVgIGZyb20gR01DUCBSb29tLiogYW5kIENoYXIuSXRlbXMuKiwgTVNEUCwgb3IgYG11LnNjZW5lLnNldGApOyB0aGlzIGV4dGVuc2lvbiBkcmF3cyBpdCwgdGhyb3VnaFxuICogYG11LnNjZW5lLndhdGNoYCwgc28gaXQgd29ya3MgdGhlIHNhbWUgb24gZXZlcnkgcHJvdG9jb2wuIE9uIGEgZ2FtZSB0aGF0IHNlbmRzIG9ubHkgYFJvb20uTmFtZWAgKEV2ZW5uaWEsIHN1Y2hcbiAqIGFzIFVuZGVyc3BpcmUpIGl0IGFsc28gcHJvdmlkZXMgdGhlIHJvb20gZnJvbSBgUGxheWVyLkNvbnRleHRgIGFuZCB0aGUgcm9vbSB0ZXh0IGl0IHByaW50cyAoYC4vcm9vbS50c2ApLlxuICpcbiAqIENvbXBvc2VkIGFzIFVuZGVyc3BpcmUncyByb29tIHBhbmVsOiB0aXRsZSAodXBwZXJjYXNlIGdsb3csIGJvdHRvbSBydWxlKSwgYXJlYSwgYXRtb3NwaGVyZSAoaXRhbGljIGRpbSksXG4gKiBkZXNjcmlwdGlvbiwgcG9zZSBsaW5lIChpdGFsaWMgd2l0aCBhIGxlZnQgcnVsZSksIHRoZW4gXHUyNTI0UFJFU0VOVFx1MjUxQyBvdmVyIGEgXHUyNUI4IGxpc3QgKFwibm9uZVwiIHdoZW4gZW1wdHkpIGFuZCwgd2hlbiB0aGVcbiAqIHJvb20gaGFzIGV4aXRzLCBcdTI1MjRFWElUU1x1MjUxQyBvdmVyIGEgXHUyNUI4IGxpc3QuIEJlZm9yZSBhbnkgcm9vbSBpdCByZWFkcyBOTyBST09NIFlFVC4gQW4gZXhpdCBpcyBhIGJ1dHRvbiB0aGF0IHNlbmRzIHRoZVxuICogZGlyZWN0aW9uOyBleGl0cyBhbmQgcm9vbSBpdGVtcyBhcmUgY29udGV4dC1tZW51IHRhcmdldHMgZm9yIG90aGVyIGV4dGVuc2lvbnMsIG9mIHRoZSBraW5kcyBgc2NlbmUuZXhpdGAgYW5kXG4gKiBgc2NlbmUuaXRlbWAgdGhpcyBleHRlbnNpb24gcmVnaXN0ZXJzIChTREsgMS4xNCkuIE9uIGFuIG9sZGVyIGhvc3QgdGhleSBhcmUgdGhlIDEuMTIga2luZHMgYHNjZW5lLWV4aXRgIGFuZFxuICogYHNjZW5lLWl0ZW1gLlxuICpcbiAqIEFsdCtSIChgZm9jdXMuc2NlbmVgLCBHbyB0byBzY2VuZSkgZm9jdXNlcyB0aGUgcGFuZWwgdGhyb3VnaCBgbXUucGFuZWxzLmZvY3VzYCAoU0RLIDEuMTQpLiBCZWZvcmUgMS4xNCB0aGUgaG9zdFxuICogYmluZHMgQWx0K1IgaXRzZWxmLCBzbyB0aGUgY29tbWFuZCBpcyByZWdpc3RlcmVkIG9ubHkgd2hlbiBgbXUucGFuZWxzLmZvY3VzYCBleGlzdHMuXG4gKlxuICogU2hvd24gJ2F1dG8nOiB0aGUgcGFuZWwgam9pbnMgVmlld3MgYW5kIGFkZHMgaXRzZWxmIChyaWdodCB0b3ApIHRoZSBmaXJzdCB0aW1lIGEgc2Vzc2lvbiBrbm93cyBpdHMgcm9vbTsgdGhlXG4gKiBwbGF5ZXIgY2FuIHNldCBpdCBvZmYgLyBhdXRvIC8gb24gcGVyIHdvcmxkICh0aGUgaG9zdCdzIFwiU2hvdyBwYW5lbFwiIHJvdykuXG4gKi9cbmltcG9ydCB7IGRlZmluZUV4dGVuc2lvbiwgaCwgdHlwZSBDb250ZXh0VGFyZ2V0LCB0eXBlIERpc3Bvc2UsIHR5cGUgSnNvblNjaGVtYSwgdHlwZSBNdSwgdHlwZSBQYW5lbE1vdW50Q3R4LCB0eXBlIFNjZW5lVmlldyB9IGZyb20gJ0BtdWNsaWVudC9zZGsnO1xuaW1wb3J0IHR5cGUgeyBQcmVzZW50RW50cnksIFJlbmRlck9wdGlvbnMsIFNjZW5lQ29weSwgU2NlbmVDc3MgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IEVYSVRfS0lORCwgSVRFTV9LSU5EIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBjb250ZXh0T2YsIHJvb21OYW1lT2YsIHJvb21PZiB9IGZyb20gJy4vcm9vbSc7XG5cbmV4cG9ydCB0eXBlIHsgUHJlc2VudEVudHJ5LCBSZW5kZXJPcHRpb25zLCBTY2VuZUNvcHksIFNjZW5lQ3NzLCBTY2VuZUV4aXREYXRhLCBTY2VuZUl0ZW1EYXRhIH0gZnJvbSAnLi90eXBlcyc7XG5leHBvcnQgeyBFWElUX0tJTkQsIElURU1fS0lORCB9IGZyb20gJy4vdHlwZXMnO1xuZXhwb3J0IHsgY29udGV4dE9mLCBleGl0c09mLCBwZW9wbGVPZiwgcm9vbU5hbWVPZiwgcm9vbU9mIH0gZnJvbSAnLi9yb29tJztcblxuLyoqXG4gKiBBYm92ZSB0aGUgcm9vbSBhZGFwdGVycyAocHJpb3JpdHkgMCksIHNvIHRoZSBwZW9wbGUgcmVhZCBmcm9tIHRoZSB0ZXh0IGFyZSBub3QgaGlkZGVuIGJ5IHRoZSBNU0RQIGFkYXB0ZXInc1xuICogYHByZXNlbnQ6IFtdYCBvbiBhIHJvb20gbmFtZS4gQSBnYW1lIHRoYXQgc2VuZHMgYSBmdWxsIHJvb20gKEdNQ1AgUm9vbS5JbmZvLCBNU0RQIFJPT01fRVhJVFMgb3IgUk9PTV9WTlVNKSB0dXJuc1xuICogdGhlIHRleHQgcmVhZGVyIG9mZiBmb3IgdGhlIHNlc3Npb24gYW5kIGl0cyBmaWVsZHMgYXJlIHJlbGVhc2VkLCBzbyB0aGUgYWRhcHRlcnMgb3duIHRoZSBzY2VuZSB0aGVyZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFRFWFRfUFJJT1JJVFkgPSAxMDtcbi8qKiBMaW5lcyBrZXB0IHBlciBzZXNzaW9uIHdoaWxlIHdhaXRpbmcgZm9yIGEgcm9vbSdzIGV4aXRzIGxpbmUuICovXG5jb25zdCBLRUVQID0gNDA7XG5cbmV4cG9ydCBjb25zdCBDT1BZOiBTY2VuZUNvcHkgPSB7XG4gIHRpdGxlOiAnU2NlbmUnLFxuICBhd2FpdGluZzogJ05vIHJvb20geWV0JyxcbiAgcHJlc2VudDogJ1ByZXNlbnQnLFxuICBleGl0czogJ0V4aXRzJyxcbiAgbm9uZTogJ25vbmUnLFxuICBob3N0aWxlOiAnaG9zdGlsZScsXG4gIGdvOiAoZGlyOiBzdHJpbmcpID0+IGBnbyAke2Rpcn1gLFxuICBmb2N1czogJ0dvIHRvIHNjZW5lJyxcbiAgaXRlbUtpbmQ6ICdTY2VuZSBpdGVtJyxcbiAgZXhpdEtpbmQ6ICdFeGl0Jyxcbn07XG5cbi8qKiBUaGUgYGRhdGFgIHNjaGVtYXMgb2YgdGhlIHR3byBjb250ZXh0IGtpbmRzLCBjaGVja2VkIGJ5IHRoZSBob3N0IG9uIGV2ZXJ5IGBtdS5tZW51cy50YXJnZXRgIGNhbGwuICovXG5leHBvcnQgY29uc3QgS0lORF9TQ0hFTUFTOiBSZWNvcmQ8dHlwZW9mIElURU1fS0lORCB8IHR5cGVvZiBFWElUX0tJTkQsIEpzb25TY2hlbWE+ID0ge1xuICBbSVRFTV9LSU5EXToge1xuICAgIHR5cGU6ICdvYmplY3QnLCByZXF1aXJlZDogWydpdGVtJ10sXG4gICAgcHJvcGVydGllczogeyBpdGVtOiB7IHR5cGU6ICdvYmplY3QnLCByZXF1aXJlZDogWydpZCcsICduYW1lJ10sIHByb3BlcnRpZXM6IHsgaWQ6IHsgdHlwZTogJ3N0cmluZycgfSwgbmFtZTogeyB0eXBlOiAnc3RyaW5nJyB9LCBob3N0aWxlOiB7IHR5cGU6ICdib29sZWFuJyB9IH0gfSB9LFxuICB9LFxuICBbRVhJVF9LSU5EXTogeyB0eXBlOiAnb2JqZWN0JywgcmVxdWlyZWQ6IFsnZXhpdCddLCBwcm9wZXJ0aWVzOiB7IGV4aXQ6IHsgdHlwZTogJ3N0cmluZycgfSB9IH0sXG59O1xuXG5jb25zdCBSID0gJy5leHQtcGFuZWxbZGF0YS1leHQ9XCJzY2VuZVwiXSAubXUtc2NlbmUnO1xuLyoqIFRoZW1lIHRva2VucyBvbmx5LiBFdmVyeSBydWxlIGlzIHVuZGVyIGAuZXh0LXBhbmVsW2RhdGEtZXh0PVwic2NlbmVcIl0gLm11LXNjZW5lYDsgdGhlIHNlY3Rpb24gaGVhZHMgYXJlIHRoZSBob3N0J3MgYC5zZWMtaGVhZGAuICovXG5leHBvcnQgY29uc3QgU0NFTkVfQ1NTID0gYFxuJHtSfSB7IGhlaWdodDogMTAwJTsgb3ZlcmZsb3cteTogYXV0bzsgYmFja2dyb3VuZDogdmFyKC0tYmctZWxldik7IHBhZGRpbmc6IC43cmVtIC44NXJlbSAxcmVtOyBmb250LWZhbWlseTogdmFyKC0tZm9udC1tb25vKTsgZm9udC1zaXplOiAuOXJlbTsgY29sb3I6IHZhcigtLWZnKTsgYm94LXNpemluZzogYm9yZGVyLWJveDsgfVxuJHtSfTpmb2N1cyB7IG91dGxpbmU6IG5vbmU7IH1cbiR7Un0gLnRpdGxlIHsgbWFyZ2luOiAwIDAgLjVyZW07IHBhZGRpbmctYm90dG9tOiAuNHJlbTsgZm9udC13ZWlnaHQ6IDQwMDsgZm9udC1zaXplOiAuOXJlbTsgbGV0dGVyLXNwYWNpbmc6IC4xNmVtOyB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlOyBjb2xvcjogdmFyKC0tYWNjZW50LWJyaWdodCk7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItYnJpZ2h0KTsgfVxuJHtSfSAuYXJlYSB7IGZvbnQtc2l6ZTogLjY2cmVtOyBsZXR0ZXItc3BhY2luZzogLjJlbTsgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTsgY29sb3I6IHZhcigtLWZnLWZhaW50KTsgbWFyZ2luOiAtLjJyZW0gMCAuNHJlbTsgfVxuJHtSfSAuYXRtbyB7IGNvbG9yOiB2YXIoLS1mZy1kaW0pOyBmb250LXN0eWxlOiBpdGFsaWM7IG1hcmdpbjogMCAwIC40cmVtOyB9XG4ke1J9IC5kZXNjIHsgbWFyZ2luOiAwIDAgLjRyZW07IHdoaXRlLXNwYWNlOiBwcmUtd3JhcDsgfVxuJHtSfSAucG9zZSB7IGNvbG9yOiB2YXIoLS1mZy1kaW0pOyBmb250LXN0eWxlOiBpdGFsaWM7IG1hcmdpbjogMCAwIC41cmVtOyBwYWRkaW5nLWxlZnQ6IC41cmVtOyBib3JkZXItbGVmdDogMnB4IHNvbGlkIHZhcigtLWJvcmRlci1icmlnaHQpOyB9XG4ke1J9IC5saXN0IHsgbGlzdC1zdHlsZTogbm9uZTsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwOyB9XG4ke1J9IC5saXN0IGxpIHsgcGFkZGluZzogLjA4cmVtIDA7IGNvbG9yOiB2YXIoLS1mZyk7IH1cbiR7Un0gLnNpZ2lsIHsgY29sb3I6IHZhcigtLWFjY2VudCk7IG1hcmdpbi1yaWdodDogLjZjaDsgfVxuJHtSfSAuZXhpdCB7IGRpc3BsYXk6IGlubGluZS1mbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBtaW4taGVpZ2h0OiAyNHB4OyBjb2xvcjogaW5oZXJpdDsgdGV4dC1hbGlnbjogbGVmdDsgdHJhbnNpdGlvbjogY29sb3IgLjEycyBlYXNlOyB9XG4ke1J9IC5leGl0OmhvdmVyIHsgY29sb3I6IHZhcigtLWFjY2VudC1icmlnaHQpOyB9XG4ke1J9IC5leGl0OmZvY3VzLXZpc2libGUgeyBvdXRsaW5lOiAycHggc29saWQgdmFyKC0tYWNjZW50LWJyaWdodCk7IG91dGxpbmUtb2Zmc2V0OiAtMnB4OyB9XG4ke1J9IC5ob3N0aWxlIHsgY29sb3I6IHZhcigtLWFsZXJ0KTsgZm9udC1zaXplOiAuNzJyZW07IG1hcmdpbi1sZWZ0OiA2cHg7IH1cbiR7Un0gLm5vbmUgeyBtYXJnaW46IC4xcmVtIDA7IGZvbnQtc3R5bGU6IG5vcm1hbDsgY29sb3I6IHZhcigtLWZnLWZhaW50KTsgfVxuJHtSfSAuYXdhaXRpbmcgeyBtYXJnaW46IDA7IGNvbG9yOiB2YXIoLS1mZy1mYWludCk7IGZvbnQtc3R5bGU6IG5vcm1hbDsgZm9udC1zaXplOiAuNjRyZW07IGxldHRlci1zcGFjaW5nOiAuMTRlbTsgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTsgfVxuYDtcblxuLyoqIFRoZSBob3N0J3MgY2xhc3MgbmFtZXMgKGBtdS51aS5jc3NgKSwgdXNlZCB3aGVuIGByZW5kZXJTY2VuZWAgaXMgY2FsbGVkIHdpdGhvdXQgdGhlbS4gKi9cbmNvbnN0IEhPU1RfQ1NTOiBTY2VuZUNzcyA9IHsgc2VjSGVhZDogJ3NlYy1oZWFkJywgc2VjQ2xvc2U6ICdzZWMtY2xvc2UnLCBlbXB0eTogJ2VtcHR5JywgZ2xvdzogJ2dsb3ctdGV4dCcgfTtcblxuLyoqIFBlb3BsZSBmaXJzdCwgdGhlbiByb29tIGl0ZW1zLCBlYWNoIG5hbWUgb25jZSAoYXMgdGhlIHJlZmVyZW5jZSBkb2VzKS4gRXhwb3J0ZWQgZm9yIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXNlbnRPZihzOiBQaWNrPFNjZW5lVmlldywgJ3ByZXNlbnQnIHwgJ2l0ZW1zJz4pOiBQcmVzZW50RW50cnlbXSB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29uc3Qgb3V0OiBQcmVzZW50RW50cnlbXSA9IFtdO1xuICBmb3IgKGNvbnN0IG4gb2Ygcy5wcmVzZW50ID8/IFtdKSBpZiAoIXNlZW4uaGFzKG4pKSB7IHNlZW4uYWRkKG4pOyBvdXQucHVzaCh7IG5hbWU6IG4gfSk7IH1cbiAgZm9yIChjb25zdCBpdCBvZiBzLml0ZW1zID8/IFtdKSBpZiAoIXNlZW4uaGFzKGl0Lm5hbWUpKSB7IHNlZW4uYWRkKGl0Lm5hbWUpOyBvdXQucHVzaChpdC5ob3N0aWxlID8geyBuYW1lOiBpdC5uYW1lLCBob3N0aWxlOiB0cnVlIH0gOiB7IG5hbWU6IGl0Lm5hbWUgfSk7IH1cbiAgcmV0dXJuIG91dDtcbn1cblxuY29uc3Qgc2lnaWwgPSAoKSA9PiBoKCdzcGFuJywgeyBjbGFzczogJ3NpZ2lsJywgJ2FyaWEtaGlkZGVuJzogJ3RydWUnIH0sICdcdTI1QjgnKTtcblxuLyoqXG4gKiBUaGUgcGFuZWwncyBjaGlsZHJlbiBmb3Igb25lIHNjZW5lOyBgZ29gIHNlbmRzIGFuIGV4aXQuIEV4cG9ydGVkIGZvciB0ZXN0cy4gVGhlIDEuMCBzaWduYXR1cmVcbiAqIGByZW5kZXJTY2VuZShzLCBnbylgIHN0aWxsIHdvcmtzOyBgb3B0c2AgKDEuMSkgcGFzc2VzIHRoZSBob3N0IGNsYXNzZXMgYW5kIGEgY29udGV4dC10YXJnZXQgaG9vay5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclNjZW5lKHM6IFNjZW5lVmlldyB8IG51bGwsIGdvOiAoZGlyOiBzdHJpbmcpID0+IHZvaWQsIG9wdHM6IFJlbmRlck9wdGlvbnMgPSB7fSk6IEhUTUxFbGVtZW50W10ge1xuICBjb25zdCBjOiBTY2VuZUNzcyA9IHsgLi4uSE9TVF9DU1MsIC4uLm9wdHMuY3NzIH07XG4gIGNvbnN0IG1hcmsgPSAoZWw6IEhUTUxFbGVtZW50LCB3aGF0OiBQYXJhbWV0ZXJzPE5vbk51bGxhYmxlPFJlbmRlck9wdGlvbnNbJ3RhcmdldCddPj5bMV0pID0+IHsgb3B0cy50YXJnZXQ/LihlbCwgd2hhdCk7IHJldHVybiBlbDsgfTtcbiAgaWYgKCFzIHx8ICFzLmtub3duKSByZXR1cm4gW2goJ3AnLCB7IGNsYXNzOiBgJHtjLmVtcHR5fSBhd2FpdGluZ2AsICdkYXRhLXRlc3RpZCc6ICdzY2VuZS1lbXB0eScgfSwgQ09QWS5hd2FpdGluZyldO1xuICBjb25zdCBoZWFkID0gKGxhYmVsOiBzdHJpbmcpID0+IGgoJ2RpdicsIHsgY2xhc3M6IGMuc2VjSGVhZCwgcm9sZTogJ2hlYWRpbmcnLCAnYXJpYS1sZXZlbCc6ICczJyB9LCBsYWJlbCwgaCgnc3BhbicsIHsgY2xhc3M6IGMuc2VjQ2xvc2UsICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG4gIGNvbnN0IG91dDogSFRNTEVsZW1lbnRbXSA9IFtoKCdoMycsIHsgY2xhc3M6IGB0aXRsZSAke2MuZ2xvd31gLCByb2xlOiAnaGVhZGluZycsICdhcmlhLWxldmVsJzogJzInLCAnZGF0YS10ZXN0aWQnOiAnc2NlbmUtdGl0bGUnIH0sIHMudGl0bGUpXTtcbiAgaWYgKHMuYXJlYSkgb3V0LnB1c2goaCgnZGl2JywgeyBjbGFzczogJ2FyZWEnLCAnZGF0YS10ZXN0aWQnOiAnc2NlbmUtYXJlYScgfSwgcy5hcmVhKSk7XG4gIGlmIChzLmF0bW9zcGhlcmUpIG91dC5wdXNoKGgoJ3AnLCB7IGNsYXNzOiAnYXRtbycgfSwgcy5hdG1vc3BoZXJlKSk7XG4gIGlmIChzLmRlc2MpIG91dC5wdXNoKGgoJ3AnLCB7IGNsYXNzOiAnZGVzYycgfSwgcy5kZXNjKSk7XG4gIGlmIChzLnBvc2UpIG91dC5wdXNoKGgoJ3AnLCB7IGNsYXNzOiAncG9zZScgfSwgcy5wb3NlKSk7XG5cbiAgLy8gXHUyNTI0UFJFU0VOVFx1MjUxQyBhbHdheXMgKHdpdGggXCJub25lXCIpLCB0aGVuIFx1MjUyNEVYSVRTXHUyNTFDIG9ubHkgd2hlbiB0aGVyZSBhcmUgZXhpdHMsIGFzIHRoZSByZWZlcmVuY2UuXG4gIG91dC5wdXNoKGhlYWQoQ09QWS5wcmVzZW50KSk7XG4gIGNvbnN0IGl0ZW1zID0gbmV3IE1hcCgocy5pdGVtcyA/PyBbXSkubWFwKChpdCkgPT4gW2l0Lm5hbWUsIGl0XSBhcyBjb25zdCkpO1xuICBjb25zdCBwZW9wbGUgPSBuZXcgU2V0KHMucHJlc2VudCA/PyBbXSk7XG4gIGNvbnN0IHByZXNlbnQgPSBwcmVzZW50T2Yocyk7XG4gIGlmIChwcmVzZW50Lmxlbmd0aCkge1xuICAgIGNvbnN0IHVsID0gaCgndWwnLCB7IGNsYXNzOiAnbGlzdCcsICdkYXRhLXRlc3RpZCc6ICdzY2VuZS1wcmVzZW50JyB9KTtcbiAgICBmb3IgKGNvbnN0IHAgb2YgcHJlc2VudCkge1xuICAgICAgY29uc3QgaXQgPSBwZW9wbGUuaGFzKHAubmFtZSkgPyB1bmRlZmluZWQgOiBpdGVtcy5nZXQocC5uYW1lKTtcbiAgICAgIGNvbnN0IGxpID0gaCgnbGknLCB7IGNsYXNzOiAnZW50aXR5LXJlZicsICdkYXRhLWl0ZW0taWQnOiBpdD8uaWQgfHwgdW5kZWZpbmVkIH0sIHNpZ2lsKCksIHAubmFtZSwgcC5ob3N0aWxlID8gaCgnc3BhbicsIHsgY2xhc3M6ICdob3N0aWxlJyB9LCBDT1BZLmhvc3RpbGUpIDogbnVsbCk7XG4gICAgICB1bC5hcHBlbmQoaXQgPyBtYXJrKGxpLCB7IGl0ZW06IGl0IH0pIDogbWFyayhsaSwgeyBwZXJzb246IHAubmFtZSB9KSk7XG4gICAgfVxuICAgIG91dC5wdXNoKHVsKTtcbiAgfSBlbHNlIG91dC5wdXNoKGgoJ3AnLCB7IGNsYXNzOiBgJHtjLmVtcHR5fSBub25lYCB9LCBDT1BZLm5vbmUpKTtcblxuICBpZiAocy5leGl0cy5sZW5ndGgpIHtcbiAgICBvdXQucHVzaChoZWFkKENPUFkuZXhpdHMpKTtcbiAgICBjb25zdCB1bCA9IGgoJ3VsJywgeyBjbGFzczogJ2xpc3QnLCAnZGF0YS10ZXN0aWQnOiAnc2NlbmUtZXhpdHMnIH0pO1xuICAgIGZvciAoY29uc3QgZGlyIG9mIHMuZXhpdHMpIHtcbiAgICAgIGNvbnN0IGIgPSBoKCdidXR0b24nLCB7IGNsYXNzOiAnZXhpdCcsIHR5cGU6ICdidXR0b24nLCB0aXRsZTogQ09QWS5nbyhkaXIpLCBvbmNsaWNrOiAoKSA9PiBnbyhkaXIpIH0sIHNpZ2lsKCksIGRpcik7XG4gICAgICB1bC5hcHBlbmQoaCgnbGknLCB7fSwgbWFyayhiLCB7IGV4aXQ6IGRpciB9KSkpO1xuICAgIH1cbiAgICBvdXQucHVzaCh1bCk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lRXh0ZW5zaW9uKHtcbiAgYWN0aXZhdGUoY3R4KSB7XG4gICAgY29uc3QgbXU6IE11ID0gY3R4Lm11O1xuICAgIG11LnVpLnN0eWxlKFNDRU5FX0NTUyk7XG4gICAgY29uc3QgY3NzOiBTY2VuZUNzcyA9IHsgc2VjSGVhZDogbXUudWkuY3NzLnNlY0hlYWQsIHNlY0Nsb3NlOiBtdS51aS5jc3Muc2VjQ2xvc2UsIGVtcHR5OiBtdS51aS5jc3MuZW1wdHksIGdsb3c6IG11LnVpLmNzcy5nbG93IH07XG5cbiAgICAvLyBTREsgMS4xNCByZWdpc3RlcmVkIGtpbmRzOyBhIDEuMTIgb3IgMS4xMyBob3N0IGhhcyBubyBgbWVudXMua2luZGAgYW5kIGdldHMgdGhlIG9sZCBmbGF0IGtpbmRzLlxuICAgIGNvbnN0IGtpbmRzID0gdHlwZW9mIG11Lm1lbnVzLmtpbmQgPT09ICdmdW5jdGlvbic7XG4gICAgaWYgKGtpbmRzKSB7XG4gICAgICBjdHguc3Vic2NyaXB0aW9ucy5wdXNoKFxuICAgICAgICBtdS5tZW51cy5raW5kKHsgaWQ6IElURU1fS0lORCwgdGl0bGU6IENPUFkuaXRlbUtpbmQsIHNjaGVtYTogS0lORF9TQ0hFTUFTW0lURU1fS0lORF0gfSksXG4gICAgICAgIG11Lm1lbnVzLmtpbmQoeyBpZDogRVhJVF9LSU5ELCB0aXRsZTogQ09QWS5leGl0S2luZCwgc2NoZW1hOiBLSU5EX1NDSEVNQVNbRVhJVF9LSU5EXSB9KSxcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IGV4aXRUYXJnZXQgPSAoc2lkOiBzdHJpbmcsIGV4aXQ6IHN0cmluZyk6IENvbnRleHRUYXJnZXQgPT4gKGtpbmRzID8geyBraW5kOiBFWElUX0tJTkQsIHNpZCwgZGF0YTogeyBleGl0IH0gfSA6IHsga2luZDogJ3NjZW5lLWV4aXQnLCBzaWQsIGV4aXQgfSk7XG4gICAgY29uc3QgaXRlbVRhcmdldCA9IChzaWQ6IHN0cmluZywgaXRlbTogU2NlbmVWaWV3WydpdGVtcyddW251bWJlcl0pOiBDb250ZXh0VGFyZ2V0ID0+IChraW5kcyA/IHsga2luZDogSVRFTV9LSU5ELCBzaWQsIGRhdGE6IHsgaXRlbSB9IH0gOiB7IGtpbmQ6ICdzY2VuZS1pdGVtJywgc2lkLCBpdGVtIH0pO1xuXG4gICAgY29uc3QgbW91bnQgPSAoaG9zdDogSFRNTEVsZW1lbnQsIHBjOiBQYW5lbE1vdW50Q3R4KTogRGlzcG9zZSA9PiB7XG4gICAgICBjb25zdCByb290ID0gaCgnc2VjdGlvbicsIHsgY2xhc3M6ICdtdS1zY2VuZScsICdhcmlhLWxhYmVsJzogQ09QWS50aXRsZSwgJ2RhdGEtZm9jdXMtcmVnaW9uJzogJ3NjZW5lJywgdGFiaW5kZXg6ICctMScsICdkYXRhLXRlc3RpZCc6ICdzY2VuZScgfSk7XG4gICAgICBob3N0LmFwcGVuZChyb290KTtcbiAgICAgIGNvbnN0IHNpZCA9IHBjLnNpZDtcbiAgICAgIGlmICghc2lkKSB7IHJvb3QucmVwbGFjZUNoaWxkcmVuKC4uLnJlbmRlclNjZW5lKG51bGwsICgpID0+IHt9LCB7IGNzcyB9KSk7IHJldHVybiAoKSA9PiByb290LnJlbW92ZSgpOyB9XG4gICAgICAvLyBBIGNsaWNrIGlzIHRoZSBwbGF5ZXInczogbm8ga2V5IChub3J0aCB0d2ljZSBpcyB0d2ljZSksIGFuZCBuZXZlciBibG9ja2VkIGJ5IHJlcGxheS5cbiAgICAgIGNvbnN0IGdvID0gKGRpcjogc3RyaW5nKSA9PiB7IHZvaWQgbXUuc2Vzc2lvbnMuc2VuZChkaXIsIHsgc2lkIH0pOyB9O1xuICAgICAgbGV0IHRhcmdldHM6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG4gICAgICBjb25zdCB1bnRhcmdldCA9ICgpID0+IHsgZm9yIChjb25zdCBkIG9mIHRhcmdldHMpIGQoKTsgdGFyZ2V0cyA9IFtdOyB9O1xuICAgICAgY29uc3QgdGFyZ2V0OiBSZW5kZXJPcHRpb25zWyd0YXJnZXQnXSA9IChlbCwgd2hhdCkgPT4ge1xuICAgICAgICBpZiAoJ2V4aXQnIGluIHdoYXQpIHRhcmdldHMucHVzaChtdS5tZW51cy50YXJnZXQoZWwsIGV4aXRUYXJnZXQoc2lkLCB3aGF0LmV4aXQpKSk7XG4gICAgICAgIGVsc2UgaWYgKCdpdGVtJyBpbiB3aGF0KSB0YXJnZXRzLnB1c2gobXUubWVudXMudGFyZ2V0KGVsLCBpdGVtVGFyZ2V0KHNpZCwgd2hhdC5pdGVtKSkpO1xuICAgICAgfTtcbiAgICAgIGxldCByb29tOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICAgIGNvbnN0IG9mZiA9IG11LnNjZW5lLndhdGNoKChzKSA9PiB7XG4gICAgICAgIC8vIEEgbW92ZSByZXNldHMgdGhlIHNjcm9sbDsgYW4gdXBkYXRlIGluIHRoZSBzYW1lIHJvb20gKHNvbWVvbmUgYXJyaXZlcykga2VlcHMgaXQuIE5vIGlkOiBldmVyeSB1cGRhdGUgbWF5IGJlIGEgbW92ZS5cbiAgICAgICAgY29uc3QgbW92ZWQgPSAhcy5rbm93biB8fCAhcy5pZCB8fCBzLmlkICE9PSByb29tO1xuICAgICAgICByb29tID0gcy5rbm93biAmJiBzLmlkID8gcy5pZCA6IG51bGw7XG4gICAgICAgIGNvbnN0IHRvcCA9IHJvb3Quc2Nyb2xsVG9wO1xuICAgICAgICB1bnRhcmdldCgpO1xuICAgICAgICByb290LnJlcGxhY2VDaGlsZHJlbiguLi5yZW5kZXJTY2VuZShzLCBnbywgeyBjc3MsIHRhcmdldCB9KSk7XG4gICAgICAgIHJvb3Quc2Nyb2xsVG9wID0gbW92ZWQgPyAwIDogdG9wO1xuICAgICAgfSwgc2lkKTtcbiAgICAgIHJldHVybiAoKSA9PiB7IG9mZigpOyB1bnRhcmdldCgpOyByb290LnJlbW92ZSgpOyB9O1xuICAgIH07XG5cbiAgICBtdS5wYW5lbHMucmVnaXN0ZXIoeyBpZDogJ3NjZW5lJywgdGl0bGU6IENPUFkudGl0bGUsIHNpbmdsZXRvbjogdHJ1ZSwgZGVmYXVsdFBvc2l0aW9uOiAncmlnaHQtdG9wJywgb3JkZXI6IDEwLCBzaG93OiAnYXV0bycsIG1vdW50IH0pO1xuICAgIC8vIEFsdCtSLiBBIDEuMTIgb3IgMS4xMyBob3N0IHJlZ2lzdGVycyBgZm9jdXMuc2NlbmVgIGl0c2VsZiAocmVnaXN0ZXJpbmcgaXQgYWdhaW4gdGhyb3dzIHRoZXJlKSwgYW5kIGhhcyBubyBgcGFuZWxzLmZvY3VzYC5cbiAgICBpZiAodHlwZW9mIG11LnBhbmVscy5mb2N1cyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgbXUuY29tbWFuZHMucmVnaXN0ZXIoeyBpZDogJ2ZvY3VzLnNjZW5lJywgdGl0bGU6IENPUFkuZm9jdXMsIGtleXM6IFsnQWx0K1InXSwgZ3JvdXA6ICdGb2N1cycsIHdoZW46ICdzZXNzaW9uJywgcnVuOiAoKSA9PiB7IG11LnBhbmVscy5mb2N1cz8uKCdzY2VuZScpOyB9IH0pO1xuICAgIH1cbiAgICBtdS5zZXR0aW5ncy5kZWZpbmUoe1xuICAgICAgdGl0bGU6ICdTY2VuZScsXG4gICAgICBpdGVtczogW3sga2V5OiAnZnJvbVRleHQnLCBsYWJlbDogJ1JlYWQgdGhlIHJvb20gZnJvbSB0aGUgZ2FtZSB0ZXh0JywgZGVmYXVsdDogdHJ1ZSwga2luZDogJ3RvZ2dsZScsIHNjb3BlOiAnYm90aCcsXG4gICAgICAgIGhpbnQ6ICdGb3IgZ2FtZXMgdGhhdCBzZW5kIG9ubHkgdGhlIHJvb20gbmFtZSBvdmVyIEdNQ1AgKEV2ZW5uaWEgZ2FtZXMgc3VjaCBhcyBVbmRlcnNwaXJlKTogdGhlIGRlc2NyaXB0aW9uLCB3aG8gaXMgaGVyZSBhbmQgdGhlIGV4aXRzIGNvbWUgZnJvbSB0aGUgcm9vbSB0ZXh0LiBBIGdhbWUgdGhhdCBzZW5kcyBHTUNQIFJvb20uSW5mbyBpcyB1bmFmZmVjdGVkLicgfV0sXG4gICAgfSk7XG4gICAgY29uc3QgZnJvbVRleHQgPSAoc2lkOiBzdHJpbmcpID0+IG11LnNldHRpbmdzLmdldDxib29sZWFuPignZnJvbVRleHQnLCB7IHNpZCB9KSAhPT0gZmFsc2U7XG4gICAgLy8gVGhlIGdhbWUncyBvd24gZnVsbCByb29tIHdpbnMuIE1TRFAgUk9PTV9OQU1FIGFsb25lIGlzIG5vdCBvbmUgKFVuZGVyc3BpcmUgbWlycm9ycyBSb29tLk5hbWUgdGhlcmUpLlxuICAgIGNvbnN0IGhhc1Jvb20gPSAoc2lkOiBzdHJpbmcpID0+IG11LmdtY3Auc3RhdGUoJ1Jvb20uSW5mbycsIHNpZCkgIT09IHVuZGVmaW5lZCB8fCBtdS5tc2RwLnN0YXRlKCdST09NX0VYSVRTJywgc2lkKSAhPT0gdW5kZWZpbmVkIHx8IG11Lm1zZHAuc3RhdGUoJ1JPT01fVk5VTScsIHNpZCkgIT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBnaXZlbiA9IG5ldyBNYXA8c3RyaW5nLCBEaXNwb3NlPigpO1xuICAgIGNvbnN0IGdpdmUgPSAoc2lkOiBzdHJpbmcsIHBhdGNoOiBQYXJhbWV0ZXJzPE11WydzY2VuZSddWydwcm92aWRlJ10+WzFdKSA9PiB7IGdpdmVuLnNldChzaWQsIG11LnNjZW5lLnByb3ZpZGUoc2lkLCBwYXRjaCwgeyBwcmlvcml0eTogVEVYVF9QUklPUklUWSB9KSk7IH07XG4gICAgY29uc3QgcmVsZWFzZSA9IChzaWQ6IHN0cmluZykgPT4geyBnaXZlbi5nZXQoc2lkKT8uKCk7IGdpdmVuLmRlbGV0ZShzaWQpOyB9O1xuICAgIGNvbnN0IHNlZW4gPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG4gICAgY29uc3QgdGl0bGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICBjdHguc3Vic2NyaXB0aW9ucy5wdXNoKFxuICAgICAgbXUuZ21jcC5vbignUm9vbS5JbmZvJywgKF9kLCBtKSA9PiByZWxlYXNlKG0uc2lkKSksXG4gICAgICBtdS5tc2RwLm9uKCdST09NX0VYSVRTJywgKF92LCBtKSA9PiByZWxlYXNlKG0uc2lkKSksXG4gICAgICBtdS5tc2RwLm9uKCdST09NX1ZOVU0nLCAoX3YsIG0pID0+IHJlbGVhc2UobS5zaWQpKSxcbiAgICAgIG11LmdtY3Aub24oJ1Jvb20uTmFtZScsIChkLCBtKSA9PiB7XG4gICAgICAgIGNvbnN0IHRpdGxlID0gcm9vbU5hbWVPZihkKTtcbiAgICAgICAgaWYgKCF0aXRsZSB8fCBoYXNSb29tKG0uc2lkKSB8fCAhZnJvbVRleHQobS5zaWQpKSByZXR1cm47XG4gICAgICAgIGlmICh0aXRsZXMuZ2V0KG0uc2lkKSAhPT0gdGl0bGUpIHsgdGl0bGVzLnNldChtLnNpZCwgdGl0bGUpOyBnaXZlKG0uc2lkLCB7IHRpdGxlIH0pOyB9XG4gICAgICB9KSxcbiAgICAgIG11LmdtY3Aub24oJ1BsYXllci5Db250ZXh0JywgKGQsIG0pID0+IHtcbiAgICAgICAgY29uc3QgcGF0Y2ggPSBjb250ZXh0T2YoZCk7XG4gICAgICAgIGlmICghcGF0Y2ggfHwgaGFzUm9vbShtLnNpZCkgfHwgIWZyb21UZXh0KG0uc2lkKSkgcmV0dXJuO1xuICAgICAgICBpZiAocGF0Y2gudGl0bGUpIHRpdGxlcy5zZXQobS5zaWQsIHBhdGNoLnRpdGxlKTtcbiAgICAgICAgZ2l2ZShtLnNpZCwgcGF0Y2gpO1xuICAgICAgfSksXG4gICAgICAvLyBPYnNlcnZlOiByZWFkIG9ubHksIGxpdmUgbGluZXMgb25seSAobm90IGJhY2tsb2cpLiBBIHR5cGVkIGNvbW1hbmQgc3RhcnRzIGEgbmV3IGJsb2NrLlxuICAgICAgbXUubGluZXMuc3RhZ2Uoe1xuICAgICAgICBpZDogJ3Jvb20tdGV4dCcsIHBoYXNlOiAnb2JzZXJ2ZScsXG4gICAgICAgIHJ1bjogKGxpbmUsIGMpID0+IHtcbiAgICAgICAgICBpZiAobGluZS5raW5kID09PSAnZWNobycpIHsgc2Vlbi5kZWxldGUoYy5zaWQpOyByZXR1cm47IH1cbiAgICAgICAgICBpZiAobGluZS5raW5kICE9PSAnb3V0cHV0JyAmJiBsaW5lLmtpbmQgIT09ICdwcm9tcHQnKSByZXR1cm47XG4gICAgICAgICAgY29uc3QgYnVmID0gc2Vlbi5nZXQoYy5zaWQpID8/IFtdO1xuICAgICAgICAgIGJ1Zi5wdXNoKGxpbmUudGV4dCk7XG4gICAgICAgICAgaWYgKGJ1Zi5sZW5ndGggPiBLRUVQKSBidWYuc3BsaWNlKDAsIGJ1Zi5sZW5ndGggLSBLRUVQKTtcbiAgICAgICAgICBzZWVuLnNldChjLnNpZCwgYnVmKTtcbiAgICAgICAgICBjb25zdCByb29tID0gcm9vbU9mKGJ1Zik7XG4gICAgICAgICAgaWYgKCFyb29tKSByZXR1cm47XG4gICAgICAgICAgc2Vlbi5kZWxldGUoYy5zaWQpO1xuICAgICAgICAgIGlmIChoYXNSb29tKGMuc2lkKSB8fCAhZnJvbVRleHQoYy5zaWQpKSByZXR1cm47XG4gICAgICAgICAgLy8gQSBuZXcgcm9vbSBkcm9wcyB0aGUgcG9zZSBhbmQgaXRlbXMgdGhlIGxhc3Qgb25lIGhhZC5cbiAgICAgICAgICBjb25zdCBtb3ZlZCA9IHRpdGxlcy5nZXQoYy5zaWQpICE9PSByb29tLnRpdGxlO1xuICAgICAgICAgIHRpdGxlcy5zZXQoYy5zaWQsIHJvb20udGl0bGUgPz8gJycpO1xuICAgICAgICAgIGdpdmUoYy5zaWQsIG1vdmVkID8geyAuLi5yb29tLCBwb3NlOiAnJywgaXRlbXM6IFtdIH0gOiByb29tKTtcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgbXUuc2Vzc2lvbnMuZWFjaCgocykgPT4gKCkgPT4geyBzZWVuLmRlbGV0ZShzLmlkKTsgdGl0bGVzLmRlbGV0ZShzLmlkKTsgZ2l2ZW4uZGVsZXRlKHMuaWQpOyB9KSxcbiAgICApO1xuXG4gICAgLy8gTGlzdGVkIGFuZCBhdXRvLWFkZGVkIG9uY2UgcGVyIHNlc3Npb24sIHRoZSBmaXJzdCB0aW1lIGl0cyBzY2VuZSBrbm93cyBhIHJvb206IEdNQ1AsIE1TRFAgb3IgYSBwcm92aWRlciBhbGlrZS5cbiAgICBjdHguc3Vic2NyaXB0aW9ucy5wdXNoKG11LnNlc3Npb25zLmVhY2goKHMpID0+IHtcbiAgICAgIGxldCBkb25lID0gZmFsc2U7XG4gICAgICByZXR1cm4gbXUuc2NlbmUud2F0Y2goKHYpID0+IHsgaWYgKCFkb25lICYmIHYua25vd24pIHsgZG9uZSA9IHRydWU7IG11LnBhbmVscy50b3VjaCgnc2NlbmUnLCBzLmlkKTsgfSB9LCBzLmlkKTtcbiAgICB9KSk7XG4gIH0sXG59KTtcbiIsICIvKipcbiAqIFRoZSBleHBvcnRlZCBBUEkgb2YgYEBydW5tdS5zaC9leHQtc2NlbmVgIChpZCBgc2NlbmVgKS4gVGhlIGV4dGVuc2lvbiBzZW5kcyBubyBHTUNQOiBpdCBkcmF3cyB0aGUgaG9zdCdzIHNjZW5lXG4gKiBtb2RlbCAoYG11LnNjZW5lLndhdGNoYCwgYFNjZW5lVmlld2ApLCB3aGljaCB0aGUgcm9vbSBhZGFwdGVycyBmaWxsIGZyb20gR01DUCBgUm9vbS4qYCwgYENoYXIuSXRlbXMuKmAsIE1TRFAgYW5kXG4gKiBvdGhlciBleHRlbnNpb25zIChgbXUuc2NlbmUuc2V0YCkuIE9uIGdhbWVzIHdpdGggbm9uZSBvZiB0aG9zZSAoRXZlbm5pYTogb25seSBgUm9vbS5OYW1lYCkgaXQgcHJvdmlkZXMgdGhlIHJvb21cbiAqIGl0c2VsZiBmcm9tIGBSb29tLk5hbWVgLCBgUGxheWVyLkNvbnRleHRgIGFuZCB0aGUgcm9vbSB0ZXh0ICgxLjMuMCwgYHNyYy9yb29tLnRzYCkuIFRoaXMgZmlsZSBhbmQgdGhlIFJFQURNRVxuICogY2hhbmdlIHRvZ2V0aGVyLlxuICovXG5pbXBvcnQgdHlwZSB7IFNjZW5lVmlldyB9IGZyb20gJ0BtdWNsaWVudC9zZGsnO1xuXG4vKiogT25lIHJvdyBvZiBcdTI1MjRQUkVTRU5UXHUyNTFDOiBhIHBlcnNvbiAoZnJvbSBgcHJlc2VudGApIG9yIGEgcm9vbSBpdGVtIChmcm9tIGBpdGVtc2ApLiAqL1xuZXhwb3J0IGludGVyZmFjZSBQcmVzZW50RW50cnkge1xuICBuYW1lOiBzdHJpbmc7XG4gIC8qKiBTZXQgb24gaG9zdGlsZSByb29tIGl0ZW1zOyBkcmF3biBhcyBhIHNtYWxsIGBob3N0aWxlYCB0YWcuICovXG4gIGhvc3RpbGU/OiBib29sZWFuO1xuICAvKiogVGhlIHJvb20gaXRlbSdzIGlkLCB3aGVuIHRoZSByb3cgaXMgYW4gaXRlbSB3aXRoIG9uZSAocGVvcGxlIGhhdmUgbm9uZSkuIEBzaW5jZSAxLjEuMCAqL1xuICBpZD86IHN0cmluZztcbn1cblxuLyoqIFRoZSBjbGFzcyBuYW1lcyBgcmVuZGVyU2NlbmVgIHVzZXMgZm9yIHRoZSBob3N0IHByaW1pdGl2ZXM7IGRlZmF1bHRzIGFyZSB0aGUgaG9zdCdzIChgbXUudWkuY3NzYCkuIEBzaW5jZSAxLjEuMCAqL1xuZXhwb3J0IGludGVyZmFjZSBTY2VuZUNzcyB7XG4gIHNlY0hlYWQ6IHN0cmluZztcbiAgc2VjQ2xvc2U6IHN0cmluZztcbiAgZW1wdHk6IHN0cmluZztcbiAgZ2xvdzogc3RyaW5nO1xufVxuXG4vKiogT3B0aW9ucyBmb3Ige0BsaW5rIHJlbmRlclNjZW5lfSBiZXlvbmQgdGhlIDEuMCBzaWduYXR1cmUuIEBzaW5jZSAxLjEuMCAqL1xuZXhwb3J0IGludGVyZmFjZSBSZW5kZXJPcHRpb25zIHtcbiAgLyoqIGBtdS51aS5jc3NgIChvciB0aGUgcGFydCBvZiBpdCB1c2VkKS4gKi9cbiAgY3NzPzogUGFydGlhbDxTY2VuZUNzcz47XG4gIC8qKlxuICAgKiBDYWxsZWQgZm9yIGV2ZXJ5IGV4aXQgYnV0dG9uIGFuZCBldmVyeSBwcmVzZW50IHJvdyBhcyBpdCBpcyBjcmVhdGVkLCBzbyB0aGUgY2FsbGVyIGNhbiBtYXJrIGl0IGFzIGEgY29udGV4dFxuICAgKiB0YXJnZXQgKGBtdS5tZW51cy50YXJnZXRgKS4gUmV0dXJuIGEgZnVuY3Rpb24gdG8gdW5kbyBpdDsgdGhvc2UgcnVuIG9uIHRoZSBuZXh0IHJlbmRlciBvciB1bm1vdW50LlxuICAgKi9cbiAgdGFyZ2V0PzogKGVsOiBIVE1MRWxlbWVudCwgd2hhdDogeyBleGl0OiBzdHJpbmcgfSB8IHsgaXRlbTogU2NlbmVWaWV3WydpdGVtcyddW251bWJlcl0gfSB8IHsgcGVyc29uOiBzdHJpbmcgfSkgPT4gdm9pZCB8ICgoKSA9PiB2b2lkKTtcbn1cblxuLyoqIERyYXduIGNvcHkuICovXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lQ29weSB7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGF3YWl0aW5nOiBzdHJpbmc7XG4gIHByZXNlbnQ6IHN0cmluZztcbiAgZXhpdHM6IHN0cmluZztcbiAgbm9uZTogc3RyaW5nO1xuICBob3N0aWxlOiBzdHJpbmc7XG4gIGdvKGRpcjogc3RyaW5nKTogc3RyaW5nO1xuICAvKiogVGhlIGBmb2N1cy5zY2VuZWAgY29tbWFuZCdzIHRpdGxlLiBAc2luY2UgMS4yLjAgKi9cbiAgZm9jdXM6IHN0cmluZztcbiAgLyoqIFRoZSBjb250ZXh0IGtpbmRzJyB0aXRsZXMgKHRoZSBtZW51J3MgYWNjZXNzaWJsZSBsYWJlbCkuIEBzaW5jZSAxLjIuMCAqL1xuICBpdGVtS2luZDogc3RyaW5nO1xuICBleGl0S2luZDogc3RyaW5nO1xufVxuXG4vKiogVGhlIGNvbnRleHQga2luZCBvZiBhIHJvb20gaXRlbSBpbiBcdTI1MjRQUkVTRU5UXHUyNTFDIChTREsgMS4xNCkuIEBzaW5jZSAxLjIuMCAqL1xuZXhwb3J0IGNvbnN0IElURU1fS0lORCA9ICdzY2VuZS5pdGVtJztcbi8qKiBUaGUgY29udGV4dCBraW5kIG9mIGFuIGV4aXQgYnV0dG9uIChTREsgMS4xNCkuIEBzaW5jZSAxLjIuMCAqL1xuZXhwb3J0IGNvbnN0IEVYSVRfS0lORCA9ICdzY2VuZS5leGl0JztcblxuLyoqIGBkYXRhYCBvZiBhIGBzY2VuZS5pdGVtYCB0YXJnZXQuIEBzaW5jZSAxLjIuMCAqL1xuZXhwb3J0IGludGVyZmFjZSBTY2VuZUl0ZW1EYXRhIHsgaXRlbTogU2NlbmVWaWV3WydpdGVtcyddW251bWJlcl0gfVxuLyoqIGBkYXRhYCBvZiBhIGBzY2VuZS5leGl0YCB0YXJnZXQuIEBzaW5jZSAxLjIuMCAqL1xuZXhwb3J0IGludGVyZmFjZSBTY2VuZUV4aXREYXRhIHsgZXhpdDogc3RyaW5nIH1cblxuLyoqXG4gKiBUeXBlcyBgdC5kYXRhYCBpbiBhbm90aGVyIGV4dGVuc2lvbidzIGBtdS5tZW51cy5jb250ZXh0KHsgdGFyZ2V0OiAnc2NlbmUuaXRlbScgfCAnc2NlbmUuZXhpdCcsIFx1MjAyNiB9KWAgb25jZSBpdFxuICogaW1wb3J0cyB0aGlzIGZpbGUuIEBzaW5jZSAxLjIuMFxuICovXG5kZWNsYXJlIG1vZHVsZSAnQG11Y2xpZW50L3Nkaycge1xuICBpbnRlcmZhY2UgQ29udGV4dEtpbmRzIHtcbiAgICAnc2NlbmUuaXRlbSc6IFNjZW5lSXRlbURhdGE7XG4gICAgJ3NjZW5lLmV4aXQnOiBTY2VuZUV4aXREYXRhO1xuICB9XG59XG4iLCAiLyoqXG4gKiBUaGUgcm9vbSBmcm9tIHRoZSBnYW1lJ3Mgb3duIHRleHQsIGZvciBnYW1lcyB0aGF0IHNlbmQgbm8gYFJvb20uSW5mb2AgKEV2ZW5uaWEgZ2FtZXMgc3VjaCBhcyBVbmRlcnNwaXJlIHNlbmRcbiAqIG9ubHkgYFJvb20uTmFtZWAgYW5kLCBhdCBsb2dpbiwgYFBsYXllci5Db250ZXh0YCkuIFB1cmUgZnVuY3Rpb25zOiBgaW5kZXgudHNgIGZlZWRzIHRoZW0gdGhlIHNlc3Npb24ncyBsaW5lcy5cbiAqXG4gKiBBbiBFdmVubmlhIHJvb20gbG9vayBpczogdGhlIHRpdGxlLCB0aGUgZGVzY3JpcHRpb24sIGEgYmxhbmsgbGluZSwgdGhpbmdzIGluIHRoZSByb29tLCBhIGJsYW5rIGxpbmUsIHdobyBpc1xuICogdGhlcmUgKFwiQXNoIGlzIHN0YW5kaW5nIGhlcmUuIFlvdSBhcmUgc3RhbmRpbmcgaGVyZS5cIiksIHRoZW4gdGhlIGV4aXRzIGxpbmUgKFwiVGhlcmUgYXJlIGV4aXRzIHRvIHRoZSBtYXJrZXRcbiAqIChtKSBhbmQgdGhlIGdhdGUgKGcpLlwiKS4gVGhlIGV4aXRzIGxpbmUgY2xvc2VzIHRoZSBibG9jaywgc28gYSBsb29rIGF0IGFueXRoaW5nIGJ1dCBhIHJvb20gcmVhZHMgbm90aGluZy5cbiAqL1xuaW1wb3J0IHR5cGUgeyBTY2VuZVBhdGNoIH0gZnJvbSAnQG11Y2xpZW50L3Nkayc7XG5cbi8qKiBcIlRoZXJlIGFyZSBleGl0cyB0byBcdTIwMjZcIiAvIFwiVGhlcmUgaXMgYW4gZXhpdCB0byBcdTIwMjZcIiAvIFwiRXhpdHM6IFx1MjAyNlwiLiAqL1xuY29uc3QgRVhJVFNfUkUgPSAvXig/OnRoZXJlICg/OmFyZXxpcykgKD86YW4/ICk/KD86ZXhpdHM/fHdheXM/KD86IG91dCk/KSAoPzp0b3xsZWFkaW5nIHRvKSB8KD86b2J2aW91cyApP2V4aXRzPzogKSguKz8pXFwuPyQvaTtcbi8qKiBPbmUgc2VudGVuY2Ugb2YgdGhlIHdoby1pcy1oZXJlIGxpbmU6IFwiPG5hbWU+IGlzfGFyZSA8cG9zdHVyZT4gaGVyZS5cIiAqL1xuY29uc3QgSEVSRV9SRSA9IC9eKC4rPykgKD86aXN8YXJlKSAoPzpbYS16XSsgKT9oZXJlXFwuPyQvaTtcbmNvbnN0IE1BWF9USVRMRSA9IDgwO1xuXG4vKiogVGhlIGV4aXRzIGxpbmUncyBuYW1lcywgaW4gb3JkZXI6IFwidGhlIG1hcmtldCAobSksIHRoZSB3ZWxsIGFuZCBTaGFyZCBzZXJ2aWNlcyAocylcIiBcdTIxOTIgbWFya2V0LCB0aGUgd2VsbCwgU2hhcmQgc2VydmljZXMuICovXG5leHBvcnQgZnVuY3Rpb24gZXhpdHNPZihsaW5lOiBzdHJpbmcpOiBzdHJpbmdbXSB8IG51bGwge1xuICBjb25zdCBtID0gRVhJVFNfUkUuZXhlYyhsaW5lLnRyaW0oKSk7XG4gIGlmICghbSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChsZXQgcGFydCBvZiBtWzFdLnNwbGl0KC9cXHMqLFxccyooPzphbmRcXHMrKT98XFxzK2FuZFxccysvKSkge1xuICAgIHBhcnQgPSBwYXJ0LnJlcGxhY2UoL1xccypcXChbXildKlxcKVxccyokLywgJycpLnJlcGxhY2UoL150aGVcXHMrL2ksICcnKS50cmltKCk7XG4gICAgaWYgKHBhcnQgJiYgIW91dC5pbmNsdWRlcyhwYXJ0KSkgb3V0LnB1c2gocGFydCk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqIFRoZSBwZW9wbGUgaW4gYSB3aG8taXMtaGVyZSBsaW5lLCB3aXRob3V0IHlvdTogXCJBc2ggYW5kIEl2byBhcmUgc2l0dGluZyBoZXJlLiBZb3UgYXJlIHN0YW5kaW5nIGhlcmUuXCIgXHUyMTkyIEFzaCwgSXZvLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBlb3BsZU9mKGxpbmU6IHN0cmluZyk6IHN0cmluZ1tdIHtcbiAgY29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IHMgb2YgbGluZS50cmltKCkuc3BsaXQoLyg/PD1cXC4pXFxzKy8pKSB7XG4gICAgY29uc3QgbSA9IEhFUkVfUkUuZXhlYyhzKTtcbiAgICBpZiAoIW0pIGNvbnRpbnVlO1xuICAgIGZvciAoY29uc3QgbiBvZiBtWzFdLnNwbGl0KC9cXHMqLFxccyooPzphbmRcXHMrKT98XFxzK2FuZFxccysvKSkge1xuICAgICAgY29uc3QgbmFtZSA9IG4udHJpbSgpO1xuICAgICAgaWYgKG5hbWUgJiYgIS9eeW91JC9pLnRlc3QobmFtZSkgJiYgIW91dC5pbmNsdWRlcyhuYW1lKSkgb3V0LnB1c2gobmFtZSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmNvbnN0IGxvb2tzVGl0bGUgPSAodDogc3RyaW5nKSA9PiB0Lmxlbmd0aCA+IDAgJiYgdC5sZW5ndGggPD0gTUFYX1RJVExFICYmICEvWy4hPzo7LFwiJyk+XFxdXSQvLnRlc3QodCk7XG5cbi8qKlxuICogVGhlIHNjZW5lIGEgcm9vbSBsb29rIGVuZHMgaW4sIGZyb20gdGhlIHNlc3Npb24ncyByZWNlbnQgbGluZXMgb2xkZXN0IGZpcnN0LCB0aGUgbGFzdCBiZWluZyB0aGUgZXhpdHMgbGluZTsgbnVsbFxuICogd2hlbiB0aGV5IGRvIG5vdCBlbmQgaW4gYSByb29tIGxvb2suIFJlYWQgYmFja3dhcmRzIGZyb20gdGhlIGV4aXRzIGxpbmUsIGluIGJsYW5rLXNlcGFyYXRlZCBzZWN0aW9uczogdGhlIG9uZVxuICoganVzdCBiZWZvcmUgaXQgKHdpdGggdGhlIGV4aXRzIGxpbmUpIGhvbGRzIHdobyBpcyBoZXJlOyB0aGUgbmVhcmVzdCBzZWN0aW9uIHdpdGggYSB0aXRsZSBsaW5lIChubyBjbG9zaW5nXG4gKiBwdW5jdHVhdGlvbikgaXMgdGhlIGhlYWRlciwgaXRzIHRpdGxlIHRoZW4gdGhlIGRlc2NyaXB0aW9uLiBUaGluZ3MgaW4gdGhlIHJvb20gc2l0IGJldHdlZW4gYW5kIGFyZSBza2lwcGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcm9vbU9mKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSwgbWF4U2VjdGlvbnMgPSA0KTogU2NlbmVQYXRjaCB8IG51bGwge1xuICBpZiAoIWxpbmVzLmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGV4aXRzID0gZXhpdHNPZihsaW5lc1tsaW5lcy5sZW5ndGggLSAxXSk7XG4gIGlmICghZXhpdHMpIHJldHVybiBudWxsO1xuICBjb25zdCBzZWN0aW9uczogc3RyaW5nW11bXSA9IFtbXV07XG4gIGZvciAoY29uc3QgcmF3IG9mIGxpbmVzLnNsaWNlKDAsIC0xKSkge1xuICAgIGNvbnN0IGwgPSByYXcudHJpbSgpO1xuICAgIGlmIChsKSBzZWN0aW9uc1tzZWN0aW9ucy5sZW5ndGggLSAxXS5wdXNoKGwpO1xuICAgIGVsc2UgaWYgKHNlY3Rpb25zW3NlY3Rpb25zLmxlbmd0aCAtIDFdLmxlbmd0aCkgc2VjdGlvbnMucHVzaChbXSk7XG4gIH1cbiAgaWYgKCFzZWN0aW9uc1tzZWN0aW9ucy5sZW5ndGggLSAxXS5sZW5ndGgpIHNlY3Rpb25zLnBvcCgpO1xuICBpZiAoIXNlY3Rpb25zLmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHRhaWwgPSBzZWN0aW9uc1tzZWN0aW9ucy5sZW5ndGggLSAxXTtcbiAgY29uc3QgcGVvcGxlID0gdGFpbC5zb21lKChsKSA9PiBwZW9wbGVPZihsKS5sZW5ndGggfHwgL155b3UgKD86YXJlfGlzKSBbYS16IF0qaGVyZVxcLj8kL2kudGVzdChsKSk7XG4gIGZvciAobGV0IGkgPSBzZWN0aW9ucy5sZW5ndGggLSAxOyBpID49IE1hdGgubWF4KDAsIHNlY3Rpb25zLmxlbmd0aCAtIG1heFNlY3Rpb25zKTsgaS0tKSB7XG4gICAgY29uc3Qgc2VjID0gc2VjdGlvbnNbaV07XG4gICAgbGV0IHQgPSAtMTtcbiAgICBmb3IgKGxldCBqID0gc2VjLmxlbmd0aCAtIDE7IGogPj0gMDsgai0tKSBpZiAobG9va3NUaXRsZShzZWNbal0pICYmICFIRVJFX1JFLnRlc3Qoc2VjW2pdKSkgeyB0ID0gajsgYnJlYWs7IH1cbiAgICBpZiAodCA8IDApIGNvbnRpbnVlO1xuICAgIC8vIFRoZSB0aXRsZSBsaW5lIG11c3Qgbm90IGJlIHRoZSB3aG8taXMtaGVyZSBzZWN0aW9uIGl0c2VsZi5cbiAgICBpZiAoaSA9PT0gc2VjdGlvbnMubGVuZ3RoIC0gMSAmJiBwZW9wbGUpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHByZXNlbnQgPSBwZW9wbGUgPyBbLi4ubmV3IFNldCh0YWlsLmZsYXRNYXAocGVvcGxlT2YpKV0gOiBbXTtcbiAgICByZXR1cm4geyB0aXRsZTogc2VjW3RdLCBkZXNjOiBzZWMuc2xpY2UodCArIDEpLmpvaW4oJ1xcbicpLCBleGl0cywgcHJlc2VudCB9O1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG4vKiogYFJvb20uTmFtZWA6IGEgYmFyZSBzdHJpbmcsIG9yIGB7IG5hbWUgfWAuICovXG5leHBvcnQgZnVuY3Rpb24gcm9vbU5hbWVPZihkYXRhOiB1bmtub3duKTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJykgcmV0dXJuIGRhdGEudHJpbSgpO1xuICBpZiAoZGF0YSAmJiB0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIChkYXRhIGFzIHsgbmFtZT86IHVua25vd24gfSkubmFtZSA9PT0gJ3N0cmluZycpIHJldHVybiAoZGF0YSBhcyB7IG5hbWU6IHN0cmluZyB9KS5uYW1lLnRyaW0oKTtcbiAgcmV0dXJuICcnO1xufVxuXG4vKiogYFBsYXllci5Db250ZXh0YCAoRXZlbm5pYSwgVW5kZXJzcGlyZSk6IGB7IHJvb20sIHBvc2VfbGluZSwgcHJlc2VuY2UsIGNoYXJhY3RlciB9YCBcdTIxOTIgdGl0bGUsIHBvc2UgYW5kIHRoZSBwZW9wbGUgcHJlc2VudCAobm90IHlvdSkuICovXG5leHBvcnQgZnVuY3Rpb24gY29udGV4dE9mKGRhdGE6IHVua25vd24pOiBTY2VuZVBhdGNoIHwgbnVsbCB7XG4gIGlmICghZGF0YSB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICBjb25zdCBkID0gZGF0YSBhcyB7IHJvb20/OiB1bmtub3duOyBwb3NlX2xpbmU/OiB1bmtub3duOyBwcmVzZW5jZT86IHVua25vd247IGNoYXJhY3Rlcj86IHVua25vd24gfTtcbiAgY29uc3QgbWUgPSB0eXBlb2YgZC5jaGFyYWN0ZXIgPT09ICdzdHJpbmcnID8gZC5jaGFyYWN0ZXIudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiAnJztcbiAgY29uc3QgcGF0Y2g6IFNjZW5lUGF0Y2ggPSB7fTtcbiAgaWYgKHR5cGVvZiBkLnJvb20gPT09ICdzdHJpbmcnICYmIGQucm9vbS50cmltKCkpIHBhdGNoLnRpdGxlID0gZC5yb29tLnRyaW0oKTtcbiAgaWYgKHR5cGVvZiBkLnBvc2VfbGluZSA9PT0gJ3N0cmluZycpIHBhdGNoLnBvc2UgPSBkLnBvc2VfbGluZS50cmltKCk7XG4gIGlmIChBcnJheS5pc0FycmF5KGQucHJlc2VuY2UpKSBwYXRjaC5wcmVzZW50ID0gWy4uLm5ldyBTZXQoZC5wcmVzZW5jZS5maWx0ZXIoKG4pOiBuIGlzIHN0cmluZyA9PiB0eXBlb2YgbiA9PT0gJ3N0cmluZycgJiYgISFuLnRyaW0oKSAmJiBuLnRyaW0oKS50b0xvd2VyQ2FzZSgpICE9PSBtZSkubWFwKChuKSA9PiBuLnRyaW0oKSkpXTtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKHBhdGNoKS5sZW5ndGggPyBwYXRjaCA6IG51bGw7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBbUJBLFNBQVMsaUJBQWlCLFNBQXlHOzs7QUNtQzVILElBQU0sWUFBWTtBQUVsQixJQUFNLFlBQVk7OztBQzdDekIsSUFBTSxXQUFXO0FBRWpCLElBQU0sVUFBVTtBQUNoQixJQUFNLFlBQVk7QUFHWCxTQUFTLFFBQVEsTUFBK0I7QUFDckQsUUFBTSxJQUFJLFNBQVMsS0FBSyxLQUFLLEtBQUssQ0FBQztBQUNuQyxNQUFJLENBQUMsRUFBRyxRQUFPO0FBQ2YsUUFBTSxNQUFnQixDQUFDO0FBQ3ZCLFdBQVMsUUFBUSxFQUFFLENBQUMsRUFBRSxNQUFNLDhCQUE4QixHQUFHO0FBQzNELFdBQU8sS0FBSyxRQUFRLG9CQUFvQixFQUFFLEVBQUUsUUFBUSxZQUFZLEVBQUUsRUFBRSxLQUFLO0FBQ3pFLFFBQUksUUFBUSxDQUFDLElBQUksU0FBUyxJQUFJLEVBQUcsS0FBSSxLQUFLLElBQUk7QUFBQSxFQUNoRDtBQUNBLFNBQU87QUFDVDtBQUdPLFNBQVMsU0FBUyxNQUF3QjtBQUMvQyxRQUFNLE1BQWdCLENBQUM7QUFDdkIsYUFBVyxLQUFLLEtBQUssS0FBSyxFQUFFLE1BQU0sWUFBWSxHQUFH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
