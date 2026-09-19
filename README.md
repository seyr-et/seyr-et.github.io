# Seyr-et Et Lokantası — QR Menü

Restoranın masalarındaki QR kodun açtığı dijital menü. Statik site,
sunucu tarafında kod çalışmıyor; GitHub Pages yalnızca dosyaları sunuyor.

## Menü nasıl güncellenir

**Fiyat, ürün, açıklama, sıralama** → Google tablosundan. Bu depoya
dokunmaya gerek yok, değişiklik yarım dakikada menüye yansır.
Kullanım kılavuzu işletmeye ayrıca verildi.

**Tasarım, renk, kategori görseli** → buradaki dosyalardan.

## Veri akışı

1. `index.html` açılır, içine gömülü menüyü **anında** basar (ek istek yok)
2. `menu.js` arka planda Google tablosunun CSV'sini çeker
3. Başarılıysa menüyü canlı veriyle yeniden basar

Tabloya erişilemezse gömülü menü ekranda kalır — **menü asla boş açılmaz.**
Tablonun adresi `index.html` içindeki `window.MENU_KAYNAGI` satırında.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Sayfa + gömülü yedek menü + dil seçici |
| `style.css` | Tüm görünüm, tek dosya |
| `menu.js` | Menüyü basar, akordiyon, CSV okuma, dil değiştirme |
| `images/` | Logo, favicon, arka planlar, kategori başlık görselleri |
| `.github/yedek-tazele.php` | Gömülü yedeği tablodan tazeler |
| `.github/workflows/` | Yukarıdaki script'i her gün çalıştırır |
| `.nojekyll` | GitHub Pages'in dosyaları olduğu gibi sunmasını sağlar |

## Gömülü yedek

`index.html` içindeki `id="gomulu-menu"` bloğu **elle düzenlenmez.**
Her gün 06:00'da otomatik tazelenir (Actions sekmesinden elle de
çalıştırılabilir). Veri şüpheliyse script dosyaya hiç dokunmaz —
çalışan yedeği bozuk veriyle değiştirmek, tazelememekten kötüdür.

> GitHub, 60 gün hiç commit almayan depolarda zamanlanmış görevleri
> devre dışı bırakır. Menü aylarca hiç değişmezse görev durabilir;
> Actions sekmesinden yeniden etkinleştirilir.

## Yerel önizleme

```
php -S 127.0.0.1:8788 -t .
```
