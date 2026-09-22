import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require(process.env.FORMS_TYPESCRIPT_PATH || 'typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'lib/forms/preview.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forms-preview-tests-'));
const output = path.join(temp, 'preview.cjs');
fs.writeFileSync(output, compiled.outputText);
const { resolvePreview, localArtifact, providerUrl, previewCoverage } = require(output);
const file = (format='PDF', role='original', id='A') => ({ path: `/downloads/official-forms/originals/${id}.${format.toLowerCase()}`, format, role, delivery:'hosted', name:id });
const item = patch => ({ id:'A', title:'실제 원본', files:[file()], ...patch });
let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
try {
 test('PDF with no legacy thumbnail still has a PDF preview', () => assert.equal(resolvePreview(item()).kind, 'pdf'));
 test('Raw institution image requires no invented metadata', () => {
   const r=resolvePreview(item({files:[file('PNG')]})); assert.equal(r.kind,'image'); assert.equal(r.width,undefined);
 });
 test('Hosted HWP without a preview stays pending', () => assert.equal(resolvePreview(item({files:[file('HWP')],sourceUrl:'https://example.org/forms'})).kind,'pending'));
 test('Provider-only service has usage guidance, not a missing-file status', () => assert.equal(resolvePreview(item({files:[],sourceUrl:'https://example.org/'})).kind,'provider'));
 test('No source and no files is not falsely marked as a service', () => assert.equal(resolvePreview(item({files:[]})).kind,'pending'));
 test('Pending files do not count as available previews', () => assert.equal(resolvePreview(item({files:[{...file(),delivery:'pending'}]})).kind,'pending'));
 test('Measured full image uses the full-size example, not its thumbnail', () => {
   const r=resolvePreview(item({example:'/downloads/official-forms/examples/A.png',thumbnail:'/downloads/official-forms/thumbnails/A.jpg',preview:{sourcePath:file().path,sourceRole:'original',method:'original-pdf',width:778,height:1100,editorialRedraw:false}}));
   assert.equal(r.imagePath,'/downloads/official-forms/examples/A.png'); assert.equal(r.pdfPath,file().path);
 });
 test('An editorial drawing is never promoted into an official document', () => {
   const r=resolvePreview(item({example:'/downloads/official-forms/examples/A.png',preview:{sourcePath:file().path,width:778,height:1100,editorialRedraw:true}}));
   assert.equal(r.kind,'pdf'); assert.equal(r.imagePath,undefined);
 });
 test('Untraced legacy images are not trusted as official originals', () => assert.equal(resolvePreview(item({files:[file('HWP')],example:'/downloads/official-forms/examples/A.png',preview:{width:778,height:1100}})).kind,'pending'));
 test('A thumbnail is not enlarged and mislabeled as a full-resolution image', () => {
   const r=resolvePreview(item({thumbnail:'/downloads/official-forms/thumbnails/A.jpg',preview:{sourcePath:file().path,width:778,height:1100}})).kind; assert.equal(r,'pdf');
 });
 test('An image and an unrelated PDF are not paired as the same source', () => {
   const raw=file('PNG','example','B'); const r=resolvePreview(item({files:[raw,file()]})); assert.equal(r.kind,'image'); assert.equal(r.pdfPath,undefined);
 });
 test('Converted office PDF is only used with traceable source metadata', () => {
   const f=file('HWP'); const r=resolvePreview(item({files:[f],example:'/downloads/official-forms/previews/A/first-page.png',preview:{sourcePath:f.path,pdfPath:'/downloads/official-forms/previews/A/source.pdf',width:778,height:1100}}));
   assert.equal(r.pdfPath,'/downloads/official-forms/previews/A/source.pdf'); assert.equal(r.originalPath,f.path);
 });
 test('Invalid dimensions never qualify a generated image', () => {
   for (const width of [0,-1,NaN,Infinity]) assert.equal(resolvePreview(item({example:'/downloads/official-forms/examples/A.png',preview:{sourcePath:file().path,width,height:100}})).kind,'pdf');
 });
 test('External PDFs remain provider links and are not embedded cross-origin', () => assert.equal(resolvePreview(item({files:[{...file(),path:'https://example.org/form.pdf',delivery:'provider'}]})).kind,'provider'));
 test('Unsafe local paths are rejected', () => {
   for (const value of ['/downloads/official-forms/../x.pdf','/downloads/official-forms/%2e%2e/x.pdf','/downloads/official-forms/%5cx.pdf','//evil.test/x.pdf','javascript:alert(1)','/downloads/official-forms/x.pdf?q=1','/downloads/official-forms/%00x.pdf']) assert.equal(localArtifact(value),undefined,value);
 });
 test('Untrusted provider protocols and credentials are rejected', () => {
   for (const value of ['javascript:alert(1)','data:text/html,x','https://a:b@example.org','not a url']) assert.equal(providerUrl(value),undefined);
 });
 test('Unsafe hosted files stay pending rather than disappearing into services', () => assert.equal(resolvePreview(item({files:[{...file(),path:'/etc/passwd'}],sourceUrl:'https://example.org'})).kind,'pending'));
 test('Coverage excludes archives and counts unique matching resources only', () => {
   const a=item(), b=item({id:'B',files:[],sourceUrl:'https://example.org'}), c=item({id:'C',files:[file('HWP')]}), d=item({id:'D',resource:{presentation:{visibility:'archived'}}});
   assert.deepEqual(previewCoverage([a,a,b,c,d]),{total:3,ready:1,provider:1,pending:1});
 });
 test('Coverage works beyond the old fixed 74-item catalogue', () => assert.equal(previewCoverage(Array.from({length:177},(_,i)=>item({id:String(i)}))).ready,177));
 console.log(`${passed} preview policy tests passed.`);
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
