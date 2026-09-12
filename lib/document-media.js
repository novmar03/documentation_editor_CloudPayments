// Shared by the editor, exported HTML and the documentation site.
export function installDocumentMedia(root = document) {
  const doc = root.ownerDocument || root;
  const win = doc.defaultView;
  if (!win || !root.querySelectorAll) return () => {};
  const states = new WeakMap();
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  function pinColumns() {
    root.querySelectorAll('table[data-freeze-column]').forEach(table => {
      const spans = [];
      [...table.rows].forEach(row => {
        let column = 0;
        [...row.cells].forEach(cell => {
          while (spans[column] > 0) column++;
          const pinned = column === 0;
          if (cell.hasAttribute('data-first-column') !== pinned) cell.toggleAttribute('data-first-column', pinned);
          for (let k = 0; k < cell.colSpan; k++) spans[column + k] = cell.rowSpan || table.rows.length;
          column += cell.colSpan;
        });
        for (let k = 0; k < spans.length; k++) spans[k] = Math.max(0, (spans[k] || 0) - 1);
      });
    });
  }
  pinColumns();
  const observer = new win.MutationObserver(records => {
    if (records.some(r => r.target.closest?.('table') || [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('table') || n.querySelector('table'))))) pinColumns();
  });
  observer.observe(root === doc ? doc.body : root, {childList: true, subtree: true});
  function state(el) {
    if (!states.has(el)) {
      states.set(el, {index: 0, paused: !!reduced?.matches, next: Date.now() + 3000});
      const pause = el.querySelector('[data-carousel-action="pause"]');
      if (pause) pause.textContent = reduced?.matches ? 'Продолжить' : 'Пауза';
    }
    return states.get(el);
  }
  function show(el, index, manual = false) {
    const slides = [...el.querySelectorAll('[data-carousel-slide]')];
    if (!slides.length) return;
    const s = state(el);
    s.index = (index + slides.length) % slides.length;
    s.next = Date.now() + 3000;
    slides.forEach((slide, i) => { slide.hidden = i !== s.index; });
    el.querySelectorAll('[data-carousel-index]').forEach((dot, i) => {
      dot.setAttribute('aria-current', String(i === s.index));
    });
    const counter = el.querySelector('[data-carousel-counter]');
    if (counter) counter.textContent = `${s.index + 1} / ${slides.length}`;
    const status = el.querySelector('[data-carousel-status]');
    if (manual && status) status.textContent = `Изображение ${s.index + 1} из ${slides.length}`;
  }
  function click(event) {
    if (!(event.target instanceof win.Element)) return;
    const control = event.target.closest('[data-carousel-action], [data-carousel-index]');
    const el = control?.closest('.doc-carousel');
    if (!el || !root.contains(el)) return;
    event.preventDefault();
    const s = state(el), action = control.dataset.carouselAction;
    if (action === 'pause') {
      s.paused = !s.paused; s.next = Date.now() + 3000;
      control.textContent = s.paused ? 'Продолжить' : 'Пауза';
      control.setAttribute('aria-label', s.paused ? 'Продолжить автопрокрутку' : 'Приостановить автопрокрутку');
    } else show(el, action === 'previous' ? s.index - 1 : action === 'next' ? s.index + 1 : Number(control.dataset.carouselIndex), true);
  }
  function key(event) {
    if (!(event.target instanceof win.Element)) return;
    const el = event.target.closest('.doc-carousel');
    if (!el || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    show(el, state(el).index + (event.key === 'ArrowLeft' ? -1 : 1), true);
  }
  const timer = win.setInterval(() => {
    root.querySelectorAll('.doc-carousel').forEach(el => {
      const s = state(el);
      if (doc.hidden || el.matches(':hover') || el.contains(doc.activeElement)) { s.next = Date.now() + 3000; return; }
      if (!s.paused && Date.now() >= s.next) show(el, s.index + 1);
    });
  }, 250);
  root.querySelectorAll('.doc-carousel').forEach(state);
  root.addEventListener('click', click);
  root.addEventListener('keydown', key);
  return () => { observer.disconnect(); win.clearInterval(timer); root.removeEventListener('click', click); root.removeEventListener('keydown', key); };
}
