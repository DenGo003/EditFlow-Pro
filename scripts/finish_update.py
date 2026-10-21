"""Detached updater. Wait for Premiere and the old backend, then migrate safely."""
import csv
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.update_manager import status  # noqa: E402
from scripts.install_update import install, validate  # noqa: E402


def premiere_running():
    if os.name != 'nt':
        return False
    result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq Adobe Premiere Pro.exe', '/FO', 'CSV', '/NH'],
                            capture_output=True, text=True, errors='replace', timeout=8)
    if result.returncode:
        raise RuntimeError('Cannot check whether Premiere is still running')
    return any(row and row[0].lower() == 'adobe premiere pro.exe'
               for row in csv.reader(result.stdout.splitlines()))


def backend_running():
    with socket.socket() as sock:
        sock.settimeout(.4)
        return sock.connect_ex(('127.0.0.1', 8765)) == 0


def run(state, source, stage, timeout_seconds=8*3600, sleeper=time.sleep):
    state, source, stage = map(lambda p: Path(p).resolve(), (state, source, stage))
    base = (state / 'updates').resolve()
    if not stage.is_relative_to(base) or not source.is_relative_to(stage) or not source.is_dir():
        raise ValueError('Update stage is invalid')
    validate(source)
    deadline = time.monotonic() + timeout_seconds
    while premiere_running() or backend_running():
        if time.monotonic() >= deadline:
            status(state, state='expired', message='Premiere did not close; update was not installed.')
            return False
        sleeper(1)
    status(state, state='installing', message='Applying update and preserving previous panel/config.')
    install(state, source)
    version = (source / 'release.json').read_text(encoding='utf-8')
    import json
    status(state, state='installed', version=json.loads(version)['version'],
           message='Update installed. Open Premiere and load the stable EditFlow panel.')
    shutil.rmtree(stage, ignore_errors=True)
    return True


def main():
    if os.name != 'nt':
        raise RuntimeError('Detached updater is for Windows; run() can be tested in isolation.')
    if len(sys.argv) != 4:
        raise ValueError('Invalid update invocation')
    state = Path(sys.argv[1])
    try:
        run(*sys.argv[1:])
    except Exception as exc:
        status(state, state='failed', message=str(exc)[:400])
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.exit(1)
