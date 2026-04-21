/* NOVUS ORDO — app logic: screen switching, nav, tweaks, cmdK, mobile drawer */
(function(){
  const shell = document.getElementById('appShell');
  const switcher = document.getElementById('screenSelect');
  const tweaksBtn = document.getElementById('tweaksBtn');
  const tweaksPanel = document.getElementById('tweaksPanel');
  const sidebar = document.getElementById('sidebar');
  const sideBackdrop = document.getElementById('sideBackdrop');
  const burger = document.getElementById('burger');
  const mask = document.getElementById('cmdkMask');
  const cmdkInput = document.getElementById('cmdkInput');
  const openBtn = document.getElementById('openCmdK');

  // Inject screens
  Object.keys(SCREENS).forEach(k => {
    const el = document.getElementById('screen-' + k);
    if (el) el.innerHTML = SCREENS[k];
  });

  const allScreenIds = ['login','dashboard','sessions','session-detail','missions','characters','character-detail','identity','identity-detail','hall-of-fame','equipment','credits','wiki','gallery','chronicle','notifications','profile','admin'];

  function goTo(id) {
    if (!allScreenIds.includes(id)) return;
    const loginEl = document.getElementById('screen-login');
    if (id === 'login') {
      shell.style.display = 'none';
      loginEl.classList.add('active');
    } else {
      shell.style.display = '';
      loginEl.classList.remove('active');
      document.querySelectorAll('.main > .screen').forEach(s => s.classList.remove('active'));
      const target = document.getElementById('screen-' + id);
      if (target) target.classList.add('active');
    }
    switcher.value = id;
    document.querySelectorAll('[data-go]').forEach(a => {
      a.classList.toggle('active', a.dataset.go === id);
    });
    localStorage.setItem('no_screen', id);
    closeSide();
    const main = document.getElementById('mainArea');
    if (main) main.scrollTop = 0;
    window.scrollTo(0,0);
  }

  switcher.addEventListener('change', e => goTo(e.target.value));

  document.body.addEventListener('click', e => {
    const t = e.target.closest('[data-go]');
    if (t) { e.preventDefault(); goTo(t.dataset.go); closeCmdK(); }
  });

  // Tweaks
  tweaksBtn.addEventListener('click', () => tweaksPanel.classList.toggle('open'));
  document.querySelectorAll('.tweaks .tw-opts').forEach(group => {
    group.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const key = group.dataset.tw;
      const val = btn.dataset.val;
      group.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
      applyTweak(key, val);
      localStorage.setItem('no_tw_' + key, val);
    });
  });
  function applyTweak(k, v) {
    if (k === 'layout') shell.setAttribute('data-layout', v);
    if (k === 'density') document.body.setAttribute('data-density', v);
    if (k === 'pattern') document.body.setAttribute('data-pattern', v);
  }

  // Mobile drawer
  function openSide(){ sidebar.classList.add('open'); sideBackdrop.classList.add('open'); }
  function closeSide(){ sidebar.classList.remove('open'); sideBackdrop.classList.remove('open'); }
  if (burger) burger.addEventListener('click', openSide);
  if (sideBackdrop) sideBackdrop.addEventListener('click', closeSide);

  // Command-K
  function openCmdK(){ mask.classList.add('open'); setTimeout(()=>cmdkInput && cmdkInput.focus(),20); }
  function closeCmdK(){ mask.classList.remove('open'); }
  if (openBtn) openBtn.addEventListener('click', e=>{e.preventDefault(); openCmdK();});
  document.addEventListener('keydown', e=>{
    if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openCmdK(); }
    if (e.key==='Escape') closeCmdK();
  });
  if (mask) mask.addEventListener('click', e=>{ if (e.target===mask) closeCmdK(); });

  // Restore
  const saved = localStorage.getItem('no_screen') || 'dashboard';
  goTo(allScreenIds.includes(saved) ? saved : 'dashboard');
  ['layout','density','pattern'].forEach(k => {
    const v = localStorage.getItem('no_tw_' + k);
    if (v) {
      applyTweak(k, v);
      const group = document.querySelector(`.tweaks .tw-opts[data-tw="${k}"]`);
      if (group) group.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === v));
    }
  });
})();
