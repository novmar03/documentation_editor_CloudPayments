export async function renderPlantUml(source, signal) {
  if (!source.trim()) throw new Error('Введите код PlantUML');
  if (source.length > 50000) throw new Error('Максимум 50 000 символов в диаграмме');
  const response = await fetch('https://kroki.io/plantuml/png', {
    method: 'POST', headers: {'Content-Type': 'text/plain'}, body: source,
    credentials: 'omit', signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/<[^>]*>/g, '').slice(0, 700);
    throw new Error('Не удалось построить диаграмму. Проверьте синтаксис PlantUML. ' + detail);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Изображение диаграммы превышает 5 МБ');
  if (![137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) throw new Error('Сервис не вернул изображение PNG');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return 'data:image/png;base64,' + btoa(binary);
}
