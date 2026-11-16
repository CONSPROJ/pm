/* راهنمای «؟» مشترک کل سامانه (صفحهٔ اصلی و نقشه‌خوان) — ۴۴۰ و ۴۴۲
   hlpBtn(html): دکمهٔ «؟» که با کلیک یا نگه‌داشتن نشانگر، توضیح را در کادری کوچک نشان می‌دهد.
   متن‌های توضیحی شناخته‌شده (HLP_SEL، و هر عنصر با کلاس tip) خودکار پنهان و به «؟» کنار نزدیک‌ترین عنوان تبدیل می‌شوند.
   هشدار، خطا، و متنی که دکمه/فیلد/پیوند دارد دست نمی‌خورد. برای متن تازه: کلاس tip یا hlpBtn، نه پاراگراف زیر عنوان. */
(function(){
  if(window.hlpBtn) return;
  const SEL = '.tip, .dc-tk, .drv-tk, .hr-note, .rf-hint, .pj-hint, .pc-note, .sp-hint, .cdx-note, .rs-note, .nf-hint, .xls-note, .mq-hint, .lv-help, .fxf-note, .dc-note, .upc-hint, .recv-note, .pr-note, .fz-sec-note, .ds-note, .dh-note, .dc-hint, .dc-help, .ch-note, .wsh-note, .wm3-note, .um-hint, .uc-note, .te-hint, .sx-note, .spf-note, .pct-ro, .dc-tb > small';
  const HLP = new Map();
  function hlpBtn(html){ const k = String(html || ''); if(!k.trim()) return ''; let id = HLP.get(k); if(!id){ id = 'h' + (HLP.size + 1); HLP.set(k, id); HLP.set(id, k); }
    return '<button type="button" class="hlp" data-hlp="' + id + '" aria-label="راهنما">?</button>'; }
  window.hlpBtn = hlpBtn;
  const css = '.hlp{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;width:17px;height:17px;margin-inline-start:6px;border-radius:50%;font-size:10.5px;font-weight:800;line-height:1;cursor:pointer;vertical-align:middle;'
    + 'color:var(--muted,#7a8494);background:var(--field,#f1f3f6);border:1px solid var(--line,#e3e7ed);transition:background .15s,color .15s}'
    + '.hlp:hover,.hlp:focus-visible{color:#fff;background:var(--sky,#2a6fa0);border-color:var(--sky,#2a6fa0)}'
    + '.hlp-pop{position:fixed;z-index:100000;padding:10px 12px;border-radius:12px;background:var(--ink,#1d2430);color:var(--surface,#fff);font-size:12px;font-weight:500;line-height:1.95;box-shadow:0 12px 32px -8px rgba(15,23,42,.45);text-align:right;direction:rtl}'
    + '.hlp-pop code{background:rgba(255,255,255,.14);color:inherit;padding:0 4px;border-radius:4px;font-size:11px}.hlp-pop b{color:inherit}';
  const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
  const anchorOf = el => { let p = el.previousElementSibling; while(p && (p.classList.contains('hlp-src') || (p.tagName === 'TEXTAREA' && p.hidden))) p = p.previousElementSibling;
    if(p && (/^H[1-6]$/.test(p.tagName) || p.tagName === 'B')) return p; if(p && p.matches('.dc-tbh, .pp-sh, .wm2-ph-h, .dc-auh')) return p.querySelector('b, u') || p;
    const par = el.parentElement; if(par){ const h = par.querySelector(':scope > h3, :scope > h4, :scope > h5, :scope > b'); if(h && (h.compareDocumentPosition(el) & 4)) return h; } return null; };
  const conv = el => { if(el.__hlp) return; el.__hlp = 1; if(/warn|err|alert|bad/.test(el.className)) return; if(el.querySelector('button, input, select, textarea, a, label')) return;
    if(el.textContent.trim().length < 18) return; const a = anchorOf(el); if(!a || a.querySelector(':scope > .hlp')) return;
    a.insertAdjacentHTML('beforeend', hlpBtn(el.innerHTML)); el.hidden = true; el.classList.add('hlp-src'); };
  const scan = n => { if(n.nodeType !== 1) return; if(n.matches(SEL)) conv(n); if(n.firstElementChild) n.querySelectorAll(SEL).forEach(conv); };
  const go = () => { scan(document.body); new MutationObserver(ms => { for(const m of ms) for(const n of m.addedNodes) scan(n); }).observe(document.body, {childList: true, subtree: true}); };
  if(document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  let pop = null; const close = () => { if(pop){ pop.remove(); pop = null; } };
  const open = b => { close(); const h = HLP.get(b.dataset.hlp); if(!h) return; pop = document.createElement('div'); pop.className = 'hlp-pop'; pop.innerHTML = h; document.body.appendChild(pop);
    const r = b.getBoundingClientRect(), W = window.innerWidth, w = Math.min(320, W - 24); pop.style.width = w + 'px'; pop.style.left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, W - w - 12)) + 'px';
    const top = r.bottom + 8; pop.style.top = (top + pop.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - pop.offsetHeight - 8) : top) + 'px'; pop.__b = b; };
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.hlp'); if(b){ e.preventDefault(); e.stopPropagation(); if(pop && pop.__b === b) close(); else open(b); return; } if(pop && !e.target.closest('.hlp-pop')) close(); }, true);
  document.addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('.hlp'); if(b && matchMedia('(hover: hover)').matches && (!pop || pop.__b !== b)) open(b); });
  document.addEventListener('mouseout', e => { const b = e.target.closest && e.target.closest('.hlp'); if(b && pop && pop.__b === b && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.hlp-pop'))) close(); });
  window.addEventListener('scroll', close, true); document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });
})();
