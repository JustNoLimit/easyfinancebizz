# EasyFinance — yerel ortama devir

17 Kasım 2026. Bu paket kaynak kod, testler, kurulum belgeleri ve araştırma notlarını taşır. Üretim veritabanı, gerçek hesap verileri, API/Taxisnet şifreleri, oturum çerezleri, SSH özel anahtarları ve ortam sırları dahil değildir. Yerel kurulum mevcut VPS hesabını veya verilerini otomatik olarak taşımaz.

## Önce yapılacak iş

Kullanıcı DEEDIT'i Chrome'da kendisi açıp giriş yapmak, ardından uygulamayı **tek ekonomik ajanla** inceletmek istiyor. Az kullanım hakkı kaldığı için büyük bağlamlı çoklu ajan çalıştırma. OpenCode/DeepSeek bulunduğu doğrulanmadı; varsa `opencode deepseek/deepseekflash` tercihini değerlendir, yoksa kullanılabilir ekonomik ajanı kullan.

**Yeni kod/portal yönlendirmesi veya VPS yayını yapma.** Kullanıcı yanlış portal seçimleri nedeniyle uygulama çalışmalarını durdurup önce referans uygulamayı incelemeyi istedi. Önce tarayıcı kontrol aracının bulunduğunu doğrula. Kullanıcının giriş yaptığı aynı Chrome oturumunu kullan; parolaları sohbette isteme, kaydetme veya ajana aktarma. Hesap incelemesi salt okunur olmalı; ödeme, beyanname, abonelik, dışa aktarma veya hesap değişikliği yapma. Kimlik doğrulama/izin adımlarında kullanıcı kontrolünü koru.

Okunacak belgeler:

- `deploy/DEEDIT-AUDIT.md`: istek yapıları, kimlik bilgileri, uygunluk koşulları ve belirsizlikler.
- `deploy/FEATURE-COMPARISON.md`: referans özellikler ve bizdeki eksikler; bazı uygulama durumu satırları sonraki çalışmaların gerisinde olabilir.
- `deploy/TAXISNET-RESEARCH.md`: referansın kendi arka uç servislerine yaptığı çağrılar.
- `deploy/PORTALS.md`: son bağlantı uygulamaları, doğrulamalar ve sınırlar.

## Doğrulanmış ayrımlar ve mevcut sorun

DEEDIT'in açık istemcisinde işveren APD için AME veya AMOE; KEAO için AMKA/AME/AMOE; bireysel EFKA için AMKA ve işletme türünün `ΑΤΟΜΙΚΗ ΕΠΙΧΕΙΡΗΣΗ` olması koşulları var. İşveren IKA/TEKA ve inşaat projeleri ayrı gösteriliyor. Bunlar istemci koşullarıdır; resmi hukuki uygunluk veya borcun sıfır olduğu anlamına gelmez.

Referans istemci normal Taxisnet bilgilerini kendi şifreleme servisi üzerinden işleyip kendi arka ucuna gönderiyor. Bu, myDATA kullanıcı adı + Subscription Key'den ve uygulama hesabı girişinden ayrıdır. Referansın kapalı arka ucunun hangi resmi uç noktaları kullandığı **kanıtlanmadı**. Özel API'lerini çağırma veya erişim kısıtlarını aşma.

Bizim işveren mali hesap kartı bağlantısı kullanıcının gerçek oturumunda `Δεν επιτρέπεται η πρόσβαση` gösterdi. Bunun DEEDIT'in APD akışının karşılığı olduğu doğrulanmış değildir. Yalnızca resmi bir bağlantı bulmak veya örnek testlerin geçmesi gerçek hesapta işlevselliği kanıtlamaz. Yeni portal tahminleriyle ilerleme.

## Son teknik durum

- Giriş zorunlu; örnek finans verileri kaldırılmıştır.
- myDATA gerçek üretim okuması doğrulandı. Gruplanmış defter kayıtları, tekil fatura listesi değildir.
- Gerçek myAADE vergi borcu görüntüleme bölümleri ve seçili yıl F2 KDV beyanname durum listesi AFM kontrolüyle doğrulandı. KDV listesi, ödenecek/devreden tutarın mutabakatı değildir.
- EFKA işveren, bireysel EFKA ve KEAO'nun gerçek finansal veri alımı tamamlanmış sayılmaz. Bilinmeyen/hatalı sonuçları sıfır borca çevirme; önceki başarılı veriyi koru.
- Son kod kontrollerinde `npm run check`, 55 Node testi ve yerel örnek ekranlarla işveren giriş geçişi / kalan kaynaklar UI kontrolleri geçti. Bunlar canlı EFKA/KEAO erişimini doğrulamaz.
- Kullanıcının gerçek hesap üzerinde salt okunur inceleme izni vardı; gerçek sırlar repoda değildir. Yeni yerel uygulama ayrı veri dizini ve ilk hesap kurulumuyla başlar.

## Yerelde çalıştırma

Node.js 24 önerilir:

```sh
npm ci
npm run check
npm test
npm start
```

Adres: `http://localhost:3000`. Geliştirme veri dizini varsayılan `/tmp/easyfinance-data`; Windows'ta `DATA_DIR` için erişilebilir bir yerel dizin seç. İlk kurulum kodu bu veri dizinindeki `setup-token` dosyasında oluşur; koda veya seçtiğin şifreye repoda yer verme. Node sunucusu tek başına resmi portal tarayıcı işçisini başlatmaz. İşçi yapılandırması `portal-worker/` ve `deploy/easyfinance/compose.yaml` içinde; mevcut Compose dosyası VPS'e özeldir, yerelde körlemesine başlatma. Sadece kaynak incelemek için VPS sırları gerekmez.

## Mevcut VPS (taşınmadı, değiştirme)

Site: https://finance.107.175.212.3.sslip.io/

Kaynak dizini `/srv/hosting/apps/easyfinance`; Compose dizini bunun altındaki `deploy/easyfinance`. Caddy diğer sitelerle ortak `/srv/hosting/edge` altında. Uygulama `easyfinance-app-1`, özel tarayıcı işçisi `easyfinance-portal-worker-1`. Gerçek veriler şifreli `easyfinance_data` Docker hacminde. Hacmi silme, sırları veya gerçek ekran görüntülerini dışarı aktarma. SSH anahtarı özellikle bu pakete dahil edilmedi; yerel erişim gerekirse kendi yetkili anahtarını güvenli yoldan kur.

## Yeni yerel sohbete başlangıç metni

> EasyFinance projesine devam ediyoruz. Önce LOCAL-HANDOFF.md ve oradaki araştırma belgelerini oku. Kod veya yayın değiştirme. Referans DEEDIT'i kontrol edebildiğin ortak Chrome'da aç; ben giriş yapacağım. Sonra tek ekonomik ajanla gerçek ekranları, bağlantı önkoşullarını ve özellikleri salt okunur incele. Doğrulanmamış portal bağlantılarını doğru kabul etme. Gizli bilgileri, çerezleri ve finansal verileri dosyalara veya sohbete dökme.
