"use client";

import { useEffect, useRef, useState } from "react";
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
import type { LocationDocument } from "@/app/types/typesense";
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

// Helper function to create a valid GeoJSON object
function createValidGeoJSON(
  coordinates: unknown,
  geometryType = "Polygon"
): GeoJSONGeometry {
  // If it's already a valid GeoJSON with type property, return it
  if (coordinates && typeof coordinates === "object" && "type" in coordinates) {
    return coordinates as GeoJSONGeometry;
  }

  // Check if coordinates is an array
  if (!Array.isArray(coordinates)) {
    console.error("Invalid coordinates format:", coordinates);
    // Return a simple polygon as fallback
    return {
      type: "Polygon",
      coordinates: [
        [
          [-8.5, 39.0],
          [-8.5, 40.0],
          [-7.5, 40.0],
          [-7.5, 39.0],
          [-8.5, 39.0],
        ],
      ],
    };
  }

  // Determine the geometry type based on the structure of coordinates
  let type = (geometryType as GeoJSONGeometry["type"]) || "Polygon";

  // If no explicit type is provided, try to infer it from the coordinates structure
  if (!geometryType) {
    if (Array.isArray(coordinates[0]) && !Array.isArray(coordinates[0][0])) {
      // [[x,y], [x,y], ...] -> LineString
      type = "LineString";
    } else if (
      Array.isArray(coordinates[0]) &&
      Array.isArray(coordinates[0][0])
    ) {
      // [[[x,y], [x,y], ...]] -> Polygon
      type = "Polygon";
    } else if (!Array.isArray(coordinates[0])) {
      // [x,y] -> Point
      type = "Point";
    }
  }

  // Create and return a proper GeoJSON geometry object
  return {
    type: type,
    coordinates: coordinates,
  };
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
      } else if (location.coordinates_json) {
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

        // Log the parsed coordinates for debugging
        console.log("Parsed coordinates:", parsedCoordinates);

        // Create a valid GeoJSON object for bounds calculation
        const validGeoJson = createValidGeoJSON(
          parsedCoordinates,
          location.geometry_type
        );

        console.log("Valid GeoJSON:", validGeoJson);

        // Create a Leaflet GeoJSON layer to calculate bounds
        const layer = L.geoJSON(validGeoJson);

        if (layer.getBounds && typeof layer.getBounds === "function") {
          const bounds = layer.getBounds();
          console.log("Bounds:", bounds);

          if (bounds.isValid()) {
            // Fit the map to the bounds of the selected location with some padding
            map.fitBounds(bounds, {
              padding: [50, 50],
              maxZoom: 13, // Limit zoom level to prevent zooming too far in
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

// Main map widget
const MapWidget = ({ locationResult }: MapWidgetProps) => {
  const [isMounted, setIsMounted] = useState(false);
  const [geoJsonData, setGeoJsonData] = useState<GeoJSONFeature | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const [isPointLocation, setIsPointLocation] = useState(false);
  const [pointCenter, setPointCenter] = useState<[number, number] | null>(null);
  const [pointRadius, setPointRadius] = useState<number | null>(null);
  const [pointName, setPointName] = useState<string>("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
        // Parse the coordinates_json field
        const parsedCoordinates = JSON.parse(locationResult.coordinates_json);

        // Create a valid GeoJSON geometry object
        const validGeometry = createValidGeoJSON(
          parsedCoordinates,
          locationResult.geometry_type
        );

        // Create a proper GeoJSON feature
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
          geometry: validGeometry,
        };

        console.log("Created GeoJSON feature:", geoJsonFeature);
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
        <>
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
          />
          <Marker position={pointCenter}>
            <Popup>
              <div>
                <h3 className="font-semibold">{pointName}</h3>
                <p className="text-sm text-gray-600">Radius: {pointRadius}m</p>
              </div>
            </Popup>
          </Marker>
        </>
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

      <MapUpdater location={locationResult} />
    </MapContainer>
  );
};

export default MapWidget;
