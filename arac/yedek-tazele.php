<?php
/**
 * Gömülü yedek menüyü Google Sheets'ten tazeler.
 *
 *   C:/xampp/php/php.exe yedek-tazele.php
 *
 * NEDEN VAR
 * ---------
 * Sayfa açılırken önce içine gömülü menüyü basar (anında, istek yok),
 * sonra Sheets'i çekip başarılıysa yeniden basar. Sheets'e erişilemezse
 * gömülü menü ekranda kalır — menü asla boş açılmaz.
 *
 * Ama o gömülü yedek `yayin-uret.php` tarafından YEREL VERİTABANINDAN
 * üretiliyordu. Sheets kaynak haline gelince veritabanı güncellenmiyor,
 * yedek donuyor. Sheets'in erişilemediği bir anda müşteriye aylar önceki
 * fiyat gösterilir. Bu script o boşluğu kapatır: yedeği doğrudan canlı
 * tablodan tazeler, veritabanına hiç ihtiyaç duymaz.
 *
 * yayin-uret.php'den farkı: o ilk kurulum aracı (veritabanı + görsel
 * kopyalama), bu ise tekrar tekrar çalışacak bakım aracı. Ayrı durmaları
 * bilinçli — bu script ileride zamanlanmış görev olarak da çalışabilir.
 *
 * GÜVENLİK KURALI
 * ---------------
 * Çekilen veri şüpheliyse dosyaya HİÇ dokunulmaz. Elimizdeki çalışan
 * yedeği bozuk veriyle değiştirmek, yedeği hiç tazelememekten kötüdür.
 */

// Değişim bu oranı aşarsa onay istenir (0.30 = %30). --zorla ile geçilir.
const SAPMA_SINIRI = 0.30;

$zorla = in_array('--zorla', $argv, true);

// index.html yolu argüman olarak verilebilir. Verilmezse bu projedeki
// yayin/index.html kullanılır.
//
// Neden argüman: GitHub Pages kullanıcı sitesinde depo kökü = sitenin
// kökü, yani orada index.html kökte duracak. Aynı script iki yerleşimde
// de çalışsın diye yol sabit değil.
//   yerel  : php yedek-tazele.php
//   depoda : php yedek-tazele.php index.html
$serbest   = array_values(array_filter(array_slice($argv, 1), fn($a) => !str_starts_with($a, '--')));
$indexYolu = $serbest[0] ?? (__DIR__ . '/yayin/index.html');

// --- 1. index.html'i oku, kaynak adresini ve mevcut yedeği çıkar ------
if (!is_file($indexYolu)) {
    cik("index.html bulunamadi: $indexYolu");
}
$html = file_get_contents($indexYolu);

if (!preg_match('/window\.MENU_KAYNAGI\s*=\s*"([^"]+)"/', $html, $m)) {
    cik("index.html icinde MENU_KAYNAGI adresi bulunamadi.\n" .
        "Sheets henuz baglanmamis olabilir.");
}
$kaynakAdres = $m[1];

// Kategori gorselleri tabloda yok; mevcut gomulu veriden tasinir.
$mevcut = null;
if (preg_match('#<script type="application/json" id="gomulu-menu">(.*?)</script>#s', $html, $g)) {
    $mevcut = json_decode($g[1], true);
}
if (!$mevcut || empty($mevcut['kategoriler'])) {
    cik("index.html icindeki mevcut gomulu menu okunamadi.\n" .
        "Once yayin-uret.php ile bir kez uretilmis olmasi gerekiyor.");
}

$gorselHaritasi = [];
foreach ($mevcut['kategoriler'] as $k) {
    $gorselHaritasi[$k['ad']] = $k['gorsel'] ?? null;
}
$eskiUrunSayisi = array_sum(array_map(fn($k) => count($k['urunler']), $mevcut['kategoriler']));

// --- 2. CSV'yi cek ----------------------------------------------------
echo "kaynak      : " . mb_strimwidth($kaynakAdres, 0, 70, '...') . "\n";

$ch = curl_init($kaynakAdres);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,   // pub -> googleusercontent yonlendirmesi
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_USERAGENT      => 'seyret-yedek-tazele',
]);
$csv  = curl_exec($ch);
$kod  = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$hata = curl_error($ch);
curl_close($ch);

if ($csv === false || $hata !== '') { cik("Baglanti hatasi: $hata"); }
if ($kod !== 200)                   { cik("Sunucu $kod dondu. Tablo hala 'Web'de yayinla' ile acik mi?"); }
if (trim($csv) === '')              { cik("Bos cevap geldi."); }

// Google hata sayfasi dondurduyse CSV sanip ayristirmayalim
if (stripos(ltrim($csv), '<!DOCTYPE') === 0 || stripos(ltrim($csv), '<html') === 0) {
    cik("CSV yerine HTML geldi. Yayin adresi 'output=csv' ile bitiyor mu?");
}

// --- 3. Ayristir ------------------------------------------------------
// fgetcsv kullaniliyor: aciklamalarda hucre ici satir basi var
// (Seyr-et Kirmizi Yelpaze), satir satir bolmek onlari kirardi.
$akis = fopen('php://temp', 'r+');
fwrite($akis, $csv);
rewind($akis);

$satirlar = [];
while (($s = fgetcsv($akis, 0, ',', '"')) !== false) {
    $satirlar[] = $s;
}
fclose($akis);

if (count($satirlar) < 2) { cik("Tabloda veri satiri yok."); }

// Baslik eslestirme — menu.js ile ayni mantik, ayni toleranslar
$baslik = array_map(
    fn($h) => mb_strtolower(trim((string) $h), 'UTF-8'),
    $satirlar[0]
);
$bul = function (array $adaylar) use ($baslik) {
    foreach ($adaylar as $a) {
        $i = array_search($a, $baslik, true);
        if ($i !== false) { return $i; }
    }
    return -1;
};
$iKat   = $bul(['kategori']);
$iUrun  = $bul(['ürün', 'urun']);
$iAck   = $bul(['açıklama', 'aciklama']);
$iFiyat = $bul(['fiyat']);
$iGizle = $bul(['gizle']);

if ($iKat < 0 || $iUrun < 0 || $iFiyat < 0) {
    cik("Baslik satirinda Kategori / Urun / Fiyat sutunlari bulunamadi.\n" .
        "Gelen baslik: " . implode(' | ', $satirlar[0]));
}

$sira = [];
$harita = [];
for ($r = 1; $r < count($satirlar); $r++) {
    $s   = $satirlar[$r];
    $kat = trim((string) ($s[$iKat]  ?? ''));
    $ad  = trim((string) ($s[$iUrun] ?? ''));
    if ($kat === '' || $ad === '') { continue; }
    // Gizle sutununda bir sey varsa urun basilmaz — menu.js ile ayni
    if ($iGizle >= 0 && trim((string) ($s[$iGizle] ?? '')) !== '') { continue; }

    if (!isset($harita[$kat])) {
        $harita[$kat] = [
            'ad'      => $kat,
            'gorsel'  => $gorselHaritasi[$kat] ?? null,
            'urunler' => [],
        ];
        $sira[] = $kat;
    }
    $harita[$kat]['urunler'][] = [
        'ad'       => $ad,
        'aciklama' => $iAck >= 0 ? (string) ($s[$iAck] ?? '') : '',
        'fiyat'    => trim((string) ($s[$iFiyat] ?? '')),
    ];
}

if (!$sira) { cik("Hicbir gecerli urun satiri okunamadi."); }

$kategoriler   = array_map(fn($k) => $harita[$k], $sira);
$yeniUrunSayisi = array_sum(array_map(fn($k) => count($k['urunler']), $kategoriler));

// --- 4. Akil saglama kontrolu ----------------------------------------
$gorselsiz = array_filter($kategoriler, fn($k) => $k['gorsel'] === null);
foreach ($gorselsiz as $k) {
    echo "UYARI       : '{$k['ad']}' kategorisinin gorseli yok ";
    echo "(tabloda adi degistirilmis ya da yeni eklenmis olabilir)\n";
}

$sapma = $eskiUrunSayisi > 0 ? abs($yeniUrunSayisi - $eskiUrunSayisi) / $eskiUrunSayisi : 0;
if ($sapma > SAPMA_SINIRI && !$zorla) {
    cik(sprintf(
        "Urun sayisi %d -> %d (%%%.0f degisim). Bu beklenenden buyuk bir fark.\n" .
        "Tablo yanlislikla bozulduysa calisan yedegi bozuk veriyle degistirmeyelim.\n" .
        "Degisim kasitliysa: php yedek-tazele.php --zorla",
        $eskiUrunSayisi, $yeniUrunSayisi, $sapma * 100
    ));
}

// --- 5. Yaz ----------------------------------------------------------
$veri = ['guncelleme' => date('Y-m-d'), 'kategoriler' => $kategoriler];
$json = json_encode($veri, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG);

$yeniBlok = '<script type="application/json" id="gomulu-menu">' . $json . '</script>';
$yeni = preg_replace(
    '#<script type="application/json" id="gomulu-menu">.*?</script>#s',
    str_replace(['\\', '$'], ['\\\\', '\\$'], $yeniBlok),  // $ ve \ kacislari bozulmasin
    $html,
    1,
    $sayi
);
if ($sayi !== 1) { cik("index.html icinde gomulu menu blogu bulunamadi."); }

if ($yeni === $html) {
    echo "sonuc       : degisiklik yok, yedek zaten guncel\n";
    exit(0);
}

file_put_contents($indexYolu, $yeni);
printf("sonuc       : yedek tazelendi — %d kategori, %d urun (onceki: %d urun)\n",
    count($kategoriler), $yeniUrunSayisi, $eskiUrunSayisi);

function cik(string $mesaj): void {
    fwrite(STDERR, "HATA: $mesaj\n");
    fwrite(STDERR, "index.html'e dokunulmadi, mevcut yedek korundu.\n");
    exit(1);
}
