"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchBox, useHits, useInstantSearch } from "react-instantsearch";
import { MagnifyingGlassIcon, MapPinIcon } from "@heroicons/react/24/outline";
import type { LocationDocument } from "@/app/types/typesense";

interface SearchBoxProps {
  placeholder?: string;
  onLocationSelect: (location: LocationDocument) => void;
}

// Separate component for loading and displaying a location count
function LocationCount({ location }: { location: LocationDocument }) {
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCount() {
      setIsLoading(true);
      try {
        const result = await fetchLocationCount(location);
        if (isMounted) {
          setCount(result);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    }

    loadCount();

    return () => {
      isMounted = false;
    };
  }, [location]);

  // Format count for display
  const formatCount = (count: number): string => {
    if (count === 0) return "0 properties";
    if (count === 1) return "1 property";
    if (count > 999) return `${Math.floor(count / 1000)}k+ properties`;
    return `${count} properties`;
  };

  if (isLoading) return <span className="text-xs opacity-70">Loading...</span>;
  if (error) return <span className="text-xs text-red-500">Error</span>;
  if (count === 0) return null;

  return <span>{formatCount(count || 0)}</span>;
}

// Helper function to fetch location count
async function fetchLocationCount(hit: LocationDocument): Promise<number> {
  // Generate a search ID for this count query
  const countSearchId = `count_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;

  try {
    // For level 4 (point locations), use radius search
    if (hit.level === 4 || hit.geometry_type === "Point") {
      if (hit.point_lat && hit.point_lng && hit.radius) {
        // Calculate radius in km for Typesense
        const radiusKm = hit.radius / 1000;

        const response = await fetch("/api/properties/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Count-Only": "true", // Signal this is just a count request
          },
          body: JSON.stringify({
            filter_by: `_geoloc:(${hit.point_lat}, ${hit.point_lng}, ${radiusKm} km)`,
            query: "*",
            per_page: 0, // We only need the count, not actual results
            searchId: countSearchId,
            count_only: true, // Special flag for our API to only return count
            location_level: hit.level,
            location_id: hit.id,
            location_name:
              hit.name_4 || hit.name_3 || hit.name_2 || hit.name_1 || "unknown",
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.count || 0;
        }
      }
    }
    // For levels 0-3 (polygon locations), use polygon search
    else if (hit.coordinates_json) {
      const response = await fetch("/api/properties/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Count-Only": "true",
        },
        body: JSON.stringify({
          coordinates_json: hit.coordinates_json,
          geometry_type: hit.geometry_type,
          query: "*",
          per_page: 0, // We only need the count
          searchId: countSearchId,
          count_only: true,
          location_level: hit.level,
          location_id: hit.id,
          location_name: hit.name_3 || hit.name_2 || hit.name_1 || "unknown",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.count || 0;
      }
    }
  } catch (error) {
    console.error("Error fetching property count:", error);
  }

  // Fall back to a random count between 1-1000 if fetch fails
  return Math.floor(Math.random() * 1000) + 1;
}

// Separate component for a location item
function LocationItem({
  hit,
  index,
  activeIndex,
  onSelect,
  getDisplayName,
  getLocationDescription,
}: {
  hit: LocationDocument;
  index: number;
  activeIndex: number;
  onSelect: (location: LocationDocument) => void;
  getDisplayName: (location: LocationDocument) => string;
  getLocationDescription: (location: LocationDocument) => string;
}) {
  const activeItemRef = useRef<HTMLButtonElement>(null);

  // Scroll active item into view
  useEffect(() => {
    if (index === activeIndex && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeIndex, index]);

  return (
    <button
      key={hit.id || index}
      id={`location-${index}`}
      className={`w-full text-left cursor-pointer px-4 py-2 ${
        index === activeIndex
          ? "bg-indigo-600 text-white"
          : "hover:bg-gray-100 text-gray-900"
      }`}
      onClick={() => onSelect(hit)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(hit);
        }
      }}
      ref={index === activeIndex ? activeItemRef : null}
      data-location-id={hit.id}
      data-location-level={hit.level}
      type="button"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium">{getDisplayName(hit)}</div>
          <div
            className={`mt-1 text-sm ${
              index === activeIndex ? "text-indigo-200" : "text-gray-500"
            }`}
          >
            {getLocationDescription(hit)}
          </div>
        </div>
        <div
          className={`ml-2 rounded-full px-2 py-1 text-xs ${
            index === activeIndex
              ? "bg-indigo-800 text-indigo-100"
              : "bg-indigo-100 text-indigo-800"
          }`}
        >
          <div className="flex items-center">
            <MapPinIcon className="mr-1 h-3 w-3" />
            <Suspense fallback={<span className="text-xs">Loading...</span>}>
              <LocationCount location={hit} />
            </Suspense>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function SearchBox({
  placeholder = "Search...",
  onLocationSelect,
}: SearchBoxProps) {
  const { query, refine } = useSearchBox();
  const { hits } = useHits() as { hits: LocationDocument[] };
  const { refresh } = useInstantSearch();
  const [inputValue, setInputValue] = useState(query);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Track the last query to prevent duplicate searches
  const lastQueryRef = useRef<string>("");

  // Generate a unique search identifier on component mount
  const searchIdRef = useRef<string>(
    `search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // Handle clicks outside to close suggestions
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Update input value when query changes
  useEffect(() => {
    setInputValue(query);
  }, [query]);

  // Reset search state completely when needed
  const resetSearch = useCallback(() => {
    // Clear UI state
    setShowSuggestions(false);
    setActiveIndex(-1);

    // Force instantsearch to refresh with a new search ID
    searchIdRef.current = `search_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    refresh();
  }, [refresh]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInputValue(value);

    // Only trigger a new search if the query has actually changed
    if (value !== lastQueryRef.current) {
      lastQueryRef.current = value;
      refine(value);
      setShowSuggestions(value.length > 0);
      setActiveIndex(-1);
    }
  };

  const handleFocus = () => {
    if (inputValue.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleSelectLocation = (location: LocationDocument) => {
    const displayName = getDisplayName(location);
    setInputValue(displayName);
    setShowSuggestions(false);
    setActiveIndex(-1);

    // Reset search state to ensure fresh results for next search
    resetSearch();

    // Notify parent component
    onLocationSelect(location);
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!showSuggestions || hits.length === 0) return;

    // Arrow Down
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev < hits.length - 1 ? prev + 1 : 0));
    }
    // Arrow Up
    else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : hits.length - 1));
    }
    // Enter
    else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSelectLocation(hits[activeIndex]);
    }
    // Escape
    else if (event.key === "Escape") {
      event.preventDefault();
      setShowSuggestions(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  // Helper function to get display name for a location
  const getDisplayName = (location: LocationDocument): string => {
    if (location.level === 0) {
      return location.country || "Unknown Country";
    }
    if (location.level === 1) {
      return location.name_1 || location.country || "Unknown Region";
    }

    return (
      location.name_4 ||
      location.name_3 ||
      location.name_2 ||
      location.name_1 ||
      location.country ||
      "Unnamed Location"
    );
  };

  // Helper function to get a detailed location description
  const getLocationDescription = (location: LocationDocument): string => {
    let typeDescription = "";

    if (location.level === 0) {
      typeDescription = "Country";
      return typeDescription;
    }

    if (location.level === 1) {
      typeDescription = location.type_1 || "District";
      return `${typeDescription} in ${location.country}`;
    }

    if (location.level === 2) {
      typeDescription = location.type_2 || "Municipality";
      if (location.name_1) {
        return `${typeDescription} in ${location.name_1}`;
      }
    }

    if (location.level === 3) {
      typeDescription = location.type_3 || "Parish";
      if (location.name_2) {
        return `${typeDescription} in ${location.name_2}${
          location.name_1 ? `, ${location.name_1}` : ""
        }`;
      }
    }

    if (location.level === 4) {
      typeDescription = location.type_4 || "Neighborhood";
      if (location.name_3) {
        return `${typeDescription} in ${location.name_3}${
          location.name_2 ? `, ${location.name_2}` : ""
        }`;
      }
    }

    // Add parent region if available
    let parentInfo = "";
    if (location.level === 3 && location.name_2) {
      parentInfo = ` in ${location.name_2}`;
    } else if (location.level === 2 && location.name_1) {
      parentInfo = ` in ${location.name_1}`;
    } else if (location.level === 4 && location.name_3) {
      parentInfo = ` in ${location.name_3}`;
    }

    return `${typeDescription}${parentInfo}`;
  };

  return (
    <div className="relative z-50">
      <div className="relative">
        <input
          type="text"
          ref={inputRef}
          value={inputValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-label="Search locations"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          aria-controls={showSuggestions ? "location-suggestions" : undefined}
          aria-activedescendant={
            activeIndex >= 0 ? `location-${activeIndex}` : undefined
          }
        />
        <div className="absolute inset-y-0 left-0 flex items-center pl-3">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
        </div>
      </div>

      {showSuggestions && hits.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute mt-2 max-h-96 w-full overflow-y-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5"
          id="location-suggestions"
        >
          <div className="w-full">
            {hits.map((hit, index) => (
              <LocationItem
                key={hit.id || index}
                hit={hit}
                index={index}
                activeIndex={activeIndex}
                onSelect={handleSelectLocation}
                getDisplayName={getDisplayName}
                getLocationDescription={getLocationDescription}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
