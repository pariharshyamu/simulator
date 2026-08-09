/* Where the four libraries come from.

   Default: the pinned versions on jsDelivr. Loading a library from a CDN tells
   that CDN your IP address and nothing else — your document is never read,
   never uploaded, and never sent anywhere. If even that is too much, run
   `python3 get-vendor.py`: it writes vendor/manifest.json, and from then on
   every one of these resolves to a file on your own server instead.

   One fetch decides it, for the whole app, once. */

const HERE = new URL('.', import.meta.url);

let resolving = null;

export function vendorBase(){ return HERE; }

export function vendor(){
  if (resolving) return resolving;
  resolving = (async () => {
    const cat = await (await fetch(new URL('vendor.json', HERE))).json();
    /* On a CDN deployment this 404s, and one "Failed to load resource" appears
       in the console. That is the check working, not a fault: the file only
       exists if someone ran get-vendor.py on the host. */
    let have = {};
    try {
      const r = await fetch(new URL('vendor/manifest.json', HERE), { cache: 'no-store' });
      if (r.ok) have = (await r.json()).libs || {};
    } catch (e) { /* no local copy — the CDN it is */ }

    const map = { __local: Object.keys(have).length > 0, __libs: cat.libs };
    for (const [key, lib] of Object.entries(cat.libs))
      map[key] = have[key] ? new URL('vendor/' + lib.file, HERE).href : lib.cdn;
    map.__source = map.__local ? 'self-hosted' : 'jsdelivr';
    return map;
  })();
  return resolving;
}

export async function vendorURL(key){
  const m = await vendor();
  if (!m[key]) throw new Error('No such library: ' + key);
  return m[key];
}
