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
  const listboxRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  // Generate random counts for locations after component mounts
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const hit of hits) {
      const key = `${hit.id || ""}__${hit.gid_0}_${hit.gid_1 || ""}_${
        hit.gid_2 || ""
      }_${hit.gid_3 || ""}_${hit.gid_4 || ""}_level${hit.level}`;
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

  // Helper function to get location type label
  const getLocationTypeLabel = (location: LocationDocument): string => {
    if (location.level === 0) return location.type_0 || "País";
    if (location.level === 1) return location.type_1 || "Region (Distrito)";
    if (location.level === 2) return location.type_2 || "County (Concelho)";
    if (location.level === 3) return location.type_3 || "Parish (Freguesia)";
    if (location.level === 4) return location.type_4 || "Neighborhood (Bairro)";
    return `Nível ${location.level}`;
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

  // Get location count, using consistent random numbers or real count if available
  const getLocationCount = (hit: LocationDocument): number => {
    const key = `${hit.id || ""}__${hit.gid_0}_${hit.gid_1 || ""}_${
      hit.gid_2 || ""
    }_${hit.gid_3 || ""}_${hit.gid_4 || ""}_level${hit.level}`;
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
          className="absolute z-[1000] mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-96 overflow-y-auto"
          id="search-suggestions"
          ref={listboxRef}
          aria-label="Location suggestions"
        >
          {hits.map((hit, index) => {
            const isActive = index === activeSuggestionIndex;
            const locationKey = `loc-${hit.id || index}-${hit.gid_0}${
              hit.gid_1 || ""
            }${hit.gid_2 || ""}${hit.gid_3 || ""}`;

            return (
              <div
                key={locationKey}
                id={`option-${index}`}
                aria-selected={isActive}
                className={`px-4 py-2 cursor-pointer ${
                  isActive ? "bg-gray-100" : ""
                } hover:bg-gray-100`}
                onMouseDown={() => handleSelectLocation(hit)}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
                ref={isActive ? activeItemRef : null}
              >
                <div className="flex items-center">
                  <MapPinIcon
                    className="h-5 w-5 mr-2 text-gray-500"
                    aria-hidden="true"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{getDisplayName(hit)}</span>
                      <span
                        className={`text-sm rounded-full px-2 py-0.5 ${
                          hit.level === 0
                            ? "bg-blue-100 text-blue-700"
                            : hit.level === 1
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {getLocationCount(hit)}
                      </span>
                    </div>
                    <div className="flex flex-col text-gray-500 text-sm">
                      <span className={hit.level <= 1 ? "font-medium" : ""}>
                        {getLocationTypeLabel(hit)}
                      </span>
                      {getLocationDescription(hit) && (
                        <span className="text-xs mt-0.5">
                          {getLocationDescription(hit)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
