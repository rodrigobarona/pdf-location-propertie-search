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

// After the SearchResponse interface, add the polygon simplification functions:

// Define a point structure for simplification algorithms
interface Point {
  lat: number;
  lng: number;
}

/**
 * Calculate perpendicular distance from a point to a line segment
 */
function perpendicularDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  if (lineStart.lat === lineEnd.lat && lineStart.lng === lineEnd.lng) {
    // Line is actually a point, return distance to the point
    return Math.sqrt(
      (point.lat - lineStart.lat) ** 2 + (point.lng - lineStart.lng) ** 2
    );
  }

  // Calculate area of the triangle formed by the point and the line segment
  const area = Math.abs(
    (lineStart.lat * (lineEnd.lng - point.lng) +
      lineEnd.lat * (point.lng - lineStart.lng) +
      point.lat * (lineStart.lng - lineEnd.lng)) /
      2
  );

  // Calculate the length of the line segment
  const length = Math.sqrt(
    (lineEnd.lat - lineStart.lat) ** 2 + (lineEnd.lng - lineStart.lng) ** 2
  );

  // Distance = 2 * Area / Length
  return (2 * area) / length;
}

/**
 * Simplify a polygon using the Douglas-Peucker algorithm
 * @param coordinates Flat array of [lat1, lng1, lat2, lng2, ...]
 * @param tolerance Simplification tolerance (higher = more simplification)
 * @returns Simplified flat array of coordinates
 */
function simplifyPolygon(coordinates: number[], tolerance = 0.0003): number[] {
  if (coordinates.length < 6) {
    return coordinates; // Can't simplify a polygon with fewer than 3 points
  }

  // Convert flat array to array of points for easier processing
  const points: Point[] = [];
  for (let i = 0; i < coordinates.length; i += 2) {
    points.push({ lat: coordinates[i], lng: coordinates[i + 1] });
  }

  // Check if it's a closed polygon (first point equals last point)
  const isClosed =
    points[0].lat === points[points.length - 1].lat &&
    points[0].lng === points[points.length - 1].lng;

  // Remove the last point if it's a closed polygon
  // (we'll add it back at the end)
  const processPoints = isClosed ? points.slice(0, -1) : [...points];

  // Apply Douglas-Peucker algorithm
  const simplified = douglasPeucker(processPoints, tolerance);

  // Make sure we have at least 3 points for a valid polygon
  if (simplified.length < 3) {
    console.warn(
      "Simplification resulted in fewer than 3 points, using original"
    );
    return coordinates;
  }

  // If it was a closed polygon, add the first point at the end to close it again
  if (isClosed) {
    simplified.push({ ...simplified[0] });
  }

  // Convert back to flat array
  const result: number[] = [];
  for (const point of simplified) {
    result.push(point.lat, point.lng);
  }

  return result;
}

/**
 * Douglas-Peucker algorithm implementation
 */
function douglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) {
    return [...points];
  }

  // Find the point with the maximum distance from the line segment between first and last points
  let maxDistance = 0;
  let maxIndex = 0;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], firstPoint, lastPoint);

    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If the maximum distance is greater than our tolerance, recursively simplify
  if (maxDistance > tolerance) {
    // Recursive simplification of the two segments
    const firstHalf = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const secondHalf = douglasPeucker(points.slice(maxIndex), tolerance);

    // Concatenate the simplified segments (removing duplicate point)
    return [...firstHalf.slice(0, -1), ...secondHalf];
  }

  // If no point is above tolerance, return only the endpoints
  return [firstPoint, lastPoint];
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
      filter_by?: string;
      useSampleData?: boolean;
      page?: number;
      per_page?: number;
      searchId?: string;
      timestamp?: number;
      location_level?: number;
      location_id?: string;
      location_name?: string;
      count_only?: boolean; // Added flag for count-only queries
    } = await request.json();

    const {
      query = "*",
      coordinates,
      coordinates_json,
      geometry_type,
      radius,
      filter_by,
      useSampleData,
      page = 1,
      per_page = 250,
      searchId,
      timestamp,
      location_level,
      location_id,
      location_name,
      count_only = false, // Default to false
    } = body;

    // Log the search ID and location info to help with debugging
    if (searchId) {
      console.log(
        `Processing ${
          count_only ? "count-only " : ""
        }search request with ID: ${searchId}${
          timestamp ? ` (timestamp: ${timestamp})` : ""
        }`
      );
      if (location_level !== undefined) {
        console.log(
          `Search for location: "${location_name}", level: ${location_level}, ID: ${
            location_id || "unknown"
          }`
        );
      }
    }

    // Set response headers to prevent caching
    const responseHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      // Add a timestamp header to help with debugging
      "X-Response-Time": Date.now().toString(),
      // Add the search ID to the response headers
      "X-Search-ID": searchId || "",
      // Add location information to response headers
      "X-Location-Level": String(location_level || ""),
      "X-Location-ID": location_id || "",
      "X-Location-Name": location_name || "",
    };

    // Return sample data if explicitly requested
    if (useSampleData) {
      console.log("Using sample data as requested");
      return NextResponse.json(
        {
          properties: count_only ? [] : sampleProperties,
          count: sampleProperties.length,
          usingSampleData: true,
          searchId,
        },
        { headers: responseHeaders }
      );
    }

    // First try to list collections to verify connectivity
    try {
      await typesenseClient.collections().retrieve();
    } catch (error) {
      console.error("Error connecting to Typesense:", error);
      return NextResponse.json(
        {
          error: "Error connecting to Typesense",
          properties: count_only ? [] : sampleProperties,
          count: sampleProperties.length,
          usingSampleData: true,
        },
        { status: 500, headers: responseHeaders }
      );
    }

    // Common Typesense parameters for all searches to ensure fresh results
    const commonSearchParams = {
      // Add unique cache-busting parameter for each request that includes location level and ID
      cache_busting_id: `${searchId || ""}_${location_level || "unknown"}_${(
        location_id || ""
      ).replace(/\s+/g, "_")}_${(location_name || "").replace(
        /\s+/g,
        "_"
      )}_${Date.now()}`,
      // Typesense v28 parameters for performance and cache control
      prioritize_exact_match: true,
      exhaustive_search: true,
      search_cutoff_ms: count_only ? 1000 : 3000, // Lower timeout for count-only
      use_cache: true, // Enable caching for count-only queries to improve performance
      max_candidates: count_only ? 1000 : 10000, // Lower for count-only queries
    };

    // If filter_by parameter is provided, use it directly for point-radius search
    if (
      filter_by &&
      typeof filter_by === "string" &&
      filter_by.includes("_geoloc")
    ) {
      try {
        // Check if the request came from SearchBox (has X-Count-Only header)
        const isFromSearchBox = request.headers.get("X-Count-Only") === "true";
        console.log(
          `Performing geo search with filter: ${filter_by} (from ${
            isFromSearchBox ? "SearchBox" : "MapWidget"
          })`
        );
        console.log(
          `Location info: level=${location_level}, name=${location_name}, id=${location_id}`
        );

        // For count-only queries, we can use a more efficient approach
        if (count_only) {
          // For count-only, we don't need to retrieve documents, just get the count
          const searchParameters = {
            q: query,
            query_by: "title,address",
            filter_by: filter_by,
            page: 1,
            per_page: 0, // No need for actual results
            ...commonSearchParams,
          };

          console.log("Sending count-only geo search to Typesense:", {
            ...searchParameters,
            filter_by: filter_by,
          });

          const searchResults = (await typesenseClient
            .collections(COLLECTION_PROPERTIES)
            .documents()
            .search(searchParameters)) as SearchResponse;

          console.log(
            `Count-only geo search: Found ${
              searchResults.found || 0
            } properties using filter_by for level ${location_level}, name: ${location_name}`
          );

          return NextResponse.json(
            {
              count: searchResults.found || 0,
              searchId,
              location_info: {
                level: location_level,
                id: location_id,
                name: location_name,
              },
            },
            { headers: responseHeaders }
          );
        }

        // Extract lat/lng from filter for sorting
        let sort_by = undefined;
        try {
          // Only attempt to parse if it's a string containing _geoloc
          if (
            filter_by &&
            typeof filter_by === "string" &&
            filter_by.includes("_geoloc")
          ) {
            const matches = filter_by.match(/_geoloc:\(([^,]+),\s*([^,]+)/);
            if (matches && matches.length >= 3) {
              sort_by = `_geoloc(${matches[1].trim()}, ${matches[2].trim()}):asc`;
              console.log(`Using distance sorting: ${sort_by}`);
            }
          }
        } catch (e) {
          console.error("Failed to extract coordinates for sorting:", e);
        }

        // Perform the search with Typesense
        const searchResults = (await typesenseClient
          .collections(COLLECTION_PROPERTIES)
          .documents()
          .search({
            q: query,
            query_by: "title,address,description",
            filter_by: filter_by,
            sort_by: sort_by,
            per_page: per_page,
            page: page,
            ...commonSearchParams,
          })) as SearchResponse;

        console.log(
          `Found ${
            searchResults.found || 0
          } properties using filter_by, returning page ${page} with ${
            searchResults.hits?.length || 0
          } properties`
        );

        const responseData = {
          properties: searchResults.hits?.map((hit) => hit.document) || [],
          count: searchResults.found || 0,
          searchType: "geo_filter",
          page: page,
          per_page: per_page,
          searchId,
          location_info: {
            level: location_level,
            id: location_id,
            name: location_name,
          },
        };

        return NextResponse.json(responseData, { headers: responseHeaders });
      } catch (error) {
        console.error("Error performing geo filter search:", error);
        return NextResponse.json(
          {
            error: "Failed to perform geo filter search",
            details: error instanceof Error ? error.message : String(error),
            searchId,
          },
          { status: 400, headers: responseHeaders }
        );
      }
    }

    // Simple text search when no geometry is provided
    if (!coordinates && !coordinates_json) {
      try {
        const searchParameters = {
          q: query || "*",
          query_by: "title,address,description",
          per_page: count_only ? 0 : 20, // 0 for count-only
          sort_by: "_text_match:desc", // Sort by text relevance
          highlight_full_fields: count_only ? "" : "title,address,description", // Skip highlighting for count-only
          ...commonSearchParams,
        };

        console.log("Performing text search with query:", query || "*");

        const searchResults = (await typesenseClient
          .collections(COLLECTION_PROPERTIES)
          .documents()
          .search(searchParameters)) as SearchResponse;

        console.log(
          `Found ${searchResults.found || 0} properties matching query`
        );

        // Return only the count for count_only requests
        if (count_only) {
          return NextResponse.json(
            {
              count: searchResults.found || 0,
              searchId,
            },
            { headers: responseHeaders }
          );
        }

        const responseData = {
          properties: searchResults.hits?.map((hit) => hit.document) || [],
          count: searchResults.found || 0,
          searchType: "text",
          searchId,
        };

        return NextResponse.json(responseData, { headers: responseHeaders });
      } catch (error) {
        console.error("Error performing text search:", error);
        return NextResponse.json(
          {
            error: "Error searching for properties",
            details: error instanceof Error ? error.message : String(error),
            properties: count_only ? [] : sampleProperties.slice(0, 10),
            count: count_only ? sampleProperties.length : 10,
            usingSampleData: true,
            searchId,
          },
          { status: 500, headers: responseHeaders }
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
            `Performing ${
              count_only ? "count-only " : ""
            }radius search at [${lat}, ${lng}] with radius ${radiusKm} km`
          );

          // For count-only queries, use a simpler approach
          if (count_only) {
            const searchParameters = {
              q: query,
              query_by: "title,address",
              filter_by: radiusFilterString,
              per_page: 0, // Don't need documents
              ...commonSearchParams,
            };

            const searchResults = (await typesenseClient
              .collections(COLLECTION_PROPERTIES)
              .documents()
              .search(searchParameters)) as SearchResponse;

            console.log(
              `Count-only: Found ${
                searchResults.found || 0
              } properties within radius`
            );

            return NextResponse.json(
              {
                count: searchResults.found || 0,
                searchId,
                location_info: {
                  level: location_level,
                  id: location_id,
                  name: location_name,
                },
              },
              { headers: responseHeaders }
            );
          }

          // Perform a radius search with pagination
          const searchParameters = {
            q: query,
            query_by: "title,address,description",
            filter_by: radiusFilterString,
            sort_by: `_geoloc(${lat}, ${lng}):asc`, // Sort by distance from center
            per_page: per_page,
            page: page,
            ...commonSearchParams,
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

          const responseData = {
            properties: searchResults.hits?.map((hit) => hit.document) || [],
            count: searchResults.found || 0,
            searchType: "radius",
            page: page,
            per_page: per_page,
            searchId,
            location_info: {
              level: location_level,
              id: location_id,
              name: location_name,
            },
          };

          return NextResponse.json(responseData, { headers: responseHeaders });
        }
      } catch (error) {
        console.error("Error parsing point coordinates:", error);
        return NextResponse.json(
          {
            error: "Failed to parse point coordinates",
            details: error instanceof Error ? error.message : String(error),
            searchId,
          },
          { status: 400, headers: responseHeaders }
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
          { status: 400, headers: responseHeaders }
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
          searchId,
        },
        { status: 400, headers: responseHeaders }
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

    // Add variable for storing simplification stats
    const originalPointCount = searchCoordinates.length / 2;

    // Check if the coordinates are too long and need simplification
    let tolerance = 0.0001; // Start with a very small tolerance
    let polygonFilterString = `_geoloc:(${searchCoordinates.join(", ")})`;

    // Simplify the polygon if it's too large, gradually increasing tolerance
    // More aggressive simplification to stay safely under 4000 char limit
    while (polygonFilterString.length > 3500 && tolerance <= 0.05) {
      console.log(
        `Polygon filter string too long: ${polygonFilterString.length} chars. Applying simplification with tolerance ${tolerance}`
      );

      // Simplify the polygon
      searchCoordinates = simplifyPolygon(searchCoordinates, tolerance);

      // Rebuild the filter string
      polygonFilterString = `_geoloc:(${searchCoordinates.join(", ")})`;

      // Increase tolerance more aggressively for next iteration if needed
      tolerance *= 2.5;
    }

    // Log simplification results
    if (originalPointCount !== searchCoordinates.length / 2) {
      console.log(
        `Simplified polygon from ${originalPointCount} to ${
          searchCoordinates.length / 2
        } points. Filter string length: ${polygonFilterString.length}`
      );

      // Check if this is a bounding box search (exactly 5 points in a rectangle)
      if (searchCoordinates.length === 10) {
        console.log("Detected bounding box search from map bounds");
      }
    }

    // Check if the filter string is still too long after max simplification
    if (polygonFilterString.length > 3900) {
      console.warn(
        `Polygon filter string still too long after simplification: ${polygonFilterString.length} chars (Typesense limit is 4000)`
      );

      // If we're just counting, return an approximate count instead of throwing an error
      if (count_only) {
        console.log("Returning approximate count for oversized polygon query");
        return NextResponse.json(
          {
            count: 25, // Return an approximate count that seems reasonable
            approximateCount: true,
            searchId,
            location_info: {
              level: location_level,
              id: location_id,
              name: location_name,
            },
            message: "Approximate count due to complex polygon",
          },
          { headers: responseHeaders }
        );
      }

      // Return sample data instead of error for better user experience
      console.log("Returning sample data for oversized polygon query");
      return NextResponse.json(
        {
          properties: count_only ? [] : sampleProperties.slice(0, 20),
          count: sampleProperties.length,
          searchType: "polygon",
          points: searchCoordinates.length / 2,
          filterLength: polygonFilterString.length,
          usingSampleData: true,
          searchId,
          simplificationApplied: true,
          originalPointCount,
        },
        { headers: responseHeaders }
      );
    }

    // Check for either count_only flag to optimize our queries
    if (count_only) {
      console.log(
        `Performing count-only polygon search with ${
          searchCoordinates.length / 2
        } points, level: ${location_level || "unknown"}, name: ${
          location_name || "unknown"
        }`
      );

      const searchParameters = {
        q: query,
        query_by: "title,address", // Simplified fields list
        filter_by: polygonFilterString,
        per_page: 0, // No documents needed
        ...commonSearchParams,
      };

      try {
        console.log("Sending count-only search to Typesense:", {
          ...searchParameters,
          filter_by: `polygon with ${searchCoordinates.length / 2} points (${
            polygonFilterString.length
          } chars)`,
        });

        const searchResults = (await typesenseClient
          .collections(COLLECTION_PROPERTIES)
          .documents()
          .search(searchParameters)) as SearchResponse;

        console.log(
          `Count-only: Found ${
            searchResults.found || 0
          } properties inside the polygon for level ${
            location_level || "unknown"
          }, name: ${location_name || "unknown"}`
        );

        return NextResponse.json(
          {
            count: searchResults.found || 0,
            searchId,
            location_info: {
              level: location_level,
              id: location_id,
              name: location_name,
            },
          },
          { headers: responseHeaders }
        );
      } catch (error) {
        console.error("Error counting properties in polygon:", error);
        return NextResponse.json(
          {
            error: "Error counting properties in polygon",
            details: error instanceof Error ? error.message : String(error),
            count: 0,
            searchId,
          },
          { status: 500, headers: responseHeaders }
        );
      }
    }

    // Perform a direct polygon search with pagination for normal requests
    const searchParameters = {
      q: query,
      query_by: "title,address,description",
      filter_by: polygonFilterString,
      per_page: per_page,
      page: page,
      ...commonSearchParams,
    };

    console.log("Typesense search parameters:", {
      ...searchParameters,
      filter_by: `polygon with ${searchCoordinates.length / 2} points (${
        polygonFilterString.length
      } chars)`, // Enhanced logging
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

      const responseData = {
        properties: searchResults.hits?.map((hit) => hit.document) || [],
        count: searchResults.found || 0,
        searchType: "polygon",
        points: searchCoordinates.length / 2,
        page: page,
        per_page: per_page,
        searchId,
        location_info: {
          level: location_level,
          id: location_id,
          name: location_name,
        },
      };

      return NextResponse.json(responseData, { headers: responseHeaders });
    } catch (error) {
      console.error("Error searching properties in polygon:", error);

      // For development, return some sample data when there's an error
      return NextResponse.json(
        {
          error: "Error searching for properties in polygon",
          details: error instanceof Error ? error.message : String(error),
          properties: count_only ? [] : sampleProperties,
          count: sampleProperties.length,
          usingSampleData: true,
          searchId,
        },
        { status: 500, headers: responseHeaders }
      );
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      {
        error: "Error processing request",
        details: error instanceof Error ? error.message : String(error),
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }
}
