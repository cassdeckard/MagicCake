// Generates data/enemies.json from MagicCake-archive's enemy tables
// (https://github.com/cassdeckard/MagicCake-archive, public/data/*.yml, extracted from the
// EarthBound ROM via CoilSnake). Usage: node scripts/gen-enemies.mjs <path-to-MagicCake-archive>
// Requires js-yaml (npm i --no-save js-yaml).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import * as yaml from 'js-yaml'
const src = process.argv[2] || '../MagicCake-archive'
const load = f => yaml.load(readFileSync(path.join(src, 'public/data', f), 'utf8'))
const groups = load('enemy_groups.yml'); const cfg = load('enemy_configuration_table.yml')
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const map = new Map() // slug -> {name, bgs:[[l1,l2]]}, ordered by group id then enemy order
for (const id of Object.keys(groups).map(Number).sort((a, b) => a - b)) {
  const g = groups[id]; const pair = [g['Background 1'], g['Background 2']]
  if (!pair[0] && !pair[1]) continue
  for (const e of g.Enemies || []) {
    if (!(e.Amount > 0)) continue
    const name = cfg[e.Enemy]?.Name; if (!name) continue
    const s = slug(name); if (!s) continue
    if (!map.has(s)) map.set(s, { name, bgs: [] })
    const bgs = map.get(s).bgs
    if (!bgs.some(p => p[0] === pair[0] && p[1] === pair[1])) bgs.push(pair)
  }
}
const out = { source: 'https://github.com/cassdeckard/MagicCake-archive (public/data/enemy_groups.yml + enemy_configuration_table.yml)', enemies: Object.fromEntries([...map].sort((a, b) => a[0].localeCompare(b[0]))) }
writeFileSync(new URL('../data/enemies.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(`${map.size} enemies`)
