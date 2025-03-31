"use client";

import { SearchBox, Hits, RefinementList } from "react-instantsearch";
import { PropertyDocument } from "../types/typesense";
import Image from "next/image";

const PropertyHitComponent = ({ hit }: { hit: PropertyDocument }) => {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {hit.cover_photo && (
        <div className="relative h-48">
          <img
            src={hit.cover_photo}
            alt={hit.title || "Property"}
            className="object-cover w-full h-full"
          />
        </div>
      )}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {hit.title || "Untitled Property"}
        </h3>
        <p className="text-gray-600">{hit.address || "No address available"}</p>
        {hit.price && (
          <p className="text-xl font-bold text-blue-600 mt-2">
            €{hit.price.toLocaleString()}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {hit.bedrooms && (
            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
              {hit.bedrooms} beds
            </span>
          )}
          {hit.bathrooms && (
            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
              {hit.bathrooms} baths
            </span>
          )}
          {hit.area && (
            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
              {hit.area}m²
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default function PropertySearch() {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-xl font-semibold mb-4">Search Properties</h2>

      <div className="mb-4">
        <SearchBox
          placeholder="Search for properties..."
          classNames={{
            root: "relative",
            form: "relative",
            input:
              "w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
            submit: "absolute right-3 top-1/2 transform -translate-y-1/2",
            reset: "absolute right-12 top-1/2 transform -translate-y-1/2",
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1">
          <div className="mb-6">
            <h3 className="font-medium mb-2">Price Range</h3>
            <RefinementList
              attribute="price_range"
              classNames={{
                list: "space-y-1",
                item: "flex items-center",
                checkbox:
                  "mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500",
                count:
                  "ml-2 text-xs text-gray-500 rounded-full bg-gray-100 px-2 py-0.5",
              }}
            />
          </div>

          <div className="mb-6">
            <h3 className="font-medium mb-2">Bedrooms</h3>
            <RefinementList
              attribute="bedrooms"
              classNames={{
                list: "space-y-1",
                item: "flex items-center",
                checkbox:
                  "mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500",
                count:
                  "ml-2 text-xs text-gray-500 rounded-full bg-gray-100 px-2 py-0.5",
              }}
            />
          </div>

          <div>
            <h3 className="font-medium mb-2">Property Type</h3>
            <RefinementList
              attribute="category_name"
              classNames={{
                list: "space-y-1",
                item: "flex items-center",
                checkbox:
                  "mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500",
                count:
                  "ml-2 text-xs text-gray-500 rounded-full bg-gray-100 px-2 py-0.5",
              }}
            />
          </div>
        </div>

        <div className="md:col-span-3">
          <Hits
            hitComponent={({ hit }) => (
              <PropertyHitComponent hit={hit as unknown as PropertyDocument} />
            )}
            classNames={{
              list: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
            }}
          />
        </div>
      </div>
    </div>
  );
}
