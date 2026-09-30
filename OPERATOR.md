# Zenze.fun — Operator handbook

Panduan lengkap untuk menjalankan, memakai, dan mempublikasikan Zenze.fun.
Produk publik berbahasa Inggris. File ini untuk operator.

Situs: https://zenze.fun  
X: [@ZenzeFun](https://x.com/ZenzeFun) — brand kit, bio, voice, daily quotas: [X-BRAND.md](./X-BRAND.md)  
Token list: https://zenze.fun/tokenlist.json

---

## 1. Apa ini

Zenze.fun adalah launchpad bonding-curve. Launch dan trade dari **wallet**, bukan akun email.

| Jaringan | Chain ID | Gas | Peran $ZNZF |
|---|---|---|---|
| Robinhood Chain | 4663 (`0x1237`) | ETH | **Canonical** — 1.000.000.000 minted sekali |
| Arc (Circle) | 5042 (`0x13b2`) | USDC native | **Bridged** — supply 0, mint 1:1 saat lock di Robinhood |

Jangan pernah deploy `ZenzeToken` (canonical mint) di chain kedua. Arc memakai `ZenzeBridgedToken` + `ZenzeForeignBridge`.

---

## 2. Fitur

### Publik (tanpa login)

- **Explore** — pool live, band Calm / Warm / Cold / Storm dari holder + likuiditas
- **Launch** — pilih chain (dropdown + logo) dan **trading pair** (dropdown + logo aset). Take dibayar on-chain bersama deploy.
- **List** — indeks token yang sudah ada on-chain. Take on-chain; referral 10%. Desk operator bisa indeks gratis.
- **Trade** — beli/jual di bonding curve setelah tanda tangan wallet
- **$ZNZF** — alokasi, stake, buyback, **Add $ZNZF** (EIP-747), contract canonical vs bridged
- **Capy Bridge** — lock di Robinhood, mint di Arc
- **Capy AI** — analisis pool on-demand
- **Analytics** — Dune (server-only)
- **Guide / Docs / Legal**
- **Token list** Uniswap-compatible di `/tokenlist.json`

### Wallet

- **Reown AppKit 1.8.24** (Ethers adapter) with the Zenze Cloud Project ID. Real Reown modal: WalletConnect QR + EIP-6963 injected + Coinbase. Email/social/swaps/onramp stay off. Default account type is EOA.
- Project ID is **public** (32 hex from [dashboard.reown.com](https://dashboard.reown.com)). Live id is set. Rotate it in desk Settings if needed.
- Logo chain: feather resmi Robinhood Chain (brand kit) dan arch resmi Arc (arc.io)

- `wallet_addEthereumChain` untuk Arc dan Robinhood
- `wallet_watchAsset` untuk $ZNZF

### Admin (hanya treasury wallet)

Masuk = tanda tangan dari treasury `0x4eA876ba2Fe3A565344cBb127B381402D636f413`.
Tokens, treasury/withdrawals, listings, marketing/X, AI DeepSeek V4.1 Flash, settings.

**Desk Settings** (`/arise/settings`):

- **Maintenance** — tutup situs publik; desk tetap bisa dibuka untuk mematikannya
- **Reown Project ID** — AppKit WalletConnect (sudah terpasang)
- **API keys** (masked): Pinata JWT + gateway, Dune, DeepSeek Flash, xAI, TwitterAPIs, X auth_token / ct0, X bearer, X handle
- Chain switches + contract addresses

Path publik: `/arise`. `/admin` dan `/login` memakai 404 custom Zenze (“This pool ran dry”) dengan HTTP 404 — bukan halaman nginx Ubuntu, bukan desk.

Nginx **tidak** boleh `error_page 404 /login` (itu yang memunculkan `nginx/1.24.0 (Ubuntu)`). Pakai named location `@zenze_404` + `proxy_intercept_errors off`. Crawler di-404 oleh app, bukan `return 404` di nginx — filter UA nginx memblokir desk untuk manusia.

Masuk desk = tanda tangan wallet treasury `0x4eA876ba2Fe3A565344cBb127B381402D636f413`. Session 12 jam di localStorage **dan** cookie httpOnly `zenze_desk`.

---

## 3. Cara memakai produk

### Connect

1. Pasang MetaMask / Rabby / Coinbase Wallet.
2. **Connect Wallet** → pilih wallet yang terpasang.
3. Pilih Robinhood atau Arc di dropdown jaringan (ada logo).

### Launch

1. `/launch`
2. Nama, ticker, deskripsi, **upload gambar** (dipotong 512×512).
3. Chain → Trading pair (cari NVDA, TSLA, ETH, USDG, …).
4. Kirim transaksi factory dari wallet. Creator tercatat dari signature.

Pair Robinhood: ETH, USDG, $ZNZF, PONS, + stock token issuer (NVDA, AAPL, TSLA, SPY, QQQ, SGOV, …).
Pair Arc: USDC, $ZNZF.

### List token luar

`/list` — paste contract, Capy baca name/ticker/supply on-chain, upload art, bayar listing fee.

### Trade

Buka pool → Buy/Sell. Wallet harus di chain yang sama. Token listed membuka explorer, bukan curve.

### Tambah $ZNZF ke wallet

`/$ZNZF` → **Add $ZNZF** (canonical Robinhood) atau **Add bridged $ZNZF** (Arc).
Atau import `https://zenze.fun/tokenlist.json` di Rabby / Uniswap / Rainbow.

### Bridge

`/bridge` — lock canonical di Robinhood, mint bridged di Arc. Bukan mint kedua.

### Admin

`/arise` — connect treasury. Tidak ada password. Jangan bagikan private key. Path `/admin` dan `/login` adalah 404 custom Zenze.

### Autonomous X (`/arise/marketing`)

Default **on**. Capy riset fakta live (launch, volume, fee 2%, graduation 2 ETH, $ZNZF), belajar dari engagement post sendiri, lalu post sebagai @ZenzeFun.

Prioritas: launch baru → reply pertanyaan mention → river $ZNZF (likes ≥ 4, 35%) → pulse $ZNZF / fakta protokol. Cadence 45 menit, cap 8 original/hari. Filter: wajib `$ZNZF`, dilarang moon/100x/kunci/dapur. Loop in-process di production + cron PM2 20 menit. Preview `npm run dev` **tidak** auto-tweet.

Pause dari switch di Marketing. **Run pulse now** menembus cadence.


---

## 4. Kontrak live

Treasury / deployer: `0x4eA876ba2Fe3A565344cBb127B381402D636f413`

Kontrak lama (`0x4BB3…F4d6`, curve `0x0DD4…385D`, Arc `0x53eF…CBc6`) tetap retired. Jangan dipakai.

### Robinhood (canonical) — v2.5.0

| | Address |
|---|---|
| $ZNZF | `0x65ee0ce656908544a1f29856ac9aee8563b5002c` |
| Fee vault | `0xeaeb7d39cd6d362e420609142c5cf8f05999bac6` |
| Bonding curve | `0xda1650faaec372925c9211e6625ba5d9a4397d57` |
| Buyback | `0x1f5287b157439db84aa7223bc5c42847e097e2fb` |
| Launch factory | belum. Gas tidak cukup. |
| Capy Bridge lock | belum |

### Arc (bridged)

| | Address |
|---|---|
| $ZNZF bridged | `0x65ee0ce656908544a1f29856ac9aee8563b5002c` |
| Fee vault | `0xeaeb7d39cd6d362e420609142c5cf8f05999bac6` |
| Launch factory | `0xda1650faaec372925c9211e6625ba5d9a4397d57` |
| Capy Bridge mint | `0x37c66bfd99fb9e86040b55b83681169d1a7b47bd` |

Supply 1e9 hanya di token Robinhood. Arc bridged totalSupply = 0 sampai ada lock. Swap $ZNZF tertutup sampai curve Robinhood terbit.

---

## 5. Pinata — IPFS untuk token art

**Live.** JWT server-only di `startup.sh` (`PINATA_JWT`, `PINATA_GATEWAY`). Jangan `VITE_`. Jangan tampilkan di halaman publik.

| Mode | Yang tersimpan |
|---|---|
| JWT set | Data URL di-pin ke IPFS **public** (v3 `/files`, fallback `pinFileToIPFS`). DB menyimpan URL gateway dedicated |
| Pin gagal | Data URL JPEG tetap disimpan — launch tidak gagal |
| Preset `/brand` | Path lokal, tidak di-pin ulang |

Gateway dedicated: `https://copper-cheerful-mite-422.mypinata.cloud` (restrict = hanya pin akun ini).

Brand $ZNZF sudah di-pin:
- PNG `bafkreic4zv47c7r5m35ow2p4l4xsgn6jwupm4mhur5dyuliihqohxlkys4`
- SVG `bafkreihj5prauop3q4a33lsvyaiwq6gxnsxdphvtb5h5pntxoy7mrd3y4y`

Admin → Settings menampilkan “Pinata is live”. Upload baru di-pin. Gambar lama (data URL / path) tetap valid.

Yang **diterima** sebagai token art: `/brand|tokens|quotes/*.(png|jpg|webp|svg)`, `data:image/(jpeg|png|webp)`, `ipfs://CID` (Qm / bafk / bafy / bafm), gateway Pinata / ipfs.io / cloudflare. HTTPS sembarangan **ditolak** (SSRF).

Yang **tidak** perlu: NFT.storage, Arweave, S3, Cloudinary.

---

## 6. Logo trading pair

Setiap quote memakai **logo resmi dari CoinGecko / CoinMarketCap**, disimpan di `/quotes/<ticker>.png`. Bukan geometri generate.

- ETH, USDC, USDG — CoinGecko large PNG
- PONS — CoinMarketCap id 40938
- BULL (Webull • Robinhood Token) — CoinGecko
- SGOV (iShares 0-3M Treasury • Robinhood Token) — CoinGecko
- Stock tokens — CoinMarketCap xStock / Ondo (logo emiten yang sama dipakai CG/CMC)

$ZNZF belum listed di CG/CMC. Mark-nya disc emas datar + Z krim, transparan di luar cakram — gaya USDC, bukan koin 3D.

Jangan jalankan generator SVG lama. `node scripts/write-quote-assets.mjs` hanya menulis `tokenlist.json`.

---

## 7. Keamanan (wajib)

1. **Putar private key treasury.** Kunci `0x2313…` pernah dipakai di chat. 1B $ZNZF masih di wallet itu. Buat wallet baru, transfer supply + ownership vault/factory/bridge, update `src/lib/onchain.json`.
2. Jangan commit `.env`, `PRIVATE_KEY`, `PINATA_JWT`, `DUNE_API_KEY`, `XAI_API_KEY`.
3. Admin = signature wallet deployer. Bukan email.
4. Gambar token hanya local / data / IPFS allowlist.
5. Publik tidak menampilkan “demo”, “Coming soon”, atau alamat deploy kitchen.

---

## 8. Deploy & ops

- App bind `0.0.0.0:8080` di belakang Nginx + Certbot (`infra/`).
- Setelah publish: salin `infra/nginx/zenze-fun.conf` ke `/etc/nginx/sites-available/zenze.fun`, lalu `nginx -t` dan reload. Tanpa ini, `/login` `/admin` masih halaman Ubuntu, bukan 404 Capy.
- Kontrak: Foundry `contracts/`. `scripts/deploy-protocol.mjs` **menolak** mint canonical di chain ≠ 4663.
- Verifikasi source di Blockscout (Robinhood) dan explorer.arc.io (Arc) — ini syarat DexScreener / Gecko / wallet trust.
- Domain produksi harus `https://zenze.fun` (canonical SEO + tokenlist logoURI).

---

## 9. Agar dapp muncul di wallet

Connect **sudah jalan** di setiap wallet EVM injected (EIP-6963 + add-chain).  
**Muncul di katalog** wallet (browser dapp, WalletGuide, “featured”) adalah proses listing terpisah.

### A. Reown Cloud / WalletConnect (wajib untuk QR + katalog)

1. https://dashboard.reown.com → New Project → type **App**.
2. Isi metadata:
   - Name: `Zenze.fun`
   - Description: Fair-launch token pools on Robinhood Chain and Arc.
   - Homepage / Web app: `https://zenze.fun`
   - Icon: `https://zenze.fun/brand/capy-mark-192.png`
   - Chains: EIP-155 4663 dan 5042 (kalau chain belum ada di WalletGuide, buka issue chain onboarding dulu: [WalletGuide chain register](https://docs.walletconnect.network/walletguide/chains/overview))
3. Allowlist origin: `https://zenze.fun`
4. Tab **Explorer** → Submit. Review 7–10 hari kerja. Setelah approve, Zenze muncul di WalletGuide.
5. Project ID sudah terpasang di desk. Rotate di Settings jika perlu.

Tanpa Project ID, modal injected tetap 100% benar.



### B. Token di dalam wallet (bukan dapp)

| Jalur | Cara |
|---|---|
| Satu tap | `$ZNZF` → Add $ZNZF (`wallet_watchAsset`) |
| Token list | Import `https://zenze.fun/tokenlist.json` (Uniswap list spec) |
| Trust Wallet assets | PR ke `trustwallet/assets` setelah volume |
| CoinGecko / CMC | Setelah pair DEX + volume; form GeckoTerminal token info |

### C. Wallet dapp browser (in-app)

Setelah WalletGuide approve, MetaMask Portfolio / Rainbow / Rabby / Phantom EVM menarik dapp dari Explorer API. Beberapa punya list sendiri:

- Rabby dapp list (GitHub PR)
- MetaMask dapp directory
- Phantom / OKX / Coinbase Wallet — form mitra, biasanya butuh WalletConnect listing dulu

Metadata sudah di:

- `/manifest.webmanifest`
- `/.well-known/dapp.json`
- `eip155:4663` + `eip155:5042`

### D. Add network otomatis

`wallet_addEthereumChain` sudah dipasang. User tidak perlu Chainlist, tapi submit tetap bagus:

- https://chainlist.org (PR ke `ethereum-lists/chains`)
- https://github.com/ethereum-lists/chains

Params resmi:

```
Robinhood: 4663, ETH, https://rpc.mainnet.chain.robinhood.com, https://robinhoodchain.blockscout.com
Arc: 5042, USDC, https://rpc.mainnet.arc.io, https://explorer.arc.io
```

---

## 10. Dipublikasikan oleh Arc dan Robinhood Chain

Tidak ada tombol “publish me” resmi dari Circle atau Robinhood. Listing = observasi on-chain + direktori ekosistem + outreach.

### Robinhood Chain

| Venue | Cara | Biaya |
|---|---|---|
| [robindapps.com](https://robindapps.com) | Mereka meranking dapp dari on-chain TVL. **Tidak ada paid listing.** Deploy factory, ada volume/TVL, mereka menarik sendiri. Kirim URL + contract jika perlu dikoreksi. | Gratis |
| [ruginhood.com](https://ruginhood.com) | Scanner. Token muncul otomatis saat pool Uniswap/curve terlihat. | Gratis |
| Splitshot | Listing otomatis jika pool ≥ $100 TVL | Gratis |
| Blockscout | Verify source $ZNZF, factory, vault, bridge | Gratis |
| Uniswap UI | Import token list Zenze; pool graduation ke Uniswap v3/v4 | — |
| DexScreener | Chain sudah ramai; token muncul setelah pair DEX. Chain listing baru: Discord mereka | Gratis |
| Hoodies / NFT dirs | Tidak relevan kecuali NFT | — |

Outreach: posting @ZenzeFun, tag komunitas RH, pastikan explorer verified.

### Arc (Circle)

| Venue | Cara | Biaya |
|---|---|---|
| [builtonarc.app](https://builtonarc.app/submit) | Direktori independen (bukan Circle). Listing $249 (founding $149 s/d 16 Oct 2026). Featured $999/30 hari. Bayar USDC. Bukan endorsement Circle. | Berbayar |
| [docs.arc.io](https://docs.arc.io/build) | Sample apps / ecosystem — kirim ke Circle via Arc House | Gratis, review |
| [community.arc.io](https://community.arc.io) Architects | Program kontributor Circle. “Verified Arc Builder” (poin) sedang dirancang. Onboarding + ID verify. | Gratis |
| X [@arc](https://x.com/arc) / Arc House | Thread launch + contract verified + video demo | Gratis |
| growthepie / L2beat-style trackers | Setelah TVL terukur | — |

Circle **tidak** menjual slot “official Arc dapp”. Yang terdekat: Architects + docs sample apps + observed-on-chain di Built on Arc.

### Aggregator pasar (setelah ada pair DEX)

1. Verifikasi kontrak di explorer.
2. Seed likuiditas (USDG atau ETH di RH; USDC di Arc).
3. DexScreener — auto jika DEX sudah diindeks.
4. GeckoTerminal — [update token info](https://www.geckoterminal.com/update-token-info) (berbayar, cepat) atau antrean gratis.
5. CoinGecko / CoinMarketCap — butuh volume + website + explorer + social. GT Express Listing menjanjikan CG ikut.

---

## 11. Checklist go-live (centang sampai 100)

### Produk (sudah)

- [x] Canonical 1B hanya di Robinhood; Arc bridged 0 supply
- [x] Launch/list/trade dari wallet
- [x] Pair dropdown + mark aset
- [x] Chain dropdown + logo
- [x] Header/footer: Capy + wordmark, tanpa koin dobel
- [x] $ZNZF mark emas geometris
- [x] Connect modal EIP-6963
- [x] Add $ZNZF (`wallet_watchAsset`)
- [x] `/tokenlist.json`
- [x] `/manifest.webmanifest` + `/.well-known/dapp.json`
- [x] Token art allowlist; Pinata opsional
- [x] Tidak ada dummy/demo di halaman publik

### Operator (anda yang kerjakan)

- [ ] **Putar kunci treasury** dan pindahkan 1B
- [ ] Domain HTTPS `zenze.fun` mengarah ke app
- [ ] Verify source di Blockscout + Arc explorer
- [ ] `PINATA_JWT` jika ingin IPFS
- [ ] Reown Cloud project + submit WalletGuide
- [ ] PR `ethereum-lists/chains` (kalau belum)
- [ ] Kirim ke robindapps / Built on Arc
- [ ] Arc House Architects + thread @ZenzeFun
- [ ] Setelah pool DEX: DexScreener / GeckoTerminal / CG

---

## 12. Audit end-to-end

| Area | Status | Catatan |
|---|---|---|
| Supply $ZNZF | OK | 1B RH, 0 Arc, deploy script menolak dual-mint |
| Wallet UX | OK | AppKit + Reown Project ID live; WC QR + injected |
| Pair logos | OK | Mark geometri + `/quotes/*.png` |
| Token art | OK | Data URL cukup; Pinata live |
| Token list | OK | Uniswap schema, checksum via viem |
| Add to wallet | OK | EIP-747 di `/znzf` |
| Admin desk `/arise` | OK | Wallet treasury, session 12 jam (localStorage + cookie httpOnly). Crawler → 404 branded. |
| 404 `/login` `/admin` | OK | Custom “This pool ran dry” + HTTP 404, noindex. Nginx `@zenze_404`, jangan intercept. |
| Capy vision | OK | DeepSeek V4.1 Flash melihat token art dari desk Tokens |
| Capy AI | OK | DeepSeek V4.1 Flash (`deepseek-flash`), xAI fallback |
| Marketing / X | OK | TwitterAPIs + X cookies; autonomous pulse (facts only, $ZNZF required) |
| Publik copy | OK | Canonical vs bridged, tanpa kitchen leak |
| SEO / PWA | OK | sitemap, robots, manifest, json-ld |
| Listing wallet | Siap | Metadata ada; submit Reown Explorer masih tindakan manusia |
| Listing chain | Siap | Kontrak live; TVL/verify/direktori = operator |
| Secret di repo | Hati-hati | Keys di startup server; rotate X cookies jika chat terekspos |
| Risiko sisa | **Kunci treasury pernah terekspos di chat** | Putar sekarang |

Pinata, Reown, DeepSeek Flash, dan TwitterAPIs **sudah terpasang**. Rotate di desk Settings.

---

## 13. Env yang boleh ada

Server only:

```
DATABASE_URL
PINATA_JWT
PINATA_GATEWAY
DUNE_API_KEY
XAI_API_KEY
DEEPSEEK_API_KEY
TWITTERAPIS_KEY
X_AUTH_TOKEN
X_CT0
X_HANDLE
X_AUTO_ON
X_AUTO_MINUTES
X_PULSE_SECRET
REOWN_PROJECT_ID
```

Browser:

```
VITE_REOWN_PROJECT_ID
```

Jangan pernah:

```
PRIVATE_KEY
VITE_PINATA_JWT
VITE_DUNE_API_KEY
VITE_DEEPSEEK_API_KEY
VITE_TWITTERAPIS_KEY
VITE_X_AUTH_TOKEN
```
