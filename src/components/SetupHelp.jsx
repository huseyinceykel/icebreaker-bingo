// Firebase ayarlari eksikse bos sayfa yerine ne yapilacagini gosterir (firebase.js'i yuklemez).
export default function SetupHelp({ missing }) {
  return (
    <div className="center">
      <h1>⚙️ Kurulum gerekli / Setup required</h1>
      <p>
        Firebase ayarları bulunamadı. Proje kök klasöründe <code>.env</code> dosyası oluşturup Firebase web
        uygulaması değerlerini yazın, sonra geliştirme sunucusunu yeniden başlatın.
      </p>
      <p style={{ opacity: 0.8 }}>
        Firebase config is missing. Create a <code>.env</code> file with your Firebase web app values and restart the dev server.
      </p>
      <pre style={{ textAlign: "left", background: "rgba(127,127,127,.15)", padding: 14, borderRadius: 12, overflowX: "auto", maxWidth: "100%" }}>
{`cp .env.example .env     # sonra değerleri doldurun
npm run dev

# ya da gerçek projeye dokunmadan emülatörle:
npm run emulators        # 1. terminal
npm run dev:emulator     # 2. terminal`}
      </pre>
      <p style={{ opacity: 0.7, fontSize: 13 }}>Eksik / Missing: {missing.join(", ")}</p>
      <p style={{ opacity: 0.7, fontSize: 13 }}>Ayrıntılar için README.md · See README.md</p>
    </div>
  );
}
