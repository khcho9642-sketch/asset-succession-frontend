#!/usr/bin/env python3
"""Fixture-only tests: no institution sources or production files are fabricated."""
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image

SCRIPT = Path(__file__).with_name('forms-build-preview-index.py')
spec = importlib.util.spec_from_file_location('preview_builder', SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def pdf_bytes(pages=2):
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'']
    kids = []
    for index in range(pages):
        page_id = len(objects) + 1
        kids.append(f'{page_id} 0 R'.encode())
        contents_id, font_id = page_id + 1, page_id + 2
        objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {contents_id} 0 R >>'.encode())
        stream = f'BT /F1 20 Tf 45 760 Td (Preview test fixture - page {index + 1}) Tj ET'.encode()
        objects.append(b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream')
        objects.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    objects[1] = b'<< /Type /Pages /Kids [' + b' '.join(kids) + b'] /Count ' + str(pages).encode() + b' >>'
    result = b'%PDF-1.4\n'
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result += f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n'
    xref = len(result)
    result += f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode()
    result += b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets[1:])
    result += f'trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return result


class PreviewGeneratorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.public = self.root / 'public'
        self.folder = self.public / 'downloads/official-forms'
        self.folder.mkdir(parents=True)
        self.manifest = self.folder / 'manifest.json'
    def tearDown(self):
        self.temp.cleanup()
    def hosted(self, suffix='pdf', id='A', content=None):
        path = self.folder / f'{id}.{suffix}'
        if content is not None:
            path.write_bytes(content)
        elif suffix == 'pdf':
            path.write_bytes(pdf_bytes())
        else:
            Image.new('RGBA', (180, 280), (0, 0, 0, 0)).save(path)
        return {'id': id, 'title': f'{id} fixture', 'files': [{'name': id, 'path': f'/downloads/official-forms/{id}.{suffix}', 'format': suffix.upper(), 'role': 'original', 'delivery': 'hosted'}]}
    def write(self, docs):
        self.manifest.write_text(json.dumps({'documents': docs, 'immutableEvidence': 'KEEP'}, ensure_ascii=False))
    def index(self):
        return json.loads((self.folder / 'preview-index.json').read_text())
    @unittest.skipUnless(shutil.which('pdftoppm') and shutil.which('pdfinfo'), 'Poppler is required')
    def test_actual_pdf_raster_and_original_manifest_preserved(self):
        item = self.hosted()
        self.write([item])
        original, manifest = (self.folder/'A.pdf').read_bytes(), self.manifest.read_bytes()
        report = builder.build(self.root)
        self.assertEqual(report['ready'], 1)
        meta = self.index()['documents']['A']['preview']
        self.assertEqual(meta['pageCount'], 2)
        self.assertEqual(meta['sourceSha256'], hashlib.sha256(original).hexdigest())
        self.assertEqual((self.folder/'A.pdf').read_bytes(), original)
        self.assertEqual(self.manifest.read_bytes(), manifest)
        self.assertEqual(builder.build(self.root, check=True)['pending'], 0)
    def test_provider_is_guidance_not_fake_download(self):
        self.write([{'id':'A','title':'Provider service','sourceUrl':'https://example.org','files':[]}])
        result=builder.build(self.root)
        self.assertEqual((result['provider'],result['ready'],result['pending']),(1,0,0))
        self.assertEqual(self.index()['documents'],{})
    def test_missing_provider_url_is_pending(self):
        self.write([{'id':'A','files':[]}])
        self.assertEqual(builder.build(self.root)['pending'],1)
    def test_invalid_pdf_is_pending(self):
        self.write([self.hosted(content=b'<html>not a PDF</html>')])
        report=builder.build(self.root)
        self.assertEqual(report['pending'],1)
        self.assertIn('not a PDF', report['items'][0]['reason'])
    def test_hwp_without_converter_stays_pending(self):
        self.write([self.hosted('hwp',content=b'not loaded without renderer')])
        with patch.object(builder.shutil,'which',return_value=None):
            report=builder.build(self.root)
        self.assertEqual(report['pending'],1)
        self.assertIn('LibreOffice',report['items'][0]['reason'])
    def test_small_real_image_is_not_upscaled(self):
        self.write([self.hosted('png')])
        self.assertEqual(builder.build(self.root)['ready'],1)
        meta=self.index()['documents']['A']['preview']
        self.assertEqual((meta['width'],meta['height']),(180,280))
        self.assertTrue(meta['lowResolution'])
        with Image.open(self.folder/'previews-completed/A/first-page.png') as image:
            self.assertEqual(image.getpixel((0,0)),(255,255,255))
    def test_more_than_74_documents_are_all_processed(self):
        self.write([self.hosted('png',f'A{i}') for i in range(75)])
        report=builder.build(self.root)
        self.assertEqual((report['catalogueCount'],report['ready'],report['pending']),(75,75,0))
        self.assertEqual(len(self.index()['documents']),75)
    def test_archives_are_separate_and_not_generated(self):
        item=self.hosted('png');item['resource']={'presentation':{'visibility':'archived'}}
        self.write([item]); report=builder.build(self.root)
        self.assertEqual((report['archived'],report['ready'],report['pending']),(1,0,0))
    def test_duplicate_resource_ids_refuse_processing(self):
        item=self.hosted('png');self.write([item,item])
        with self.assertRaisesRegex(ValueError,'duplicate'):
            builder.build(self.root)
    def test_unsafe_resource_id_refuses_processing(self):
        self.write([{'id':'../../escape','files':[]}])
        with self.assertRaisesRegex(ValueError,'unsafe'):
            builder.build(self.root)
    def test_unsafe_input_path_is_reported_not_read(self):
        item=self.hosted('png');item['files'][0]['path']='/downloads/official-forms/%2e%2e/secret.png'
        self.write([item]); self.assertEqual(builder.build(self.root)['pending'],1)
    def test_check_does_not_create_unverified_previews(self):
        self.write([self.hosted('png')]);report=builder.build(self.root,check=True)
        self.assertEqual(report['pending'],1)
        self.assertFalse((self.folder/'preview-index.json').exists())
    def test_corrupt_generated_thumbnail_invalidates_readiness(self):
        self.write([self.hosted('png')]);builder.build(self.root)
        (self.folder/'previews-completed/A/thumbnail.jpg').write_bytes(b'broken')
        self.assertEqual(builder.build(self.root,check=True)['pending'],1)
    def test_changed_original_invalidates_old_generated_preview(self):
        self.write([self.hosted('png')]);builder.build(self.root)
        Image.new('RGB',(180,280),'black').save(self.folder/'A.png')
        self.assertEqual(builder.build(self.root,check=True)['pending'],1)
    def test_cli_returns_failure_when_preview_is_missing(self):
        self.write([self.hosted('png')])
        result=subprocess.run([sys.executable,str(SCRIPT),'--root',str(self.root),'--check'],capture_output=True,text=True)
        self.assertEqual(result.returncode,1)
        self.assertEqual(json.loads(result.stdout)['pending'],1)

if __name__ == '__main__':
    unittest.main(verbosity=2)
