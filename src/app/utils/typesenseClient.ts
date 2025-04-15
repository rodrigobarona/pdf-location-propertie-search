import Typesense from "typesense";

// Initialize Typesense client
export const typesenseClient = new Typesense.Client({
  apiKey: process.env.TYPESENSE_ADMIN_KEY || "",
  nodes: [
    {
      host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || "",
      port: Number.parseInt(process.env.NEXT_PUBLIC_TYPESENSE_PORT || "443"),
      protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || "https",
    },
  ],
  connectionTimeoutSeconds: 10,
});

// Collection names
export const COLLECTION_PROPERTIES =
  process.env.TYPESENSE_COLLECTION_PROPERTIES || "properties";
export const COLLECTION_LOCATIONS =
  process.env.NEXT_PUBLIC_TYPESENSE_COLLECTION_LOCATIONS || "portugal_gadm";
