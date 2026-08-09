/* WebLLM runs the language model in its own worker. The main thread only ever
   sees streamed tokens, so scrolling and typing stay smooth on a phone.

   The engine module is fetched on demand (it is 6.6 MB), so messages that
   arrive before it is ready are queued rather than dropped. */
import { vendorURL } from './vendor.js';

let handler = null;
const pending = [];

self.onmessage = (msg) => {
  if (handler) handler.onmessage(msg);
  else pending.push(msg);
};

(async () => {
  const { WebWorkerMLCEngineHandler } = await import(/* @vite-ignore */ await vendorURL('webllm'));
  handler = new WebWorkerMLCEngineHandler();
  while (pending.length) handler.onmessage(pending.shift());
})().catch(err => {
  self.postMessage({ kind: 'return', uuid: '', content: null,
                     error: String((err && err.message) || err) });
});
