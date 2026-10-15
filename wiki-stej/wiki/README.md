# Wiki (GitHub Pages + CMS)

Wiki bergaya MediaWiki: statis, gratis, di-hosting di GitHub Pages, disunting lewat CMS di `/admin`.

## Pasang (5 langkah)

1. Buat repositori GitHub, unggah semua isi folder ini ke branch `main`.
2. **Settings → Pages → Source: GitHub Actions.**
3. Edit `admin/config.yml`: ganti `repo: OWNER/REPO` dengan `username/nama-repo`.
4. (Opsional) Edit `config.json` untuk judul wiki.
5. Tunggu Action selesai → wiki di `https://username.github.io/nama-repo/`, CMS di `.../admin/`.

## Login CMS

Buka `/admin` → **Sign in with token** → masukkan [Personal Access Token](https://github.com/settings/personal-access-tokens/new) (fine-grained, repo ini, izin *Contents: Read and write*). Siapa pun yang punya akses tulis ke repo bisa menyunting; itu "sistem izin" wiki ini.

## Struktur

- `content/*.md` — halaman (front matter: `title`, `categories`)
- `index.json` — dibuat `scripts/build-index.js` (otomatis oleh Action)
- `assets/` — CSS & JS · `admin/` — CMS · `uploads/` — gambar

## Uji lokal

```
node scripts/build-index.js && python3 -m http.server 8000
```
