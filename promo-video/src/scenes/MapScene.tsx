import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame} from "remotion";
import {MapPlate} from "../components/MapPlate";
import {Mushroom, MushroomMark} from "../components/Mushroom";

export const MapScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{backgroundColor: "#0e120d", color: "#eeeae0", overflow: "hidden"}}>
      <MapPlate />
      <div style={{position: "absolute", inset: 0, boxShadow: "inset 0 0 160px rgba(0,0,0,.55)"}} />
      <div style={{position: "absolute", left: 0, right: 0, top: interpolate(frame, [24, 118], [-80, 1160], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(.4, 0, .2, 1)}), height: 3, background: "linear-gradient(90deg, transparent, rgba(242,138,59,.75), transparent)", boxShadow: "0 0 32px rgba(232,114,42,.58)", opacity: .8}} />

      <Interactive.Div
        name="Panell del predictor"
        style={{position: "absolute", left: 72, top: 70, width: 450, minHeight: 665, padding: "34px 34px 30px", borderRadius: 30, backgroundColor: "rgba(22,28,20,.90)", border: "1px solid rgba(238,234,224,.14)", boxShadow: "0 28px 80px rgba(0,0,0,.50)", backdropFilter: "blur(18px)", opacity: interpolate(frame, [0, 20], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"}), translate: interpolate(frame, [0, 24], ["-60px 0px", "0px 0px"], {extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.bezier(.16, 1, .3, 1)})}}
      >
        <div style={{display: "flex", alignItems: "center", gap: 16}}><MushroomMark size={52} /><div><div style={{fontFamily: "Georgia, serif", fontSize: 32, fontWeight: 700}}>Boletada</div><div style={{fontSize: 17, color: "#96a190", marginTop: 3}}>Predicció actualitzada avui</div></div></div>
        <div style={{marginTop: 32, padding: "18px 20px", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, background: "rgba(255,255,255,.05)", fontSize: 24, display: "flex", justifyContent: "space-between"}}><span>Rossinyol</span><span style={{color: "#9aa492"}}>⌄</span></div>
        <div style={{fontSize: 16, color: "#9aa492", marginTop: 32, textTransform: "uppercase", letterSpacing: 2}}>Condicions al territori</div>
        <div className="heatbar" />
        <div style={{display: "flex", justifyContent: "space-between", color: "#aeb6aa", fontSize: 15}}><span>Molt baixa</span><span>Mitjana</span><span>Molt alta</span></div>
        <div style={{marginTop: 34, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,.1)"}}>
          <div style={{fontSize: 16, color: "#9aa492", textTransform: "uppercase", letterSpacing: 2}}>Exemple de zones</div>
          {["Pirineu occidental", "Prepirineu", "Pirineu oriental"].map((name, index) => (
            <div key={name} style={{display: "flex", alignItems: "center", gap: 15, fontSize: 21, marginTop: 20}}><span style={{width: 12, height: 12, borderRadius: "50%", background: index === 0 ? "#ef7430" : index === 1 ? "#d98b31" : "#a7a840"}} /><span style={{flex: 1}}>{name}</span></div>
          ))}
        </div>
      </Interactive.Div>

      <Mushroom x={360} y={615} size={145} delay={48} expression="curious" />

      <Interactive.Div
        name="Missatge del mapa"
        style={{position: "absolute", right: 92, top: 92, width: 980, textAlign: "right", fontFamily: "Georgia, serif", fontSize: 77, lineHeight: 1.02, letterSpacing: -2.5, textShadow: "0 5px 32px rgba(0,0,0,.72)", opacity: interpolate(frame, [24, 52], [0, 1], {extrapolateRight: "clamp", extrapolateLeft: "clamp"}), translate: interpolate(frame, [24, 52], ["0px 35px", "0px 0px"], {extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.bezier(.16, 1, .3, 1)})}}
      >
        Compara zones.<br />Decideix <span style={{color: "#f28a3b", fontStyle: "italic"}}>on començar.</span>
      </Interactive.Div>

      <div style={{position: "absolute", right: 82, bottom: 46, fontSize: 15, color: "rgba(255,255,255,.58)"}}>Mapa © Esri · Dades Meteocat + ICGC</div>
    </AbsoluteFill>
  );
};
