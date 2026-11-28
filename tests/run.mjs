// すべてのテストを順に実行する: node tests/run.mjs
import { spawnSync } from 'node:child_process';
let ok = true;
for (const t of ['rate.mjs', 'golden.mjs', 'scenario.mjs', 'app.mjs', 'excel.mjs', 'privacy.mjs', 'masters.mjs']) {
  const r = spawnSync(process.execPath, [new URL(t, import.meta.url).pathname], { stdio: 'inherit' });
  if (r.status !== 0) ok = false;
}
console.log(ok ? 'ALL PASS' : 'FAILED');
process.exit(ok ? 0 : 1);
