import {useEffect, useRef, useState} from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {AbsoluteFill, staticFile, useDelayRender} from "remotion";

const predictionCoordinates: [[number, number], [number, number], [number, number], [number, number]] = [
  [0.05776498450473856, 42.95483227778488],
  [3.3680129450848524, 42.99207106268313],
  [3.354081835470876, 40.50617169316801],
  [0.16896126830144184, 40.47202679402399],
];

type MapPlateProps = { variant?: "topo" | "preview" };

export const MapPlate: React.FC<MapPlateProps> = ({variant = "topo"}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {delayRender, continueRender} = useDelayRender();
  const [loadingHandle] = useState(() => delayRender("Carregant el mapa de Catalunya"));
  const preview = variant === "preview";

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: preview ? [1.05, 41.98] : [1.7, 41.8],
      zoom: preview ? 7.55 : 7.35,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: {preserveDrawingBuffer: true},
      style: {
        version: 8,
        sources: {
          base: {
            type: "raster",
            tileSize: 256,
            tiles: [
              preview
                ? "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"
                : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
            ],
          },
          prediction: {
            type: "image",
            url: staticFile("data/bolets.rossinyol.png"),
            coordinates: predictionCoordinates,
          },
        },
        layers: [
          {id: "base", type: "raster", source: "base", paint: {"raster-saturation": -0.78, "raster-contrast": preview ? 0.28 : 0.18, "raster-brightness-max": preview ? 0.27 : 0.34, "raster-fade-duration": 0}},
          {id: "prediction", type: "raster", source: "prediction", paint: {"raster-opacity": 0.88, "raster-fade-duration": 0, "raster-resampling": "linear"}},
        ],
      },
    });

    map.on("load", () => {
      map.resize();
      map.jumpTo({center: preview ? [1.05, 41.98] : [1.7, 41.8], zoom: preview ? 7.55 : 7.35});
      map.once("idle", () => continueRender(loadingHandle));
    });
  }, [continueRender, loadingHandle, preview]);

  return (
    <AbsoluteFill style={{backgroundColor: "#10150f"}}>
      <div ref={containerRef} style={{position: "absolute", inset: 0, width: "100%", height: "100%"}} />
      {preview ? <AbsoluteFill style={{background: "rgba(7,16,8,.14)"}} /> : <AbsoluteFill style={{background: "linear-gradient(90deg, rgba(9,12,8,.62) 0%, rgba(9,12,8,.12) 52%, rgba(9,12,8,.26) 100%)"}} />}
    </AbsoluteFill>
  );
};

export const PreviewMapScene: React.FC = () => <MapPlate variant="preview" />;
