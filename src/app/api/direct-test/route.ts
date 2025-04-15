import { NextResponse } from "next/server";
import {
  typesenseClient,
  COLLECTION_PROPERTIES,
} from "@/app/utils/typesenseClient";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filterBy, countOnly, searchId } = body;

    if (!filterBy) {
      return NextResponse.json(
        { error: "filterBy parameter is required" },
        { status: 400 }
      );
    }

    console.log(`[Direct Test] Processing test request with ID: ${searchId}`);
    console.log(`[Direct Test] Using filter: ${filterBy}`);

    try {
      // Simple test search to verify filter_by syntax and processing
      const searchResults = await typesenseClient
        .collections(COLLECTION_PROPERTIES)
        .documents()
        .search({
          q: "*",
          query_by: "title,address",
          filter_by: filterBy,
          per_page: countOnly ? 0 : 1,
        });

      console.log(
        `[Direct Test] Found ${searchResults.found || 0} properties with filter`
      );

      return NextResponse.json({
        success: true,
        count: searchResults.found || 0,
        searchId,
        message: "Direct test successful",
      });
    } catch (error) {
      console.error("[Direct Test] Search error:", error);

      // Return detailed error information
      return NextResponse.json(
        {
          error: "Search failed",
          details: error instanceof Error ? error.message : String(error),
          filter: filterBy,
          searchId,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Direct Test] API error:", error);
    return NextResponse.json(
      {
        error: "API error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
