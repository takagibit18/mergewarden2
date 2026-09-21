import test from 'node:test';
import assert from 'node:assert/strict';
import { PythonTreeSitterExtractor } from '../src/python-extractor.ts';
import { resolvePython } from '../../../src/graph/python-resolver.ts';
async function resolve(files) {
  const e=await PythonTreeSitterExtractor.create();
  try { return resolvePython(await Promise.all(Object.entries(files).map(([path,source])=>e.extract({snapshotId:'fixture',path,source})))); } finally { e.dispose(); }
}
const calls = r => r.facts.flatMap(f=>f.calls);
const edges = r => r.relations.filter(e=>e.relation==='CALLS').map(e=>[r.facts.flatMap(f=>f.symbols).find(s=>s.id===e.fromId).qualifiedName,r.facts.flatMap(f=>f.symbols).find(s=>s.id===e.toId).qualifiedName]).sort();
test('same names in separate files never create cross-file calls',async()=>{
  const r=await resolve({'a.py':'def save(): pass\ndef run(): save()\n','b.py':'def save(): pass\ndef run(): save()\n','c.py':'save()\n'});
  assert.deepEqual(edges(r),[['a.run','a.save'],['b.run','b.save']]); assert.equal(calls(r).find(c=>c.path==='c.py').resolution,'unresolved');
});
test('nested functions use lexical scope and method bodies skip class namespace',async()=>{
  const r=await resolve({'a.py':'def save(): pass\ndef outer():\n def save(): pass\n def inner(): save()\n inner()\nclass A:\n def save(): pass\n save()\n def method(self): save()\n'});
  assert.deepEqual(edges(r),[['a.A','a.A.save'],['a.A.method','a.save'],['a.outer','a.outer.inner'],['a.outer.inner','a.outer.save']]);
});
for(const body of ['def run(save): save()','def run():\n save()\n save = other','def run():\n for save in xs: save()','def run():\n with x as save: save()','def run():\n del save\n save()']) test(`local binding shadows outer definition: ${body.split('\n')[0]}`,async()=>{
  const r=await resolve({'a.py':`def save(): pass\n${body}\n`}); assert.equal(edges(r).length,0);
});
for(const [statement,expression] of [['import pkg.mod','pkg.mod.save()'],['import pkg.mod as m','m.save()'],['from pkg.mod import save','save()'],['from pkg.mod import save as alias','alias()'],['from .mod import save as alias','alias()'],['from . import mod','mod.save()']]) test(`explicit import binding: ${statement}`,async()=>{
  const r=await resolve({'pkg/__init__.py':'','pkg/mod.py':'def save(): pass\n','pkg/use.py':`${statement}\ndef run(): ${expression}\n`});
  assert.deepEqual(edges(r),[['pkg.use.run','pkg.mod.save']]); assert.equal(calls(r)[0].resolution,'resolved_import_alias'); assert.ok(r.relations.some(e=>e.relation==='IMPORTS'));
});
test('dynamic receivers, getattr, lambdas and comprehension calls remain unresolved',async()=>{
  const r=await resolve({'a.py':'def save(): pass\ndef run(obj):\n obj.save()\n getattr(obj,"save")()\n (lambda save: save())(obj)\n [save() for save in xs]\n'}); assert.equal(edges(r).length,0); assert.ok(calls(r).every(c=>c.resolution==='unresolved'));
});
test('syntax errors keep sites but cannot generate proven semantic edges',async()=>{
  const r=await resolve({'a.py':'def save(): pass\nsave()\ndef broken(:\n'}); assert.equal(r.facts[0].parseComplete,false); assert.equal(edges(r).length,0);
});
test('duplicate/conditional/decorated definitions are candidates, not CALLS',async()=>{
  const r=await resolve({'a.py':'if flag:\n def save(): pass\nelse:\n def save(): pass\nsave()\n@decorator\ndef run(): pass\nrun()\n'}); assert.equal(edges(r).length,0); assert.ok(calls(r).every(c=>c.resolution==='candidate'));
});
test('default expressions are resolved in enclosing scope; global and wildcard stay uncertain',async()=>{
  const r=await resolve({'a.py':'def save(): pass\ndef run(save=save()): save()\n'}); assert.deepEqual(edges(r),[['a','a.save']]);
  for(const source of ['def save(): pass\ndef f():\n global save\n save()\n','from a import *\nsave()\n']) assert.equal(edges(await resolve({'b.py':source})).length,0);
});
test('facts and relation identifiers rebuild deterministically without CST objects',async()=>{
  const files={'a.py':'def save(): pass\ndef f(): save()\n'}; const a=await resolve(files); assert.deepEqual(a,await resolve(files)); assert.equal(JSON.stringify(a).includes('namedChildren'),false);
});
test('local imports before binding, mutated receivers and keyword labels do not fabricate edges',async()=>{
 const r=await resolve({'helper.py':'def save(): pass\n','a.py':'from helper import save\ndef f():\n save()\n from helper import save\n','b.py':'import helper as h\nh.save = replacement\nh.save()\n','c.py':'def save(): pass\nexternal(save=1)\n'});
 assert.equal(edges(r).length,0);assert.equal(r.relations.filter(e=>e.relation==='REFERENCES'&&e.sourcePath==='c.py').length,0);
});
test('explicit metaclass construction stays unresolved',async()=>{
 const r=await resolve({'a.py':'class C(metaclass=Factory): pass\nC()\n'});assert.equal(edges(r).length,0);assert.equal(calls(r)[0].resolution,'unresolved');assert.ok(r.facts[0].diagnostics.some(d=>d.includes('metaclass')));
});
