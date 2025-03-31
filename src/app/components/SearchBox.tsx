"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchBox, useHits } from "react-instantsearch";
import { MagnifyingGlassIcon, MapPinIcon } from "@heroicons/react/24/outline";
import type { LocationDocument } from "@/app/types/typesense";

interface SearchBoxProps {
  placeholder?: string;
  onLocationSelect: (location: LocationDocument) => void;
}

export default function SearchBox({
  placeholder = "Search...",
  onLocationSelect,
}: SearchBoxProps) {
  const { query, refine } = useSearchBox();
  const { hits } = useHits() as { hits: LocationDocument[] };
  const [inputValue, setInputValue] = useState(query);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [randomCounts, setRandomCounts] = useState<Record<string, number>>({});
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Generate random counts for locations after component mounts
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const hit of hits) {
      const key = `${hit.gid_0}_${hit.gid_1 || ""}_${hit.gid_2 || ""}_${
        hit.gid_3 || ""
      }`;
      counts[key] = Math.floor(Math.random() * 1000) + 1;
    }
    setRandomCounts(counts);
  }, [hits]);

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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInputValue(value);
    refine(value);
    setShowSuggestions(value.length > 0);
    setActiveIndex(-1);
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
    return (
      location.name_3 ||
      location.name_2 ||
      location.name_1 ||
      location.country ||
      "Unnamed Location"
    );
  };

  // Helper function to get location type label
  const getLocationTypeLabel = (location: LocationDocument): string => {
    if (location.level === 0) return "País";
    if (location.level === 1) return "Region (Distrito)";
    if (location.level === 2) return "County (Concelho)";
    if (location.level === 3) return "Parish (Freguesia)";
    return `Nível ${location.level}`;
  };

  // Helper function to get a detailed location description
  const getLocationDescription = (location: LocationDocument): string => {
    let typeDescription = "";

    if (location.level === 1) {
      typeDescription = location.type_1 || "District";
    } else if (location.level === 2) {
      typeDescription = location.type_2 || "Municipality";
    } else if (location.level === 3) {
      typeDescription = location.type_3 || "Parish";
    }

    // Add parent region if available
    let parentInfo = "";
    if (location.level === 3 && location.name_2) {
      parentInfo = ` in ${location.name_2}`;
    } else if (location.level === 2 && location.name_1) {
      parentInfo = ` in ${location.name_1}`;
    }

    return `${typeDescription}${parentInfo}`;
  };

  // Get location count, using consistent random numbers or real count if available
  const getLocationCount = (hit: LocationDocument): number => {
    const key = `${hit.gid_0}_${hit.gid_1 || ""}_${hit.gid_2 || ""}_${
      hit.gid_3 || ""
    }`;
    return hit.count || randomCounts[key] || 0;
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          value={inputValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Search locations"
          aria-controls={showSuggestions ? "location-suggestions" : undefined}
          aria-activedescendant={
            activeIndex >= 0 ? `location-item-${activeIndex}` : undefined
          }
          className="w-full py-3 pl-4 pr-10 border border-gray-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <MagnifyingGlassIcon
          className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400"
          aria-hidden="true"
        />
      </div>

      {showSuggestions && hits.length > 0 && (
        <div
          ref={suggestionsRef}
          id="location-suggestions"
          className="absolute z-[1000] mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-96 overflow-y-auto"
          tabIndex={-1}
        >
          <ul ref={listRef} aria-label="Search suggestions" className="py-2">
            {hits.map((hit, index) => {
              const locationName = getDisplayName(hit);
              const locationType = getLocationTypeLabel(hit);
              const locationDescription = getLocationDescription(hit);
              const locationKey = `${hit.gid_0}_${hit.gid_1 || ""}_${
                hit.gid_2 || ""
              }_${hit.gid_3 || ""}`;
              const isActive = index === activeIndex;

              return (
                <li
                  key={locationKey || `location-${index}`}
                  id={`location-item-${index}`}
                  role="option"
                  aria-selected={isActive}
                  className={`px-4 py-2 cursor-pointer ${
                    isActive ? "bg-gray-100" : ""
                  } hover:bg-gray-100`}
                  onClick={() => handleSelectLocation(hit)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleSelectLocation(hit);
                    }
                  }}
                  tabIndex={0}
                >
                  <div className="flex items-center">
                    <MapPinIcon
                      className="h-5 w-5 mr-2 text-gray-500"
                      aria-hidden="true"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{locationName}</span>
                        <span className="text-sm bg-gray-100 rounded-full px-2 py-0.5 text-gray-600">
                          {getLocationCount(hit)}
                        </span>
                      </div>
                      <div className="flex flex-col text-gray-500 text-sm">
                        <span>{locationType}</span>
                        {locationDescription && (
                          <span className="text-xs mt-0.5">
                            {locationDescription}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
