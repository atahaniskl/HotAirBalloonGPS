// Harita başlatma
var map = L.map('map').setView([38.5, 35], 10); // Harita merkezini belirleyin

// OpenStreetMap katmanı
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Balon simgesi
var balonIcon = L.icon({
  iconUrl: 'images/balon-simgesi.png', // PNG dosyasının yolu
  iconSize: [50, 50], // Simge boyutu (İhtiyacınıza göre ayarlayın)
  iconAnchor: [25, 50], // Simgenin "bağlantı" noktası (Alt kısımda olmalı)
  popupAnchor: [0, -50] // Popup'ın simgeye göre pozisyonu
});

// Haversine formülü ile mesafe hesaplama
function calculateDistance(lat1, lon1, lat2, lon2) {
  var R = 6371; // Dünya'nın yarıçapı (km)
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var distance = R * c; // Mesafe kilometre cinsinden
  return distance;
}

// Uyarıyı ekranda göster
function showDistanceAlert(message) {
  var alertContainer = document.getElementById('alert-container');

  var alertBox = document.createElement('div');
  alertBox.classList.add('distance-alert');
  alertBox.textContent = message;

  // Yeni uyarıyı container'ın en üstüne ekle
  alertContainer.prepend(alertBox);

  // Stil efektleri
  setTimeout(() => {
    alertBox.style.opacity = '1';
  }, 10);

  // 5 saniye sonra uyarıyı kaldır
  setTimeout(() => {
    alertBox.remove();
  }, 5000);
}


// Mesafe kontrolü
// Mesafe kontrolü

let shownPairs = {}; // Artık set değil, obje kullanacağız (içine zaman da koyacağız)
const COOLDOWN_TIME = 3000; // 3 saniye: aynı balon çifti için en az 3 saniye bekle

function checkDistance(balonlar) {
  let minDistance = 0.2; // 200 metre
  var closeBalloons = [];

  Object.keys(balonlar).forEach(id1 => {
    Object.keys(balonlar).forEach(id2 => {
      if (id1 !== id2) {
        var balon1 = balonlar[id1];
        var balon2 = balonlar[id2];
        var distance = calculateDistance(balon1.lat, balon1.lon, balon2.lat, balon2.lon);
        let pairKey = [id1, id2].sort().join('-');

        if (distance < minDistance) {
          let now = Date.now();

          // Eğer daha önce uyarı verilmediyse veya cooldown süresi geçtiyse
          if (!shownPairs[pairKey] || (now - shownPairs[pairKey]) > COOLDOWN_TIME) {
            closeBalloons.push({ id1, id2, distance });
            shownPairs[pairKey] = now; // Şu anki zamanı kaydet
          }
        } else {
          // Eğer artık yakın değillerse kaydı sil
          delete shownPairs[pairKey];
        }
      }
    });
  });

  // Yakın balonlar varsa uyarı göster
  closeBalloons.forEach(pair => {
    showDistanceAlert(`Kaza Riski: ${pair.id1} ile ${pair.id2} arasındaki mesafe çok az! (${(pair.distance * 1000).toFixed(1)} m)`);
  });
}



// TensorFlow Lite modelini yükleme
async function loadModel() {
  // Modeli yükle
  const model = await tflite.loadTFLiteModel('model.tflite');
  return model;
}

// TensorFlow Lite modelini kullanarak çarpışma tespiti yapma
async function checkCollision(model, balonlar) {
  const inputs = Object.values(balonlar).map(balon => [
    balon.lat,
    balon.lon,
    balon.speed,
    balon.altitude,
    balon.bearing,
    balon.verticalSpeed,
    balon.acceleration,
    balon.horizontalDistance
  ]);

  // Modelin tahminlerini almak için veriyi tensor'a dönüştür
  const predictions = await model.predict(tf.tensor2d(inputs));

  // Çarpışma tespiti: Model, çarpışma riski olup olmadığını tahmin edecek
  predictions.array().then(prediction => {
    prediction.forEach((prob, index) => {
      if (prob > 0.5) { // Eğer çarpışma olasılığı %50'den fazlaysa
        showDistanceAlert(`Uyarı: Balon ${Object.keys(balonlar)[index]} çarpışma riski taşıyor!`);
      }
    });
  });
}

// CSV dosyasını yükle
function loadCSV() {
  fetch('balloon_data_with_movement_parameters2.csv')
    .then(response => response.text())
    .then(data => {
      var rows = Papa.parse(data, { header: true }).data;
      console.log(rows); // Veriyi konsola yazdır

      var balonlar = {};

      rows.forEach(row => {
        var balonId = row.id;
        var lat = parseFloat(row.latitude);
        var lon = parseFloat(row.longitude);
        var timestamp = row.timestamp;
        var speed = row['Speed (km/s)'];
        var altitude = row.altitude;
        var bearing = row['Bearing (degrees)'];
        var verticalSpeed = row['Vertical Speed (km/s)'];
        var acceleration = row['Acceleration (km/s²)'];
        var horizontalDistance = row['Horizontal Distance (km)'];

        if (isNaN(lat) || isNaN(lon)) {
          console.error('Geçersiz koordinat:', lat, lon); // Hata durumunda konsola yazdır
        } else {
          // Eğer bu balon daha önce eklenmediyse, bir balon nesnesi oluştur
          if (!balonlar[balonId]) {
            balonlar[balonId] = {
              marker: L.marker([lat, lon], { icon: balonIcon }).addTo(map)
                .bindPopup(`Balon Adı: ${balonId}<br>Hız: ${speed} km/h<br>Yükseklik: ${altitude} m<br>Yön: ${bearing}°<br>Dikey Hız: ${verticalSpeed} km/s`)
                .bindTooltip(balonId, { permanent: true, direction: 'top' }),
              positions: [],
              lat: lat,
              lon: lon,
              speed: speed,
              altitude: altitude,
              bearing: bearing,
              verticalSpeed: verticalSpeed,
              acceleration: acceleration,
              horizontalDistance: horizontalDistance
            };
          }

          // Balonun hareket koordinatlarını sakla
          balonlar[balonId].positions.push({
            lat: lat,
            lon: lon,
            timestamp: timestamp,
            speed: speed,
            altitude: altitude,
            bearing: bearing,
            verticalSpeed: verticalSpeed,
            acceleration: acceleration,
            horizontalDistance: horizontalDistance
          });
        }
      });

      // Balonları hareket ettirme işlemi
      Object.keys(balonlar).forEach(balonId => {
        var balon = balonlar[balonId];
        moveBalloon(balon.marker, balon.positions, balonId);
      });

      // Modeli yükle
      loadModel().then(model => {
        // Balonlar arasındaki mesafeyi kontrol et ve çarpışma riski tespiti yap
        setInterval(() => {
          checkCollision(model, balonlar);
        }, 1000); // Her saniyede bir çarpışma kontrolü yap
      });

      // Balonlar arasındaki mesafeyi kontrol et
      // Her saniyede bir balonlar arasındaki mesafeyi kontrol et
      setInterval(() => {
        checkDistance(balonlar);
      }, 1000);

    })
    .catch(error => console.error('CSV yüklenirken hata oluştu:', error));
}

// Balonu hareket ettirme
function moveBalloon(marker, positions, balonId) {
  let index = 0;

  function animateBalloon() {
    if (index < positions.length) {
      var position = positions[index];
      marker.setLatLng([position.lat, position.lon]);
      index++;
    } else {
      index = 0; // Yeniden başlat
    }
  }

  setInterval(animateBalloon, 100); // Her 1 saniyede bir balonu hareket ettir
}

// CSV verilerini yükle
loadCSV();
