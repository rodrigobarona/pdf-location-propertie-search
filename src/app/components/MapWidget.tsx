"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  Circle,
  Marker,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LocationDocument, PropertyDocument } from "@/app/types/typesense";
import L from "leaflet";

// Fix the Leaflet default icon issue
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Set the default icon for all markers
L.Marker.prototype.options.icon = DefaultIcon;

// Define GeoJSON types
interface GeoJSONGeometry {
  type:
    | "Point"
    | "LineString"
    | "Polygon"
    | "MultiPoint"
    | "MultiLineString"
    | "MultiPolygon"
    | "GeometryCollection";
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}

interface GeoJSONFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: GeoJSONGeometry;
}

// Helper function to create a valid GeoJSON object from coordinates
function createValidGeoJSON(
  coordinates: number[][][] | number[][][][] | unknown,
  geometryType: string
): GeoJSON.FeatureCollection {
  if (geometryType === "Polygon") {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: coordinates as number[][][],
          },
        },
      ],
    };
  }

  if (geometryType === "MultiPolygon") {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "MultiPolygon",
            coordinates: coordinates as number[][][][],
          },
        },
      ],
    };
  }

  console.error("Unsupported geometry type:", geometryType);
  return {
    type: "FeatureCollection",
    features: [],
  };
}

// Helper function to extract polygon coordinates for API search
function extractPolygonCoordinates(
  geoJsonData: GeoJSONFeature | null
): number[] | null {
  if (!geoJsonData || !geoJsonData.geometry) return null;

  try {
    const geometryType = geoJsonData.geometry.type;
    const coordinates: number[] = [];

    // Handle different geometry types
    if (geometryType === "Polygon") {
      // For simple Polygon, take the outer ring (first array of coordinates)
      if (
        Array.isArray(geoJsonData.geometry.coordinates) &&
        geoJsonData.geometry.coordinates.length > 0 &&
        Array.isArray(geoJsonData.geometry.coordinates[0])
      ) {
        // Extract all coordinates without simplification
        // Convert from [lng, lat] format to [lat, lng] for Typesense search
        const outerRing = geoJsonData.geometry.coordinates[0] as number[][];
        for (const coord of outerRing) {
          if (Array.isArray(coord) && coord.length >= 2) {
            // Ensure we're working with numbers
            const lng = Number(coord[0]);
            const lat = Number(coord[1]);
            coordinates.push(lat, lng); // Push lat, lng for Typesense
          }
        }
      }
    } else if (geometryType === "MultiPolygon") {
      // For MultiPolygon, find the largest polygon's outer ring
      const multiPolygonCoords = geoJsonData.geometry
        .coordinates as number[][][][];
      if (Array.isArray(multiPolygonCoords)) {
        let largestPolygonIndex = 0;
        let maxPointCount = 0;

        // Find the polygon with the most points (likely the main boundary)
        for (let i = 0; i < multiPolygonCoords.length; i++) {
          if (
            Array.isArray(multiPolygonCoords[i]) &&
            multiPolygonCoords[i].length > 0 &&
            Array.isArray(multiPolygonCoords[i][0])
          ) {
            const pointCount = multiPolygonCoords[i][0].length;
            console.log(`GeoJSON Polygon ${i} has ${pointCount} points`);

            if (pointCount > maxPointCount) {
              maxPointCount = pointCount;
              largestPolygonIndex = i;
            }
          }
        }

        console.log(
          `Using largest GeoJSON polygon at index ${largestPolygonIndex} with ${maxPointCount} points`
        );

        // Extract coordinates from the largest polygon's outer ring
        if (
          Array.isArray(multiPolygonCoords[largestPolygonIndex]) &&
          multiPolygonCoords[largestPolygonIndex].length > 0 &&
          Array.isArray(multiPolygonCoords[largestPolygonIndex][0])
        ) {
          const outerRing = multiPolygonCoords[
            largestPolygonIndex
          ][0] as number[][];
          for (const coord of outerRing) {
            if (Array.isArray(coord) && coord.length >= 2) {
              // Ensure we're working with numbers
              const lng = Number(coord[0]);
              const lat = Number(coord[1]);
              coordinates.push(lat, lng); // Push lat, lng for Typesense
            }
          }
        }
      }
    } else {
      console.error(
        "Unsupported geometry type for polygon search:",
        geometryType
      );
      return null;
    }

    // Check if we have enough coordinates to form a polygon
    if (coordinates.length < 6) {
      console.error("Not enough coordinates to form a polygon");
      return null;
    }

    // Ensure polygon is closed (first point equals last point)
    const isClosed =
      coordinates[0] === coordinates[coordinates.length - 2] &&
      coordinates[1] === coordinates[coordinates.length - 1];

    if (!isClosed) {
      console.warn(
        "Raw polygon is not closed. Adding first point to close the polygon."
      );
      coordinates.push(coordinates[0], coordinates[1]);
    } else {
      console.log(
        `Polygon already closed with ${coordinates.length / 2} points`
      );
    }

    return coordinates;
  } catch (error) {
    console.error("Error extracting polygon coordinates:", error);
    return null;
  }
}

// Component to update the map view when location changes
function MapUpdater({ location }: { location: LocationDocument | null }) {
  const map = useMap();

  useEffect(() => {
    if (!location) {
      // Default view of Portugal if no location is selected
      map.setView([39.6, -8.0], 6);
      return;
    }

    // Special handling for Level 4 locations (points)
    if (location.level === 4 || location.geometry_type === "Point") {
      if (location.point_lat && location.point_lng) {
        // Use direct lat/lng coordinates if available
        const center: L.LatLngExpression = [
          location.point_lat,
          location.point_lng,
        ];
        map.setView(center, 14);
        return;
      }

      if (location.coordinates_json) {
        try {
          // Parse point coordinates from JSON
          const parsed = JSON.parse(location.coordinates_json);
          if (parsed.type === "Point" && Array.isArray(parsed.coordinates)) {
            // GeoJSON uses [lng, lat] format, but Leaflet uses [lat, lng]
            const [lng, lat] = parsed.coordinates;
            map.setView([lat, lng], 14);
            return;
          }
        } catch (error) {
          console.error("Error parsing point coordinates:", error);
        }
      }
    }

    // Standard handling for polygon locations (Levels 0-3)
    if (location.coordinates_json) {
      try {
        // Parse the coordinates_json field
        const parsedCoordinates = JSON.parse(location.coordinates_json);

        // For multipolygons, use all polygons to ensure the entire area is visible
        let validGeoJson: GeoJSON.FeatureCollection;

        if (
          location.geometry_type === "MultiPolygon" &&
          Array.isArray(parsedCoordinates)
        ) {
          // Use the entire MultiPolygon for bounds calculation to ensure all parts are visible
          validGeoJson = {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "MultiPolygon",
                  coordinates: parsedCoordinates as number[][][][],
                },
              },
            ],
          };

          console.log("Using complete MultiPolygon for map bounds");
        } else {
          validGeoJson = createValidGeoJSON(
            parsedCoordinates,
            location.geometry_type
          );
        }

        // Create a Leaflet GeoJSON layer to calculate bounds
        const layer = L.geoJSON(validGeoJson);

        if (layer.getBounds && typeof layer.getBounds === "function") {
          const bounds = layer.getBounds();

          if (bounds.isValid()) {
            // Calculate center point for debugging
            const center = bounds.getCenter();
            console.log(`Bounds center: [${center.lat}, ${center.lng}]`);
            console.log(
              `Bounds dimensions: ${bounds.getNorth() - bounds.getSouth()}° x ${
                bounds.getEast() - bounds.getWest()
              }°`
            );

            // Calculate appropriate padding based on area size
            const latSpan = bounds.getNorth() - bounds.getSouth();
            const lngSpan = bounds.getEast() - bounds.getWest();
            const areaSize = latSpan * lngSpan;

            // Use smaller padding for larger areas, larger padding for smaller areas
            let paddingAmount: number;
            let maxZoomLevel: number;

            // Adapt padding and max zoom based on region level and size
            if (location.level === 2) {
              // Municipality/Concelho level (like Cascais)
              paddingAmount = 60; // Reduced padding for better visibility
              maxZoomLevel = 12.5; // Slightly higher max zoom
            } else if (location.level === 1) {
              // District level
              paddingAmount = 50;
              maxZoomLevel = 11;
            } else if (location.level === 0) {
              // Country level
              paddingAmount = 40;
              maxZoomLevel = 9;
            } else {
              // Default for other cases
              paddingAmount = 75;
              maxZoomLevel = 13;
            }

            // Additional adjustments based on area size
            if (areaSize < 0.01) {
              // Very small area
              paddingAmount = 30;
              maxZoomLevel = Math.min(14, maxZoomLevel);
            } else if (areaSize > 0.5) {
              // Very large area
              paddingAmount = Math.max(20, paddingAmount - 20);
              maxZoomLevel = Math.min(11, maxZoomLevel);
            }

            console.log(
              `Using padding: ${paddingAmount}px, maxZoom: ${maxZoomLevel}`
            );

            // Fit the map to the bounds with appropriate padding
            map.fitBounds(bounds, {
              padding: [paddingAmount, paddingAmount],
              maxZoom: maxZoomLevel,
            });

            return;
          }
        }
      } catch (error) {
        console.error("Error parsing GeoJSON for map bounds:", error);
      }
    }

    // Default view of Portugal if all other methods fail
    map.setView([39.6, -8.0], 6);
  }, [location, map]);

  return null;
}

interface MapWidgetProps {
  locationResult: LocationDocument | null;
}

// Generate a truly unique search ID with timestamp and random string
function generateSearchId(): string {
  return `search_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Main map widget
const MapWidget = ({ locationResult }: MapWidgetProps) => {
  const [isMounted, setIsMounted] = useState(false);
  const [geoJsonData, setGeoJsonData] = useState<GeoJSONFeature | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const [isPointLocation, setIsPointLocation] = useState(false);
  const [pointCenter, setPointCenter] = useState<[number, number] | null>(null);
  const [pointRadius, setPointRadius] = useState<number | null>(null);
  const [pointName, setPointName] = useState<string>("");

  // Add state for properties inside polygon
  const [properties, setProperties] = useState<PropertyDocument[]>([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(false);
  const [usingSampleData, setUsingSampleData] = useState(false);
  const [polygonCoordinates, setPolygonCoordinates] = useState<number[] | null>(
    null
  );

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalHits, setTotalHits] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const isAutoLoading = true; // Always auto-load, no state/toggle needed
  const PAGE_SIZE = 250;

  // Advanced search tracking
  const [searchId, setSearchId] = useState<string>(() => generateSearchId());
  const currentSearchIdRef = useRef<string>("");
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Generate a new search ID when location changes
  useEffect(() => {
    // Cancel any pending requests from previous searches
    abortControllersRef.current.forEach((controller) => {
      try {
        controller.abort();
      } catch (e) {
        // Ignore abort errors
      }
    });
    abortControllersRef.current.clear();

    const newSearchId = generateSearchId();
    console.log(
      `Location changed - generating new search ID: ${newSearchId} for location: ${
        locationResult?.name_1 || locationResult?.name_2 || "unknown"
      }`
    );

    // Reset all search state
    setSearchId(newSearchId);
    currentSearchIdRef.current = newSearchId;
    loadedPagesRef.current = new Set();

    // Reset UI state
    setCurrentPage(1);
    setProperties([]);
    setTotalHits(0);
    setHasMoreResults(false);
    setIsLoadingProperties(false);
    setLoadingMore(false);
  }, [locationResult]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Helper function to handle fetch errors
  const handleFetchError = useCallback(
    async (coordinates: number[]) => {
      // Capture current search ID
      const currentSearchId = searchId;

      // Create abort controller for this request
      const controller = new AbortController();
      abortControllersRef.current.set(currentSearchId, controller);

      // Use sample data if fetch fails, but only if component is still mounted
      try {
        console.log(
          `Fetching sample data as fallback for searchId: ${currentSearchId}`
        );

        const sampleResponse = await fetch("/api/properties/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            coordinates,
            useSampleData: true,
            searchId: currentSearchId,
          }),
          cache: "no-store",
          signal: controller.signal,
        });

        // Clean up the controller
        abortControllersRef.current.delete(currentSearchId);

        // Only process response if the search ID hasn't changed
        if (currentSearchId === searchId) {
          if (sampleResponse.ok) {
            const sampleData = await sampleResponse.json();
            setProperties(sampleData.properties || []);
            setTotalHits(sampleData.properties?.length || 0);
          } else {
            setProperties([]);
            setTotalHits(0);
          }
          setUsingSampleData(true);
          setIsLoadingProperties(false);
        } else {
          console.log(
            `Ignoring stale sample data for searchId: ${currentSearchId}, current is: ${searchId}`
          );
        }
      } catch (error) {
        // Don't report errors for aborted requests
        if (error.name !== "AbortError") {
          console.error(
            `Error fetching sample data for searchId ${currentSearchId}:`,
            error
          );
        }

        // Only update state if the search ID hasn't changed
        if (currentSearchId === searchId) {
          setProperties([]);
          setUsingSampleData(false);
          setTotalHits(0);
          setIsLoadingProperties(false);
        }

        // Clean up the controller
        abortControllersRef.current.delete(currentSearchId);
      }
    },
    [searchId]
  );

  // Function to fetch properties with Typesense v28 best practices
  const fetchProperties = useCallback(
    async (coordinates: number[], page = 1) => {
      if (!coordinates || coordinates.length === 0) {
        console.log("No coordinates provided for property search");
        return;
      }

      // Skip if we already loaded this page for the current search
      if (
        loadedPagesRef.current.has(page) &&
        searchId === currentSearchIdRef.current
      ) {
        console.log(
          `Page ${page} already loaded for searchId: ${searchId}, skipping`
        );
        return;
      }

      // Add to loaded pages set
      loadedPagesRef.current.add(page);

      // Capture the current search ID at the time the request is made
      const currentSearchId = searchId;
      currentSearchIdRef.current = currentSearchId;

      // Create abort controller for this request
      const controller = new AbortController();
      abortControllersRef.current.set(
        `${currentSearchId}_page${page}`,
        controller
      );

      console.log(
        `Fetching properties page ${page} with searchId: ${currentSearchId}`
      );

      if (page === 1) {
        setIsLoadingProperties(true);
      } else {
        setLoadingMore(true);
      }
      setUsingSampleData(false);

      try {
        const response = await fetch("/api/properties/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
          body: JSON.stringify({
            coordinates,
            query: "*", // Default query to match all documents
            page,
            per_page: PAGE_SIZE,
            searchId: currentSearchId, // Include search ID with request
          }),
          cache: "no-store",
          signal: controller.signal,
          next: { revalidate: 0 }, // NextJS-specific: don't cache this request
        });

        // Clean up the controller
        abortControllersRef.current.delete(`${currentSearchId}_page${page}`);

        if (!response.ok) {
          throw new Error(`API responded with status: ${response.status}`);
        }

        const data = await response.json();

        // Only update state if the search ID hasn't changed
        if (currentSearchId === searchId) {
          if (data.properties && Array.isArray(data.properties)) {
            if (page === 1) {
              // First page - replace existing properties
              setProperties(data.properties);
            } else {
              // Subsequent pages - append to existing properties
              setProperties((prevProperties) => {
                // Create a set of existing IDs to avoid duplicates
                const existingIds = new Set(
                  prevProperties.map((p) => p.id || p.document_id)
                );

                // Add only unique properties
                const newProperties = data.properties.filter(
                  (p) => !existingIds.has(p.id || p.document_id)
                );

                return [...prevProperties, ...newProperties];
              });
            }

            // Update total count
            setTotalHits(data.count || 0);

            // Check if there are more results to load
            const totalFetched = page * PAGE_SIZE;
            const hasMore = totalFetched < (data.count || 0);
            setHasMoreResults(hasMore);
            setCurrentPage(page);

            setUsingSampleData(!!data.usingSampleData);
            console.log(
              `Found ${data.count || 0} properties in polygon, loaded ${
                page * PAGE_SIZE > data.count ? data.count : page * PAGE_SIZE
              } (${
                data.points || coordinates.length / 2
              } points) for searchId: ${currentSearchId}`
            );

            // Auto-load next page if there are more results
            if (hasMore && isAutoLoading) {
              // Use a slight delay to avoid overwhelming the server
              setTimeout(() => {
                if (currentSearchId === searchId) {
                  fetchProperties(coordinates, page + 1);
                }
              }, 800);
            }
          } else {
            if (page === 1) {
              setProperties([]);
              setTotalHits(0);
              setHasMoreResults(false);
            }
            console.log(
              `No properties found in polygon for searchId: ${currentSearchId}`
            );
          }
        } else {
          console.log(
            `Ignoring stale search results for searchId: ${currentSearchId}, current is: ${searchId}`
          );
        }
      } catch (error) {
        // Don't report errors for aborted requests
        if (error.name !== "AbortError") {
          console.error(
            `Error fetching properties for searchId ${currentSearchId}:`,
            error
          );

          if (currentSearchId === searchId && page === 1) {
            handleFetchError(coordinates);
          }
        }
      } finally {
        // Clean up the controller if it wasn't already removed
        abortControllersRef.current.delete(`${currentSearchId}_page${page}`);

        // Only update loading state if this search is still current
        if (currentSearchId === searchId) {
          if (page === 1) {
            setIsLoadingProperties(false);
          } else {
            setLoadingMore(false);
          }
        }
      }
    },
    [handleFetchError, searchId, isAutoLoading]
  );

  // Function to load more properties (manual trigger if auto-loading is disabled)
  const loadMoreProperties = useCallback(() => {
    if (hasMoreResults && !loadingMore && polygonCoordinates) {
      const nextPage = currentPage + 1;
      fetchProperties(polygonCoordinates, nextPage);
    }
  }, [
    hasMoreResults,
    loadingMore,
    polygonCoordinates,
    currentPage,
    fetchProperties,
  ]);

  // Use geometry directly from location when available, otherwise extract from GeoJSON
  useEffect(() => {
    if (!locationResult) {
      setPolygonCoordinates(null);
      return;
    }

    // Generate a new search ID when location changes to ensure fresh results
    const newSearchId = generateSearchId();
    console.log(
      `Location changed - generating new search ID: ${newSearchId} for location: ${
        locationResult?.name_1 || locationResult?.name_2 || "unknown"
      }`
    );
    setSearchId(newSearchId);
    currentSearchIdRef.current = newSearchId;

    // Reset pagination state when location changes
    setCurrentPage(1);
    setProperties([]);
    setTotalHits(0);
    setHasMoreResults(false);

    // For polygon locations, try to get coordinates directly from the location
    if (
      locationResult.coordinates_json &&
      (locationResult.level < 4 || locationResult.geometry_type !== "Point")
    ) {
      try {
        // Parse the coordinates_json field
        const parsedCoordinates = JSON.parse(locationResult.coordinates_json);

        // For MultiPolygon, find the largest polygon (most likely the main boundary)
        if (
          locationResult.geometry_type === "MultiPolygon" &&
          Array.isArray(parsedCoordinates) &&
          parsedCoordinates.length > 0
        ) {
          // Find the polygon with the most points (likely the main boundary)
          let largestPolygonIndex = 0;
          let maxPointCount = 0;

          // Loop through all polygons to find the one with the most points
          for (let i = 0; i < parsedCoordinates.length; i++) {
            if (
              Array.isArray(parsedCoordinates[i]) &&
              parsedCoordinates[i].length > 0 &&
              Array.isArray(parsedCoordinates[i][0])
            ) {
              const pointCount = parsedCoordinates[i][0].length;
              console.log(`Polygon ${i} has ${pointCount} points`);

              if (pointCount > maxPointCount) {
                maxPointCount = pointCount;
                largestPolygonIndex = i;
              }
            }
          }

          console.log(
            `Using largest polygon at index ${largestPolygonIndex} with ${maxPointCount} points`
          );

          // Extract all coordinates from the largest polygon's outer ring
          const flatCoordinates: number[] = [];
          const polygonRing = parsedCoordinates[largestPolygonIndex][0]; // Largest polygon, outer ring

          if (Array.isArray(polygonRing) && polygonRing.length > 0) {
            // Convert from [lng, lat] to [lat, lng] format for Typesense
            for (const point of polygonRing) {
              if (Array.isArray(point) && point.length >= 2) {
                flatCoordinates.push(Number(point[1]), Number(point[0])); // lat, lng
              }
            }

            // Ensure polygon is closed
            const isClosed =
              flatCoordinates.length >= 4 &&
              flatCoordinates[0] ===
                flatCoordinates[flatCoordinates.length - 2] &&
              flatCoordinates[1] ===
                flatCoordinates[flatCoordinates.length - 1];

            if (!isClosed) {
              console.warn(
                "Raw polygon is not closed. Adding first point to close the polygon."
              );
              flatCoordinates.push(flatCoordinates[0], flatCoordinates[1]);
            }

            console.log(
              `Using ${flatCoordinates.length / 2} points from largest polygon`
            );
            setPolygonCoordinates(flatCoordinates);
            return;
          }
        }
      } catch (error) {
        console.error("Error parsing coordinates_json directly:", error);
      }
    }

    // Fall back to extracting from GeoJSON if direct parsing failed
    if (geoJsonData) {
      const coordinates = extractPolygonCoordinates(geoJsonData);
      console.log("Extracted coordinates from GeoJSON:", coordinates);
      setPolygonCoordinates(coordinates);
    } else {
      setPolygonCoordinates(null);
    }
  }, [locationResult, geoJsonData]);

  // Fetch properties inside polygon when coordinates change or when a point location is selected
  useEffect(() => {
    // For polygon search: check if we have valid polygon coordinates
    if (polygonCoordinates && polygonCoordinates.length >= 6) {
      // Reset pagination when coordinates change
      setCurrentPage(1);
      setProperties([]);
      setTotalHits(0);
      fetchProperties(polygonCoordinates, 1);
      return;
    }

    // For point search: check if we have a point location
    if (isPointLocation && pointCenter && pointRadius) {
      // Reset pagination when point changes
      setCurrentPage(1);
      setProperties([]);
      setTotalHits(0);
      fetchProperties(polygonCoordinates || [], 1);
      return;
    }

    // Clear properties if no valid search parameters
    setProperties([]);
    setTotalHits(0);
    setHasMoreResults(false);
  }, [
    polygonCoordinates,
    isPointLocation,
    pointCenter,
    pointRadius,
    fetchProperties,
  ]);

  useEffect(() => {
    if (!locationResult) {
      setGeoJsonData(null);
      setIsPointLocation(false);
      setPointCenter(null);
      setPointRadius(null);
      return;
    }

    // Handle Level 4 (Point) locations
    if (
      locationResult.level === 4 ||
      locationResult.geometry_type === "Point"
    ) {
      setIsPointLocation(true);

      // Use direct lat/lng if available
      if (locationResult.point_lat && locationResult.point_lng) {
        setPointCenter([locationResult.point_lat, locationResult.point_lng]);
        setPointRadius(locationResult.radius || 500);
        setPointName(
          locationResult.name_4 ||
            locationResult.name_3 ||
            locationResult.name_2 ||
            locationResult.name_1 ||
            locationResult.country ||
            "Unnamed Location"
        );
        setGeoJsonData(null);
        return;
      }

      // Parse coordinates from JSON if direct coordinates aren't available
      if (locationResult.coordinates_json) {
        try {
          const parsed = JSON.parse(locationResult.coordinates_json);
          if (parsed.type === "Point" && Array.isArray(parsed.coordinates)) {
            // GeoJSON uses [lng, lat] format, but Leaflet uses [lat, lng]
            const [lng, lat] = parsed.coordinates;
            setPointCenter([lat, lng]);
            setPointRadius(locationResult.radius || 500);
            setPointName(
              locationResult.name_4 ||
                locationResult.name_3 ||
                locationResult.name_2 ||
                locationResult.name_1 ||
                locationResult.country ||
                "Unnamed Location"
            );
            setGeoJsonData(null);
            return;
          }
        } catch (error) {
          console.error("Error parsing point location:", error);
        }
      }
    }

    // Handle polygon locations (Level 0-3)
    setIsPointLocation(false);

    if (locationResult.coordinates_json) {
      try {
        // Parse the coordinates_json field exactly as it is
        const parsedCoordinates = JSON.parse(locationResult.coordinates_json);
        console.log("Raw parsed coordinates from JSON:", parsedCoordinates);

        // Create a GeoJSON feature directly using the parsed coordinates
        // without any transformation or simplification
        const geoJsonFeature: GeoJSONFeature = {
          type: "Feature",
          properties: {
            name:
              locationResult.name_4 ||
              locationResult.name_3 ||
              locationResult.name_2 ||
              locationResult.name_1 ||
              locationResult.country,
            level: locationResult.level,
            type:
              locationResult.type_4 ||
              locationResult.type_3 ||
              locationResult.type_2 ||
              locationResult.type_1 ||
              "",
          },
          geometry: {
            type: locationResult.geometry_type as GeoJSONGeometry["type"],
            coordinates: parsedCoordinates,
          },
        };

        console.log(
          "Created GeoJSON feature with raw coordinates:",
          geoJsonFeature
        );
        setGeoJsonData(geoJsonFeature);
      } catch (error) {
        console.error("Error parsing GeoJSON:", error);
        setGeoJsonData(null);
      }
    } else {
      setGeoJsonData(null);
    }
  }, [locationResult]);

  const onEachFeature = (feature: GeoJSONFeature, layer: L.Layer) => {
    if (feature.properties) {
      const { name, type } = feature.properties;
      const popupContent = `
        <div>
          <h3 class="font-semibold">${name || "Unnamed Location"}</h3>
          ${type ? `<p class="text-sm text-gray-600">${type}</p>` : ""}
        </div>
      `;
      layer.bindPopup(popupContent);
    }
  };

  if (!isMounted) {
    return (
      <div className="h-full w-full bg-gray-200 flex items-center justify-center">
        <p>Loading map...</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[39.6, -8.0]} // Center of Portugal
        zoom={6}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {isPointLocation && pointCenter && pointRadius && (
          <Circle
            center={pointCenter}
            radius={pointRadius}
            pathOptions={{
              color: "#d4277b",
              weight: 2,
              opacity: 0.8,
              fillColor: "rgba(212, 39, 123, 0.2)",
              fillOpacity: 0.35,
            }}
          >
            <Popup>
              <div>
                <h3 className="font-semibold">{pointName}</h3>
                <p className="text-sm text-gray-600">Radius: {pointRadius}m</p>
              </div>
            </Popup>
          </Circle>
        )}

        {!isPointLocation && geoJsonData && (
          <GeoJSON
            key={JSON.stringify(geoJsonData)} // Force re-render when data changes
            data={geoJsonData}
            style={() => ({
              color: "#d4277b",
              weight: 2,
              opacity: 0.8,
              fillColor: "rgba(212, 39, 123, 0.2)",
              fillOpacity: 0.35,
            })}
            onEachFeature={onEachFeature}
            ref={geoJsonLayerRef as React.RefObject<L.GeoJSON>}
          />
        )}

        {/* Property markers */}
        {properties.map((property) => {
          // Check for _geoloc field first (Typesense schema format)
          if (
            property._geoloc &&
            Array.isArray(property._geoloc) &&
            property._geoloc.length === 2
          ) {
            const [lat, lng] = property._geoloc;

            if (typeof lat === "number" && typeof lng === "number") {
              return (
                <Marker key={property.id} position={[lat, lng]}>
                  <Popup>
                    <div className="property-popup">
                      <h3 className="font-semibold">
                        {property.title || "Property"}
                      </h3>
                      <p className="text-sm">{property.address}</p>
                      {property.price && (
                        <p className="text-sm font-medium mt-1">
                          €{property.price.toLocaleString()}
                        </p>
                      )}
                      <div className="flex gap-2 mt-1 text-xs text-gray-600">
                        {property.bedrooms && (
                          <span>{property.bedrooms} bed</span>
                        )}
                        {property.bathrooms && (
                          <span>{property.bathrooms} bath</span>
                        )}
                        {property.area && <span>{property.area} m²</span>}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            }
          }

          return null;
        })}

        <MapUpdater location={locationResult} />
      </MapContainer>

      {/* Status indicator with enhanced UI for auto-loading */}
      <div className="absolute bottom-2 right-2 bg-white rounded-md shadow-md p-2 z-[1000] text-sm">
        {isLoadingProperties ? (
          <p className="flex items-center">
            <span className="inline-block w-3 h-3 mr-1 rounded-full bg-blue-500 animate-pulse" />
            Loading properties...
          </p>
        ) : properties.length > 0 ? (
          <div>
            <p>
              {properties.length}{" "}
              {totalHits > properties.length ? `of ${totalHits}` : ""}{" "}
              properties found
              {usingSampleData && (
                <span className="text-yellow-600 ml-1">(Sample data)</span>
              )}
            </p>
            {hasMoreResults && loadingMore && (
              <p className="mt-1 text-xs flex items-center">
                <span className="inline-block w-2 h-2 mr-1 rounded-full bg-blue-500 animate-pulse" />
                Loading more properties...
              </p>
            )}
            {hasMoreResults && !loadingMore && !isAutoLoading && (
              <button
                type="button"
                onClick={loadMoreProperties}
                className="mt-1 text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded w-full"
              >
                Load more ({totalHits - properties.length} remaining)
              </button>
            )}
          </div>
        ) : polygonCoordinates ? (
          <p>No properties found in this area</p>
        ) : (
          <p>Select an area to see properties</p>
        )}
      </div>
    </div>
  );
};

export default MapWidget;
