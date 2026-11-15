#!/usr/bin/env python3
"""Build real first-page previews for the entire current catalogue.

Preserves manifest.json, all original downloads and the legacy 74-member bundle.
Writes only previews-completed/, preview-index.json and a coverage report.
Requires Pillow, Poppler (pdftoppm/pdfinfo); LibreOffice is optional for office files.
Missing/failed conversions remain pending and make this command exit nonzero.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlparse
from PIL import Image, ImageOps
import olefile
from pypdf import PdfReader, PdfWriter

PREFIX = '/downloads/official-forms/'
IMAGE_TYPES = {'.png', '.jpg', '.jpeg', '.webp'}
OFFICE_TYPES = {'.hwp', '.hwpx', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods'}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local(public: Path, value: str) -> Path:
    if not isinstance(value, str) or not value.startswith(PREFIX):
        raise ValueError('not a local catalogue artifact')
    decoded = unquote(value)
    if any(c in decoded for c in ('\\', '?', '#', '\0')) or any(p in {'.', '..'} for p in decoded.split('/')):
        raise ValueError('unsafe catalogue artifact path')
    path = (public / decoded.lstrip('/')).resolve()
    if not path.is_relative_to(public.resolve()):
        raise ValueError('artifact escapes public directory')
    return path


def url(path: Path, public: Path) -> str:
    return '/' + path.relative_to(public).as_posix()


def provider(value: str) -> bool:
    parsed = urlparse(value or '')
    return parsed.scheme in {'http', 'https'} and bool(parsed.netloc) and not parsed.username


def image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        image.load()
        return image.size


def run(command: list[str], timeout: int = 90) -> str:
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)
    if result.returncode:
        raise ValueError(f'{Path(command[0]).name} failed (exit {result.returncode})')
    return result.stdout


def render_pdf(source: Path, target: Path) -> tuple[Path, int]:
    if source.read_bytes()[:5] != b'%PDF-':
        raise ValueError('source is not a PDF')
    info = run(['pdfinfo', str(source)])
    match = re.search(r'^Pages:\s+(\d+)', info, re.MULTILINE)
    if not match or int(match[1]) < 1:
        raise ValueError('PDF has no readable pages')
    base = target / 'page'
    run(['pdftoppm', '-f', '1', '-singlefile', '-scale-to', '1100', '-png', str(source), str(base)])
    return base.with_suffix('.png'), int(match[1])


def valid_record(item: dict, record: dict, public: Path, generated: bool) -> bool:
    """Validate traceability, real image dimensions and, for new assets, hashes."""
    try:
        meta = record['preview']
        if item.get('documentSection') and meta.get('sourcePages') != item['documentSection']['pages']:
            return False
        if meta.get('editorialRedraw') is True:
            return False
        source_file = next(f for f in item.get('files', []) if f.get('delivery') == 'hosted' and f.get('path') == meta.get('sourcePath'))
        source = local(public, source_file['path'])
        if not source.is_file():
            return False
        full = local(public, record['example'])
        thumb = local(public, record['thumbnail'])
        width, height = image_size(full)
        tw, th = image_size(thumb)
        if (width, height) != (meta['width'], meta['height']) or not tw or not th:
            return False
        if generated:
            for path, key in [(source, 'sourceSha256'), (full, 'imageSha256'), (thumb, 'thumbnailSha256')]:
                if digest(path) != meta.get(key):
                    return False
        if meta.get('pdfPath'):
            pdf = local(public, meta['pdfPath'])
            if pdf.read_bytes()[:5] != b'%PDF-':
                return False
            if generated and digest(pdf) != meta.get('pdfSha256'):
                return False
        return True
    except (KeyError, StopIteration, OSError, ValueError, TypeError):
        return False


def expand_documents(documents: list[dict], parts: dict) -> list[dict]:
    result = []
    if parts.get('schemaVersion') != 1:
        raise ValueError('invalid document parts schema')
    known = {item['id'] for item in documents}
    if set(parts['documents']) - known:
        raise ValueError('unknown document parts source')
    for item in documents:
        definitions = parts['documents'].get(item['id'])
        if not definitions:
            result.append(item)
            continue
        indexes = [index for part in definitions for index in part['fileIndexes']]
        if sorted(indexes) != list(range(len(item['files']))) or item['id'] not in [part['id'] for part in definitions]:
            raise ValueError('document parts must preserve bookmarks and cover every file once')
        for part in definitions:
            child = {**item, 'id': part['id'], 'title': part['title'], 'sourceRecordId': item['id'],
                     'files': [item['files'][i] for i in part['fileIndexes']]}
            if (item.get('preview') or {}).get('sourcePath') not in [f['path'] for f in child['files']]:
                child.pop('preview', None)
                child['thumbnail'] = child['example'] = None
            result.append(child)
    return result


def expand_sections(documents: list[dict], config: dict) -> list[dict]:
    originals = {item['id']: item for item in documents}
    result = dict(originals)
    for bundle in config['bundles']:
        parent = originals[bundle['parentId']]
        source = originals[bundle['pdfRecordId']]['files'][bundle['fileIndex']]
        for part in bundle['sections']:
            original = originals.get(part['id'], parent)
            child = {**original, 'id': part['id'], 'title': part['title'], 'preview': None,
                     'example': None, 'thumbnail': None,
                     'files': [f for f in original['files'] if f['path'] != source['path']] + [source],
                     'documentSection': {'sourcePath': source['path'], 'pages': part['pages'], 'match': part['match']}}
            result[part['id']] = child
    return list(result.values())


def restore_legacy(item: dict, public: Path) -> dict | None:
    """The historical thumbnail IS the measured HWP PrvImage, not a placeholder."""
    meta = item.get('preview') or {}
    if meta.get('method') not in {'hwp-embedded-image', 'pdf-first-page', 'institution-image'}:
        return None
    try:
        source = next(f for f in item['files'] if f['path'] == meta.get('sourcePath') and f['delivery'] == 'hosted')
        source_path, image = local(public, source['path']), local(public, item['thumbnail'])
        if digest(source_path) != meta['sourceSha256'] or digest(image) != meta['sha256']:
            return None
        if image_size(image) != (meta['width'], meta['height']):
            return None
        if meta['method'] == 'hwp-embedded-image':
            with olefile.OleFileIO(source_path) as ole:
                raw = ole.openstream('PrvImage').read()
            if hashlib.sha256(raw).hexdigest() != meta['sourceStreamSha256']:
                return None
            with Image.open(io.BytesIO(raw)) as embedded, Image.open(image) as stored:
                if embedded.convert('RGB').tobytes() != stored.convert('RGB').tobytes():
                    return None
        restored = {**meta, 'editorialRedraw': False, 'imageSha256': digest(image),
                    'thumbnailSha256': digest(image), 'legacyRestored': True}
        if meta.get('sourcePages'):
            restored['pageCount'] = meta['sourcePages']
        if source_path.suffix.lower() == '.pdf':
            restored.update(pdfPath=source['path'], pdfSha256=digest(source_path))
        return {'example': item['thumbnail'], 'thumbnail': item['thumbnail'], 'preview': restored}
    except (KeyError, StopIteration, OSError, ValueError):
        return None


def create_record(item: dict, source_file: dict, public: Path) -> dict:
    source = local(public, source_file['path'])
    if not source.is_file():
        raise ValueError('source file is missing')
    suffix = source.suffix.lower()
    source_hash = digest(source)
    output = public / 'downloads/official-forms/previews-completed' / item['id']
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='forms-preview-') as folder:
        temp = Path(folder)
        pdf = None
        if suffix in IMAGE_TYPES:
            image_source, page_count, method = source, 1, 'institution-image'
        elif suffix == '.pdf':
            section = item.get('documentSection')
            if section:
                reader = PdfReader(source)
                first, last = section['pages']
                if not 1 <= first <= last <= len(reader.pages):
                    raise ValueError('PDF section range is out of bounds')
                text = re.sub(r'\s+', '', reader.pages[first - 1].extract_text() or '')
                if re.sub(r'\s+', '', section['match']) not in text:
                    raise ValueError('PDF section title does not match the selected page')
                writer = PdfWriter()
                for page in reader.pages[first - 1:last]:
                    writer.add_page(page)
                pdf = output / 'document.pdf'
                writer.write(pdf)
                image_source, page_count = render_pdf(pdf, temp)
                method = 'original-pdf-section'
            else:
                image_source, page_count = render_pdf(source, temp)
                pdf, method = source, 'original-pdf'
        elif suffix == '.hwp' and olefile.isOleFile(source):
            with olefile.OleFileIO(source) as ole:
                if not ole.exists('PrvImage'):
                    raise ValueError('HWP has no embedded PrvImage; a faithful converter is required')
                embedded = ole.openstream('PrvImage').read()
            image_source = temp / 'embedded.png'
            with Image.open(io.BytesIO(embedded)) as image:
                image.load()
                image.save(image_source)
            page_count, method = None, 'hwp-embedded-image'
        elif suffix in OFFICE_TYPES:
            office = shutil.which('libreoffice') or shutil.which('soffice')
            if not office:
                raise ValueError('LibreOffice is not installed for this file format')
            run([office, f'-env:UserInstallation={(temp / "profile").as_uri()}', '--headless', '--convert-to', 'pdf', '--outdir', str(temp), str(source)])
            converted = temp / f'{source.stem}.pdf'
            if not converted.is_file():
                raise ValueError('office conversion did not produce a PDF')
            image_source, page_count = render_pdf(converted, temp)
            pdf = output / 'source.pdf'
            shutil.copyfile(converted, pdf)
            method = 'office-conversion'
        else:
            raise ValueError(f'no renderer for {suffix or "unknown file type"}')
        with Image.open(image_source) as original:
            image = ImageOps.exif_transpose(original).convert('RGBA')
            white = Image.new('RGBA', image.size, 'white')
            white.alpha_composite(image)
            image = white.convert('RGB')
            image.thumbnail((1100, 1100), Image.Resampling.LANCZOS)
            image.save(output / 'first-page.png', optimize=True)
            thumbnail = image.copy()
            thumbnail.thumbnail((400, 400), Image.Resampling.LANCZOS)
            thumbnail.save(output / 'thumbnail.jpg', quality=88, optimize=True)
            width, height = image.size
            tw, th = thumbnail.size
    # A conversion process must not modify the official source in place.
    if digest(source) != source_hash:
        raise ValueError('source bytes changed during conversion')
    meta = {
        'method': method, 'sourceRole': source_file.get('role', 'original'),
        'sourcePath': source_file['path'], 'sourceSha256': source_hash,
        'width': width, 'height': height, 'thumbnailWidth': tw, 'thumbnailHeight': th,
        'pageCount': page_count, 'lowResolution': max(width, height) < 1000,
        'editorialRedraw': False,
        'imageSha256': digest(output / 'first-page.png'),
        'thumbnailSha256': digest(output / 'thumbnail.jpg'),
    }
    if pdf:
        meta['pdfPath'] = url(pdf, public)
        meta['pdfSha256'] = digest(pdf)
        meta['pdfBytes'] = pdf.stat().st_size
    if item.get('documentSection'):
        meta['sourcePages'] = item['documentSection']['pages']
    if method == 'hwp-embedded-image':
        meta['sourceStream'] = 'PrvImage'
        meta['sourceStreamSha256'] = hashlib.sha256(embedded).hexdigest()
    return {'example': url(output / 'first-page.png', public), 'thumbnail': url(output / 'thumbnail.jpg', public), 'preview': meta}


def build(root: Path, check: bool = False, report_path: Path | None = None) -> dict:
    public = (root / 'public').resolve()
    manifest_path = public / 'downloads/official-forms/manifest.json'
    original_manifest = manifest_path.read_bytes()
    manifest = json.loads(original_manifest.decode('utf-8-sig'))
    parts_path = public / 'downloads/official-forms/document-parts.json'
    parts = json.loads(parts_path.read_text(encoding='utf-8')) if parts_path.exists() else {'schemaVersion': 1, 'documents': {}}
    sections_path = public / 'downloads/official-forms/document-sections.json'
    documents = manifest['documents']
    if sections_path.exists():
        documents = expand_sections(documents, json.loads(sections_path.read_text(encoding='utf-8')))
    documents = expand_documents(documents, parts)
    ids = [item['id'] for item in documents]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', i) for i in ids):
        raise ValueError('duplicate or unsafe resource identifiers')
    index_path = public / 'downloads/official-forms/preview-index.json'
    index = json.loads(index_path.read_text(encoding='utf-8')) if index_path.exists() else {'schemaVersion': 1, 'documents': {}}
    if index.get('schemaVersion') != 1 or not isinstance(index.get('documents'), dict):
        raise ValueError('invalid preview index schema')
    output = {'schemaVersion': 1, 'documents': {}}
    legacy_hwp = [item for item in manifest['documents'] if (item.get('preview') or {}).get('method') == 'hwp-embedded-image']
    report = {'sourceRecordCount': len(manifest['documents']), 'catalogueCount': len(documents), 'ready': 0, 'provider': 0, 'pending': 0, 'archived': 0,
              'legacyHwpVerified': sum(restore_legacy(item, public) is not None for item in legacy_hwp),
              'legacyHwpRestored': 0, 'items': []}
    for item in documents:
        row = {'id': item['id'], 'title': item.get('title', '')}
        archived = item.get('resource', {}).get('presentation', {}).get('visibility') == 'archived'
        files = [f for f in item.get('files', []) if f.get('delivery') == 'hosted'
                 and (not item.get('documentSection') or f['path'] == item['documentSection']['sourcePath'])]
        external = [item.get('sourceUrl', '')] + [f.get('path', '') for f in item.get('files', []) if f.get('delivery') != 'pending']
        previous = index['documents'].get(item['id'])
        if previous and valid_record(item, previous, public, True):
            output['documents'][item['id']] = previous
            row['status'] = 'ready'
        elif (restored := restore_legacy(item, public)) and valid_record(item, restored, public, True):
            output['documents'][item['id']] = restored
            row['status'] = 'ready'
        elif not files and any(provider(value) for value in external):
            row['status'] = 'provider'
        else:
            row['status'] = 'pending'
            failures = []
            if not check:
                roles = {'original': 0, 'combined': 1, 'example': 2}
                def rank(f):
                    extension = Path(unquote(f.get('path', ''))).suffix.lower()
                    return (0 if extension == '.pdf' or extension in IMAGE_TYPES else 1, roles.get(f.get('role'), 3), f.get('path', ''))
                for file in sorted(files, key=rank):
                    try:
                        generated = create_record(item, file, public)
                        if not valid_record(item, generated, public, True):
                            raise ValueError('generated preview verification failed')
                        output['documents'][item['id']] = generated
                        row['status'] = 'ready'
                        break
                    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
                        failures.append(f"{file.get('name') or file.get('format', 'file')}: {error}")
            if row['status'] == 'pending':
                row['reason'] = '; '.join(failures) or 'No verified full-size image and thumbnail; original conversion is required.'
        entry = output['documents'].get(item['id'])
        if entry:
            row.update(method=entry['preview']['method'], width=entry['preview']['width'], height=entry['preview']['height'])
            if entry['preview'].get('legacyRestored') and entry['preview']['method'] == 'hwp-embedded-image':
                report['legacyHwpRestored'] += 1
        if archived:
            row['previewStatus'] = row['status']
            row['status'] = 'archived'
        report[row['status']] += 1
        report['items'].append(row)
    if manifest_path.read_bytes() != original_manifest:
        raise ValueError('manifest must not be modified by preview generation')
    if not check:
        temp_index = index_path.with_suffix('.json.tmp')
        temp_index.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temp_index.replace(index_path)
    report_path = report_path or root / 'docs/forms-preview-completion/coverage.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--check', action='store_true', help='Check real preview coverage without generating files')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = build(args.root.resolve(), args.check, args.report)
    print(json.dumps({k: v for k, v in report.items() if k != 'items'}, ensure_ascii=False))
    return 1 if report['pending'] else 0

if __name__ == '__main__':
    raise SystemExit(main())
