/* =========================================================================
   POINTER-DRIVEN DRAG, AND THE PHONE SHELL

   The artefact was built with HTML5 drag-and-drop — dragstart, dataTransfer,
   drop. None of those events exist on a touch screen. On a phone the palette
   was decorative: you could look at the blocks and you could not move one.
   That is the whole interaction, so the whole artefact was inert.

   Pointer events replace it. One code path covers mouse, finger and pen, and
   there is no dataTransfer to marshal — the thing being dragged is just a
   variable. Two details matter and both are easy to get wrong:

     touch-action  A finger on an element the browser thinks is scrollable is
                   a scroll gesture, and the browser will steal it mid-drag
                   and cancel your pointer stream. `touch-action:none` on the
                   block says otherwise. It is applied only while a drag is
                   possible, so ordinary scrolling through the palette still
                   works.

     capture       setPointerCapture keeps the events coming to the element
                   the finger started on even after it has moved somewhere
                   else. Without it a fast drag off the edge of a block drops
                   the stream and the ghost sticks to the screen.

   The second half of the problem is layout. Under 900px the three columns
   become one panel at a time, so the palette and the model are never both on
   screen — and no amount of drag support helps you drag between two things
   you cannot both see. On those widths a TAP on a palette block adds it, and
   drag is reserved for reordering within the model. That is the right mobile
   idiom anyway: dragging across a screen edge is a desktop affordance.
   ========================================================================= */

const NARROW = () => window.matchMedia('(max-width:900px)').matches;

/* ------------------------------------------------------------ the panels */
let PANEL = 'canvasWrap';

function showPanel(id){
  PANEL = id;
  ['palette', 'canvasWrap', 'right'].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.classList.toggle('on', k === id);
  });
  document.querySelectorAll('#mobnav button').forEach(b =>
    b.classList.toggle('on', b.dataset.p === id));
  /* A panel that was hidden has zero width, so any canvas drawn into it was
     drawn at zero width too. Re-render the results when they come back. */
  if (id === 'right' && MB.result) renderResults(MB.result);
  const el = document.getElementById(id);
  if (el) el.scrollTop = el.scrollTop;   // keep position, do not jump
}

function syncNav(){
  const b = document.getElementById('navCount');
  if (b){ b.textContent = MB.spec.length; b.style.display = MB.spec.length ? '' : 'none'; }
  /* The instruction under "Your model" is a lie on a phone — there is no
     "left" to drag from. Say what actually works on this screen. */
  const h = document.getElementById('canvasHint');
  if (h) h.textContent = NARROW()
    ? 'Tap a block in Blocks to add it. Drag a block here to reorder, tap it for the maths.'
    : 'Drag blocks in from the left. Order matters, top to bottom. Tap a block for the maths it performs.';
}

let toastT = null;
function toast(msg){
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2100);
}

function wireNav(){
  document.querySelectorAll('#mobnav button').forEach(b =>
    b.addEventListener('click', () => showPanel(b.dataset.p)));
  showPanel(NARROW() ? 'canvasWrap' : 'canvasWrap');
  /* Rotating a phone, or resizing a desktop window across the breakpoint,
     must not leave two panels hidden with nothing to show. */
  window.addEventListener('resize', () => {
    if (!NARROW())
      ['palette', 'canvasWrap', 'right'].forEach(k =>
        document.getElementById(k).classList.remove('on'));
    else showPanel(PANEL);
    syncNav();
  });
}

/* ----------------------------------------------------------------- drag */
const DRAG_START_PX = 7;      // below this it is a tap, not a drag
let D = null;                 // the live gesture, or null

/* Where in the canvas would a drop at this y land? Returns an index into
   MB.spec, counting only blocks (the drop hint is not one). */
function dropIndex(y){
  const blocks = [...document.querySelectorAll('#canvas .blk')];
  for (let i = 0; i < blocks.length; i++){
    const r = blocks[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return i;
  }
  return blocks.length;
}

function showSlot(i){
  document.querySelectorAll('#canvas .slot').forEach(n => n.remove());
  if (i == null) return;
  const canvas = document.getElementById('canvas');
  const blocks = [...canvas.querySelectorAll('.blk')];
  const slot = document.createElement('div');
  slot.className = 'slot';
  if (i >= blocks.length) canvas.insertBefore(slot, canvas.querySelector('.drop'));
  else canvas.insertBefore(slot, blocks[i]);
}

/* Auto-scroll when the finger is held near an edge of the canvas — without
   it you cannot drag a block to a position that is off screen, which on a
   phone is most of them. */
let scrollT = null;
function edgeScroll(y){
  const c = document.getElementById('canvas');
  if (!c) return;
  const r = c.getBoundingClientRect(), M = 46;
  const up = y < r.top + M, dn = y > r.bottom - M;
  clearInterval(scrollT); scrollT = null;
  if (up || dn) scrollT = setInterval(() => { c.scrollTop += up ? -11 : 11; }, 16);
}
function stopEdgeScroll(){ clearInterval(scrollT); scrollT = null; }

function makeGhost(node, x, y){
  const g = node.cloneNode(true);
  g.id = 'ghostblk';
  g.querySelectorAll('.x,.flds,.tags,.math,.more').forEach(n => n.remove());
  g.classList.remove('sel');
  g.style.left = x + 'px'; g.style.top = y + 'px';
  document.body.appendChild(g);
  return g;
}

function endDrag(commit){
  if (!D) return;
  const d = D; D = null;
  stopEdgeScroll();
  if (d.ghost) d.ghost.remove();
  if (d.node) d.node.classList.remove('drag');
  document.querySelectorAll('#canvas .slot').forEach(n => n.remove());
  document.body.style.userSelect = '';
  try { d.node.releasePointerCapture(d.id); } catch (e) {}

  if (!commit || !d.moved) return;
  const i = d.index;
  if (i == null) return;
  if (d.kind === 'new') addBlock(d.type, i);
  else {
    const from = d.from;
    if (i === from || i === from + 1) return;         // dropped where it was
    const [b] = MB.spec.splice(from, 1);
    MB.spec.splice(i > from ? i - 1 : i, 0, b);
    sortSpec(); afterChange();
  }
}

/* Attach the gesture to one block. `info` is {kind:'new', type} for a palette
   block or {kind:'move', from} for one already in the model. */
function wireBlockPointer(node, info, onTap){
  node.classList.add('grabbable');
  node.addEventListener('pointerdown', e => {
    /* A finger that landed on a number field, a dropdown, a tag chip or the
       delete button is not trying to drag the block. Leave those alone or
       the controls become unusable, which is worse than no drag at all. */
    if (e.target.closest('input,select,button,.tg')) return;
    if (e.button != null && e.button !== 0) return;

    /* Dragging out of the palette is meaningless when the canvas is on
       another panel — let the gesture scroll the palette instead. */
    const canDrag = !(NARROW() && info.kind === 'new');

    D = { kind: info.kind, type: info.type, from: info.from, node,
          id: e.pointerId, x0: e.clientX, y0: e.clientY,
          moved: false, index: null, ghost: null, canDrag };
    try { node.setPointerCapture(e.pointerId); } catch (err) {}
  });

  node.addEventListener('pointermove', e => {
    if (!D || D.id !== e.pointerId) return;
    const dx = e.clientX - D.x0, dy = e.clientY - D.y0;
    if (!D.moved){
      if (Math.hypot(dx, dy) < DRAG_START_PX) return;
      if (!D.canDrag){ D = null; return; }            // give the gesture back
      D.moved = true;
      D.ghost = makeGhost(node, e.clientX, e.clientY);
      if (D.kind === 'move') node.classList.add('drag');
      document.body.style.userSelect = 'none';
    }
    e.preventDefault();
    D.ghost.style.left = e.clientX + 'px';
    D.ghost.style.top  = e.clientY + 'px';
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    const inside = e.clientX >= r.left - 40 && e.clientX <= r.right + 40 &&
                   e.clientY >= r.top  - 20 && e.clientY <= r.bottom + 20;
    D.index = inside ? dropIndex(e.clientY) : null;
    showSlot(D.index);
    edgeScroll(e.clientY);
  });

  const up = e => {
    if (!D || D.id !== e.pointerId) return;
    const wasTap = !D.moved;
    endDrag(true);
    if (wasTap && onTap) onTap();
  };
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', () => endDrag(false));
}

/* A palette block: tap adds it, drag places it. */
function wirePaletteBlock(node, type){
  wireBlockPointer(node, { kind: 'new', type }, () => {
    const before = MB.spec.length;
    addBlock(type);
    if (MB.spec.length === before)
      toast(`Only one ${BLOCKS[type].label.toLowerCase()} block is allowed`);
    else if (NARROW())
      toast(`${BLOCKS[type].label} added — see Model`);
  });
}

/* A block already in the model: tap opens its maths, drag reorders it. */
function wireCanvasBlock(node, i){
  wireBlockPointer(node, { kind: 'move', from: i }, () => {
    MB.open = (MB.open === i) ? null : i;
    renderCanvas();
  });
}
