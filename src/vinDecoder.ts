export interface NhtsaVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  engine: string;
  transmission: string;
  bodyStyle: string;
  driveType: string;
  fuelType: string;
  plant: string;
  confidence: number;
  cabConfig: string;
  bedLength: string;
  series: string;
  vehicleType: string;
  trim2: string;
  errorCode: string;
  errorText: string;
}

interface NhtsaResult {
  Variable?: string;
  Value?: string | null;
  ValueId?: string | null;
}

interface NhtsaResponse {
  Results: NhtsaResult[];
}

function getField(results: NhtsaResult[], variable: string): string {
  const entry = results.find((r) => r.Variable === variable);
  const val = entry?.Value;
  if (!val || val === 'null' || val === 'Not Applicable') return '';
  return val;
}

export async function decodeVin(vin: string): Promise<NhtsaVehicle> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NHTSA API returned ${response.status}`);
  }

  const data: NhtsaResponse = await response.json();
  if (!data.Results || data.Results.length === 0) {
    throw new Error('No results returned from NHTSA');
  }

  const make = getField(data.Results, 'Make');
  const model = getField(data.Results, 'Model');
  const yearStr = getField(data.Results, 'Model Year');
  const errorCode = getField(data.Results, 'Error Code');

  if (errorCode && errorCode !== '0') {
    throw new Error(`VIN decode error: ${getField(data.Results, 'Error Text') || 'invalid VIN'}`);
  }

  if (!make || !model) {
    throw new Error('Unable to decode vehicle details from this VIN');
  }

  const displacementL = getField(data.Results, 'Displacement (L)');
  const engineConfig = getField(data.Results, 'Engine Configuration');
  const engineCylinders = getField(data.Results, 'Engine Number of Cylinders');
  const engineHp = getField(data.Results, 'Engine Brake (hp)');

  let engine = '';
  if (displacementL) engine = `${displacementL}L`;
  if (engineConfig) engine = engine ? `${engine} ${engineConfig}` : engineConfig;
  if (engineCylinders) {
    const cylMatch = engineCylinders.match(/\d+/);
    if (cylMatch) engine = engine ? `${engine} V${cylMatch[0]}` : `V${cylMatch[0]}`;
  }
  if (engineHp) engine = engine ? `${engine} ${engineHp}hp` : `${engineHp}hp`;

  const transmission = getField(data.Results, 'Transmission Style') || getField(data.Results, 'Transmission Style');

  const trim = getField(data.Results, 'Trim') || getField(data.Results, 'Series');
  const series = getField(data.Results, 'Series');
  const vehicleType = getField(data.Results, 'Vehicle Type');
  const trim2 = getField(data.Results, 'Trim2');

  const bodyStyle = getField(data.Results, 'Body Class') || vehicleType;
  const driveType = getField(data.Results, 'Drive Type');
  const fuelType = getField(data.Results, 'Fuel Type - Primary');
  const plant = getField(data.Results, 'Plant City') || getField(data.Results, 'Plant Country');

  // Additional fields for factory configuration
  const cabConfig = getField(data.Results, 'Cab Type') || getField(data.Results, 'Body Cab Type');
  const bedLength = getField(data.Results, 'Bed Length') || getField(data.Results, 'Bed Type');

  const errorText = getField(data.Results, 'Error Text');

  const filledCount = [make, model, yearStr, engine, transmission, bodyStyle, driveType, fuelType].filter(Boolean).length;
  const confidence = Math.round((filledCount / 8) * 100);

  return {
    vin: vin.toUpperCase(),
    year: parseInt(yearStr) || 0,
    make,
    model,
    trim: trim || 'Base',
    engine: engine || 'N/A',
    transmission: transmission || 'N/A',
    bodyStyle: bodyStyle || 'N/A',
    driveType: driveType || 'N/A',
    fuelType: fuelType || 'N/A',
    plant: plant || 'N/A',
    confidence,
    cabConfig: cabConfig || '',
    bedLength: bedLength || '',
    series: series || '',
    vehicleType: vehicleType || '',
    trim2: trim2 || '',
    errorCode,
    errorText,
  };
}
