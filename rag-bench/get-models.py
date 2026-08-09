#!/usr/bin/env python3
"""One-time download of a local language model for the MAHAGENCO RAG Bench.

Run this once on a machine with internet.  Everything lands in models/ and the
bench then works with the network unplugged.

    python get-models.py            # list the choices
    python get-models.py small      # ~490 MB  Qwen2.5 0.5B Instruct
    python get-models.py medium     # ~570 MB  Qwen3 0.6B
    python get-models.py large      # ~1.24 GB Llama 3.2 1B Instruct
    python get-models.py embedder   # re-fetch the 34 MB embedding model
    python get-models.py vendor     # ~50 MB ONNX Runtime WebAssembly binaries
"""
import json, os, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.abspath(__file__))
HF = "https://huggingface.co"

CHOICES = {
    "small":  ("onnx-community/Qwen2.5-0.5B-Instruct",       "model_q4f16.onnx", "~490 MB"),
    "medium": ("onnx-community/Qwen3-0.6B-ONNX",             "model_q4f16.onnx", "~570 MB"),
    "large":  ("onnx-community/Llama-3.2-1B-Instruct-q4f16", "model_q4f16.onnx", "~1.24 GB"),
    "embedder": ("Xenova/bge-small-en-v1.5",                 "model_quantized.onnx", "~34 MB"),
    "vendor":   ("onnxruntime-web (jsDelivr)",               "",                     "~50 MB"),
}
ORT_VERSION = "1.26.0-dev.20260416-b7804b056c"
TFJS_VERSION = "4.2.0"
ORT_FILES = ("ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm",
             "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm")
SMALL_FILES = ("config.json", "generation_config.json", "tokenizer.json",
               "tokenizer_config.json", "special_tokens_map.json",
               "added_tokens.json", "merges.txt", "vocab.json", "vocab.txt",
               "chat_template.jinja", "preprocessor_config.json")


def listing(repo):
    url = f"{HF}/api/models/{repo}?blobs=true"
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def fetch(repo, rel, dest, size=None):
    if os.path.exists(dest) and (size is None or abs(os.path.getsize(dest) - size) < 1024):
        print(f"    have  {rel}")
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    url = f"{HF}/{repo}/resolve/main/{rel}"
    tmp = dest + ".part"
    try:
        with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
            total = int(r.headers.get("content-length") or 0)
            done = 0
            while True:
                buf = r.read(1 << 20)
                if not buf:
                    break
                f.write(buf); done += len(buf)
                if total:
                    pct = 100 * done / total
                    sys.stdout.write(f"\r    {rel:<34} {done/1e6:8.1f} / {total/1e6:.1f} MB  {pct:5.1f}%")
                    sys.stdout.flush()
        os.replace(tmp, dest)
        print(f"\r    done  {rel:<34} {os.path.getsize(dest)/1e6:8.1f} MB           ")
    except urllib.error.HTTPError as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        if e.code == 404:
            return                      # optional file, fine
        raise


def get_vendor():
    """The ONNX Runtime WebAssembly binaries. Not in git — 50 MB of build output."""
    print(f"\nvendor: transformers.js {TFJS_VERSION} + onnxruntime-web {ORT_VERSION}  (~50 MB)")
    jobs = [(f"https://cdn.jsdelivr.net/npm/@huggingface/transformers@{TFJS_VERSION}/dist/transformers.min.js",
             os.path.join(ROOT, "vendor", "transformers.min.js"), "transformers.min.js")]
    base = f"https://cdn.jsdelivr.net/npm/onnxruntime-web@{ORT_VERSION}/dist/"
    out = os.path.join(ROOT, "vendor", "ort")
    os.makedirs(out, exist_ok=True)
    jobs += [(base + f, os.path.join(out, f), f) for f in ORT_FILES]
    for url, dest, f in jobs:
        if os.path.exists(dest) and os.path.getsize(dest) > 1000:
            print(f"    have  {f}")
            continue
        tmp = dest + ".part"
        try:
            with urllib.request.urlopen(url, timeout=180) as r, open(tmp, "wb") as fh:
                total = int(r.headers.get("content-length") or 0)
                done = 0
                while True:
                    buf = r.read(1 << 20)
                    if not buf:
                        break
                    fh.write(buf); done += len(buf)
                    if total:
                        sys.stdout.write(f"\r    {f:<40} {done/1e6:7.1f} / {total/1e6:.1f} MB")
                        sys.stdout.flush()
            os.replace(tmp, dest)
            print(f"\r    done  {f:<40} {os.path.getsize(dest)/1e6:7.1f} MB      ")
        except Exception as e:
            if os.path.exists(tmp):
                os.remove(tmp)
            print(f"\n    ! {f}: {e}")
            return False
    print("  -> vendor/  ready.")
    return True


def get(kind):
    if kind == "vendor":
        return get_vendor()
    repo, onnx, approx = CHOICES[kind]
    print(f"\n{kind}: {repo}  ({approx})")
    info = listing(repo)
    names = {s["rfilename"]: (s.get("size") or 0) for s in info.get("siblings", [])}
    for f in SMALL_FILES:
        if f in names:
            fetch(repo, f, os.path.join(ROOT, "models", repo, f), names[f])
    rel = "onnx/" + onnx
    if rel not in names:
        alt = [n for n in names if n.startswith("onnx/") and n.endswith(".onnx")]
        print("   ! wanted", rel, "— available:", ", ".join(sorted(alt)[:8]))
        return
    fetch(repo, rel, os.path.join(ROOT, "models", repo, rel), names[rel])
    data = rel + "_data"
    if data in names:
        fetch(repo, data, os.path.join(ROOT, "models", repo, data), names[data])
    print(f"  -> models/{repo}/  ready. Pick it in the bench under Setup & notes.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a in CHOICES]
    emb = os.path.join(ROOT, "models", CHOICES["embedder"][0], "onnx", "model_quantized.onnx")
    ort = os.path.join(ROOT, "vendor", "transformers.min.js")
    if not args and not (os.path.exists(emb) and os.path.exists(ort)):
        print("First run — fetching what the bench needs (about 85 MB, once).")
        if not os.path.exists(ort):
            get("vendor")
        if not os.path.exists(emb):
            get("embedder")
        print()
    if not args:
        print(__doc__)
        print("Choices:")
        for k, (r, o, s) in CHOICES.items():
            here = (os.path.isdir(os.path.join(ROOT, "vendor", "ort")) if k == "vendor"
                    else os.path.isdir(os.path.join(ROOT, "models", r)))
            print(f"  {k:<9} {r:<44} {s:>9}   {'[already here]' if here else ''}")
        sys.exit(0)
    for a in args:
        get(a)
    print("\nAll done. Start the bench with start-windows.bat or start-mac-linux.sh.")
