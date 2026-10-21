/** External, on-demand street imagery. No panorama images are copied or embedded.
 * Yandex Maps may show a map instead of a panorama if coverage is absent.
 * In-game positions are virtual coordinates, not device GPS readings.
 */
export function validCoordinate(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -85 && lat <= 85 && lon >= -180 && lon <= 180;
}
export function panoramaUrl(lat, lon) {
  if (!validCoordinate(lat, lon)) throw new RangeError('Неверные координаты панорамы');
  const url = new URL('https://yandex.ru/maps/');
  url.searchParams.set('panorama[point]', `${lon.toFixed(6)},${lat.toFixed(6)}`);
  return url.toString();
}
export function mapUrl(lat, lon) {
  if (!validCoordinate(lat, lon)) throw new RangeError('Неверные координаты карты');
  const url = new URL('https://yandex.ru/maps/');
  url.searchParams.set('ll', `${lon.toFixed(6)},${lat.toFixed(6)}`);
  url.searchParams.set('z', '17');
  return url.toString();
}
