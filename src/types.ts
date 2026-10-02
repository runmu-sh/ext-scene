/**
 * The exported API of `@runmu.sh/ext-scene` (id `scene`). The extension reads no GMCP and sends none: it draws the
 * host's scene model (`mu.scene.watch`, `SceneView`), which the room adapters fill from GMCP `Room.*`,
 * `Char.Items.*`, MSDP and other extensions (`mu.scene.set`). This file and the README change together.
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
}
