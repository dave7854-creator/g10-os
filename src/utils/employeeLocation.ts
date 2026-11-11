import { supabase } from '@/supabaseClient';

export type EmployeeLocationEvent = 'login' | 'clock_in' | 'clock_out';
type LocationResult = {
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  status: 'granted' | 'denied' | 'unavailable' | 'timeout';
};

function locate(): Promise<LocationResult> {
  if (!navigator.geolocation || !window.isSecureContext) {
    return Promise.resolve({ latitude: null, longitude: null, accuracy_meters: null, status: 'unavailable' });
  }
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: position.coords.accuracy,
        status: 'granted',
      }),
      error => resolve({
        latitude: null, longitude: null, accuracy_meters: null,
        status: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable',
      }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

/** Captures only the requested event, never background location. */
export async function recordEmployeeLocation(
  employeeId: string,
  eventType: EmployeeLocationEvent,
  timeClockId?: string,
): Promise<void> {
  const location = await locate();
  const { error } = await supabase.from('employee_location_events').insert({
    employee_id: employeeId,
    event_type: eventType,
    time_clock_id: timeClockId ?? null,
    ...location,
  });
  if (error) throw error;
}
