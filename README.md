# Scene (`@runmu.sh/ext-scene`, id `scene`)

The Scene panel of [μClient](https://runmu.sh): the room you are in, who is there and its exits.

First-party, on the [marketplace](https://runmu.sh/marketplace/x/scene). Install it from **☰ → Extensions → Discover**; once installed it is on in every world and adds itself (right top) the first time a session knows its room. Turn it off per world in **Extensions → Installed**.

Until 2026-09-29 the panel was part of the client core, and until 1.0.3 it was bundled with the client. The core still tracks the room for every session; this extension only draws it.

## Where the room comes from
The host keeps one scene per session and fills it from:

| Source | Fields |
|---|---|
| GMCP `Room.Info` | `name`, `num`/`id`/`vnum`, `area`/`zone`, `desc`/`description`, `atmosphere`/`weather`, `pose`, `exits` (object, list or string) |
| GMCP `Room.Players`, `Room.AddPlayer`, `Room.RemovePlayer` | Present (people) |
| GMCP `Char.Items.List` / `Add` / `Remove` with `location: "room"` | Present (items; `hostile: true` is marked) |
| MSDP `ROOM_NAME`, `ROOM_VNUM`, `ROOM_EXITS`, `AREA_NAME` (or `ROOM.*`) | Title, exits, area |
| Another extension: `mu.scene.set({ title, area, desc, atmosphere, pose, exits, present, items })` | Any field |

Package names are case-insensitive. Entering a new room clears Present. The room title is also the session's location (the world switcher shows it).

## What it looks like
On `--bg-elev`: the title in uppercase `--accent-bright` with a glow and a `--border-bright` rule under it, the area in small faint capitals, the atmosphere in italic `--fg-dim`, the description, and the pose line in italic with a 2px left rule. Then `┤PRESENT├` over a `▸` list of the people and room items present (a hostile item carries a small `hostile` tag in `--alert`; nobody reads `none`), and, when the room has exits, `┤EXITS├` over a `▸` list. Each exit is a button: clicking it sends the direction as if typed. Before any room arrives the panel says NO ROOM YET (an upright, uppercase, tracked faint label).

The panel is the region `scene`. **Alt+R** (*Go to scene*, command `focus.scene`) focuses it; rebind it in Settings → Keys. From 1.2.0 the extension registers the command itself (μClient with extension API 1.14); on an older μClient the client's own Alt+R does the same.

## Behaviour
- Panel `scene`, singleton, default position right top, Views order 10 (after Terminal, before Channels).
- **Show panel: auto** (per world, on the extension's settings page: off / auto / on). On auto the Scene joins Views and adds itself the first time a session knows its room, whatever the room came from (GMCP, MSDP, another extension); once per world on this device, so a Scene you closed stays closed.
- A redraw in the same room (someone arrives, an item drops) keeps your scroll position; moving to another room scrolls back to the top. When the game sends no room id, every update counts as a move.
- Right-click (or long-press) an exit or a room item for the menus other extensions add to them. The extension registers the context kinds `scene.exit` (title *Exit*, `data: { exit }`) and `scene.item` (title *Scene item*, `data: { item: { id, name, hostile? } }`), each with a schema the host checks. On a μClient before API 1.14 it publishes the 1.12 kinds `scene-exit` and `scene-item` instead; on 1.14 an entry written for the old kinds still receives the new targets in the old shape.
- It sends nothing to the game except the exits you click, and reads no GMCP itself: the room adapters fill the scene.

## Contract
The extension reads no GMCP and sends none, so it declares no GMCP packages or payload contracts; the room adapters declare `Room 1` and feed `mu.scene` (`SceneView`). Capability: `send-commands` (the exit buttons).

## Exported API (`@runmu.sh/ext-scene`, types in `src/types.ts`)
No `ctx.exports` API. The module exports, for tests and other renderers:

| Export | |
|---|---|
| `renderScene(scene, go, opts?)` | The panel's children for one `SceneView` (`null` or `known: false` → NO ROOM YET). `go(dir)` is called on an exit click. `opts.css` passes the host classes (`mu.ui.css`), `opts.target(el, what)` is called for each exit button and present row (to mark context targets). The 1.0 two-argument form still works. |
| `presentOf(scene)` | People first, then room items, each name once: `{ name, hostile? }[]`. |
| `COPY`, `SCENE_CSS` | The drawn copy and the stylesheet (every rule under `.ext-panel[data-ext="scene"] .mu-scene`). |
| `ITEM_KIND`, `EXIT_KIND`, `KIND_SCHEMAS` | `'scene.item'`, `'scene.exit'` and their `data` schemas. |

`src/types.ts` augments the SDK's `ContextKinds` with `scene.item` (`SceneItemData`) and `scene.exit` (`SceneExitData`), so an extension that imports it gets `t.data` typed in `mu.menus.context({ target: 'scene.exit', … })`.

## SDK
`api` `^1.12`. SDK 1.12: `mu.panels.register` with `show: 'auto'`, `mu.panels.touch`, `mu.sessions.each`, `mu.scene.watch` (and `SceneView.id`), `mu.sessions.send(dir, { sid })`, `mu.menus.target`, `h` and `mu.ui.css`, `mu.ui.style`. SDK 1.14, used when the host has them: `mu.menus.kind` (with `JsonSchema` and `ContextKinds`), `mu.panels.focus` with `mu.commands.register`. The manifest declares `focus.scene` in `contributes.commands`, so Alt+R is listed and bound before the extension activates.

## Develop
Made with `npm create @runmu.sh/extension` ([the quickstart](https://runmu.sh/docs/extensions/quickstart)).

```sh
npm install
npm run build        # src/index.ts → dist/index.js, then the manifest check
npm run typecheck    # against @muclient/sdk (npm:@runmu.sh/sdk)
npm test             # the headless host (@runmu.sh/dev/test) with happy-dom
npm run dev          # dev server on http://localhost:5199/ with hot reload
```

In μClient: **☰ → Extensions → Advanced → Developer → load from dev server**.

## Publish
The repository is linked to the marketplace listing [scene](https://runmu.sh/marketplace/x/scene) (publisher `bitmuse`): every version tag is imported within seconds (webhook), or within 30 minutes (poll).

```sh
# bump version in package.json and add a CHANGELOG entry, then:
npm run build && git commit -am "Scene x.y.z" && git tag vx.y.z && git push --follow-tags
```

`dist/` is committed: the marketplace builds nothing. Versions are immutable.

## License
MIT.
