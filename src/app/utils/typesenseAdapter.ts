"use client";

// Correct import for client components in the app
import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";
import { COLLECTION_LOCATIONS } from "./typesenseClient";

// Configure Typesense client
export const typesenseInstantsearchAdapter = new TypesenseInstantSearchAdapter({
  server: {
    apiKey: process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_KEY || "",
    nodes: [
      {
        host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || "",
        port: Number.parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || "443"),
        protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || "https",
      },
    ],
    cacheSearchResultsForSeconds: 2 * 60, // Cache search results for 2 minutes
  },
  // The adapter supports multiple indices, so you can search across collections
  additionalSearchParameters: {
    query_by: "name_1,name_2,name_3,name_4,country",
    sort_by: "_text_match:desc",
    per_page: 15,
  },
  geoLocationField: "location", // Field to use for geo search
  // Define collection index for locations
  collectionSpecificSearchParameters: {
    [COLLECTION_LOCATIONS]: {
      query_by: "name_1,name_2,name_3,name_4,country",
      sort_by: "_text_match:desc",
      per_page: 15,
    },
  },
});
