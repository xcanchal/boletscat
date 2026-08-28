import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame} from "remotion";
import {MapPlate} from "../components/MapPlate";

const facts = [
  ["bosc", "pineda"],
  ["sòl", "silícic / àcid"],
  ["temperatura", "17 °C"],
  ["altitud", "1.388 m"],
];

export const DetailScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{backgroundColor: "#0b0f0a", color: "#f0ede4", overflow: "hidden"}}>
      <MapPlate />
      <AbsoluteFill style={{background: "linear-gradient(90deg, rgba(7,10,7,.88) 0%, rgba(7,10,7,.72) 42%, rgba(7,10,7,.26) 100%)"}} />
      <div className="grain" />

      <Interactive.Div
        name="Missatge de detall"
        style={{position: "absolute", left: 88, top: 205, width: 710, zIndex: 4, opacity: interpolate(frame, [0, 22], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"}), translate: interpolate(frame, [0, 26], ["0px 44px", "0px 0px"], {extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.bezier(.16, 1, .3, 1)})}}
      >
        <div style={{fontSize: 20, textTransform: "uppercase", letterSpacing: 4, color: "#f28a3b", fontWeight: 750}}>EXEMPLE DE LECTURA</div>
        <div style={{fontFamily: "Georgia, serif", fontSize: 91, lineHeight: 1.01, letterSpacing: -3, marginTop: 26}}>Toca un punt.<br /><i style={{color: "#f28a3b"}}>Entén què hi trobaràs.</i></div>
        <div style={{fontSize: 29, lineHeight: 1.4, color: "#abb5a6", marginTop: 40, maxWidth: 650}}>Compara les condicions abans de decidir cap on tirar.</div>
      </Interactive.Div>

      <div style={{position: "absolute", right: 513, top: 240, width: 30, height: 30, borderRadius: "50%", background: "#f28a3b", border: "5px solid #f3efe5", boxShadow: "0 0 0 18px rgba(242,138,59,.18), 0 6px 24px rgba(0,0,0,.65)", scale: interpolate(frame, [20, 42], [.35, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.spring({damping: 14}), output: "perceptual-scale"})}} />

      <Interactive.Div
        name="Fitxa d'una zona"
        style={{position: "absolute", right: 92, top: 285, width: 525, padding: "34px 38px 32px", borderRadius: 28, background: "rgba(20,27,18,.94)", border: "1px solid rgba(238,234,224,.16)", boxShadow: "0 32px 100px rgba(0,0,0,.58)", backdropFilter: "blur(20px)", opacity: interpolate(frame, [24, 48], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"}), translate: interpolate(frame, [24, 50], ["45px 24px", "0px 0px"], {extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.bezier(.16, 1, .3, 1)})}}
      >
        <div style={{fontFamily: "Georgia, serif", fontSize: 39, lineHeight: 1.12}}>Bosc de muntanya</div>
        <div style={{display: "flex", alignItems: "center", gap: 14, marginTop: 20}}>
          <div style={{padding: "7px 13px", borderRadius: 999, color: "#ff9550", border: "2px solid #dc6127", fontSize: 19, fontWeight: 750}}>Condicions altes</div>
        </div>
        <div style={{marginTop: 29, paddingTop: 23, borderTop: "1px solid rgba(255,255,255,.10)"}}>
          {facts.map(([label, value], index) => (
            <div key={label} style={{display: "flex", justifyContent: "space-between", marginTop: index === 0 ? 0 : 19, fontSize: 22, opacity: interpolate(frame, [45 + index * 7, 63 + index * 7], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"})}}>
              <span style={{color: "#96a190"}}>{label}</span><span>{value}</span>
            </div>
          ))}
        </div>
        <div style={{marginTop: 25, padding: "16px 19px", borderRadius: 14, background: "rgba(242,138,59,.12)", color: "#f4a066", fontSize: 19, lineHeight: 1.3}}>El sòl també compta en la lectura de cada espècie.</div>
      </Interactive.Div>

      <div style={{position: "absolute", right: 82, bottom: 46, fontSize: 15, color: "rgba(255,255,255,.55)"}}>Mapa © Esri · Dades Meteocat + ICGC</div>
    </AbsoluteFill>
  );
};
