"use client";

import {
  SearchBox,
  Hits,
  RefinementList,
  useInstantSearch,
} from "react-instantsearch";
import type { LocationDocument } from "../types/typesense";

interface LocationSearchProps {
  onLocationSelect: (location: LocationDocument) => void;
}

const LocationHitComponent = ({
  hit,
  onSelect,
}: {
  hit: LocationDocument;
  onSelect: (location: LocationDocument) => void;
}) => {
  const name =
    hit.name_3 || hit.name_2 || hit.name_1 || hit.country || "Unnamed Location";
  const level = hit.level || 0;
  const levelLabel =
    ["Country", "Region", "District", "Municipality"][level] ||
    `Level ${level}`;

  return (
    <div
      className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onSelect(hit)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(hit);
        }
      }}
    >
      <h3 className="text-lg font-semibold mb-2">{name}</h3>
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
          {levelLabel}
        </span>
        {hit.type_1 && (
          <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
            {hit.type_1}
          </span>
        )}
        {hit.type_2 && (
          <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
            {hit.type_2}
          </span>
        )}
        {hit.type_3 && (
          <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
            {hit.type_3}
          </span>
        )}
      </div>
    </div>
  );
};

const EmptyQueryBoundary = ({ children }: { children: React.ReactNode }) => {
  const { results } = useInstantSearch();

  if (!results.__isArtificial && results.query === "") {
    return (
      <div className="text-center py-8 text-gray-500">
        Start typing to search for locations in Portugal
      </div>
    );
  }

  return <>{children}</>;
};

export default function LocationSearch({
  onLocationSelect,
}: LocationSearchProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-xl font-semibold mb-4">
        Search Administrative Regions
      </h2>

      <div className="mb-4">
        <SearchBox
          placeholder="Search for regions, districts or municipalities..."
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
          <h3 className="font-medium mb-2">Filter by Level</h3>
          <RefinementList
            attribute="level"
            classNames={{
              list: "space-y-1",
              item: "flex items-center",
              checkbox:
                "mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500",
              count:
                "ml-2 text-xs text-gray-500 rounded-full bg-gray-100 px-2 py-0.5",
            }}
            transformItems={(items) => {
              return items.map((item) => {
                const labelMap: Record<string, string> = {
                  "0": "Country",
                  "1": "Region",
                  "2": "District",
                  "3": "Municipality",
                };
                return {
                  ...item,
                  label: labelMap[item.label] || `Level ${item.label}`,
                };
              });
            }}
          />
        </div>

        <div className="md:col-span-3">
          <EmptyQueryBoundary>
            <Hits
              hitComponent={({ hit }) => (
                <LocationHitComponent
                  hit={hit as unknown as LocationDocument}
                  onSelect={onLocationSelect}
                />
              )}
              classNames={{
                list: "grid grid-cols-1 gap-4",
              }}
            />
          </EmptyQueryBoundary>
        </div>
      </div>
    </div>
  );
}
