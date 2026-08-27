import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame} from "remotion";
import {MushroomMark} from "../components/Mushroom";

export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const species = ["Rovelló", "Cep", "Llenega", "Trompeta", "Rossinyol", "Camagroc", "Múrgola"];

  return (
    <AbsoluteFill style={{background: "radial-gradient(circle at 84% 52%, #39462d 0%, #151c12 38%, #090c08 82%)", color: "#f1eee5", overflow: "hidden"}}>
      <div className="grain" />
      <div className="contour contour-a" />
      <div style={{position: "absolute", left: 90, top: 70, display: "flex", alignItems: "center", gap: 16, fontSize: 28, fontWeight: 700}}><MushroomMark size={54} /> Boletada</div>

      <Interactive.Div
        name="Missatge final"
        style={{position: "absolute", left: 90, top: 210, width: 1160, fontFamily: "Georgia, serif", fontSize: 96, lineHeight: 1.01, letterSpacing: -3.5, opacity: interpolate(frame, [0, 24], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"}), translate: interpolate(frame, [0, 26], ["0px 45px", "0px 0px"], {extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.bezier(.16, 1, .3, 1)})}}
      >
        La pròxima sortida<br />comença <i style={{color: "#f28a3b"}}>abans de sortir.</i>
      </Interactive.Div>

      <div style={{position: "absolute", left: 94, top: 520, display: "flex", flexWrap: "wrap", gap: 13, width: 1000}}>
        {species.map((name, index) => (
          <div key={name} style={{padding: "12px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,.16)", background: name === "Rossinyol" ? "#e8722a" : "rgba(255,255,255,.07)", fontSize: 21, opacity: interpolate(frame, [24 + index * 4, 42 + index * 4], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"}), translate: interpolate(frame, [24 + index * 4, 42 + index * 4], ["0px 18px", "0px 0px"], {extrapolateRight: "clamp", extrapolateLeft: "clamp"})}}>{name}</div>
        ))}
      </div>

      <Interactive.Div
        name="Crida a l'acció"
        style={{position: "absolute", left: 90, bottom: 115, display: "flex", alignItems: "center", gap: 26, opacity: interpolate(frame, [62, 86], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"}), scale: interpolate(frame, [62, 88], [.92, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.spring({damping: 18}), output: "perceptual-scale"})}}
      >
        <div style={{padding: "20px 31px", borderRadius: 17, backgroundColor: "#f0ede4", color: "#151a12", fontSize: 27, fontWeight: 800, letterSpacing: -.4}}>Accedeix al mapa ↗</div>
        <div style={{fontSize: 31, fontWeight: 700, color: "#f28a3b"}}>boletada.cat</div>
      </Interactive.Div>

      <div style={{position: "absolute", right: 75, bottom: 42, color: "#75816f", fontSize: 17}}>Respecta el bosc i la normativa local</div>
    </AbsoluteFill>
  );
};
