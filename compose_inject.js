// compose_inject.js
(function(){
  'use strict';
  const DEBUG = false; // Set to false for production
  const u = new URL(location.href);
  if (DEBUG) { try { console.log('[Compose-Inject] Script loaded on:', location.href); } catch {} }
  const isNotesNew = u.pathname.includes('/notes') && (u.pathname.includes('/new') || u.search.includes('compose'));
  const isFeedCompose = u.pathname.startsWith('/home') && (u.searchParams.get('action') === 'compose' || !!(u.searchParams.get('note_token') || u.searchParams.get('token')));
  const hasTokenParam = !!(u.searchParams.get('note_token') || u.searchParams.get('token'));
  const isHomeWithToken = u.pathname === '/home' && hasTokenParam;
  const shouldRun = isNotesNew || isFeedCompose || isHomeWithToken || (u.pathname.startsWith('/home') && hasTokenParam);
  if (DEBUG) { try { console.log('[Compose-Inject] Path check:', { pathname: u.pathname, action: u.searchParams.get('action'), isNotesNew, isFeedCompose, hasTokenParam, shouldRun }); } catch {} }
  if (!shouldRun) { if (DEBUG) { try { console.log('[Compose-Inject] Exiting - URL does not match compose pattern'); } catch {} } return; }

  const NOTE_PREFILL_PARAM = 'message';

  setTimeout(async () => {
    try {
      const params = new URL(location.href).searchParams;
      const hadUrlMessage = !!params.get(NOTE_PREFILL_PARAM);
      const token = params.get('note_token') || params.get('token');
      if (DEBUG) { try{ console.log('[Compose-Inject] Starting with token:', token); console.log('[Compose-Inject] URL params:', Array.from(params.entries())); }catch{} }

      const getEditor = () => {
        // ONLY target the NEW Notes composer, not existing posts
        // Priority order: placeholder text (most specific) → empty editors → general editors
        return document.querySelector('[placeholder*="What\'s on your mind"]') || 
               document.querySelector('[placeholder*="mind"]') ||
               // Only target ProseMirror/contenteditable that are EMPTY (new composers)
               Array.from(document.querySelectorAll('.ProseMirror, [contenteditable="true"]')).find(el => 
                 el.offsetParent !== null && (!el.textContent || el.textContent.trim().length === 0)
               ) ||
               document.querySelector('textarea');
      };

      let textToInsert = null;
      let clipboardPopulated = false;
      
      // Path A: Check URL message parameter first (small text ≤1800 chars)
      const urlMessage = params.get(NOTE_PREFILL_PARAM);
      if (urlMessage && urlMessage.length > 0) {
        if (DEBUG) { console.log('[Compose-Inject] Using URL message parameter'); }
        textToInsert = urlMessage;
        
        // Copy to clipboard for small posts
        try {
          await navigator.clipboard.writeText(urlMessage);
          clipboardPopulated = true;
          if (DEBUG) { console.log('[Compose-Inject] Small post text copied to clipboard as backup'); }
        } catch (e) {
          console.error('[Compose-Inject] Clipboard copy failed:', e);
        }
      } else if (token) {
        // Path B: Retrieve from storage (large text >1800 chars)
        if (DEBUG) { console.log('[Compose-Inject] Large post detected, retrieving from storage'); }
        
        // CRITICAL: First try to get ANY stored text and immediately copy to clipboard
        // This ensures clipboard is populated BEFORE auto-insert attempts
        let immediateText = null;
        
        // Try multiple storage locations for immediate clipboard population
        const storageKeys = [
          `noteTransfer:${token}`,
          'pendingNoteText',
          `pendingNotes`
        ];
        
        for (const key of storageKeys) {
          try {
            const data = await chrome.storage.local.get([key]);
            if (key === `noteTransfer:${token}` && data[key]?.text) {
              immediateText = String(data[key].text).slice(0, 6000);
              if (DEBUG) { console.log(`[Compose-Inject] Found text in noteTransfer:${token}`); }
              break;
            } else if (key === 'pendingNoteText' && data.pendingNoteText) {
              immediateText = String(data.pendingNoteText).slice(0, 6000);
              if (DEBUG) { console.log('[Compose-Inject] Found text in pendingNoteText'); }
              break;
            } else if (key === 'pendingNotes' && data.pendingNotes?.[token]) {
              immediateText = String(data.pendingNotes[token].text).slice(0, 6000);
              if (DEBUG) { console.log('[Compose-Inject] Found text in pendingNotes map'); }
              break;
            }
          } catch (e) {
            if (DEBUG) { console.log(`[Compose-Inject] Could not read ${key}:`, e); }
          }
        }
        
        // IMMEDIATELY copy to clipboard if we found any text
        if (immediateText) {
          try {
            await navigator.clipboard.writeText(immediateText);
            clipboardPopulated = true;
            textToInsert = immediateText;
            if (DEBUG) { console.log(`[Compose-Inject] IMMEDIATELY copied ${immediateText.length} chars to clipboard`); }
            showToast('Text copied to clipboard. Auto-populating editor...');
          } catch (e) {
            console.error('[Compose-Inject] Critical clipboard copy failed:', e);
            showToast('Could not access clipboard. Please try manual copy from X.');
          }
        } else {
          // If immediate text not found, do a quick storage check (much faster)
          if (DEBUG) { console.log('[Compose-Inject] No immediate text, doing quick storage check'); }
          const key = `noteTransfer:${token}`;
          const stored = await chrome.storage.local.get([key]);
          const entry = stored[key];
          if (entry && entry.text){ 
            textToInsert = String(entry.text).slice(0,6000);
            if (DEBUG) { console.log(`[Compose-Inject] Found text in quick check: ${textToInsert.length} chars`); }
            
            try {
              await navigator.clipboard.writeText(textToInsert);
              clipboardPopulated = true;
              showToast('Text copied to clipboard. Auto-populating editor...');
            } catch (e) {
              console.error('[Compose-Inject] Clipboard copy failed:', e);
            }
          } else {
            // Final fallback check
            const fallback = await chrome.storage.local.get(['pendingNoteText']);
            if (fallback.pendingNoteText) {
              textToInsert = fallback.pendingNoteText;
              if (DEBUG) { console.log('[Compose-Inject] Using pendingNoteText as fallback'); }
              
              try {
                await navigator.clipboard.writeText(textToInsert);
                clipboardPopulated = true;
                showToast('Text copied to clipboard. Auto-populating editor...');
              } catch (e) {
                console.error('[Compose-Inject] Fallback clipboard copy failed:', e);
              }
            }
          }
        }
      }

      if (textToInsert) {
        // Start looking for editor immediately while clipboard operations happen
        let editor = getEditor();
        if (!editor) {
          // If not found immediately, do a quick focused search
          const mountStart = Date.now();
          while (!editor && Date.now() - mountStart < 3000) { 
            await new Promise(r => setTimeout(r, 50)); // Check every 50ms for faster detection
            editor = getEditor(); 
          }
        }
        
        if (editor) {
          const safe = sanitizeForComposer(textToInsert);
          const ok = await populateEditorRobust(editor, safe);
          if (ok) {
            try{
              removeAutoLinks(editor);
              setTimeout(()=>{ try{ removeAutoLinks(editor); }catch{} }, 300);
            }catch{}
            try{ if (token) await chrome.storage.local.remove([`noteTransfer:${token}`]); }catch{}
            chrome.storage.local.remove(['pendingNoteText','pendingNoteTs','pendingNoteToken']);
            
            if (clipboardPopulated) {
              if (DEBUG) { console.log('[Compose-Inject] Success! Text auto-inserted and clipboard backup available'); }
            } else {
              if (DEBUG) { console.log('[Compose-Inject] Text auto-inserted (no clipboard backup)'); }
            }
            return;
          } else {
            // Auto-population failed
            if (clipboardPopulated) {
              showToast('Auto-insert failed. Text is in clipboard - paste with Cmd/Ctrl+V');
            } else {
              showToast('Auto-insert failed and clipboard unavailable. Please copy from X.');
            }
          }
        } else {
          // No editor found
          if (clipboardPopulated) {
            showToast('Editor not ready. Text is in clipboard - paste with Cmd/Ctrl+V');
          } else {
            showToast('Editor not found and clipboard unavailable. Please copy from X.');
          }
        }
      } else if (hadUrlMessage && hadUrlMessage.length > 0) {
        // Only show error if we had a URL message parameter with content but couldn't process it
        showToast('Could not retrieve text. Please copy directly from X.');
      }
    } catch (err) {
      console.error('[Compose Inject] Critical error:', err);
      showToast('Error occurred. Please copy text directly from X.');
    }
  }, 300);

  function sanitizeForComposer(text){
    try{
      let t = String(text || '');
      t = t.replace(/[\u00A0\u2007\u202F]/g, ' ').replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
      t = t.replace(/(https?:\/\/\S+?)(?=\S)/g, '$1\u200B');
      t = t.replace(/(^|\s)(@[A-Za-z0-9_]{2,50})(?=\S)/g, '$1$2\u200B');
      return t;
    }catch{ return text; }
  }

  async function dispatchInput(el){
    try{ el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true })); }catch{}
    await new Promise(r=>setTimeout(r,50)); // Reduced from 120ms to 50ms (2.4x faster)
  }

  function makeChunks(text, maxChunk = 900, softMin = 600){
    const chunks = []; let i = 0;
    while (i < text.length){
      let end = Math.min(i + maxChunk, text.length);
      if (end < text.length){
        const slice = text.slice(i, end);
        let cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '), slice.lastIndexOf('\n'));
        if (cut < softMin) cut = -1; end = i + (cut > 0 ? cut + 1 : slice.length);
      }
      chunks.push(text.slice(i, end).trim()); i = end;
    }
    return chunks.filter(Boolean);
  }

  async function setDirect(el, text){
    try{
      if (el.tagName === 'TEXTAREA'){
        el.focus(); el.value = text; await dispatchInput(el); return true;
      }
      if (el.getAttribute('contenteditable') === 'true' || el.classList.contains('ProseMirror')){
        el.focus();
        const html = text.split('\n').map(line => line.length ? escapeHtml(line) : '<br>').join('<br>');
        el.innerHTML = html;
        await dispatchInput(el);
        const current = (el.textContent||'').trim();
        if (current && current.length >= Math.min(text.length * 0.9, text.length - 10)) return true;
      }
    }catch(err){ console.warn('[Compose Inject] setDirect failed', err); }
    return false;
  }

  async function insertExec(el, t){
    try{ el.focus(); document.execCommand('insertText', false, t); }catch{}
    if (el.tagName==='TEXTAREA') el.value = (el.value||'') + t;
    else if (!document.execCommand) el.textContent = (el.textContent||'') + t;
    await new Promise(r=>setTimeout(r,30)); // Reduced from 120ms to 30ms (4x faster)
  }

  async function populateEditorRobust(el, fullText){
    try{ el.focus(); document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); }catch{}
    let chunks = makeChunks(fullText, 900, 600);
    for (let i=0;i<chunks.length;i++){
      await insertExec(el, chunks[i]);
      if (i < chunks.length-1) await insertExec(el, '\n\n');
    }
    const current = el.tagName==='TEXTAREA' ? (el.value||'') : (el.textContent||'');
    if (current && current.length >= Math.min(fullText.length * 0.98, fullText.length - 6)) return true;
    
    try{ el.focus(); document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); }catch{}
    chunks = makeChunks(fullText, 600, 400);
    for (let i=0;i<chunks.length;i++){
      await insertExec(el, chunks[i]);
      if (i < chunks.length-1) await insertExec(el, '\n\n');
    }
    const after = el.tagName==='TEXTAREA' ? (el.value||'') : (el.textContent||'');
    if (after && after.length >= Math.min(fullText.length * 0.98, fullText.length - 6)) return true;
    
    if (await setDirect(el, fullText)) return true;
    return false;
  }

  function escapeHtml(s){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function showToast(text){
    try{
      if(document.getElementById('unified-toast')) return;
      const el=document.createElement('div');
      el.id='unified-toast'; el.textContent=text;
      Object.assign(el.style,{
        position:'fixed',
        bottom:'16px',
        right:'16px',
        zIndex:999999,
        background:'#ff5c00', // Orange background to match "Edit in Notes" button
        color:'#fff',
        padding:'16px 20px', // Larger padding
        borderRadius:'8px',
        fontSize:'15px', // Larger font
        fontWeight:'600', // Bolder text
        maxWidth:'420px',
        lineHeight:'1.4',
        fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', // Match system font
        boxShadow:'0 4px 12px rgba(0,0,0,0.15)' // Subtle shadow
      });
      document.body.appendChild(el); setTimeout(()=>{el.remove()},6000);
    }catch{}
  }

  function removeAutoLinks(root){
    try{
      const editor = root || document.querySelector('.ProseMirror,[contenteditable="true"]');
      if (!editor) return;
      const unwrap = (el) => { const parent = el.parentNode; while (el.firstChild) parent.insertBefore(el.firstChild, el); parent.removeChild(el); };
      editor.querySelectorAll('a[href], span[class*="mention" i], span[data-mention], span[data-type="mention"]').forEach(a=>unwrap(a));
      editor.querySelectorAll('[data-link-mark], [rel="noopener"]').forEach(a=>unwrap(a));
      editor.innerHTML = editor.innerHTML
        .replace(/\u00A0|\u2007|\u202F/g, ' ')
        .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
        .replace(/\s+<br>\s+/g, '<br>')
        .replace(/(<br>){3,}/g, '<br><br>');
      dispatchInput(editor);
    }catch{}
  }
})();