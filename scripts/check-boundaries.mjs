import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const allowed = {
  domain: [],
  contracts: [],
  application: ['domain', 'contracts'],
  agent: ['domain', 'application', 'contracts'],
  integrations: ['domain'],
  persistence: ['domain'],
  api: [
    'domain',
    'application',
    'agent',
    'integrations',
    'persistence',
    'contracts',
  ],
  web: ['contracts'],
  'voice-satellite': ['contracts'],
};
function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts'))
      yield path;
  }
}
let count = 0;
for (const parent of ['apps', 'packages']) {
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    assert(name in allowed, `Unknown workspace ${name}`);
    const directory = join(parent, name);
    const manifest = JSON.parse(
      readFileSync(join(directory, 'package.json'), 'utf8'),
    );
    assert.equal(manifest.name, `@aura/${name}`);
    for (const [dependency, version] of Object.entries(
      manifest.dependencies ?? {},
    )) {
      if (dependency.startsWith('@aura/')) {
        assert(
          allowed[name].includes(dependency.slice(6)),
          `${name} cannot depend on ${dependency}`,
        );
        assert.equal(version, 'workspace:*');
      } else {
        assert.notEqual(
          name,
          'domain',
          'Domain must have no vendor dependencies',
        );
        assert(/^\d+\.\d+\.\d+$/.test(version), `${dependency} must be pinned`);
      }
    }
    for (const file of files(join(directory, 'src'))) {
      count++;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g,
      )) {
        const imported = match[1];
        if (imported.startsWith('@aura/')) {
          const workspace = imported.slice(6).split('/')[0];
          assert(
            allowed[name].includes(workspace),
            `${file} cannot import ${imported}`,
          );
          assert(
            imported === `@aura/${workspace}` || !imported.includes('/src/'),
            `${file} must use public exports`,
          );
        } else if (imported.startsWith('.')) {
          assert(
            !imported.startsWith('../../'),
            `${file} cannot reach outside its workspace`,
          );
        } else {
          assert.notEqual(name, 'domain', `Domain cannot import ${imported}`);
          if (name === 'web')
            assert(
              !/openai|strands|persistence|node:/.test(imported),
              `Server dependency in web: ${imported}`,
            );
        }
      }
    }
  }
}
console.log(`Workspace boundaries verified across ${count} source files.`);
