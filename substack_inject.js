(() => {
  'use strict';

  function isSubstackEnv() {
    try {
      const host = location.hostname.toLowerCase();
      if (host.includes('substack.com')) return true;
      if (document.querySelector('meta[name="twitter:app:name:iphone"][content="Substack"]')) return true;
      if (document.querySelector('link[href*="substackcdn"]')) return true;
      if (document.querySelector('script[src*="substack"]')) return true;
      const u = new URL(location.href);
      if (/(^|\/)p\//.test(u.pathname) || u.pathname.includes('/posts/')) return true;
    } catch {}
    return false;
  }

  if (!isSubstackEnv()) return;

  const NOTE_COMPOSE_ORIGIN = 'https://substack.com';
  const NOTE_COMPOSE_PATH = '/home';
  const BTN_LABEL = 'Edit in Notes';

  let lastSelectedText = '';

  function getSelectedText() { const sel = window.getSelection(); return (!sel||sel.isCollapsed) ? '' : (sel.toString()||'').trim(); }

  async function openComposeWith(text) {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    try { await chrome.storage.local.remove(['generatedNoteContent','timestamp']); } catch {}
    await chrome.storage.local.set({ pendingNoteText: text, pendingNoteTs: Date.now(), pendingNoteToken: token });
    const p = new URLSearchParams(); p.set('action','compose'); p.set('note_token', token);
    const subset = text.length > 1800 ? text.slice(0,1800) : text;
    if (subset) p.set('message', subset);
    window.open(`${NOTE_COMPOSE_ORIGIN}${NOTE_COMPOSE_PATH}?${p}`, '_blank', 'noopener');
  }

  // No sticky buttons: action only appears within Substack's native selection bubble

  function createMenuButton(shareBtnComputed) {
    const btn = document.createElement('button');
    btn.className = 'notes-menu-btn';
    btn.type = 'button';
    btn.textContent = BTN_LABEL;
    // Match X/LinkedIn: orange background, white text; inherit font metrics from Share/Restack
    btn.style.cssText = 'display:flex;align-items:center;width:100%;padding:8px 12px;line-height:20px;color:#ffffff;background:#ff6719;border:none;border-radius:6px;cursor:pointer;text-align:left;transition:background-color .2s;margin-bottom:6px;';
    // Force consistency with the orange pill style (so dropdown and fallback are identical)
    btn.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '600';
    btn.addEventListener('mouseenter', ()=>{ btn.style.backgroundColor='#e55a15'; });
    btn.addEventListener('mouseleave', ()=>{ btn.style.backgroundColor='#ff6719'; });
    btn.addEventListener('mousedown', ()=>{ lastSelectedText = getSelectedText() || lastSelectedText; });
    btn.addEventListener('click', async (e)=>{ e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); const t=getSelectedText()||lastSelectedText; if(t) await openComposeWith(t); });
    const icon = document.createElement('span'); icon.textContent='📝'; icon.style.marginRight='8px'; btn.insertBefore(icon, btn.firstChild);
    return btn;
  }

  function closeBubble(){ try { document.querySelectorAll('[aria-label="Close"]').forEach(x=>x.click()); } catch {} }

  function findShareBubbleCandidate(root){
    const candidates = (root ? [root] : []).concat(Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper], [role="dialog"], [data-state="open"]')));
    for (const el of candidates){ if (!el || el.nodeType !== 1) continue; const t=(el.textContent||'').toLowerCase(); if (t.includes('share') && t.includes('restack')) return el; }
    return null;
  }

  function injectIntoBubble(bubble){
    if (!bubble || bubble.querySelector('.notes-menu-btn')) return false;
    const buttons = bubble.querySelectorAll('button, [role="button"]');
    let shareBtn = null; for (const b of buttons){ const txt=(b.textContent||'').toLowerCase(); if (txt.includes('share')) { shareBtn=b; break; } }
    const metrics = shareBtn ? window.getComputedStyle(shareBtn) : null;
    const btn = createMenuButton(metrics);
    if (shareBtn && shareBtn.parentElement) shareBtn.parentElement.insertBefore(btn, shareBtn);
    else if (buttons[0] && buttons[0].parentElement) buttons[0].parentElement.insertBefore(btn, buttons[0]);
    else bubble.insertBefore(btn, bubble.firstChild);
    return true;
  }

  function hasActiveSelection(){ const t=getSelectedText(); return (t && t.length>10) || (lastSelectedText && lastSelectedText.length>10); }
  function tryInject(root){ if (!hasActiveSelection()) return false; const b=findShareBubbleCandidate(root||document.body); if (b) return injectIntoBubble(b); return false; }

  const observer = new MutationObserver((mutations)=>{ if (!hasActiveSelection()) return; let injected=false; for (const m of mutations){ if (m.type==='attributes') injected = injected || tryInject(m.target); if (m.type==='childList'){ m.addedNodes.forEach(n=>{ if (n.nodeType===1) injected = injected || tryInject(n); }); } } });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-state','style','class','aria-hidden']});

  document.addEventListener('mouseup', ()=>{ setTimeout(()=>{ const t=getSelectedText(); if (t && t.length>10){ lastSelectedText=t; tryInject(); } }, 40); });
  document.addEventListener('selectionchange', ()=>{ const t=getSelectedText(); if (!t) lastSelectedText=''; }, { passive:true });

  document.addEventListener('keydown', async (e)=>{ if ((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key==='N'){ const t=getSelectedText()||lastSelectedText; if(t){ e.preventDefault(); await openComposeWith(t); } } });
})();
