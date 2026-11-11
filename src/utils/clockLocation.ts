export interface ClockLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}
export type ClockLocationResult = { location: ClockLocation | null; status: 'captured' | 'denied' | 'unavailable' | 'timeout' };

export function captureClockLocation(): Promise<ClockLocationResult> {
  if (!navigator.geolocation || !window.isSecureContext) return Promise.resolve({ location: null, status: 'unavailable' });
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        location: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy },
        status: 'captured',
      }),
      error => resolve({ location: null, status: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

export function clockLocationUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(latitude + ',' + longitude)}`;
}
