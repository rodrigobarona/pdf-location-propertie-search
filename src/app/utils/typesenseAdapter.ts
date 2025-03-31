"use client";

// Correct import for client components
import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";

// Configure Typesense client
export const typesenseInstantsearchAdapter = new TypesenseInstantSearchAdapter({
  server: {
    apiKey: process.env.NEXT_PUBLIC_TYPESENSE_API_KEY || "",
    nodes: [
      {
        host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || "",
        port: Number.parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || "443"),
        protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || "https",
      },
    ],
  },
  additionalSearchParameters: {
    query_by: "name_1,name_2,name_3,country",
    sort_by: "_text_match:desc, level:asc",
    per_page: 10,
  },
});
