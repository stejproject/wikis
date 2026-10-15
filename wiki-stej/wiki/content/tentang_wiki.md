---
title: Tentang Wiki
categories:
  - Wiki
---
## Arsitektur

Wiki ini statis: semua halaman adalah berkas Markdown di folder `content/`. Browser memuat `index.json` (dibuat otomatis oleh GitHub Action) lalu menampilkan halaman, pencarian, kategori, dan perubahan terbaru.

## Penyuntingan

CMS memakai Sveltia CMS yang menulis langsung ke repositori GitHub. Riwayat halaman adalah riwayat commit Git.

## Batasan

Dibanding MediaWiki asli: tidak ada templat, pengguna/izin bawaan (izin = akses tulis repo GitHub), atau halaman pembicaraan.
