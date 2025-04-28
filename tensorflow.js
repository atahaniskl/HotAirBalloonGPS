let balonlar = {}; // Balonlar değişkeni boş olarak tanımlanmalı

async function loadModel() {
  const model = await tflite.loadTFLiteModel('model.tflite');
  return model;
}

async function checkCollision(model, balonlar) {
  if (Object.keys(balonlar).length === 0) return; // Eğer hiç balon yoksa boşuna predict yapma

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

  const inputsTensor = tf.tensor2d(inputs, [inputs.length, 8], 'float32');

  try {
    const outputTensor = await model.predict(inputsTensor);
    const predictions = await outputTensor.array();

    predictions.forEach((prob, index) => {
      if (prob[0] > 0.5) { // veya sadece prob > 0.5, model çıkışına bağlı
        showDistanceAlert(`Uyarı: Balon ${Object.keys(balonlar)[index]} çarpışma riski taşıyor!`);
      }
    });

    tf.dispose([inputsTensor, outputTensor]); // Belleği temizle
  } catch (error) {
    console.error("Çarpışma kontrol hatası:", error);
  }
}

loadModel().then(model => {
  setInterval(() => {
    checkCollision(model, balonlar);
  }, 1000); // 1 saniyede bir çarpışma kontrolü
});
