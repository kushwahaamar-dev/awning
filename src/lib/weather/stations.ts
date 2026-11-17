// Where each city's temperature market settles. Gemini's ticker carries the city's airport code
// (WXHIGH-AUS-…), which is the National Weather Service station with a K in front, bar the few
// noted below. The table was read from api.weather.gov on 14 November 2026 and checked, city by
// city, against the station each contract's rules name. A city listed later is looked up live.

export type Station = { id: string; name: string; latitude: number; longitude: number; timezone: string };

// Chicago settles at Midway, Los Angeles at LAX, New York in Central Park; Alaska's stations start with P.
const OTHER_IDS: Record<string, string> = { ANC: "PANC", CHI: "KMDW", LA: "KLAX", NYC: "KNYC" };

const KNOWN: Record<string, Station> = {
  ABQ: { id: "KABQ", name: "Albuquerque International Airport", latitude: 35.0417, longitude: -106.6147, timezone: "America/Denver" },
  ANC: { id: "PANC", name: "Ted Stevens Anchorage International Airport", latitude: 61.1744, longitude: -149.9961, timezone: "America/Anchorage" },
  ATL: { id: "KATL", name: "Hartsfield - Jackson Atlanta International Airport", latitude: 33.6403, longitude: -84.4269, timezone: "America/New_York" },
  AUS: { id: "KAUS", name: "Austin-Bergstrom International Airport", latitude: 30.183, longitude: -97.6799, timezone: "America/Chicago" },
  BHM: { id: "KBHM", name: "Birmingham International Airport", latitude: 33.5656, longitude: -86.745, timezone: "America/Chicago" },
  BNA: { id: "KBNA", name: "Nashville International Airport", latitude: 36.1189, longitude: -86.6892, timezone: "America/Chicago" },
  BOS: { id: "KBOS", name: "Logan International Airport", latitude: 42.3606, longitude: -71.0106, timezone: "America/New_York" },
  BUF: { id: "KBUF", name: "Greater Buffalo International Airport", latitude: 42.94, longitude: -78.736, timezone: "America/New_York" },
  BWI: { id: "KBWI", name: "Baltimore-Washington International Airport", latitude: 39.1733, longitude: -76.684, timezone: "America/New_York" },
  CHI: { id: "KMDW", name: "Chicago Midway Airport", latitude: 41.7842, longitude: -87.7553, timezone: "America/Chicago" },
  CLE: { id: "KCLE", name: "Cleveland Hopkins International Airport", latitude: 41.4057, longitude: -81.8519, timezone: "America/New_York" },
  CMH: { id: "KCMH", name: "John Glenn Columbus International Airport", latitude: 39.9907, longitude: -82.8769, timezone: "America/New_York" },
  CVG: { id: "KCVG", name: "Cincinnati/Northern Kentucky International Airport", latitude: 39.0446, longitude: -84.6723, timezone: "America/New_York" },
  DCA: { id: "KDCA", name: "Washington/Reagan National Airport, DC", latitude: 38.8483, longitude: -77.0342, timezone: "America/New_York" },
  DEN: { id: "KDEN", name: "Denver International Airport", latitude: 39.8466, longitude: -104.6562, timezone: "America/Denver" },
  DFW: { id: "KDFW", name: "Dallas/Fort Worth International Airport", latitude: 32.8974, longitude: -97.022, timezone: "America/Chicago" },
  DTW: { id: "KDTW", name: "Detroit Metropolitan Wayne County Airport", latitude: 42.2314, longitude: -83.3308, timezone: "America/Detroit" },
  HOU: { id: "KHOU", name: "Houston Hobby Airport", latitude: 29.6375, longitude: -95.2825, timezone: "America/Chicago" },
  IND: { id: "KIND", name: "Indianapolis International Airport", latitude: 39.7252, longitude: -86.2816, timezone: "America/Indiana/Indianapolis" },
  JAX: { id: "KJAX", name: "Jacksonville International Airport", latitude: 30.4953, longitude: -81.6937, timezone: "America/New_York" },
  LA: { id: "KLAX", name: "Los Angeles International Airport", latitude: 33.9381, longitude: -118.3889, timezone: "America/Los_Angeles" },
  LAS: { id: "KLAS", name: "Harry Reid International Airport", latitude: 36.0719, longitude: -115.1634, timezone: "America/Los_Angeles" },
  MCI: { id: "KMCI", name: "Kansas City International Airport", latitude: 39.2972, longitude: -94.7306, timezone: "America/Chicago" },
  MCO: { id: "KMCO", name: "Orlando International Airport", latitude: 28.4183, longitude: -81.3241, timezone: "America/New_York" },
  MEM: { id: "KMEM", name: "Memphis International Airport", latitude: 35.0564, longitude: -89.9863, timezone: "America/Chicago" },
  MIA: { id: "KMIA", name: "Miami International Airport", latitude: 25.7906, longitude: -80.3164, timezone: "America/New_York" },
  MKE: { id: "KMKE", name: "General Mitchell International Airport", latitude: 42.955, longitude: -87.9044, timezone: "America/Chicago" },
  MSP: { id: "KMSP", name: "Minneapolis-St. Paul International Airport", latitude: 44.8831, longitude: -93.2289, timezone: "America/Chicago" },
  MSY: { id: "KMSY", name: "New Orleans International Airport", latitude: 29.9928, longitude: -90.2508, timezone: "America/Chicago" },
  NYC: { id: "KNYC", name: "Central Park", latitude: 40.7833, longitude: -73.9667, timezone: "America/New_York" },
  OKC: { id: "KOKC", name: "Will Rogers World Airport", latitude: 35.3886, longitude: -97.6003, timezone: "America/Chicago" },
  OMA: { id: "KOMA", name: "Omaha - Eppley Airfield", latitude: 41.3119, longitude: -95.9018, timezone: "America/Chicago" },
  PDX: { id: "KPDX", name: "Portland International Airport", latitude: 45.5958, longitude: -122.6092, timezone: "America/Los_Angeles" },
  PHL: { id: "KPHL", name: "Philadelphia International Airport", latitude: 39.8733, longitude: -75.2268, timezone: "America/New_York" },
  PHX: { id: "KPHX", name: "Phoenix Sky Harbor International Airport", latitude: 33.4278, longitude: -112.0035, timezone: "America/Phoenix" },
  PIT: { id: "KPIT", name: "Pittsburgh International Airport", latitude: 40.4846, longitude: -80.2145, timezone: "America/New_York" },
  RDU: { id: "KRDU", name: "Raleigh-Durham International Airport", latitude: 35.8922, longitude: -78.7819, timezone: "America/New_York" },
  RIC: { id: "KRIC", name: "Richmond International Airport", latitude: 37.5111, longitude: -77.3233, timezone: "America/New_York" },
  SAC: { id: "KSAC", name: "Sacramento Executive Airport", latitude: 38.5067, longitude: -121.496, timezone: "America/Los_Angeles" },
  SAN: { id: "KSAN", name: "San Diego International Airport", latitude: 32.7336, longitude: -117.1831, timezone: "America/Los_Angeles" },
  SAT: { id: "KSAT", name: "San Antonio International Airport", latitude: 29.5328, longitude: -98.4636, timezone: "America/Chicago" },
  SDF: { id: "KSDF", name: "Louisville Muhammad Ali International Airport", latitude: 38.1741, longitude: -85.7365, timezone: "America/Kentucky/Louisville" },
  SEA: { id: "KSEA", name: "Seattle-Tacoma International Airport", latitude: 47.4447, longitude: -122.3136, timezone: "America/Los_Angeles" },
  SFO: { id: "KSFO", name: "San Francisco International Airport", latitude: 37.6196, longitude: -122.3656, timezone: "America/Los_Angeles" },
  SLC: { id: "KSLC", name: "Salt Lake City International Airport", latitude: 40.7707, longitude: -111.965, timezone: "America/Denver" },
  STL: { id: "KSTL", name: "St. Louis Lambert International Airport", latitude: 38.7525, longitude: -90.3736, timezone: "America/Chicago" },
  TPA: { id: "KTPA", name: "Tampa International Airport", latitude: 27.9614, longitude: -82.5403, timezone: "America/New_York" },
  TUL: { id: "KTUL", name: "Tulsa International Airport", latitude: 36.1975, longitude: -95.8864, timezone: "America/Chicago" },
  TUS: { id: "KTUS", name: "Tucson International Airport", latitude: 32.1315, longitude: -110.9564, timezone: "America/Phoenix" },
};

/** The station as this table has it, for a city that is on it. */
export const knownStation = (cityCode: string): Station | null => KNOWN[cityCode] ?? null;

const looked = new Map<string, Station>();

/** The weather station a city's market settles on, by the city code in the market's ticker. */
export async function stationFor(cityCode: string): Promise<Station> {
  const known = KNOWN[cityCode] ?? looked.get(cityCode);
  if (known) return known;

  const id = OTHER_IDS[cityCode] ?? `K${cityCode}`;
  const res = await fetch(`https://api.weather.gov/stations/${id}`, { headers: { accept: "application/geo+json", "user-agent": "awning" }, cache: "no-store" });
  if (!res.ok) throw new Error(`No weather station on record for ${cityCode}`);
  const { properties, geometry } = (await res.json()) as { properties: { name: string; timeZone: string }; geometry: { coordinates: [number, number] } };
  const station = { id, name: properties.name, latitude: geometry.coordinates[1], longitude: geometry.coordinates[0], timezone: properties.timeZone };
  looked.set(cityCode, station);
  return station;
}
