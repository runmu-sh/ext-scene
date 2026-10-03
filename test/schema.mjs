/**
 * The host's JSON Schema check for context-kind data (clients/web/src/core/schema.ts `validate`, μClient 57b4b00),
 * copied as plain JS so the tests check `KIND_SCHEMAS` against the data the panel publishes the way the host does.
 */
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

/** The first problem as `path: message`, or null when `data` conforms. */
export function validate(schema, data, root = schema, path = '$') {
  if (schema.$ref) {
    const m = /^#\/\$defs\/(.+)$/.exec(schema.$ref);
    const target = m ? root.$defs?.[m[1]] : undefined;
    if (!target) return `${path}: unknown $ref ${schema.$ref}`;
    return validate(target, data, root, path);
  }
  if (schema.type) {
    const want = Array.isArray(schema.type) ? schema.type : [schema.type];
    const got = typeOf(data);
    if (!want.some((t) => t === got || (t === 'number' && got === 'integer'))) return `${path}: expected ${want.join(' or ')}, got ${got}`;
  }
  if (schema.enum && !schema.enum.some((e) => e === data)) return `${path}: not one of ${schema.enum.map(String).join(', ')}`;
  if (typeOf(data) === 'object') {
    for (const r of schema.required ?? []) if (!(r in data) || data[r] === undefined) return `${path}.${r}: required`;
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const ps = schema.properties?.[k];
      if (ps) { const e = validate(ps, v, root, `${path}.${k}`); if (e) return e; }
      else if (schema.additionalProperties === false && schema.properties) return `${path}.${k}: not allowed`;
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') { const e = validate(schema.additionalProperties, v, root, `${path}.${k}`); if (e) return e; }
    }
  }
  if (typeOf(data) === 'array' && schema.items) {
    for (let i = 0; i < data.length; i++) { const e = validate(schema.items, data[i], root, `${path}[${i}]`); if (e) return e; }
  }
  return null;
}
