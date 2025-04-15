"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { InstantSearch } from "react-instantsearch";
import type { LocationDocument } from "./types/typesense";
import { typesenseInstantsearchAdapter } from "./utils/typesenseAdapter";
import SearchBox from "./components/SearchBox";

// Get the locations collection name from environment variables
const LOCATIONS_COLLECTION = process.env.NEXT_PUBLIC_TYPESENSE_COLLECTION_LOCATIONS || "portugal_gadm";

// Dynamically import the MapWidget to avoid SSR issues with Leaflet
const MapWidget = dynamic(() => import("./components/MapWidget"), {
  ssr: false,
});

export default function Home() {
  const [selectedLocation, setSelectedLocation] =
    useState<LocationDocument | null>(null);

  const handleLocationSelect = (location: LocationDocument) => {
    setSelectedLocation(location);
  };

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="w-full bg-[#e8f162] py-8 mb-4 text-center">
        <h1 className="text-4xl font-bold">Agora é o momento</h1>
      </div>

      <div className="w-full max-w-7xl px-4">
        <InstantSearch
          indexName={LOCATIONS_COLLECTION}
          searchClient={typesenseInstantsearchAdapter.searchClient}
        >
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              type="button"
              className="px-8 py-2 border-2 border-[#d4277b] text-[#d4277b] font-bold rounded-sm"
            >
              Comprar
            </button>
            <button
              type="button"
              className="px-8 py-2 border-2 border-gray-300 text-gray-700 font-bold rounded-sm"
            >
              Arrendar
            </button>

            <div className="flex-1 flex">
              <div className="relative flex-1">
                <SearchBox
                  onLocationSelect={handleLocationSelect}
                  placeholder="Onde quer viver?"
                />
              </div>
              <button
                type="button"
                className="px-8 py-2 bg-[#d4277b] text-white font-bold rounded-sm"
              >
                Procurar
              </button>
            </div>
          </div>

          {selectedLocation && (
            <div className="w-full h-[600px] rounded-lg overflow-hidden shadow-lg mb-8">
              <MapWidget locationResult={selectedLocation} />
            </div>
          )}
        </InstantSearch>
      </div>
    </main>
  );
}
