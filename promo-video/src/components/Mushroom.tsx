import {Easing, Interactive, interpolate, useCurrentFrame} from "remotion";

type MushroomProps = {
  x: number;
  y: number;
  size?: number;
  delay?: number;
  flip?: boolean;
  cap?: string;
  expression?: "happy" | "curious";
};

export const Mushroom: React.FC<MushroomProps> = ({
  x,
  y,
  size = 230,
  delay = 0,
  flip = false,
  cap = "#e8722a",
  expression = "happy",
}) => {
  const frame = useCurrentFrame();
  const localFrame = Math.max(0, frame - delay);
  const blink = localFrame % 88 > 82 ? 0.18 : 1;

  return (
    <Interactive.Div
      name="Bolet animat"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        scale: interpolate(frame, [delay, delay + 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.spring({damping: 12, stiffness: 130}),
          output: "perceptual-scale",
        }),
        translate: `0px ${Math.sin(localFrame / 8) * 10}px`,
        rotate: `${Math.sin(localFrame / 13) * (flip ? -2.2 : 2.2)}deg`,
        zIndex: 20,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 240 240" style={{scale: flip ? "-1 1" : "1 1"}}>
        <ellipse cx="120" cy="219" rx="72" ry="14" fill="#050704" opacity=".34" />
        <path d="M91 119c5-18 15-27 29-27s24 9 29 27l10 70c2 15-9 27-24 27h-30c-15 0-26-12-24-27l10-70Z" fill="#e8d7b3" />
        <path d="M91 119c7-15 17-22 29-22s22 7 29 22c-17 10-41 10-58 0Z" fill="#cbb88f" opacity=".48" />
        <path d="M22 111C22 53 63 21 120 21s98 32 98 90c0 13-11 23-24 23H46c-13 0-24-10-24-23Z" fill={cap} />
        <path d="M25 103c16-45 51-68 95-68 43 0 77 22 94 65-25-22-59-33-98-33-37 0-67 12-91 36Z" fill="#ff9d55" opacity=".32" />
        <circle cx="78" cy="69" r="14" fill="#f7d9b3" opacity=".92" />
        <circle cx="156" cy="56" r="10" fill="#f7d9b3" opacity=".82" />
        <circle cx="184" cy="91" r="6" fill="#f7d9b3" opacity=".7" />
        <ellipse cx="105" cy="157" rx="6" ry={9 * blink} fill="#2d2a22" />
        <ellipse cx="139" cy="157" rx="6" ry={9 * blink} fill="#2d2a22" />
        <circle cx="103" cy="154" r="2" fill="white" opacity={blink} />
        <circle cx="137" cy="154" r="2" fill="white" opacity={blink} />
        {expression === "happy" ? (
          <path d="M108 176c8 9 20 9 28 0" fill="none" stroke="#2d2a22" strokeWidth="5" strokeLinecap="round" />
        ) : (
          <circle cx="122" cy="178" r="5" fill="#2d2a22" />
        )}
        <path d="M81 170c-14 6-25 18-29 33" fill="none" stroke="#e8d7b3" strokeWidth="10" strokeLinecap="round" />
        <path d="M158 169c16 2 27 12 34 28" fill="none" stroke="#e8d7b3" strokeWidth="10" strokeLinecap="round" />
      </svg>
    </Interactive.Div>
  );
};

export const MushroomMark: React.FC<{size?: number}> = ({size = 62}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <path d="M8 34C8 17 18 8 32 8s24 9 24 26c0 4-3 6-7 6H15c-4 0-7-2-7-6Z" fill="#e8722a" />
    <path d="M26 40h12v10c0 5-3 8-6 8s-6-3-6-8V40Z" fill="#e8d7b3" />
    <circle cx="23" cy="22" r="4" fill="#f7d9b3" opacity=".8" />
    <circle cx="41" cy="18" r="3" fill="#f7d9b3" opacity=".7" />
  </svg>
);
