import { Composition, Folder } from "remotion";
import { Promo } from "./Promo";
import { TOTAL } from "./timeline";
import { Intro } from "./scenes/Intro";
import { Coach } from "./scenes/Coach";
import { Analyze } from "./scenes/Analyze";
import { Pro } from "./scenes/Pro";
import { Album } from "./scenes/Album";
import { Outro } from "./scenes/Outro";
import { scene } from "./timeline";
import { PromoV2, TOTAL_V2 } from "./v2/Promo";

// 竖屏 9:16，30 帧。总长由配音决定（src/timeline.ts）
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="PhotaPromo" component={Promo} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
      {/* 第二版：横屏 16:9、约 90 秒，课程汇报开场用（src/v2/） */}
      <Composition id="PhotaPromoV2" component={PromoV2} durationInFrames={TOTAL_V2} fps={30} width={1920} height={1080} />
      {/* 单独看某一个场景（没有主持人和声音），方便调画面 */}
      <Folder name="Scenes">
        <Composition id="Intro" component={Intro} durationInFrames={scene("intro").duration} fps={30} width={1080} height={1920} />
        <Composition id="Coach" component={Coach} durationInFrames={scene("coach").duration} fps={30} width={1080} height={1920} />
        <Composition id="Analyze" component={Analyze} durationInFrames={scene("analyze").duration} fps={30} width={1080} height={1920} />
        <Composition id="Pro" component={Pro} durationInFrames={scene("pro").duration} fps={30} width={1080} height={1920} />
        <Composition id="Album" component={Album} durationInFrames={scene("album").duration} fps={30} width={1080} height={1920} />
        <Composition id="Outro" component={Outro} durationInFrames={scene("outro").duration} fps={30} width={1080} height={1920} />
      </Folder>
    </>
  );
};
