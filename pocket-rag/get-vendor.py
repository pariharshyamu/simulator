#!/usr/bin/env python3
"""Pull the four libraries into vendor/ so the app never touches a CDN.

By default Pocket RAG loads pdf.js, mammoth, transformers.js and WebLLM from
jsDelivr at the exact pinned versions in vendor.json. That is fine on the open
internet, and it is what the GitHub Pages deployment does.

Run this and it stops. Every file is downloaded, its SHA-256 is checked against
the value in vendor.json, and vendor/manifest.json is written; the app reads
that manifest on startup and prefers the local copy for everything it lists.

    python3 get-vendor.py            # the parsers and the embedding runtime, 2.9 MB
    python3 get-vendor.py --all      # ...and WebLLM as well, 9.5 MB
    python3 get-vendor.py --verify   # check what is already there, download nothing

Model weights are a separate matter and are not handled here: transformers.js
fetches the 34 MB embedding model from Hugging Face and caches it in the
browser, and WebLLM does the same for its several hundred megabytes.
"""
import argparse, hashlib, json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, 'vendor')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def human(n):
    return f'{n/1_048_576:.1f} MB' if n >= 1_048_576 else f'{n/1024:.0f} KB'


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--all', action='store_true',
                    help='include WebLLM (6.6 MB) — only needed for the writer tier')
    ap.add_argument('--verify', action='store_true',
                    help='check the files already in vendor/ and exit')
    args = ap.parse_args()

    catalogue = json.load(open(os.path.join(HERE, 'vendor.json')))['libs']
    wanted = {k: v for k, v in catalogue.items()
              if args.all or args.verify or v.get('precache')}

    if args.verify:
        bad = 0
        for key, lib in catalogue.items():
            path = os.path.join(VENDOR, lib['file'])
            if not os.path.exists(path):
                print(f'  absent    {lib["file"]}')
                continue
            got = sha256(path)
            ok = got == lib['sha256']
            bad += 0 if ok else 1
            print(f'  {"verified " if ok else "MISMATCH "} {lib["file"]}  {human(os.path.getsize(path))}')
            if not ok:
                print(f'              expected {lib["sha256"]}\n              got      {got}')
        return 1 if bad else 0

    os.makedirs(VENDOR, exist_ok=True)
    total = sum(v['bytes'] for v in wanted.values())
    print(f'Fetching {len(wanted)} files, {human(total)}, into vendor/\n')

    manifest = {}
    # Anything already correct in vendor/ is kept, even if not requested now.
    for key, lib in catalogue.items():
        path = os.path.join(VENDOR, lib['file'])
        if os.path.exists(path) and sha256(path) == lib['sha256']:
            manifest[key] = {'file': lib['file'], 'sha256': lib['sha256']}

    failed = []
    for key, lib in wanted.items():
        path = os.path.join(VENDOR, lib['file'])
        if key in manifest:
            print(f'  have      {lib["file"]}')
            continue
        print(f'  fetching  {lib["file"]:26s} {human(lib["bytes"]):>9s}  ', end='', flush=True)
        try:
            with urllib.request.urlopen(lib['cdn'], timeout=120) as r:
                data = r.read()
            got = hashlib.sha256(data).hexdigest()
            if got != lib['sha256']:
                print('SHA-256 MISMATCH — not written')
                print(f'              expected {lib["sha256"]}\n              got      {got}')
                failed.append(key)
                continue
            with open(path, 'wb') as f:
                f.write(data)
            print('ok')
            manifest[key] = {'file': lib['file'], 'sha256': lib['sha256']}
        except Exception as exc:
            print(f'failed — {exc}')
            failed.append(key)

    with open(os.path.join(VENDOR, 'manifest.json'), 'w') as f:
        json.dump({'libs': manifest}, f, indent=2)

    print(f'\nvendor/manifest.json lists {len(manifest)} local libraries.')
    if 'webllm' not in manifest:
        print('WebLLM is not local — the writer tier will load it from jsDelivr.')
        print('Run with --all if you need that offline too.')
    if failed:
        print(f'\n{len(failed)} failed: {", ".join(failed)}')
        return 1
    print('\nReload the page. The footer should now say "libraries: self-hosted".')
    return 0


if __name__ == '__main__':
    sys.exit(main())
