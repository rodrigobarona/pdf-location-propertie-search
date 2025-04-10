export interface LocationDocument {
  id?: string;
  ref?: string;
  level: number;
  gid_0: string;
  gid_1?: string;
  gid_2?: string;
  gid_3?: string;
  country: string;
  name_1?: string;
  name_2?: string;
  name_3?: string;
  type_1?: string;
  type_2?: string;
  type_3?: string;
  engtype_1?: string;
  engtype_2?: string;
  engtype_3?: string;
  geometry_type: string;
  coordinates_json: string;
  count?: number; // Number of properties in this location
}

export interface PropertyDocument {
  id?: string;
  ref?: string;
  title?: string;
  address?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  parish?: string;
  county?: string;
  zone?: string;
  category_name?: string;
  cover_photo?: string;
  _geoloc?: [number, number]; // [latitude, longitude]
}

export interface TypesenseSearchResults<T> {
  facet_counts: Record<string, unknown>;
  found: number;
  hits: Array<{
    document: T;
    highlights: Record<string, unknown>;
    text_match: number;
  }>;
  out_of: number;
  page: number;
  request_params: Record<string, unknown>;
  search_time_ms: number;
  __isArtificial?: boolean;
  query?: string;
}
