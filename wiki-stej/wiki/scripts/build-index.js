#!/usr/bin/env node
// Membuat index.json dari content/*.md (tanpa dependensi). Jalankan: node scripts/build-index.js
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'content');

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

const pages = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
  const slug = f.slice(0, -3);
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const { data, body } = parseFM(src);
  const text = plain(body);
  const cats = Array.isArray(data.categories) ? data.categories : (data.categories ? [data.categories] : []);
  let updated = git(['log', '-1', '--format=%cI', '--', 'content/' + f]).trim();
  if (!updated) updated = (data.date ? new Date(data.date) : fs.statSync(path.join(dir, f)).mtime).toISOString();
  pages.push({ slug, title: data.title || slug.replace(/_/g, ' '), categories: cats, excerpt: text.slice(0, 200), updated, text: text.slice(0, 20000) });
}

// Riwayat perubahan dari git log (bila tersedia)
const changes = [];
const log = git(['log', '-n', '200', '--name-status', '--format=@@%H|%an|%cI|%s', '--', 'content']);
for (const block of log.split('@@').slice(1)) {
  const [head, ...rest] = block.split('\n');
  const [hash, author, date, ...msg] = head.split('|');
  for (const l of rest) {
    const m = l.match(/^([AMDR]\d*)\t(?:.*\t)?content\/(.+)\.md$/);
    if (m) changes.push({ slug: m[2], type: m[1][0], author, date, message: msg.join('|'), hash });
  }
}
fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), pages, changes }, null, 1));
console.log(`index.json: ${pages.length} halaman, ${changes.length} perubahan`);
