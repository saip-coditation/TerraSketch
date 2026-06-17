/**
 * Lightweight Terraform/HCL parser — extracts `resource` blocks and the
 * dependency references between them, straight from the generated .tf source.
 *
 * This is intentionally a *tolerant* parser (regex + balanced-brace scan), not
 * a full HCL2 implementation. It is good enough to drive an accurate cost
 * breakdown and a "Terraform → diagram" view from real code, and it never
 * throws on malformed input — it just returns whatever it could recover.
 */

const RESOURCE_RE = /resource\s+"([a-zA-Z0-9_]+)"\s+"([a-zA-Z0-9_-]+)"\s*\{/g;

// Resource address token, e.g. aws_subnet.private  (used to find references)
const ADDRESS_RE = /\b([a-z][a-z0-9]*_[a-z0-9_]+)\.([a-zA-Z0-9_-]+)/g;

/**
 * Given the index of an opening `{`, return the substring inside the matching
 * closing `}` (string-, comment- and nesting-aware) plus the end index.
 */
function extractBalanced(text, openIdx) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "#") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (ch === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 1;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { body: text.slice(openIdx + 1, i), end: i };
    }
  }
  return { body: text.slice(openIdx + 1), end: text.length };
}

/** Read a top-level scalar attribute value (string or number) from a block body. */
function readAttr(body, key) {
  // string:  key = "value"   |  number/ident:  key = 3
  const str = body.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*"([^"]*)"`));
  if (str) return str[1];
  const num = body.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*([0-9]+)\\b`));
  if (num) return num[1];
  return null;
}

/**
 * Parse one or many .tf source strings into a flat resource list.
 * Accepts a string, an array of strings, or a { filename: content } object.
 *
 * @returns {{ type, name, address, body }[]}
 */
export function parseResources(input) {
  const sources = [];
  if (typeof input === "string") sources.push(input);
  else if (Array.isArray(input)) sources.push(...input.filter((s) => typeof s === "string"));
  else if (input && typeof input === "object") {
    for (const v of Object.values(input)) if (typeof v === "string") sources.push(v);
  }

  const resources = [];
  for (const text of sources) {
    if (!text) continue;
    RESOURCE_RE.lastIndex = 0;
    let m;
    while ((m = RESOURCE_RE.exec(text)) !== null) {
      const type = m[1];
      const name = m[2];
      const openIdx = RESOURCE_RE.lastIndex - 1; // points at the `{`
      const { body, end } = extractBalanced(text, openIdx);
      resources.push({ type, name, address: `${type}.${name}`, body });
      RESOURCE_RE.lastIndex = end + 1;
    }
  }
  return resources;
}

/**
 * Build dependency edges between parsed resources from interpolation
 * references inside each block body (e.g. `subnet_id = aws_subnet.x.id`).
 *
 * @returns {{ from: string, to: string }[]}  from = referencing, to = referenced
 */
export function parseEdges(resources) {
  const addresses = new Set(resources.map((r) => r.address));
  const edges = [];
  const seen = new Set();
  for (const r of resources) {
    ADDRESS_RE.lastIndex = 0;
    let m;
    while ((m = ADDRESS_RE.exec(r.body)) !== null) {
      const target = `${m[1]}.${m[2]}`;
      if (target === r.address) continue; // self-reference
      if (!addresses.has(target)) continue; // only edges to known resources
      const key = `${r.address}__${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: r.address, to: target });
    }
  }
  return edges;
}

/** Parse an integer "instance count" style attribute, defaulting to 1. */
export function readCount(body) {
  for (const key of [
    "count",
    "desired_count",
    "desired_capacity",
    "node_count",
    "min_node_count",
    "number_of_nodes",
    "instances",
    "instance_count",
  ]) {
    const v = readAttr(body, key);
    if (v != null) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 1;
}

/** Read the size/sku string for a resource, if any (instance_type, sku, machine_type…). */
export function readSize(body) {
  for (const key of [
    "instance_type",
    "instance_class",
    "machine_type",
    "node_type",
    "size",
    "sku_name",
    "vm_size",
    "tier",
  ]) {
    const v = readAttr(body, key);
    if (v) return v;
  }
  return null;
}

export { readAttr };
