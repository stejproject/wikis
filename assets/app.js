(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s).trim().replace(/\s+/g, '_');
  const key = s => norm(s).toLowerCase();
  const fmtDate = d => new Date(d).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });

  let cfg = { title: 'Wiki', repo: '', branch: 'main', contentDir: 'content', mainPage: 'Halaman_Utama' };
  let idx = { pages: [], changes: [] };
  const byKey = new Map();

  function detectRepo() {
    if (cfg.repo) return cfg.repo;
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    if (!m) return '';
    const first = location.pathname.split('/').filter(Boolean)[0];
    return m[1] + '/' + (first && !first.includes('.') ? first : m[1] + '.github.io');
  }
  const lookup = name => byKey.get(key(name));

  // Lokasi file .md: content/<dir>/<slug>.md (dir = 'system' | 'articles'; kosong untuk index.json lama)
  const fileOf = p => `${cfg.contentDir}/${p.dir ? p.dir + '/' : ''}${encodeURIComponent(p.slug)}.md`;
  const collOf = p => (p && p.dir === 'system') ? 'system' : 'pages';

  function adminUrl(path, coll = 'pages') { return 'admin/#/collections/' + coll + '/' + path; }

  async function init() {
    try { cfg = { ...cfg, ...(await (await fetch('config.json', { cache: 'no-cache' })).json()) }; } catch (e) {}
    try {
      idx = await (await fetch('index.json', { cache: 'no-cache' })).json();
    } catch (e) {
      $('page-body').innerHTML = '<div class="notice">index.json belum ada. Jalankan <code>node scripts/build-index.js</code> (atau tunggu GitHub Action selesai).</div>';
    }
    idx.pages.forEach(p => { byKey.set(key(p.slug), p); byKey.set(key(p.title), p); });
    $('site-title').textContent = cfg.title;
    $('site-title').href = '#/' + cfg.mainPage;
    $('new-page-link').href = adminUrl('new');
    $('menu-btn').onclick = () => $('sidebar').classList.toggle('open');
    $('search-form').onsubmit = e => {
      e.preventDefault();
      const q = $('search-input').value.trim();
      if (q) location.hash = '#/Khusus:Cari?q=' + encodeURIComponent(q);
    };
    addEventListener('hashchange', route);
    route();
  }

  function setTabs(p) {
    const repo = detectRepo();
    const edit = $('tab-edit'), hist = $('tab-history');
    if (!p) { edit.parentElement.hidden = hist.parentElement.hidden = true; return; }
    edit.parentElement.hidden = hist.parentElement.hidden = false;
    edit.href = adminUrl('entries/' + encodeURIComponent(p.slug), collOf(p));
    hist.href = repo ? `https://github.com/${repo}/commits/${cfg.branch}/${fileOf(p)}` : '#';
  }

  function render(title, html, opts = {}) {
    $('page-title').textContent = title;
    $('page-body').innerHTML = html;
    $('page-categories').innerHTML = opts.cats || '';
    $('page-footer').innerHTML = opts.footer || '';
    $('tab-page').textContent = opts.special ? 'Halaman khusus' : 'Halaman';
    setTabs(opts.page || null);
    document.title = title + ' – ' + cfg.title;
    $('sidebar').classList.remove('open');
    scrollTo(0, 0);
  }

  const link = p => `<a href="#/${encodeURIComponent(p.slug)}">${esc(p.title)}</a>`;
  const catLink = c => `<a href="#/${encodeURIComponent('Kategori:' + norm(c))}">${esc(c)}</a>`;

  async function route() {
    const raw = decodeURIComponent((location.hash.replace(/^#\/?/, '')) || '');
    const [namePart, qs = ''] = raw.split('?');
    const name = namePart || cfg.mainPage;
    const params = new URLSearchParams(qs);
    const special = name.match(/^(Khusus|Kategori):(.*)$/i);

    if (special) {
      const kind = special[1].toLowerCase(), arg = special[2];
      if (kind === 'kategori') return categoryPage(arg);
      switch (key(arg)) {
        case 'semua_halaman': return allPages();
        case 'kategori': return categoryList();
        case 'perubahan_terbaru': return recent();
        case 'acak': {
          const pool = idx.pages.filter(p => !p.system); // halaman sistem tidak ikut diacak
          const p = pool[Math.floor(Math.random() * pool.length)];
          return p ? (location.hash = '#/' + encodeURIComponent(p.slug)) : allPages();
        }
        case 'cari': return search(params.get('q') || '');
      }
      return render('Halaman khusus tidak ditemukan', '<div class="notice">Halaman khusus ini tidak ada.</div>', { special: true });
    }
    return showPage(name);
  }

  async function showPage(name) {
    const p = lookup(name);
    if (!p) {
      const t = name.replace(/_/g, ' ');
      return render(t, `<div class="notice">Halaman ini belum ada. <a href="${adminUrl('new') + '?title=' + encodeURIComponent(t)}">Buat halaman “${esc(t)}”</a> atau <a href="#/Khusus:Cari?q=${encodeURIComponent(t)}">cari “${esc(t)}”</a>.</div>`);
    }
    $('page-body').textContent = 'Memuat…';
    let md;
    try {
      const r = await fetch(fileOf(p), { cache: 'no-cache' });
      if (!r.ok) throw 0;
      md = await r.text();
    } catch (e) { return render(p.title, '<div class="notice">Gagal memuat halaman.</div>', { page: p }); }
    md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

    const html = buildHtml(md);
    const cats = p.categories.length ? '<b>Kategori:</b> ' + p.categories.map(catLink).join(' | ') : '';
    render(p.title, '', { page: p, cats, footer: 'Terakhir diubah pada ' + fmtDate(p.updated) + '.' });
    $('page-body').replaceChildren(html);
  }

  function wikify(md) {
    return md.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => {
      if (i % 2) return part;
      return part.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_, t, label) => {
        const ref = t.trim(), p = lookup(ref), sp = /^(Khusus|Kategori):/i.test(ref);
        const href = '#/' + encodeURIComponent(p ? p.slug : norm(ref));
        return `<a href="${href}"${p || sp ? '' : ' class="new" title="Halaman belum ada"'}>${esc((label || ref).trim())}</a>`;
      });
    }).join('');
  }

  function buildHtml(md) {
    const dirty = marked.parse(wikify(md), { gfm: true, breaks: false });
    const tpl = document.createElement('template');
    tpl.innerHTML = DOMPurify.sanitize(dirty);
    const root = tpl.content;
    const hs = [...root.querySelectorAll('h2,h3,h4')];
    const used = new Set();
    hs.forEach(h => {
      let id = norm(h.textContent) || 'bagian', n = 1, base = id;
      while (used.has(id)) id = base + '_' + ++n;
      used.add(id); h.id = 'b-' + id;
    });
    if (hs.length >= 3) {
      const toc = document.createElement('div'); toc.className = 'toc';
      let html = '', depth = 1;
      hs.forEach(h => {
        const d = +h.tagName[1] - 1; // 1..3
        while (depth < d) { html += '<ol>'; depth++; }
        while (depth > d) { html += '</ol>'; depth--; }
        html += `<li><a href="#" data-goto="${h.id}">${esc(h.textContent)}</a></li>`;
      });
      while (depth > 1) { html += '</ol>'; depth--; }
      toc.innerHTML = '<div class="toc-title">Daftar isi</div><ol>' + html + '</ol>';
      toc.addEventListener('click', e => {
        const a = e.target.closest('a[data-goto]'); if (!a) return;
        e.preventDefault(); document.getElementById(a.dataset.goto)?.scrollIntoView({ behavior: 'smooth' });
      });
      const firstH = hs[0];
      firstH.parentNode.insertBefore(toc, firstH);
    }
    return root;
  }

  function allPages() {
    // Hanya artikel; halaman sistem (Bantuan, dll.) tidak ditampilkan di sini
    const ps = idx.pages.filter(p => !p.system).sort((a, b) => a.title.localeCompare(b.title, 'id'));
    render('Semua halaman', `<p>${ps.length} halaman.</p><ul class="cols">${ps.map(p => `<li>${link(p)}</li>`).join('')}</ul>`, { special: true });
  }

  function categoryList() {
    const m = new Map();
    idx.pages.forEach(p => p.categories.forEach(c => m.set(c, (m.get(c) || 0) + 1)));
    const cs = [...m].sort((a, b) => a[0].localeCompare(b[0], 'id'));
    render('Daftar kategori', cs.length ? `<ul class="cols">${cs.map(([c, n]) => `<li>${catLink(c)} (${n})</li>`).join('')}</ul>` : '<p>Belum ada kategori.</p>', { special: true });
  }

  function categoryPage(arg) {
    const k = key(arg);
    const ps = idx.pages.filter(p => p.categories.some(c => key(c) === k)).sort((a, b) => a.title.localeCompare(b.title, 'id'));
    const t = 'Kategori:' + arg.replace(/_/g, ' ');
    render(t, ps.length ? `<p>${ps.length} halaman dalam kategori ini.</p><ul class="cols">${ps.map(p => `<li>${link(p)}</li>`).join('')}</ul>` : '<p>Tidak ada halaman dalam kategori ini.</p>', { special: true });
  }

  function recent() {
    const repo = detectRepo();
    const label = { A: 'Halaman baru', M: 'Disunting', D: 'Dihapus', R: 'Dipindah' };
    const row = (id, title, when, bodyHtml) => `
      <li>
        <button type="button" class="judpos" aria-expanded="false" aria-controls="${id}">
          <span>${title}</span><small>${when}</small>
        </button>
        <div class="acc-panel" id="${id}" hidden>${bodyHtml}</div>
      </li>`;
    let items;
    if (idx.changes && idx.changes.length) {
      items = idx.changes.slice(0, 100).map((c, i) => {
        const p = lookup(c.slug), name = p ? p.title : c.slug.replace(/_/g, ' ');
        const histPath = p ? fileOf(p) : `${cfg.contentDir}/${encodeURIComponent(c.slug)}.md`;
        const links = [
          p ? `<a href="#/${encodeURIComponent(p.slug)}">Buka halaman</a>` : '',
          repo ? `<a href="https://github.com/${repo}/commits/${cfg.branch}/${histPath}" target="_blank" rel="noopener">Riwayat</a>` : '',
          repo && c.hash ? `<a href="https://github.com/${repo}/commit/${c.hash}" target="_blank" rel="noopener">Lihat perubahan</a>` : ''
        ].filter(Boolean).join(' · ');
        return row('chg' + i, esc(name), esc(label[c.type] || c.type) + ' · ' + fmtDate(c.date), `
          <p><b>Oleh:</b> ${esc(c.author)}<br><b>Waktu:</b> ${fmtDate(c.date)}<br><b>Ringkasan:</b> <i>${esc(c.message)}</i></p>
          <p>${links}</p>`);
      });
    } else {
      items = [...idx.pages].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 50)
        .map((p, i) => row('chg' + i, esc(p.title), 'Diubah ' + fmtDate(p.updated),
          `<p>${esc(p.excerpt)}…</p><p><a href="#/${encodeURIComponent(p.slug)}">Buka halaman</a></p>`));
    }
    render('Perubahan terbaru', `<ul id="myUL" class="accordion">${items.join('')}</ul>`, { special: true });
    $('page-body').querySelector('.accordion').addEventListener('click', e => {
      const b = e.target.closest('.judpos'); if (!b) return;
      const open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', String(!open));
      b.classList.toggle('active', !open);
      document.getElementById(b.getAttribute('aria-controls')).hidden = open;
    });
  }

  function search(q) {
    $('search-input').value = q;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const res = idx.pages.map(p => {
      const t = p.title.toLowerCase(), x = p.text.toLowerCase(), c = p.categories.join(' ').toLowerCase();
      let s = 0;
      for (const w of terms) {
        if (t.includes(w)) s += 10; if (t === w) s += 10;
        if (c.includes(w)) s += 4;
        s += Math.min(x.split(w).length - 1, 10);
      }
      return { p, s };
    }).filter(r => r.s > 0 && terms.every(w => (r.p.title + ' ' + r.p.text + ' ' + r.p.categories.join(' ')).toLowerCase().includes(w)))
      .sort((a, b) => b.s - a.s);
    const exact = lookup(q);
    let html = exact ? `<p>Ada halaman berjudul “${link(exact)}”.</p>` : (q ? `<p>Tidak ada halaman berjudul “${esc(q)}”. <a href="${adminUrl('new') + '?title=' + encodeURIComponent(q)}">Buat halaman ini</a>.</p>` : '');
    html += res.length ? res.map(({ p }) => `<div class="result">${link(p)}<div class="snip">${esc(p.excerpt)}…</div></div>`).join('') : '<p>Tidak ada hasil.</p>';
    render('Hasil pencarian', html, { special: true });
  }

  init();
})();
