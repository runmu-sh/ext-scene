# Scene (`@runmu.sh/ext-scene`, id `scene`)

The Scene panel of [μClient](https://runmu.sh) (R-SCENE): the room you are in, its exits and who is there.

First-party, on the [marketplace](https://runmu.sh/marketplace/x/scene). Install it from **☰ → Extensions → Discover**; once installed it is on in every world and takes the Scene slot of the default layout (right top). Turn it off per world in **Extensions → Installed**.

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
On `--bg-elev`: the title in uppercase `--accent-bright` with a glow and a `--border-bright` rule under it, the area in small faint capitals, the atmosphere in italic `--fg-dim`, the description, and the pose line in italic with a 2px left rule. Then `┤EXITS├` and `┤PRESENT├` section heads (gold, the host's `.sec-head`) over `▸` lists. Each exit is a button: clicking it sends the direction as if typed. A hostile item carries a small `hostile` tag in `--alert`. An empty list says `none`, and before any room arrives the panel says NO ROOM YET (an upright, uppercase, tracked faint label).

The panel is the region `scene`, so **Alt+R** (*Go to scene*) focuses it.

## Behaviour
- Panel `scene`, singleton, default position right top, Views order 10 (after Terminal, before Channels).
- The first `Room.*` package of a session adds the panel if it is not open (R-AUTO-PANELS), once per world on this device, so a Scene you closed stays closed.
- It sends nothing to the game except the exits you click. It adds no `Core.Supports` of its own (the backend's base set already has `Room 1`).

## SDK
Uses `mu.panels.register` (with `order`, SDK 1.4), `mu.scene.watch` (SDK 1.4), `mu.sessions.send`, `mu.gmcp.on`, `mu.panels.autoAdd` and `mu.ui.style`. It exports no API. `renderScene` and `presentOf` are exported for tests.

## Develop
Made with `npm create @runmu.sh/extension` ([the quickstart](https://runmu.sh/docs/extensions/quickstart)).

```sh
npm install
npm run build        # src/index.ts → dist/index.js, then the manifest check
npm run typecheck    # against @muclient/sdk (npm:@runmu.sh/sdk)
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
