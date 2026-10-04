/**
 * The room from the game's own text, for games that send no `Room.Info` (Evennia games such as Underspire send
 * only `Room.Name` and, at login, `Player.Context`). Pure functions: `index.ts` feeds them the session's lines.
 *
 * An Evennia room look is: the title, the description, a blank line, things in the room, a blank line, who is
 * there ("Ash is standing here. You are standing here."), then the exits line ("There are exits to the market
 * (m) and the gate (g)."). The exits line closes the block, so a look at anything but a room reads nothing.
 */
import type { ScenePatch } from '@muclient/sdk';

/** "There are exits to …" / "There is an exit to …" / "Exits: …". */
const EXITS_RE = /^(?:there (?:are|is) (?:an? )?(?:exits?|ways?(?: out)?) (?:to|leading to) |(?:obvious )?exits?: )(.+?)\.?$/i;
/** One sentence of the who-is-here line: "<name> is|are <posture> here." */
const HERE_RE = /^(.+?) (?:is|are) (?:[a-z]+ )?here\.?$/i;
const MAX_TITLE = 80;

/** The exits line's names, in order: "the market (m), the well and Shard services (s)" → market, the well, Shard services. */
export function exitsOf(line: string): string[] | null {
  const m = EXITS_RE.exec(line.trim());
  if (!m) return null;
  const out: string[] = [];
  for (let part of m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/)) {
    part = part.replace(/\s*\([^)]*\)\s*$/, '').replace(/^the\s+/i, '').trim();
    if (part && !out.includes(part)) out.push(part);
  }
  return out;
}

/** The people in a who-is-here line, without you: "Ash and Ivo are sitting here. You are standing here." → Ash, Ivo. */
export function peopleOf(line: string): string[] {
  const out: string[] = [];
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

const looksTitle = (t: string) => t.length > 0 && t.length <= MAX_TITLE && !/[.!?:;,"')>\]]$/.test(t);

/**
 * The scene a room look ends in, from the session's recent lines oldest first, the last being the exits line; null
 * when they do not end in a room look. Read backwards from the exits line, in blank-separated sections: the one
 * just before it (with the exits line) holds who is here; the nearest section with a title line (no closing
 * punctuation) is the header, its title then the description. Things in the room sit between and are skipped.
 */
export function roomOf(lines: readonly string[], maxSections = 4): ScenePatch | null {
  if (!lines.length) return null;
  const exits = exitsOf(lines[lines.length - 1]);
  if (!exits) return null;
  const sections: string[][] = [[]];
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
    for (let j = sec.length - 1; j >= 0; j--) if (looksTitle(sec[j]) && !HERE_RE.test(sec[j])) { t = j; break; }
    if (t < 0) continue;
    // The title line must not be the who-is-here section itself.
    if (i === sections.length - 1 && people) continue;
    const present = people ? [...new Set(tail.flatMap(peopleOf))] : [];
    return { title: sec[t], desc: sec.slice(t + 1).join('\n'), exits, present };
  }
  return null;
}

/** `Room.Name`: a bare string, or `{ name }`. */
export function roomNameOf(data: unknown): string {
  if (typeof data === 'string') return data.trim();
  if (data && typeof data === 'object' && typeof (data as { name?: unknown }).name === 'string') return (data as { name: string }).name.trim();
  return '';
}

/** `Player.Context` (Evennia, Underspire): `{ room, pose_line, presence, character }` → title, pose and the people present (not you). */
export function contextOf(data: unknown): ScenePatch | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { room?: unknown; pose_line?: unknown; presence?: unknown; character?: unknown };
  const me = typeof d.character === 'string' ? d.character.trim().toLowerCase() : '';
  const patch: ScenePatch = {};
  if (typeof d.room === 'string' && d.room.trim()) patch.title = d.room.trim();
  if (typeof d.pose_line === 'string') patch.pose = d.pose_line.trim();
  if (Array.isArray(d.presence)) patch.present = [...new Set(d.presence.filter((n): n is string => typeof n === 'string' && !!n.trim() && n.trim().toLowerCase() !== me).map((n) => n.trim()))];
  return Object.keys(patch).length ? patch : null;
}
