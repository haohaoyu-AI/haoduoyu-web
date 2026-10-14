import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const paths=fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();assert.equal(paths.length,54);
const check=spawnSync('python3',['scripts/check-pending-schema-only.py'],{encoding:'utf8'});assert.equal(check.status,0,check.stdout+check.stderr);
const fixtures=spawnSync('python3',['-c',`import runpy
v=runpy.run_path('scripts/check-pending-schema-only.py')['violations']
assert len(v("CREATE TABLE x(id TEXT); INSERT INTO x VALUES('a');"))==1
assert len(v("CREATE TABLE x AS SELECT * FROM y;"))==1
assert not v("CREATE TRIGGER keep AFTER INSERT ON x BEGIN INSERT INTO y VALUES(NEW.id); END;")
assert len(v("CREATE TRIGGER keep AFTER INSERT ON x BEGIN INSERT INTO y VALUES(NEW.id); END; DELETE FROM x;"))==1
assert not v("CREATE VIEW old_safety AS SELECT * FROM old; -- no write\\n")
`],{encoding:'utf8'});assert.equal(fixtures.status,0,fixtures.stderr);
console.log('PASS pending schema-only static check, all54 migration files, reject standalone DML/CREATE TABLE AS SELECT, accept readonly views and complete trigger DDL. No production access.');
