import fs from "fs";
import path from "path";

const root = path.resolve("src");

const MODULE_PATTERNS = [
  { name: "anime-views", re: /^views\/anime(\/|$)/ },
  { name: "anilist", re: /^lib\/anilist(\/|$)/ },
  { name: "mal", re: /^lib\/mal(\/|$)/ },
  { name: "anime-lib", re: /^lib\/anime-/ },
  { name: "anime-providers", re: /^lib\/providers\/anime-/ },
  { name: "anime-hooks", re: /^lib\/use-anilist-/ },
  { name: "anime-components", re: /^(components\/anilist(\/|$)|components\/anime-)/ },
  { name: "anime-detail-views", re: /^views\/detail\/anime-/ },
  { name: "anime-award-view", re: /^views\/anime-award/ },
  { name: "mal-components", re: /^components\/mal(\/|$)/ },
  { name: "kids-views", re: /^views\/kids(\/|$)|^views\/kids-detail/ },
  { name: "live-views", re: /^views\/live(\/|$)/ },
  { name: "iptv", re: /^lib\/iptv(\/|$)/ },
  { name: "dvr", re: /^lib\/dvr(\/|$)/ },
  { name: "live-lib", re: /^lib\/live-/ },
  { name: "calendar-views", re: /^views\/calendar(\/|$)/ },
  { name: "calendar-lib", re: /^lib\/calendar/ },
  { name: "award-views", re: /^views\/award(\/|$)|^views\/award\.tsx$/ },
  { name: "awards-lib", re: /^lib\/awards/ },
  { name: "movies-views", re: /^views\/movies(\/|$)/ },
];

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function rel(f) {
  return path.relative(root, f).replace(/\\/g, "/");
}

function moduleOf(relPath) {
  for (const m of MODULE_PATTERNS) if (m.re.test(relPath)) return m.name;
  return null;
}

const allFiles = walk(root);
const relFiles = allFiles.map(rel);
const relSet = new Set(relFiles);

function resolveImport(fromRel, spec) {
  let s = spec;
  if (s.startsWith("@/")) s = s.slice(2);
  if (s.startsWith("./") || s.startsWith("../")) {
    const base = path.dirname(fromRel).replace(/\\/g, "/");
    const joined = path.posix.normalize(path.posix.join(base, s));
    const cands = [
      joined,
      joined + ".ts",
      joined + ".tsx",
      joined + "/index.ts",
      joined + "/index.tsx",
    ];
    for (const c of cands) if (relSet.has(c)) return c;
    return joined;
  }
  const cands = [s, s + ".ts", s + ".tsx", s + "/index.ts", s + "/index.tsx"];
  for (const c of cands) if (relSet.has(c)) return c;
  return s;
}

const importRe =
  /(?:import|export)\s+(?:type\s+)?(?:[\w*\s{},]*\s+from\s+)?["']([^"']+)["']|import\s*\(["']([^"']+)["']\)/g;

const importers = new Map();
for (const f of relFiles) {
  const content = fs.readFileSync(path.join(root, f), "utf8");
  let m;
  importRe.lastIndex = 0;
  while ((m = importRe.exec(content))) {
    const spec = m[1] || m[2];
    if (!spec || (!spec.startsWith("@/") && !spec.startsWith(".") && !spec.startsWith("src/")))
      continue;
    const target = resolveImport(f, spec);
    if (!importers.has(target)) importers.set(target, new Set());
    importers.get(target).add(f);
  }
}

const moduleFiles = relFiles.filter((f) => moduleOf(f));
const byModule = {};
for (const f of moduleFiles) {
  const mod = moduleOf(f);
  if (!byModule[mod]) byModule[mod] = [];
  byModule[mod].push(f);
}

function classify(f) {
  const froms = [...(importers.get(f) || [])];
  const external = froms.filter((x) => !moduleOf(x));
  const internal = froms.filter((x) => moduleOf(x));
  return { external, internal, total: froms.length };
}

const report = { importedByActive: [], orphaned: [], internalOnly: [] };
for (const f of moduleFiles.sort()) {
  const { external, internal, total } = classify(f);
  if (total === 0) report.orphaned.push(f);
  else if (external.length === 0) report.internalOnly.push({ file: f, importers: internal });
  else report.importedByActive.push({ file: f, importers: external });
}

console.log("=== MODULE FILE COUNTS ===");
for (const [k, v] of Object.entries(byModule).sort()) console.log(`${k}: ${v.length}`);

console.log(`\n=== IMPORTED BY ACTIVE CODE (${report.importedByActive.length}) ===`);
for (const item of report.importedByActive) {
  console.log(`\n${item.file}`);
  for (const imp of item.importers.sort()) console.log(`  <- ${imp}`);
}

console.log(`\n=== INTERNAL ONLY (${report.internalOnly.length}) ===`);
for (const item of report.internalOnly) {
  console.log(`${item.file} <- ${item.importers.join(", ")}`);
}

console.log(`\n=== ORPHANED (${report.orphaned.length}) ===`);
for (const f of report.orphaned) console.log(f);
