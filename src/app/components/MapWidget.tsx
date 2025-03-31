"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LocationDocument } from "../types/typesense";
import L from "leaflet";

// Fix Leaflet icon issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

// Helper function to create a valid GeoJSON object
function createValidGeoJSON(coordinates: any, geometryType = "Polygon") {
  // If it's already a valid GeoJSON with type property, return it
  if (coordinates && coordinates.type) {
    return coordinates;
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
  let type = geometryType || "Polygon";

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
    if (location?.coordinates_json) {
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
          } else {
            console.warn("Invalid bounds for location:", location);
            // Fallback to a default view of Portugal
            map.setView([39.6, -8.0], 6);
          }
        } else {
          console.warn("Could not get bounds for layer");
          // Fallback to a default view of Portugal
          map.setView([39.6, -8.0], 6);
        }
      } catch (error) {
        console.error("Error parsing GeoJSON for map bounds:", error);
        // Fallback to a default view of Portugal
        map.setView([39.6, -8.0], 6);
      }
    } else {
      // Default view of Portugal if no location is selected
      map.setView([39.6, -8.0], 6);
    }
  }, [location, map]);

  return null;
}

interface MapWidgetProps {
  locationResult: LocationDocument | null;
}

// Main map widget
const MapWidget = ({ locationResult }: MapWidgetProps) => {
  const [isMounted, setIsMounted] = useState(false);
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const geoJsonLayerRef = useRef<any>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (locationResult?.coordinates_json) {
      try {
        // Parse the coordinates_json field
        const parsedCoordinates = JSON.parse(locationResult.coordinates_json);

        // Create a valid GeoJSON geometry object
        const validGeometry = createValidGeoJSON(
          parsedCoordinates,
          locationResult.geometry_type
        );

        // Create a proper GeoJSON feature
        const geoJsonFeature = {
          type: "Feature",
          properties: {
            name:
              locationResult.name_3 ||
              locationResult.name_2 ||
              locationResult.name_1 ||
              locationResult.country,
            level: locationResult.level,
            type:
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

  const onEachFeature = (feature: any, layer: any) => {
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

      {geoJsonData && (
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
          ref={geoJsonLayerRef}
        />
      )}

      <MapUpdater location={locationResult} />
    </MapContainer>
  );
};

export default MapWidget;
