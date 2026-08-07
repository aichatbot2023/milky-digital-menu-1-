"""Zajednički deo prevodilačkih alata — da isti kod ne stoji na dva mesta."""

import importlib.util
import os

_spec = importlib.util.spec_from_file_location(
    "_st", os.path.join(os.path.dirname(os.path.abspath(__file__)), "safenest-translate.py"))
_m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m)

LANGS = _m.LANGS
ask = _m.ask
parse = _m.parse
source = _m.source
check = _m.check
