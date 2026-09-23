"""Verify real assets and original page pixels, separately from fixture tests."""
import importlib.util
import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageChops
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('forms-build-preview-index.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
read = lambda name: json.loads((PUBLIC / 'downloads/official-forms' / name).read_text(encoding='utf-8-sig'))
manifest, parts, sections, index = (read(name) for name in ['manifest.json', 'document-parts.json', 'document-sections.json', 'preview-index.json'])
documents = builder.expand_documents(builder.expand_sections(manifest['documents'], sections), parts)

class ActualAssets(unittest.TestCase):
    def test_40_legacy_hwp_images_are_byte_and_pixel_traceable(self):
        items = [d for d in manifest['documents'] if (d.get('preview') or {}).get('method') == 'hwp-embedded-image']
        self.assertEqual(len(items), 40)
        for item in items:
            self.assertIsNotNone(builder.restore_legacy(item, PUBLIC), item['id'])

    def test_every_hosted_document_has_images_and_matching_source_hashes(self):
        for item in documents:
            entry = index['documents'].get(item['id'])
            if any(f['delivery'] == 'hosted' for f in item['files']):
                self.assertIsNotNone(entry, item['id'])
                self.assertTrue(builder.valid_record(item, entry, PUBLIC, True), item['id'])
                with Image.open(builder.local(PUBLIC, entry['example'])) as image:
                    self.assertIsNotNone(ImageChops.difference(image.convert('RGB'), Image.new('RGB', image.size, 'white')).getbbox(), item['id'])

    def test_all_33_section_pages_retain_original_text_and_pixels(self):
        count = 0
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for item in documents:
                section = item.get('documentSection')
                if not section:
                    continue
                source = builder.local(PUBLIC, section['sourcePath'])
                output = builder.local(PUBLIC, index['documents'][item['id']]['preview']['pdfPath'])
                original, extracted = PdfReader(source), PdfReader(output)
                first, last = section['pages']
                self.assertEqual(len(extracted.pages), last - first + 1)
                self.assertIn(section['match'], re.sub(r'\s+', '', original.pages[first - 1].extract_text()))
                for offset, page in enumerate(extracted.pages):
                    self.assertEqual(page.extract_text(), original.pages[first - 1 + offset].extract_text())
                    for file, number, name in [(source, first + offset, 'source'), (output, offset + 1, 'extracted')]:
                        builder.run(['pdftoppm', '-f', str(number), '-singlefile', '-scale-to', '700', '-png', str(file), str(folder / name)])
                    with Image.open(folder / 'source.png') as a, Image.open(folder / 'extracted.png') as b:
                        self.assertEqual(a.size, b.size)
                        self.assertIsNone(ImageChops.difference(a.convert('RGB'), b.convert('RGB')).getbbox(), (item['id'], offset + 1))
                    count += 1
        self.assertEqual(count, 33)

    def test_all_original_downloads_and_manifest_unchanged_from_pr9(self):
        baseline = 'ca00dc6c03f114d7b106a2fd5ab501612876a8a3'
        entries = subprocess.check_output(['git', 'ls-tree', '-r', '-z', baseline, 'public/downloads/official-forms']).decode().split('\0')
        for entry in filter(None, entries):
            metadata, path = entry.split('\t')
            blob = metadata.split()[2]
            self.assertEqual((ROOT / path).read_bytes(), subprocess.check_output(['git', 'cat-file', 'blob', blob]), path)

if __name__ == '__main__':
    unittest.main(verbosity=2)
