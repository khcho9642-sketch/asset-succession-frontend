"""Deterministic archive of source originals and explicitly identified derived files."""
import hashlib
import json
from pathlib import Path, PurePosixPath
from urllib.parse import unquote
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
LIB = PUBLIC / 'downloads/official-forms'
manifest = json.loads((LIB / 'manifest.json').read_text(encoding='utf-8'))
documents = [doc for doc in manifest['documents'] if doc['delivery'] == 'hosted']
files = [(doc, file) for doc in documents for file in doc['files']]
assert len(documents) == manifest['bundle']['recordCount']
assert len(files) == manifest['bundle']['fileCount']
entries = {}
for doc, file in files:
    assert file['delivery'] == 'hosted' and file['licenseBasis'] in {
        'kogl-type-1', 'agency-policy', 'statutory-form', 'public-work-article-24-2'}
    if file['licenseBasis'] == 'public-work-article-24-2':
        assert doc['rightsReview']['status'] == 'public-work-assessment'
        assert not doc['rightsReview']['koglMarkVerified']
    if file.get('artifactType') == 'derived-image-compilation':
        assert file['role'] == 'image-compilation' and len(file['derivedFrom']) == 5
        assert not file['inspection']['institutionProvidedPdf']
    relative = PurePosixPath(unquote(file['path']).removeprefix('/downloads/official-forms/'))
    assert not relative.is_absolute() and '..' not in relative.parts
    path = (LIB / relative).resolve()
    assert path.is_relative_to(LIB.resolve())
    data = path.read_bytes()
    assert len(data) == file['bytes']
    assert hashlib.sha256(data).hexdigest() == file['sha256']
    assert relative.as_posix() not in entries
    entries[relative.as_posix()] = data
entries['README.md'] = (LIB / 'README.md').read_text(encoding='utf-8').encode('utf-8')
entries['manifest.json'] = (LIB / 'manifest.json').read_text(encoding='utf-8').encode('utf-8')
with ZipFile(LIB / 'official-forms.zip', 'w', compression=ZIP_DEFLATED) as archive:
    for name, data in sorted(entries.items()):
        info = ZipInfo(name, (2026, 9, 17, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
print(json.dumps({'records':len(documents),'binaryFiles':len(files),'archiveEntries':len(entries),
    'sha256':hashlib.sha256((LIB / 'official-forms.zip').read_bytes()).hexdigest()}))
