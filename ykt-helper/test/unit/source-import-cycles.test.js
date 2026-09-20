import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '../../src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

function staticImports(source) {
  const matches = [];
  const re = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(re)) matches.push(match[1]);
  return matches;
}

function resolveImport(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const candidate = path.resolve(path.dirname(from), specifier);
  const options = [candidate, `${candidate}.js`, path.join(candidate, 'index.js')];
  return options.find(file => fs.existsSync(file) && fs.statSync(file).isFile()) || null;
}

function findCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];
  const seen = new Set();

  function canonical(nodes) {
    const body = nodes.slice(0, -1);
    const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)]);
    rotations.sort((a, b) => a.join('\0').localeCompare(b.join('\0')));
    const best = rotations[0];
    return [...best, best[0]];
  }

  function dfs(node) {
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      if (visiting.has(next)) {
        const start = stack.indexOf(next);
        const cycle = canonical([...stack.slice(start), next]);
        const key = cycle.join(' -> ');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (!visited.has(next)) {
        dfs(next);
      }
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) dfs(node);
  return cycles;
}

test('production JS source import graph has no circular dependencies', () => {
  const files = walk(srcRoot);
  const graph = new Map();
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const edges = staticImports(source)
      .map(specifier => resolveImport(file, specifier))
      .filter(Boolean);
    graph.set(file, edges);
  }

  const cycles = findCycles(graph).map(cycle => cycle.map(file => path.relative(srcRoot, file).replaceAll('\\', '/')));
  assert.deepEqual(cycles, [], `circular imports:\n${cycles.map(cycle => ` - ${cycle.join(' -> ')}`).join('\n')}`);
});
