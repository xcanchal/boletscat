import "./index.css";
import {Composition, Folder, Still} from "remotion";
import {BoletsPromo} from "./Composition";
import {HeroScene} from "./scenes/HeroScene";
import {MapScene} from "./scenes/MapScene";
import {DetailScene} from "./scenes/DetailScene";
import {CtaScene} from "./scenes/CtaScene";
import {PreviewMapScene} from "./components/MapPlate";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="BoletsPromo-Scenes">
        <Composition id="HeroScene" component={HeroScene} durationInFrames={105} fps={30} width={1920} height={1080} />
        <Composition id="MapScene" component={MapScene} durationInFrames={150} fps={30} width={1920} height={1080} />
        <Composition id="DetailScene" component={DetailScene} durationInFrames={135} fps={30} width={1920} height={1080} />
        <Composition id="CtaScene" component={CtaScene} durationInFrames={135} fps={30} width={1920} height={1080} />
      </Folder>
      <Still id="PreviewMap" component={PreviewMapScene} width={1536} height={1024} />
      <Composition id="BoletsPromo" component={BoletsPromo} durationInFrames={480} fps={30} width={1920} height={1080} />
    </>
  );
};
