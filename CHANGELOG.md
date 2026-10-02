# Changelog

## 1.1.0

- Present now comes before Exits, and a room with no exits shows no Exits heading at all, as on Underspire.
- The Scene adds itself the first time a session knows its room, however the game sends it (GMCP, MSDP or another extension), not only on GMCP Room messages. A new **Show panel** setting per world (off / auto / on) controls it.
- Someone arriving or an item dropping no longer scrolls the panel back to the top; moving to another room still does.
- Right-click or long-press an exit or a room item for the actions other extensions offer on them.
- Exit buttons are at least 24px tall and show the standard focus ring.
- Needs μClient with extension API 1.12. It no longer asks to read game output; it only sends the exits you click.

## 1.0.3

- No longer bundled with μClient: `builtin` and `defaultEnabled` are gone from the manifest. Install Scene from Extensions → Discover like any other extension. The panel is unchanged.

## 1.0.2

- Its own repository, [runmu-sh/ext-scene](https://github.com/runmu-sh/ext-scene), made with `npm create @runmu.sh/extension` and built against `@runmu.sh/sdk` from npm. The package is `@runmu.sh/ext-scene`. The panel is unchanged.

## 1.0.1

- The empty state reads NO ROOM YET (was "Awaiting signal…"): an upright, uppercase, tracked faint label, as the 2026-09-29 reference.

## 1.0.0

- The Scene panel as an extension. It was part of the μClient core; it now draws the room through `mu.scene.watch` (SDK 1.4). Nothing changes for players: it is built in, on by default and in the default layout.
