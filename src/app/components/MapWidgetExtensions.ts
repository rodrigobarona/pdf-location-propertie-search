import type L from "leaflet";

// Function to extract coordinates from map bounds
// Returns a flat array in the format Typesense needs [lat, lng, lat, lng, ...]
export function getBoundsCoordinates(map: L.Map): number[] {
  if (!map) return [];

  const bounds = map.getBounds();

  // Create polygon points from the bounds (clockwise order)
  const northWest = bounds.getNorthWest();
  const northEast = bounds.getNorthEast();
  const southEast = bounds.getSouthEast();
  const southWest = bounds.getSouthWest();

  // Create flat array in the format Typesense needs [lat, lng, lat, lng, ...]
  const coordinates = [
    northWest.lat,
    northWest.lng,
    northEast.lat,
    northEast.lng,
    southEast.lat,
    southEast.lng,
    southWest.lat,
    southWest.lng,
    northWest.lat,
    northWest.lng, // Close the polygon
  ];

  // Log the bounds for debugging
  console.log(
    "Using map bounds as search area:",
    `NW: [${northWest.lat}, ${northWest.lng}]`,
    `SE: [${southEast.lat}, ${southEast.lng}]`
  );

  return coordinates;
}

// Generate a unique search ID for bounds searches
export function generateBoundsSearchId(): string {
  return `bounds_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export default {};
