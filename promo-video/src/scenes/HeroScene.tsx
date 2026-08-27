import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame} from "remotion";
import {MushroomMark} from "../components/Mushroom";

export const HeroScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{background: "radial-gradient(circle at 78% 52%, #293920 0%, #131a10 38%, #090c08 78%)", color: "#f0ede4", overflow: "hidden"}}>
      <div className="grain" />
      <div className="contour contour-a" />
      <div className="contour contour-b" />
      <Interactive.Div
        name="Marca"
        style={{position: "absolute", left: 88, top: 72, display: "flex", alignItems: "center", gap: 18, fontSize: 30, fontWeight: 650, opacity: interpolate(frame, [0, 18], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"})}}
      >
        <MushroomMark size={56} />
        Boletada
      </Interactive.Div>

      <Interactive.Div
        name="Promesa principal"
        style={{position: "absolute", left: 88, top: 286, width: 1740, fontFamily: "Georgia, serif", fontSize: 116, lineHeight: 0.98, letterSpacing: -4.5, opacity: interpolate(frame, [8, 30], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1)}), translate: interpolate(frame, [8, 30], ["0px 70px", "0px 0px"], {extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1)})}}
      >
        <div>Surt a buscar bolets</div><div style={{color: "#f28a3b", fontStyle: "italic"}}>on val la pena mirar.</div>
      </Interactive.Div>

      <Interactive.Div
        name="Resposta"
        style={{position: "absolute", left: 94, bottom: 104, fontSize: 39, color: "#abb6a5", letterSpacing: -0.4, opacity: interpolate(frame, [45, 68], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"})}}
      >
        La predicció d’avui, per espècie i zona.
      </Interactive.Div>
      <div style={{position: "absolute", right: 70, bottom: 42, color: "#72806c", fontSize: 22, letterSpacing: 2}}>BOLETADA.CAT</div>
    </AbsoluteFill>
  );
};
