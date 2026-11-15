#!/usr/bin/env python3
"""Compatibility entrypoint: process the current catalogue, not a fixed 74 rows.

Generated assets and metadata go into the separate preview index. The historical
manifest, institution originals and legacy ZIP stay byte-identical.
"""
from pathlib import Path
import runpy

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('forms-build-preview-index.py')), run_name='__main__')
