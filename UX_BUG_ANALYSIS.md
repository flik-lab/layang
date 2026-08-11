# Layang UX Implementation Report

## Scope

Perubahan ini menyelesaikan masukan UX pada Docs, selected/running state, gRPC Mock controls, halaman awal Git, dan Response viewer. Koreksi terakhir mengembalikan authoring Docs ke satu editor Markdown besar dengan automatic marker yang granular.

## 1. Docs: satu editor dengan marker per blok

Docs tidak lagi memakai form section terpisah. Setiap halaman memiliki satu editor Markdown besar sehingga user bebas:

- menulis struktur dan heading sendiri;
- memindahkan generated content dengan cut/paste biasa;
- mengganti judul section tanpa konfigurasi tambahan;
- menyisipkan teks manual sebelum atau sesudah generated content;
- menghapus generated block cukup dengan menghapus markernya.

Marker otomatis yang tersedia:

- `{{LAYANG_OVERVIEW_INDEX}}`;
- `{{LAYANG_PROTO_REFERENCE}}`;
- `{{LAYANG_ENDPOINT_REFERENCE}}`;
- `{{LAYANG_CONNECTION_REFERENCE}}`;
- `{{LAYANG_REQUEST_EXAMPLE}}`;
- `{{LAYANG_RESPONSE_EXAMPLE}}`;
- `{{LAYANG_ERRORS}}`;
- `{{LAYANG_MOCK_SCENARIOS}}`;
- `{{LAYANG_CODE_SAMPLES}}`;
- `{{LAYANG_RELATED_OPERATIONS}}`.

Marker hanya menghasilkan isi blok. Heading di atas marker tetap Markdown biasa dan bebas diubah. Contoh:

```md
## Schema yang Digunakan

Catatan manual sebelum proto.

{{LAYANG_PROTO_REFERENCE}}

Catatan manual setelah proto.
```

Untuk gRPC, `{{LAYANG_PROTO_REFERENCE}}` tetap sederhana: isi lengkap proto file yang dipin. Layang tidak memaksakan tabel field sebagai template utama.

Editor memiliki pemilih **Automatic content** dan tombol **Insert**. Marker dimasukkan pada posisi cursor. Jika marker sudah ada, tombol tersebut memilih marker yang ada agar tidak menggandakan blok secara tidak sengaja.

Format section dari versi sebelumnya tetap dibaca dan otomatis dimigrasikan menjadi satu Markdown document dengan marker yang setara. `{{LAYANG_AUTO_REFERENCE}}` juga tetap didukung sebagai marker kompatibilitas lama.

## 2. Selected, open, running, error, dan focus state

State visual dipisahkan:

- **Open tab:** dot biru hollow;
- **Running:** dot hijau solid dengan ring;
- **Error:** dot merah solid dengan ring;
- **Selected:** background dan border biru lembut;
- **Focus:** focus ring aksesibilitas;
- **Hover:** surface hover tanpa mengubah status runtime.

Selected tab dan row tidak menggunakan teks bold. Border hitam keras diganti border slate transparan atau primary lembut.

## 3. Checkbox dan Switch

- Checkbox menjadi 18×18 px.
- Switch menjadi 44×24 px.
- Thumb switch menggunakan warna putih agar tidak terlihat seperti dot hitam.
- Hit target Active dan Loop pada row scenario diperbesar.
- Kolom scenario, type, active, loop, dan actions diseimbangkan ulang.

## 4. Git initial state

Halaman awal Source Control menggunakan lebar desktop yang proporsional dan dua card seimbang:

- **Initialize current workspace**;
- **Clone Git Repository**.

Card clone tidak kehilangan border/padding saat tampil dalam mode compact. CTA, helper text, field spacing, dan footer action dirapikan.

## 5. Response viewer

Tombol tekstual **Stack** dan **Side** di toolbar Response dihapus. Sebagai pengganti tersedia **Full screen**.

Full-screen response:

- menggunakan response viewer yang sama, termasuk Body/Messages, Headers/Metadata, Trailers, Tests, search, copy, export, dan Docs action;
- dapat ditutup dari tombol **Exit full screen**;
- dapat ditutup dengan tombol `Escape`;
- dapat ditutup dengan klik backdrop;
- otomatis ditutup ketika user meninggalkan request workspace.

## Validasi

- `node --check` berhasil untuk `docs-core.mjs` dan `cli-docs-authoring.cjs`.
- Seluruh Node regression suite: **72 passed, 0 failed**.
- Test mencakup granular marker, urutan bebas, custom heading, migrasi section lama, proto-only reference, selected/running state, ukuran control, layout Git, dan Response full screen.
- Typecheck/build frontend penuh belum dapat divalidasi karena arsip tidak menyertakan `node_modules`. Percobaan `tsc --noEmit` berhenti pada dependency React/Next/protobuf yang tidak tersedia, bukan pada hasil unit regression.
