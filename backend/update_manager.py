"""Find and stage a verified unified release without changing a running panel."""
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

VERSION_RE = re.compile(r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')
ZIP_RE = re.compile(r'^EditFlow-Pro-(\d+\.\d+\.\d+)-Unified\.zip$', re.I)
DEFAULT_CHANNEL = 'https://api.github.com/repos/DenGo003/EditFlow-Pro/releases/latest'
MAX_ZIP = 250_000_000
MAX_UNPACKED = 350_000_000
MAX_FILES = 700
_lock = threading.Lock()


def version(value):
    match = VERSION_RE.fullmatch(str(value))
    if not match:
        raise ValueError('Invalid release version')
    return tuple(map(int, match.groups()))


def secure_url(value):
    parsed = urllib.parse.urlsplit(str(value))
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError('Update source must be a plain HTTPS URL without credentials')
    if parsed.hostname.lower() in ('localhost', '127.0.0.1', '::1'):
        raise ValueError('Update source cannot point to localhost')
    return value


def channel(state):
    path = Path(state) / 'update-channel.json'
    if not path.exists():
        return DEFAULT_CHANNEL
    data = json.loads(path.read_text(encoding='utf-8'))
    # A blank URL saved by 0.9.5 means no custom feed was selected.
    return secure_url(data['url']) if data.get('url') else DEFAULT_CHANNEL


def set_channel(state, url):
    url = str(url).strip()
    if url:
        secure_url(url)
    dest = Path(state) / 'update-channel.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    if url and url != DEFAULT_CHANNEL:
        tmp = dest.with_suffix('.tmp')
        tmp.write_text(json.dumps({'url': url}), encoding='utf-8')
        os.replace(tmp, dest)
    else:
        dest.unlink(missing_ok=True)
    return {'url': channel(state), 'mode': 'custom HTTPS feed' if url and url != DEFAULT_CHANNEL else 'GitHub Releases'}


def fetch_json(url):
    request = urllib.request.Request(secure_url(url), headers={
        'Accept': 'application/vnd.github+json', 'User-Agent': 'EditFlow-Pro-Updater'})
    with urllib.request.urlopen(request, timeout=12) as response:
        secure_url(response.geturl())
        raw = response.read(65_537)
    if len(raw) > 65_536:
        raise ValueError('Update feed is too large')
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError('Update feed must be a JSON object')
    return data


def github_candidate(release, current_ver):
    tag = str(release.get('tag_name', ''))
    available = tag[1:] if tag.startswith('v') else tag
    if version(available) <= current_ver:
        return None
    if release.get('draft') or release.get('prerelease'):
        return None
    filename = f'EditFlow-Pro-{available}-Unified.zip'
    assets = [a for a in release.get('assets', []) if isinstance(a, dict) and a.get('name') == filename]
    if len(assets) != 1 or assets[0].get('state') != 'uploaded':
        raise ValueError('GitHub Release has no compatible Unified ZIP asset')
    asset = assets[0]
    digest = str(asset.get('digest', '')).lower()
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
        raise ValueError('GitHub Release ZIP has no SHA256 digest')
    url = secure_url(asset.get('browser_download_url', ''))
    path = urllib.parse.urlsplit(url)
    if path.hostname != 'github.com' or not path.path.startswith('/DenGo003/EditFlow-Pro/releases/download/') or not path.path.endswith('/' + filename):
        raise ValueError('GitHub Release ZIP URL is not from this repository')
    return {'version': available, 'source': 'GitHub Releases', 'url': url, 'sha256': digest[7:]}


def downloads_candidate(downloads, current_ver):
    folder = Path(downloads) if downloads else Path.home() / 'Downloads'
    if not folder.is_dir():
        return None
    candidates = []
    for item in folder.iterdir():
        match = ZIP_RE.fullmatch(item.name)
        if match and item.is_file() and version(match.group(1)) > current_ver:
            candidates.append((version(match.group(1)), item))
    if not candidates:
        return None
    chosen = max(candidates)[1]
    return {'version': ZIP_RE.fullmatch(chosen.name).group(1), 'source': 'Downloads', 'path': str(chosen)}


def newest(state, current, downloads=None):
    current_ver = version(current)
    local = downloads_candidate(downloads, current_ver)
    url = channel(state)
    try:
        feed = fetch_json(url)
    except urllib.error.HTTPError as exc:
        if url == DEFAULT_CHANNEL and exc.code == 404:
            return local
        if local:
            return local
        raise
    except (urllib.error.URLError, TimeoutError):
        if local:
            return local
        raise
    if url == DEFAULT_CHANNEL:
        remote = github_candidate(feed, current_ver)
    else:
        available = str(feed.get('version', ''))
        if version(available) <= current_ver:
            remote = None
        else:
            archive = secure_url(feed.get('url', ''))
            digest = str(feed.get('sha256', '')).lower()
            if not re.fullmatch(r'[0-9a-f]{64}', digest):
                raise ValueError('Update feed requires a SHA256 archive digest')
            if feed.get('targetPremiere') != '25.6.2':
                raise ValueError('Update does not target Premiere 25.6.2')
            remote = {'version': available, 'source': 'HTTPS feed', 'url': archive, 'sha256': digest}
    if remote and (not local or version(remote['version']) >= version(local['version'])):
        return remote
    return local


def copy_download(source, destination, expected_digest=None):
    digest = hashlib.sha256()
    count = 0
    if isinstance(source, Path):
        stream = source.open('rb')
    else:
        stream = urllib.request.urlopen(secure_url(source), timeout=45)
        secure_url(stream.geturl())
    try:
        with stream, destination.open('wb') as out:
            while True:
                block = stream.read(1024 * 1024)
                if not block:
                    break
                count += len(block)
                if count > MAX_ZIP:
                    raise ValueError('Update archive exceeds size limit')
                digest.update(block)
                out.write(block)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    if expected_digest and digest.hexdigest() != expected_digest:
        destination.unlink(missing_ok=True)
        raise ValueError('Downloaded archive SHA256 does not match the update feed')
    return digest.hexdigest()


def inspect_bundle(archive, expected_version, current):
    """Read and hash every archive member before extraction. No code is run."""
    if version(expected_version) <= version(current):
        raise ValueError('Update must be newer than the installed version')
    prefix = f'EditFlow-Pro-{expected_version}/'
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        if len(infos) > MAX_FILES or sum(i.file_size for i in infos) > MAX_UNPACKED:
            raise ValueError('Update archive is too large')
        names = [i.filename for i in infos]
        if len(set(n.lower() for n in names)) != len(names):
            raise ValueError('Duplicate archive path')
        for i in infos:
            name = i.filename
            relative = name[len(prefix):] if name.startswith(prefix) else ''
            bits = relative.split('/')
            kind = stat.S_IFMT(i.external_attr >> 16)
            if (not relative or i.is_dir() or not re.fullmatch(r'[A-Za-z0-9_./-]+', name)
                    or any(b in ('', '.', '..') for b in bits)
                    or kind not in (0, stat.S_IFREG) or i.file_size > MAX_ZIP):
                raise ValueError('Unsafe update archive member')
        try:
            manifest = json.loads(z.read(prefix + 'package-manifest.json'))
            release = json.loads(z.read(prefix + 'release.json'))
        except (KeyError, ValueError) as exc:
            raise ValueError('Update metadata is missing or invalid') from exc
        if manifest.get('version') != expected_version or release.get('version') != expected_version:
            raise ValueError('Release version mismatch')
        if release.get('targetPremiere') != '25.6.2':
            raise ValueError('Release targets a different Premiere version')
        hashes = manifest.get('files')
        if not isinstance(hashes, dict) or set(names) != {prefix + n for n in hashes} | {prefix + 'package-manifest.json'}:
            raise ValueError('Update manifest does not account for every file')
        required = {'release.json', 'backend/server.py', 'uxp/main.js', 'uxp/manifest.json', 'scripts/install_update.py'}
        if not required.issubset(hashes):
            raise ValueError('Update bundle is incomplete')
        for path, expected in hashes.items():
            if not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
                raise ValueError('Invalid file checksum in manifest')
            hasher = hashlib.sha256()
            with z.open(prefix + path) as member:
                while block := member.read(1024 * 1024):
                    hasher.update(block)
            if hasher.hexdigest() != expected:
                raise ValueError('Corrupt update package: ' + path)
    return prefix


def prepare(state, current, downloads=None):
    if not _lock.acquire(blocking=False):
        raise RuntimeError('An update is already being prepared')
    try:
        candidate = newest(state, current, downloads)
        if not candidate:
            return {'state': 'current', 'version': current}
        updates = Path(state) / 'updates'
        updates.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix='stage-', dir=updates))
        archive = staging / 'release.zip'
        try:
            source = candidate.get('url') or Path(candidate['path'])
            digest = copy_download(source, archive, candidate.get('sha256'))
            prefix = inspect_bundle(archive, candidate['version'], current)
            with zipfile.ZipFile(archive) as z:
                z.extractall(staging / 'contents')
            extracted = staging / 'contents' / prefix.rstrip('/')
            from scripts.install_update import validate
            validate(extracted)
            return {'state': 'staged', 'version': candidate['version'], 'source': candidate['source'],
                    'archiveSHA256': digest, 'folder': str(extracted), 'stage': str(staging)}
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise
    finally:
        _lock.release()


def status(root, **fields):
    path = Path(root) / 'update-status.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(fields, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temp, path)


def arm(state, staged):
    config = json.loads((Path(state) / 'cep-launcher.json').read_text(encoding='utf-8-sig'))
    python = Path(config['backendPython'])
    if not python.is_file():
        raise RuntimeError('Configured Python is missing; update cannot start')
    script = Path(__file__).resolve().parents[1] / 'scripts' / 'finish_update.py'
    args = [str(python), str(script), str(state), staged['folder'], staged['stage']]
    flags = (subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP) if os.name == 'nt' else 0
    subprocess.Popen(args, cwd=str(script.parents[1]), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                     stderr=subprocess.DEVNULL, close_fds=True, creationflags=flags)
    status(state, state='waiting_for_premiere', version=staged['version'], source=staged['source'],
           message='Save your project and close Premiere. Installation continues automatically.')
    return {'state': 'waiting_for_premiere', 'version': staged['version'], 'source': staged['source']}
