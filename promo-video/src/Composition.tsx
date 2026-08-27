import {TransitionSeries, linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {HeroScene} from "./scenes/HeroScene";
import {MapScene} from "./scenes/MapScene";
import {DetailScene} from "./scenes/DetailScene";
import {CtaScene} from "./scenes/CtaScene";

export const BoletsPromo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={105} name="Pregunta inicial">
        <HeroScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 15})} />
      <TransitionSeries.Sequence durationInFrames={150} name="Mapa de probabilitat">
        <MapScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 15})} />
      <TransitionSeries.Sequence durationInFrames={135} name="Detall d'una zona">
        <DetailScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 15})} />
      <TransitionSeries.Sequence durationInFrames={135} name="Crida a l'acció">
        <CtaScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
