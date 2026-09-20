import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { materializeCase } from '../../../eval/materialize.mjs';
import { SnapshotStore } from '../../../src/snapshot/store.ts';
const corpus=JSON.parse(await readFile(new URL('../../../eval/cases.json',import.meta.url),'utf8'));
test('all 20 golden base/head SHAs reproduce and freeze through the real snapshot boundary',async t=>{
 const parent=resolve(tmpdir());const dir=await mkdtemp(join(parent,'mergewarden-golden-'));t.after(async()=>{assert.ok(resolve(dir).startsWith(parent+sep));await rm(dir,{recursive:true,force:true});});
 for(const item of corpus.cases){const repository=join(dir,item.id);const {base,head}=await materializeCase(item,repository);assert.equal(base,item.baseSha);assert.equal(head,item.headSha);const store=await SnapshotStore.freeze({repositoryPath:repository,stateDir:join(dir,'state'),input:{kind:'commits',base,head},configuration:{fixture:true}});assert.ok(store.manifest.changedPaths.length>0);assert.equal(await store.text('head',item.relevantLocation.path),item.headFiles[item.relevantLocation.path]);}
});
