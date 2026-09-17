import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=process.cwd();
const base='68db15b305e3dda2883d2d956709879a9034e5f9';
const read=p=>JSON.parse(readFileSync(path.join(root,p),'utf8'));
const manifest=read('public/downloads/official-forms/manifest.json');
const results=read('docs/forms-additions-61/results.json');
const before=JSON.parse(execFileSync('git',['show',base+':public/downloads/official-forms/manifest.json'],{encoding:'utf8'}));
const expected=[...Array.from({length:16},(_,n)=>`P0-${String(n+1).padStart(2,'0')}`),...Array.from({length:24},(_,n)=>`P1-${String(n+1).padStart(2,'0')}`),...Array.from({length:15},(_,n)=>`P2-${String(n+1).padStart(2,'0')}`),...Array.from({length:6},(_,n)=>`P3-${String(n+1).padStart(2,'0')}`)];
const replace={'P1-03':'REG-I-01','P1-04':'REG-I-03','P1-05':'REG-G-01'};
const additions=expected.filter(id=>!replace[id]);
const tasks=readFileSync('tasks.md','utf8');
test('all 61 requested tasks represented once',()=>{
 assert.equal(expected.length,61);assert.deepEqual(results.map(x=>x.id),expected);
 assert.equal(new Set(results.map(x=>x.id)).size,61);
});
test('58 new records plus 3 URL-only update tasks, without fabricated duplicates',()=>{
 assert.equal(additions.length,58);assert.equal(manifest.documents.length,132);
 assert.equal(new Set(manifest.documents.map(d=>d.id)).size,132);
 assert.deepEqual(manifest.documents.filter(d=>/^P[0-3]-/.test(d.id)).map(d=>d.id),additions);
});
test('existing 74 records preserved except explicitly verified URL replacements',()=>{
 assert.equal(before.documents.length,74);
 for(const previous of before.documents){
  const current=manifest.documents.find(d=>d.id===previous.id);assert.ok(current,previous.id);
  const id=Object.keys(replace).find(k=>replace[k]===previous.id);
  if(id && results.find(r=>r.id===id).status==='확인 완료'){
   assert.deepEqual({...current,sourceUrl:previous.sourceUrl},previous);
   assert.equal(current.sourceUrl,results.find(r=>r.id===id).source_url);
  }else assert.deepEqual(current,previous);
 }
});
test('extended metadata explicit and unknown fields not invented',()=>{
 for(const d of manifest.documents.filter(d=>additions.includes(d.id))){
  for(const k of ['form_no','revised_at','deadline','deadline_basis','license','source_type','checked_at','status'])assert.ok(k in d,`${d.id}:${k}`);
  assert.ok(['원본','공식제공처',null].includes(d.source_type));
  assert.ok(['확인 완료','확인 중'].includes(d.status));
  if(d.revised_at)assert.match(d.revised_at,/^\d{4}-\d{2}-\d{2}$/);
  if(d.deadline)assert.ok(d.deadline_basis,`${d.id}: deadline origin`);
 }
});
test('unverified records have no external link presented as verified',()=>{
 for(const d of manifest.documents.filter(d=>additions.includes(d.id))){
  if(d.status==='확인 중'){
   assert.equal(d.delivery,'pending');assert.equal(d.sourceUrl,'');assert.equal(d.editable,'');
  }else{assert.match(d.sourceUrl,/^https?:\/\//);assert.ok(d.editable);}
 }
});
test('every completed original has actual bytes with matching hash',()=>{
 for(const r of results.filter(r=>r.source_type==='원본' && r.status==='확인 완료')){
  assert.ok(r.files.length>0,r.id);
  for(const f of r.files){
   const file=f.path || path.join('.tmp/forms-additions-proof',f.artifact_path||'');
   assert.ok(existsSync(file),`${r.id}:${file}`);
   const bytes=readFileSync(file);assert.equal(bytes.length,f.bytes);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);
   assert.equal(f.http_status,200);assert.equal(f.title_verified,true);
  }
 }
});
test('task checkboxes and summary preserve incomplete status honestly',()=>{
 const check=[...tasks.matchAll(/^- \[([ x])\] (P[0-3]-\d\d) /gm)];
 assert.equal(check.length,61);assert.deepEqual(check.map(m=>m[2]),expected);
 for(const m of check)assert.equal(m[1]==='x',results.find(r=>r.id===m[2]).status==='확인 완료');
 const summary=read('docs/forms-additions-61/summary.json');
 assert.equal(summary.completed,check.filter(m=>m[1]==='x').length);
 assert.equal(summary.unchecked,check.filter(m=>m[1]===' ').length);
 console.log(`TASKS_DONE=${summary.completed}/61; TASKS_UNCHECKED=${summary.unchecked}`);
});
test('new fields and categories remain additive',()=>{
 const ui=readFileSync('app/forms/FormsLibrary.tsx','utf8');
 for(const label of ['재산조회','유언','후견','불복·정정'])assert.ok(ui.includes(label));
 for(const field of ['form_no','revised_at','deadline_basis','source_type','checked_at'])assert.ok(ui.includes(field));
});
