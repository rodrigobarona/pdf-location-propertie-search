import { NextResponse } from "next/server";
import {
  typesenseClient,
  COLLECTION_PROPERTIES,
} from "@/app/utils/typesenseClient";
import { sampleProperties } from "@/app/utils/sampleData";

// Define interfaces for type safety
interface SearchHit {
  document: {
    _geoloc?: [number, number]; // [latitude, longitude] array format
    [key: string]: unknown;
  };
}

interface SearchResponse {
  hits?: SearchHit[];
  found?: number;
}

export async function POST(request: Request) {
  try {
    // Parse request body
    const body: {
      query?: string;
      coordinates?: number[];
      coordinates_json?: string;
      geometry_type?: string;
      radius?: number;
      useSampleData?: boolean;
      page?: number;
      per_page?: number;
    } = await request.json();

    const {
      query = "*",
      coordinates,
      coordinates_json,
      geometry_type,
      radius,
      useSampleData,
      page = 1,
      per_page = 250,
    } = body;

    // Return sample data if explicitly requested
    if (useSampleData) {
      console.log("Using sample data as requested");
      return NextResponse.json({
        properties: sampleProperties,
        count: sampleProperties.length,
        usingSampleData: true,
      });
    }

    // First try to list collections to verify connectivity
    try {
      await typesenseClient.collections().retrieve();
    } catch (error) {
      console.error("Error connecting to Typesense:", error);
      return NextResponse.json(
        {
          error: "Error connecting to Typesense",
          properties: sampleProperties,
          usingSampleData: true,
        },
        { status: 500 }
      );
    }

    // Simple text search when no geometry is provided
    if (!coordinates && !coordinates_json) {
      try {
        const searchParameters = {
          q: query || "*",
          query_by: "title,address,description",
          per_page: 20, // Lower for normal text search to avoid overwhelming the UI
          sort_by: "_text_match:desc", // Sort by text relevance
          highlight_full_fields: "title,address,description", // Highlight matched terms
        };

        console.log("Performing text search with query:", query || "*");

        const searchResults = (await typesenseClient
          .collections(COLLECTION_PROPERTIES)
          .documents()
          .search(searchParameters)) as SearchResponse;

        console.log(
          `Found ${searchResults.hits?.length || 0} properties matching query`
        );

        return NextResponse.json({
          properties: searchResults.hits?.map((hit) => hit.document) || [],
          count: searchResults.hits?.length || 0,
          searchType: "text",
        });
      } catch (error) {
        console.error("Error performing text search:", error);
        return NextResponse.json(
          {
            error: "Error searching for properties",
            details: error instanceof Error ? error.message : String(error),
            properties: sampleProperties.slice(0, 10), // Just return a few samples for text search
            usingSampleData: true,
          },
          { status: 500 }
        );
      }
    }

    // Handle Point-Radius search
    if (geometry_type === "Point" && coordinates_json) {
      try {
        const pointData = JSON.parse(coordinates_json);

        if (
          pointData.type === "Point" &&
          Array.isArray(pointData.coordinates) &&
          pointData.coordinates.length === 2
        ) {
          // Extract coordinates (GeoJSON format is [lng, lat], we need [lat, lng])
          const [lng, lat] = pointData.coordinates;
          const searchRadius = radius || 3000; // Default to 3000m if not specified

          // Convert radius to km for Typesense
          const radiusKm = searchRadius / 1000;

          // Create filter for radius search
          const radiusFilterString = `_geoloc:(${lat}, ${lng}, ${radiusKm} km)`;

          console.log(
            `Performing radius search at [${lat}, ${lng}] with radius ${radiusKm} km`
          );

          // Perform a radius search with pagination
          const searchParameters = {
            q: query,
            query_by: "title,address,description",
            filter_by: radiusFilterString,
            sort_by: `_geoloc(${lat}, ${lng}):asc`, // Sort by distance from center
            per_page: per_page,
            page: page,
          };

          const searchResults = (await typesenseClient
            .collections(COLLECTION_PROPERTIES)
            .documents()
            .search(searchParameters)) as SearchResponse;

          console.log(
            `Found ${
              searchResults.found || 0
            } properties within radius, returning page ${page} with ${
              searchResults.hits?.length || 0
            } properties`
          );

          return NextResponse.json({
            properties: searchResults.hits?.map((hit) => hit.document) || [],
            count: searchResults.found || 0,
            searchType: "radius",
            page: page,
            per_page: per_page,
          });
        }
      } catch (error) {
        console.error("Error parsing point coordinates:", error);
        return NextResponse.json(
          {
            error: "Failed to parse point coordinates",
            details: error instanceof Error ? error.message : String(error),
          },
          { status: 400 }
        );
      }
    }

    // Prepare coordinates for polygon search
    let searchCoordinates: number[] = [];

    // Option 1: Using coordinates_json field from location document
    if (coordinates_json) {
      try {
        const parsedCoordinates = JSON.parse(coordinates_json);
        console.log(
          "Parsed coordinates JSON:",
          parsedCoordinates?.type || "unknown type"
        );

        // Handle GeoJSON Polygon
        if (
          parsedCoordinates?.type === "Polygon" &&
          Array.isArray(parsedCoordinates.coordinates) &&
          parsedCoordinates.coordinates.length > 0
        ) {
          // Get the outer ring
          const outerRing = parsedCoordinates.coordinates[0];

          if (Array.isArray(outerRing) && outerRing.length > 0) {
            // Convert from [lng, lat] format to [lat, lng] for Typesense
            for (const point of outerRing) {
              if (Array.isArray(point) && point.length >= 2) {
                searchCoordinates.push(Number(point[1]), Number(point[0])); // lat, lng
              }
            }
          }
        }
        // Handle GeoJSON MultiPolygon
        else if (
          parsedCoordinates?.type === "MultiPolygon" &&
          Array.isArray(parsedCoordinates.coordinates) &&
          parsedCoordinates.coordinates.length > 0
        ) {
          // Find the largest polygon (most likely the main boundary)
          let largestPolygonIndex = 0;
          let maxPointCount = 0;

          for (let i = 0; i < parsedCoordinates.coordinates.length; i++) {
            if (
              Array.isArray(parsedCoordinates.coordinates[i]) &&
              parsedCoordinates.coordinates[i].length > 0 &&
              Array.isArray(parsedCoordinates.coordinates[i][0])
            ) {
              const pointCount = parsedCoordinates.coordinates[i][0].length;
              if (pointCount > maxPointCount) {
                maxPointCount = pointCount;
                largestPolygonIndex = i;
              }
            }
          }

          // Extract the largest polygon's outer ring
          const outerRing =
            parsedCoordinates.coordinates[largestPolygonIndex][0];

          if (Array.isArray(outerRing) && outerRing.length > 0) {
            // Convert from [lng, lat] format to [lat, lng] for Typesense
            for (const point of outerRing) {
              if (Array.isArray(point) && point.length >= 2) {
                searchCoordinates.push(Number(point[1]), Number(point[0])); // lat, lng
              }
            }
          }
        }
        // Handle raw MultiPolygon format (common in location documents)
        else if (
          Array.isArray(parsedCoordinates) &&
          parsedCoordinates.length > 0
        ) {
          // Find the largest polygon (most likely the main boundary)
          let largestPolygonIndex = 0;
          let maxPointCount = 0;

          for (let i = 0; i < parsedCoordinates.length; i++) {
            if (
              Array.isArray(parsedCoordinates[i]) &&
              parsedCoordinates[i].length > 0 &&
              Array.isArray(parsedCoordinates[i][0])
            ) {
              const pointCount = parsedCoordinates[i][0].length;
              if (pointCount > maxPointCount) {
                maxPointCount = pointCount;
                largestPolygonIndex = i;
              }
            }
          }

          // Extract the largest polygon's outer ring
          if (
            Array.isArray(parsedCoordinates[largestPolygonIndex]) &&
            parsedCoordinates[largestPolygonIndex].length > 0
          ) {
            const polygonRing = parsedCoordinates[largestPolygonIndex][0];

            if (Array.isArray(polygonRing) && polygonRing.length > 0) {
              // Convert from [lng, lat] format to [lat, lng] for Typesense
              for (const point of polygonRing) {
                if (Array.isArray(point) && point.length >= 2) {
                  searchCoordinates.push(Number(point[1]), Number(point[0])); // lat, lng
                }
              }
            }
          }
        }

        console.log(
          `Extracted ${
            searchCoordinates.length / 2
          } points from coordinates_json`
        );
      } catch (error) {
        console.error("Error parsing coordinates_json:", error);
        return NextResponse.json(
          {
            error: "Failed to parse coordinates_json",
            details: error instanceof Error ? error.message : String(error),
          },
          { status: 400 }
        );
      }
    }
    // Option 2: Fall back to raw coordinates already in [lat, lng] format
    else if (
      coordinates &&
      Array.isArray(coordinates) &&
      coordinates.length >= 6
    ) {
      searchCoordinates = [...coordinates];
      console.log(
        `Using provided coordinates array with ${coordinates.length / 2} points`
      );
    }

    // Check if we have valid coordinates for search
    if (searchCoordinates.length < 6) {
      return NextResponse.json(
        {
          error:
            "Invalid coordinates. Provide an array of at least 6 numbers (3 points)",
          details:
            "Format should be [lat1, lng1, lat2, lng2, ...] or a valid coordinates_json field",
        },
        { status: 400 }
      );
    }

    // CRITICAL: Ensure the polygon is closed (first point equals last point)
    if (
      searchCoordinates[0] !==
        searchCoordinates[searchCoordinates.length - 2] ||
      searchCoordinates[1] !== searchCoordinates[searchCoordinates.length - 1]
    ) {
      console.log("Closing polygon by adding first point at the end");
      searchCoordinates.push(searchCoordinates[0], searchCoordinates[1]);
    }

    // Create the filter string for polygon search
    // Typesense requires the format: _geoloc:(lat1, lng1, lat2, lng2, ...)
    const polygonFilterString = `_geoloc:(${searchCoordinates.join(", ")})`;

    // Perform a direct polygon search with pagination
    const searchParameters = {
      q: query,
      query_by: "title,address,description",
      filter_by: polygonFilterString,
      per_page: per_page,
      page: page,
    };

    console.log("Typesense search parameters:", {
      ...searchParameters,
      filter_by: `polygon with ${searchCoordinates.length / 2} points`, // Simplified log
      page: page,
      per_page: per_page,
    });

    try {
      const searchResults = (await typesenseClient
        .collections(COLLECTION_PROPERTIES)
        .documents()
        .search(searchParameters)) as SearchResponse;

      console.log(
        `Found ${
          searchResults.found || 0
        } properties inside the polygon, returning page ${page} with ${
          searchResults.hits?.length || 0
        } properties`
      );

      return NextResponse.json({
        properties: searchResults.hits?.map((hit) => hit.document) || [],
        count: searchResults.found || 0,
        searchType: "polygon",
        points: searchCoordinates.length / 2,
        page: page,
        per_page: per_page,
      });
    } catch (error) {
      console.error("Error searching properties in polygon:", error);

      // For development, return some sample data when there's an error
      return NextResponse.json(
        {
          error: "Error searching for properties in polygon",
          details: error instanceof Error ? error.message : String(error),
          properties: sampleProperties,
          usingSampleData: true,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      {
        error: "Error processing request",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }
}
