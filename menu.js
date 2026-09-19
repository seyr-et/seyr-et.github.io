/* =====================================================================
   Seyr-et QR Menü — statik sürüm

   Veri akışı: sayfa açılınca yer tutucu basılır ve Google Sheets'ten
   güncel menü çekilir. Fiyat ekrana YALNIZCA BİR KEZ, doğru haliyle
   gelir. Tabloya 4 saniyede ulaşılamazsa sayfaya gömülü yedek menü
   basılır — menü asla boş açılmaz.

   Gömülü yedek neden açılışta basılmıyor: önceden basılıyordu ve tablo
   gelince üzerine yazılıyordu. Fiyat değiştikten sonraki ilk gün bu,
   eski fiyatın ~1 saniye ekranda kalması demekti. Menüde yanlış fiyat
   yarım saniye bile görünmemeli.
   ===================================================================== */
(function () {
    "use strict";

    var SAYFA_DILI = "tr";

    // -----------------------------------------------------------------
    // Yardimcilar
    // -----------------------------------------------------------------
    function kacis(metin) {
        return String(metin == null ? "" : metin)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // Google Çeviri "Seyr-et"i fiil sanıp çeviriyor ("Watch Breakfast").
    // Ardındaki boşluk da koruma içine alınıyor, yoksa çeviri sonrası
    // kelimeler bitişik çıkıyor.
    function markaKoru(guvenliMetin) {
        return guvenliMetin.replace(/Seyr-et(\s)?/g, function (t, bosluk) {
            var b = bosluk ? "&nbsp;" : "";
            return '<span class="notranslate" translate="no">Seyr-et' + b + "</span>";
        });
    }

    function satirSonu(guvenliMetin) {
        return guvenliMetin.replace(/\r?\n/g, "<br>");
    }

    // -----------------------------------------------------------------
    // Menuyu bas
    // -----------------------------------------------------------------
    function menuyuBas(veri) {
        var kap = document.getElementById("menu");
        if (!kap || !veri || !veri.kategoriler) { return; }
        kap.removeAttribute("aria-busy");

        // Acik olan kategoriyi hatirla ki yeniden basinca kapanmasin
        var acikOlan = null;
        var mevcut = kap.querySelector(".kategori--acik .kategori__baslik");
        if (mevcut) { acikOlan = mevcut.getAttribute("data-ad"); }

        var html = "";
        veri.kategoriler.forEach(function (kat, i) {
            if (!kat.urunler || !kat.urunler.length) { return; }

            var adGuvenli = kacis(kat.ad);
            var acik = acikOlan ? (kat.ad === acikOlan) : (i === 0);
            var arka = kat.gorsel
                ? "background-image:linear-gradient(to top, rgba(10,9,8,0.88) 0%, rgba(10,9,8,0.42) 58%, rgba(10,9,8,0.28) 100%), url(" + encodeURI(kat.gorsel) + ");"
                : "";

            html += '<section class="kategori' + (acik ? " kategori--acik" : "") + '">';
            html += '<button type="button" class="kategori__baslik" data-ad="' + adGuvenli +
                    '" aria-expanded="' + (acik ? "true" : "false") + '" style="' + arka + '">';
            html += "<span>" + markaKoru(adGuvenli) + "</span>";
            html += '<span class="kategori__ok" aria-hidden="true"></span>';
            html += "</button>";
            html += '<div class="kategori__govde">';

            kat.urunler.forEach(function (u) {
                var ad = markaKoru(kacis(u.ad));
                var fiyat = kacis(u.fiyat);
                html += '<div class="urun">';
                html += '<div class="urun__ust">';
                html += '<span class="urun__ad">' + ad + "</span>";
                html += '<span class="urun__fiyat notranslate" translate="no">' + fiyat + "</span>";
                html += "</div>";
                if (u.aciklama && String(u.aciklama).trim() !== "") {
                    html += '<div class="urun__aciklama">' +
                            satirSonu(markaKoru(kacis(u.aciklama))) + "</div>";
                }
                html += "</div>";
            });

            html += "</div></section>";
        });

        kap.innerHTML = html;
    }

    // Akordiyon — tek dinleyici, kap uzerinde
    document.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest(".kategori__baslik") : null;
        if (!btn) { return; }
        var bolum = btn.parentNode;
        var acilacak = !bolum.classList.contains("kategori--acik");

        document.querySelectorAll(".kategori--acik").forEach(function (a) {
            a.classList.remove("kategori--acik");
            a.querySelector(".kategori__baslik").setAttribute("aria-expanded", "false");
        });
        if (acilacak) {
            bolum.classList.add("kategori--acik");
            btn.setAttribute("aria-expanded", "true");
            // Acilan baslik ekranin ustunde kalsin
            var ust = bolum.getBoundingClientRect().top + window.scrollY - 80;
            window.scrollTo({ top: ust, behavior: "smooth" });
        }
    });

    // -----------------------------------------------------------------
    // Yukleniyor yer tutucusu
    // -----------------------------------------------------------------
    // Tablo gelene kadar basilir. Bilerek fiyat/ad icermiyor — amac zaten
    // eski bir fiyatin goz onune gelmesini engellemek.
    function iskeletBas(adet) {
        var kap = document.getElementById("menu");
        if (!kap) { return; }
        var n = Math.min(Math.max(adet || 6, 3), 8);
        var html = "";
        for (var i = 0; i < n; i++) {
            html += '<div class="iskelet" aria-hidden="true"></div>';
        }
        // Ekran okuyucu bos alan yerine durumu duysun
        kap.setAttribute("aria-busy", "true");
        kap.innerHTML = html;
    }

    // Ne tablo ne de gomulu yedek varsa (beklenmeyen durum) bos ekran
    // birakmak yerine ne oldugunu soyle.
    function hataBas() {
        var kap = document.getElementById("menu");
        if (!kap) { return; }
        kap.removeAttribute("aria-busy");
        kap.innerHTML = '<p class="menu-hata">Menü şu anda yüklenemedi. ' +
            'Lütfen sayfayı yenileyin.</p>';
    }

    // -----------------------------------------------------------------
    // CSV okuma  (tirnak icindeki virgul ve satir sonlarini destekler)
    // -----------------------------------------------------------------
    function csvCoz(metin) {
        var satirlar = [], alanlar = [], alan = "", tirnakta = false, i = 0;
        metin = metin.replace(/^﻿/, "");            // BOM
        while (i < metin.length) {
            var c = metin[i];
            if (tirnakta) {
                if (c === '"') {
                    if (metin[i + 1] === '"') { alan += '"'; i += 2; continue; }
                    tirnakta = false; i++; continue;
                }
                alan += c; i++; continue;
            }
            if (c === '"') { tirnakta = true; i++; continue; }
            if (c === ",") { alanlar.push(alan); alan = ""; i++; continue; }
            if (c === "\r") { i++; continue; }
            if (c === "\n") { alanlar.push(alan); satirlar.push(alanlar); alanlar = []; alan = ""; i++; continue; }
            alan += c; i++;
        }
        if (alan !== "" || alanlar.length) { alanlar.push(alan); satirlar.push(alanlar); }
        return satirlar;
    }

    // Sheets satirlarini menu yapisina cevirir.
    // Kategori sirasi = tabloda ilk gorunme sirasi. Urun sirasi = satir sirasi.
    function tablodanMenu(satirlar, gorselHaritasi) {
        if (!satirlar.length) { return null; }

        var baslik = satirlar[0].map(function (h) {
            return String(h).trim().toLocaleLowerCase("tr");
        });
        var iKat = baslik.indexOf("kategori");
        var iUrun = baslik.indexOf("ürün");
        if (iUrun < 0) { iUrun = baslik.indexOf("urun"); }
        var iAck = baslik.indexOf("açıklama");
        if (iAck < 0) { iAck = baslik.indexOf("aciklama"); }
        var iFiyat = baslik.indexOf("fiyat");
        var iGizle = baslik.indexOf("gizle");

        if (iKat < 0 || iUrun < 0 || iFiyat < 0) {
            throw new Error("Tabloda Kategori / Ürün / Fiyat sütunları bulunamadı");
        }

        var sira = [], harita = {};
        for (var r = 1; r < satirlar.length; r++) {
            var s = satirlar[r];
            var kat = (s[iKat] || "").trim();
            var ad = (s[iUrun] || "").trim();
            if (!kat || !ad) { continue; }
            if (iGizle >= 0 && (s[iGizle] || "").trim() !== "") { continue; }

            if (!harita[kat]) {
                harita[kat] = { ad: kat, gorsel: gorselHaritasi[kat] || null, urunler: [] };
                sira.push(kat);
            }
            harita[kat].urunler.push({
                ad: ad,
                aciklama: iAck >= 0 ? (s[iAck] || "") : "",
                fiyat: (s[iFiyat] || "").trim()
            });
        }

        if (!sira.length) { return null; }
        return { kategoriler: sira.map(function (k) { return harita[k]; }) };
    }

    // -----------------------------------------------------------------
    // Baslangic
    // -----------------------------------------------------------------
    var gomulu = null;
    try {
        gomulu = JSON.parse(document.getElementById("gomulu-menu").textContent);
    } catch (e) {
        console.error("Gömülü menü okunamadı", e);
    }

    // Kategori adi -> gorsel eslesmesi, gomulu veriden
    var gorselHaritasi = {};
    if (gomulu) {
        gomulu.kategoriler.forEach(function (k) { gorselHaritasi[k.ad] = k.gorsel; });
    }

    // Canlıda yalnızca https kabul edilir (karışık içerik uyarısı çıkmasın).
    // Yerel testte http'ye de izin veriliyor.
    var yerelMi = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
    var kaynak = window.MENU_KAYNAGI;
    var canliVar = !!kaynak &&
        (/^https:\/\//.test(kaynak) || (yerelMi && /^https?:\/\//.test(kaynak)));

    // Tablo bu sureden uzun sürerse gomulu yedege dusulur. Bilerek genis:
    // yedegin isi "Sheets erisilemiyor" durumu, "Sheets yavas" durumu degil.
    var YEDEGE_DUSME_MS = 4000;

    if (!canliVar) {
        // Sheets bagli degil — gomulu menu tek kaynak.
        if (gomulu) { menuyuBas(gomulu); }
    } else {
        // ÖNEMLİ: gomulu menu burada BASILMIYOR.
        // Eskiden once gomulu basiliyor, tablo gelince uzerine yaziliyordu.
        // Fiyat degistikten sonraki ilk gun bu, ~0.5-1 sn boyunca ESKI
        // FIYATIN ekranda durmasi demekti. Musterinin yanlis fiyat gormesi,
        // yarim saniye bile olsa kabul edilemez. Artik yer tutucu basiliyor;
        // fiyat yalnizca bir kez, dogru haliyle ekrana geliyor.
        iskeletBas(gomulu ? gomulu.kategoriler.length : 6);

        var basildi = false;
        var yedekZamanlayici = setTimeout(function () {
            if (basildi || !gomulu) { return; }
            basildi = true;
            menuyuBas(gomulu);
            console.warn("Tablo " + YEDEGE_DUSME_MS + " ms icinde gelmedi, gomulu yedek basildi.");
        }, YEDEGE_DUSME_MS);

        fetch(kaynak, { cache: "no-store" })
            .then(function (y) {
                if (!y.ok) { throw new Error("HTTP " + y.status); }
                return y.text();
            })
            .then(function (csv) {
                var yeni = tablodanMenu(csvCoz(csv), gorselHaritasi);
                if (!yeni || !yeni.kategoriler.length) { throw new Error("tabloda gecerli satir yok"); }
                clearTimeout(yedekZamanlayici);
                // Yedek zaten basildiysa bile guncel veriyle degistiriliyor:
                // o noktada secim "bir kerelik degisim" ile "ziyaret boyunca
                // yanlis fiyat" arasinda, dogru fiyat kazanir.
                menuyuBas(yeni);
                basildi = true;
                console.log("Menü Sheets'ten güncellendi.");
            })
            .catch(function (e) {
                clearTimeout(yedekZamanlayici);
                if (!basildi) {
                    basildi = true;
                    if (gomulu) {
                        menuyuBas(gomulu);
                    } else {
                        hataBas();
                    }
                }
                console.warn("Sheets okunamadı, gömülü menü kullanılıyor:", e.message);
            });
    }

    // -----------------------------------------------------------------
    // Yukari cik
    // -----------------------------------------------------------------
    var yukariBtn = document.querySelector(".yukari");
    if (yukariBtn) {
        window.addEventListener("scroll", function () {
            var y = window.scrollY || document.documentElement.scrollTop;
            yukariBtn.classList.toggle("yukari--gorunur", y > 240);
        });
        yukariBtn.addEventListener("click", function () {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    // -----------------------------------------------------------------
    // Dil secimi  (Google Çeviri motorunu suruyor)
    // -----------------------------------------------------------------
    function ustBosluguSifirla() {
        if (document.body.style.top && document.body.style.top !== "0px") {
            document.body.style.top = "0px";
        }
    }
    new MutationObserver(ustBosluguSifirla).observe(document.body, {
        attributes: true, attributeFilter: ["style"]
    });
    window.addEventListener("load", ustBosluguSifirla);

    function aktifDil() {
        var e = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
        if (!e) { return SAYFA_DILI; }
        var p = decodeURIComponent(e[1]).split("/");
        return p[2] || SAYFA_DILI;
    }

    var dilSec = document.getElementById("dil-sec");
    if (dilSec) {
        var simdiki = aktifDil();
        for (var o = 0; o < dilSec.options.length; o++) {
            if (dilSec.options[o].value === simdiki) { dilSec.value = simdiki; break; }
        }

        dilSec.addEventListener("change", function () {
            var hedef = dilSec.value;

            // Orijinale dönüş: Google'ın listesinde kaynak dil yok,
            // çerezi silip sayfayı yenilemek tek güvenilir yol.
            if (hedef === SAYFA_DILI) {
                var bitir = "; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
                document.cookie = "googtrans=" + bitir;
                document.cookie = "googtrans=" + bitir + "; domain=" + location.hostname;
                document.cookie = "googtrans=" + bitir + "; domain=." + location.hostname;
                location.reload();
                return;
            }

            var deneme = 0;
            (function uygula() {
                var g = document.querySelector(".goog-te-combo");
                if (g) {
                    g.value = hedef;
                    g.dispatchEvent(new Event("change"));
                    return;
                }
                if (++deneme < 40) { setTimeout(uygula, 150); }
            })();
        });
    }
})();

// Google Çeviri widget'ı bunu global olarak çağırıyor
function googleTranslateElementInit() {
    new google.translate.TranslateElement({
        pageLanguage: "tr",
        layout: google.translate.TranslateElement.InlineLayout.HORIZONTAL,
        autoDisplay: false
    }, "google_translate_element");
}
