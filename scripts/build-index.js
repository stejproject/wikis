#!/usr/bin/env node
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'content');
const SUBDIRS = ['system', 'articles']; // system = halaman wiki (Bantuan, dll.), articles = isi artikel
const OUT = path.join(root, 'index.json');

function unq(v) {
  v = v.trim();
  if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))
    v = v.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'");
  return v;
}
function parseFM(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {}; let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    let t;
    if ((t = line.match(/^\s+-\s+(.*)$/)) && key) { (data[key] = data[key] || []).push(unq(t[1])); continue; }
    if ((t = line.match(/^([\w-]+):\s*(.*)$/))) {
      key = t[1]; const v = t[2].trim();
      if (v === '') data[key] = [];
      else if (v[0] === '[') data[key] = v.slice(1, -1).split(',').map(unq).filter(Boolean);
      else data[key] = unq(v);
    }
  }
  return { data, body: m[2] };
}
function plain(md) {
  return md.replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~|-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function git(args) {
  try { return cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return ''; }
}
function fail(msg) { console.error('GAGAL: ' + msg); process.exit(1); }

// Jumlah artikel pada index.json lama (untuk mendeteksi penurunan mendadak)
let prevArticles = 0;
try {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  prevArticles = (prev.pages || []).filter(p => !p.system).length;
} catch (e) { /* belum ada / rusak: abaikan */ }

const pages = [], seen = new Set();
for (const sub of SUBDIRS) {
  const d = path.join(dir, sub);
  // Dulu: dilewati diam-diam. Sekarang: gagal supaya index.json yang rusak tidak ter-deploy.
  if (!fs.existsSync(d)) fail(`folder tidak ditemukan: content/${sub} (dicari di ${d})`);

  const entries = fs.readdirSync(d, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) console.warn(`PERINGATAN subfolder diabaikan (tidak rekursif): content/${sub}/${e.name}`);
    else if (e.isFile() && !/\.md$/i.test(e.name) && !e.name.startsWith('.'))
      console.warn(`PERINGATAN file bukan .md diabaikan: content/${sub}/${e.name}`);
  }

  // Ekstensi tidak peka huruf besar-kecil (.md, .MD, .Md)
  const files = entries.filter(e => e.isFile() && /\.md$/i.test(e.name)).map(e => e.name).sort();
  for (const f of files) {
    const slug = f.slice(0, -3);
    if (seen.has(slug.toLowerCase())) console.warn('PERINGATAN slug ganda (halaman sistem didahulukan):', `${sub}/${f}`);
    seen.add(slug.toLowerCase());
    const file = path.join(d, f);
    const { data, body } = parseFM(fs.readFileSync(file, 'utf8'));
    const text = plain(body);
    const cats = Array.isArray(data.categories) ? data.categories : (data.categories ? [data.categories] : []);
    // --follow + --diff-filter=AM: commit pemindahan folder tidak dihitung sebagai "diubah"
    let updated = git(['log', '-1', '--follow', '--diff-filter=AM', '--format=%cI', '--', `content/${sub}/${f}`]).trim();
    if (!updated) updated = (data.date ? new Date(data.date) : fs.statSync(file).mtime).toISOString();
    pages.push({
      slug, dir: sub, system: sub === 'system',
      title: data.title || slug.replace(/_/g, ' '),
      categories: cats, excerpt: text.slice(0, 200), updated, text: text.slice(0, 20000)
    });
  }
}

const articleCount = pages.filter(p => !p.system).length;
if (articleCount === 0) fail('tidak ada artikel di content/articles. Periksa nama folder, ekstensi .md, dan apakah file sudah ter-commit/ter-checkout.');
if (prevArticles > 0 && articleCount < prevArticles * 0.5)
  fail(`jumlah artikel turun drastis (${prevArticles} -> ${articleCount}). Periksa apakah ada file yang hilang. Hapus index.json lama untuk memaksa build jika memang disengaja.`);

const changes = [];
const log = git(['log', '-n', '200', '--name-status', '--format=@@%H|%an|%cI|%s', '--', 'content']);
for (const block of log.split('@@').slice(1)) {
  const [head, ...rest] = block.split('\n');
  const [hash, author, date, ...msg] = head.split('|');
  for (const l of rest) {
    const m = l.match(/^([AMDR]\d*)\t(?:.*\t)?content\/(?:system\/|articles\/)?([^/]+)\.md$/i);
    if (m && m[1] !== 'R100') changes.push({ slug: m[2], type: m[1][0], author, date, message: msg.join('|'), hash });
  }
}

// Hanya halaman di content/articles/ yang ditampilkan (halaman sistem seperti Bantuan tidak ikut),
// dan tiap halaman cukup satu baris (suntingan terbarunya) supaya satu halaman tidak memenuhi daftar.
const articleSlugs = new Set(pages.filter(p => !p.system).map(p => p.slug.toLowerCase()));
const seenSlug = new Set();
const shown = changes.filter(c => {
  const k = c.slug.toLowerCase();
  if (c.type === 'D' || !articleSlugs.has(k)) return false;
  if (seenSlug.has(k)) return false;
  seenSlug.add(k);
  return true;
});

fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), pages, changes: shown }, null, 1));
console.log(`index.json: ${pages.length} halaman (${articleCount} artikel), ${shown.length} perubahan`);
