import type {
  Map as LeafletMap,
  GeoJSON as LeafletGeoJSON,
  Layer,
} from "leaflet";
import type { ReactNode, RefObject } from "react";

declare module "react-leaflet" {
  export interface MapContainerProps {
    center: [number, number];
    zoom: number;
    style?: React.CSSProperties;
    zoomControl?: boolean;
    scrollWheelZoom?: boolean;
    children?: ReactNode;
  }

  export interface TileLayerProps {
    attribution: string;
    url: string;
  }

  export interface GeoJSONProps<T = unknown> {
    data: T;
    style?: () => Record<string, unknown>;
    onEachFeature?: (feature: T, layer: Layer) => void;
    key?: string;
    ref?: RefObject<LeafletGeoJSON>;
  }

  export function MapContainer(props: MapContainerProps): JSX.Element;
  export function TileLayer(props: TileLayerProps): JSX.Element;
  export function GeoJSON<T = unknown>(props: GeoJSONProps<T>): JSX.Element;
  export function useMap(): LeafletMap;
}
