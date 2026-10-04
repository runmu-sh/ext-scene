/**
 * The exported API of `@runmu.sh/ext-scene` (id `scene`). The extension sends no GMCP: it draws the host's scene
 * model (`mu.scene.watch`, `SceneView`), which the room adapters fill from GMCP `Room.*`, `Char.Items.*`, MSDP and
 * other extensions (`mu.scene.set`). On games with none of those (Evennia: only `Room.Name`) it provides the room
 * itself from `Room.Name`, `Player.Context` and the room text (1.3.0, `src/room.ts`). This file and the README
 * change together.
 */
import type { SceneView } from '@muclient/sdk';

/** One row of ┤PRESENT├: a person (from `present`) or a room item (from `items`). */
export interface PresentEntry {
  name: string;
  /** Set on hostile room items; drawn as a small `hostile` tag. */
  hostile?: boolean;
  /** The room item's id, when the row is an item with one (people have none). @since 1.1.0 */
  id?: string;
}

/** The class names `renderScene` uses for the host primitives; defaults are the host's (`mu.ui.css`). @since 1.1.0 */
export interface SceneCss {
  secHead: string;
  secClose: string;
  empty: string;
  glow: string;
}

/** Options for {@link renderScene} beyond the 1.0 signature. @since 1.1.0 */
export interface RenderOptions {
  /** `mu.ui.css` (or the part of it used). */
  css?: Partial<SceneCss>;
  /**
   * Called for every exit button and every present row as it is created, so the caller can mark it as a context
   * target (`mu.menus.target`). Return a function to undo it; those run on the next render or unmount.
   */
  target?: (el: HTMLElement, what: { exit: string } | { item: SceneView['items'][number] } | { person: string }) => void | (() => void);
}

/** Drawn copy. */
export interface SceneCopy {
  title: string;
  awaiting: string;
  present: string;
  exits: string;
  none: string;
  hostile: string;
  go(dir: string): string;
  /** The `focus.scene` command's title. @since 1.2.0 */
  focus: string;
  /** The context kinds' titles (the menu's accessible label). @since 1.2.0 */
  itemKind: string;
  exitKind: string;
}

/** The context kind of a room item in ┤PRESENT├ (SDK 1.14). @since 1.2.0 */
export const ITEM_KIND = 'scene.item';
/** The context kind of an exit button (SDK 1.14). @since 1.2.0 */
export const EXIT_KIND = 'scene.exit';

/** `data` of a `scene.item` target. @since 1.2.0 */
export interface SceneItemData { item: SceneView['items'][number] }
/** `data` of a `scene.exit` target. @since 1.2.0 */
export interface SceneExitData { exit: string }

/**
 * Types `t.data` in another extension's `mu.menus.context({ target: 'scene.item' | 'scene.exit', … })` once it
 * imports this file. @since 1.2.0
 */
declare module '@muclient/sdk' {
  interface ContextKinds {
    'scene.item': SceneItemData;
    'scene.exit': SceneExitData;
  }
}
