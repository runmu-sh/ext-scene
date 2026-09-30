# Changelog

## 1.0.2

- Its own repository, [runmu-sh/ext-scene](https://github.com/runmu-sh/ext-scene), made with `npm create @runmu.sh/extension` and built against `@runmu.sh/sdk` from npm. The package is `@runmu.sh/ext-scene`. The panel is unchanged.

## 1.0.1

- The empty state reads NO ROOM YET (was "Awaiting signal…"): an upright, uppercase, tracked faint label, as the 2026-09-29 reference.

## 1.0.0

- The Scene panel as an extension. It was part of the μClient core; it now draws the room through `mu.scene.watch` (SDK 1.4). Nothing changes for players: it is built in, on by default and in the default layout.
