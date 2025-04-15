import { NextResponse } from "next/server";
import { typesenseClient } from "@/app/utils/typesenseClient";
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
      coordinates?: number[];
      coordinates_json?: string;
      useSampleData?: boolean;
    } = await request.json();

    const { coordinates, coordinates_json, useSampleData } = body;

    // Return sample data if explicitly requested
    if (useSampleData) {
      return NextResponse.json({
        properties: sampleProperties,
        count: sampleProperties.length,
        usingSampleData: true,
      });
    }

    // Prepare coordinates for search
    let searchCoordinates: number[] = [];

    // Option 1: Using raw coordinates already in [lat, lng] format
    if (coordinates && Array.isArray(coordinates) && coordinates.length >= 6) {
      searchCoordinates = [...coordinates];
      console.log(
        `Using provided coordinates array with ${coordinates.length / 2} points`
      );
    }
    // Option 2: Using coordinates_json field from location document
    else if (coordinates_json) {
      try {
        const parsedCoordinates = JSON.parse(coordinates_json);

        // Handle MultiPolygon format (most common in location documents)
        if (
          Array.isArray(parsedCoordinates) &&
          parsedCoordinates.length > 0 &&
          Array.isArray(parsedCoordinates[0]) &&
          parsedCoordinates[0].length > 0
        ) {
          // Extract the first polygon's outer ring
          const polygonRing = parsedCoordinates[0][0];

          if (Array.isArray(polygonRing) && polygonRing.length > 0) {
            // Convert from [lng, lat] format to [lat, lng] for Typesense
            for (const point of polygonRing) {
              if (Array.isArray(point) && point.length >= 2) {
                searchCoordinates.push(Number(point[1]), Number(point[0])); // lat, lng
              }
            }
            console.log(
              `Extracted ${
                searchCoordinates.length / 2
              } points from coordinates_json`
            );
          }
        }
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

    // Log the prepared coordinates
    console.log(
      `Using ${searchCoordinates.length / 2} points for polygon search`
    );

    try {
      // Ensure the polygon is closed
      if (
        searchCoordinates[0] !==
          searchCoordinates[searchCoordinates.length - 2] ||
        searchCoordinates[1] !== searchCoordinates[searchCoordinates.length - 1]
      ) {
        // Add the first point coordinates again to close the polygon
        searchCoordinates.push(searchCoordinates[0], searchCoordinates[1]);
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

      // Create the filter string for polygon search
      // Typesense requires the format: _geoloc:(lat1, lng1, lat2, lng2, ...)
      const polygonFilterString = `_geoloc:(${searchCoordinates.join(", ")})`;

      // Perform a direct polygon search
      const searchParameters = {
        q: "*",
        query_by: "title,address,description",
        filter_by: polygonFilterString,
        per_page: 250,
      };

      console.log("Typesense search parameters:", searchParameters);

      const searchResults = (await typesenseClient
        .collections("properties")
        .documents()
        .search(searchParameters)) as SearchResponse;

      console.log(
        `Found ${searchResults.hits?.length || 0} properties inside the polygon`
      );

      return NextResponse.json({
        properties: searchResults.hits?.map((hit) => hit.document) || [],
        count: searchResults.hits?.length || 0,
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
