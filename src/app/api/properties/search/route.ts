import { NextResponse } from "next/server";
import {
  typesenseClient,
  COLLECTION_PROPERTIES,
} from "@/app/utils/typesenseClient";
import { sampleProperties } from "@/app/utils/sampleData";
import type {
  PropertyDocument,
  TypesenseSearchResults,
} from "@/app/types/typesense";

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json();
    const { q, filters, per_page = 20, page = 1 } = body;

    // Validate query
    if (!q && !filters) {
      return NextResponse.json(
        {
          error: "Search query or filters are required",
        },
        { status: 400 }
      );
    }

    // Build search parameters
    const searchParameters: Record<string, unknown> = {
      q: q || "*",
      query_by: "title,address,description",
      per_page: per_page,
      page: page,
    };

    // Add filters if provided
    if (filters) {
      searchParameters.filter_by = filters;
    }

    try {
      // Attempt to search for properties using Typesense
      const searchResults = (await typesenseClient
        .collections(COLLECTION_PROPERTIES)
        .documents()
        .search(
          searchParameters
        )) as unknown as TypesenseSearchResults<PropertyDocument>;

      return NextResponse.json({
        properties: searchResults.hits.map((hit) => hit.document),
        count: searchResults.found,
        source: "typesense",
      });
    } catch (searchError) {
      console.error("Typesense search error:", searchError);

      // Return sample data for testing if Typesense search fails
      return NextResponse.json({
        properties: sampleProperties,
        count: sampleProperties.length,
        usingSampleData: true,
      });
    }
  } catch (error) {
    console.error("Error processing search request:", error);
    return NextResponse.json(
      {
        error: "Error processing search request",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }
}
