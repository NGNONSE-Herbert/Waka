import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { c } from './theme';

type IconProps = { size?: number; color?: string; stroke?: number };

const make = (body: React.ReactNode, defaultStroke = 2) =>
  function Icon({ size = 22, color = c.ink, stroke = defaultStroke }: IconProps) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        {body}
      </Svg>
    );
  };

export const Bell = make(<><Path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7z" /><Path d="M10 20a2 2 0 004 0" /></>);
export const Swap = make(<Path d="M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3" />, 2.2);
export const ArrowRight = make(<Path d="M5 12h14M13 6l6 6-6 6" />, 2.4);
export const ArrowLeft = make(<Path d="M19 12H5M11 6l-6 6 6 6" />, 2.2);
export const Plus = make(<Path d="M12 5v14M5 12h14" />, 2.4);
export const Search = make(<><Circle cx={11} cy={11} r={7} /><Path d="M20 20l-4-4" /></>);
export const Ticket = make(<><Path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4V8z" /><Path d="M14 7v10" strokeDasharray="2 2" /></>);
export const PlusCircle = make(<><Circle cx={12} cy={12} r={9} /><Path d="M12 8v8M8 12h8" /></>);
export const User = make(<><Circle cx={12} cy={8} r={4} /><Path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>);
export const Shield = make(<><Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><Path d="M9 12l2 2 4-4" /></>, 2.2);
export const Chevron = make(<Path d="M9 6l6 6-6 6" />, 2.2);
export const Clock = make(<><Circle cx={12} cy={12} r={9} /><Path d="M12 7v5l3 2" /></>, 2.4);
export const Phone = make(<><Rect x={7} y={3} width={10} height={18} rx={2} /><Path d="M11 18h2" /></>);
export const Check = make(<Path d="M5 12l5 5 9-10" />, 3);
export const Flag = make(<Path d="M5 21V4M5 4h11l-2 4 2 4H5" />);
export const ChevronDown = make(<Path d="M6 9l6 6 6-6" />, 2.2);
export const Car = make(<><Path d="M5 11l1.6-4.4A2 2 0 018.5 5.3h7a2 2 0 011.9 1.3L19 11" /><Path d="M4 11h16a1 1 0 011 1v5H3v-5a1 1 0 011-1z" /><Path d="M6 17v2M18 17v2M7 14h.01M17 14h.01" /></>);
export const Wallet = make(<><Path d="M4 7a2 2 0 012-2h11a1 1 0 011 1v2" /><Path d="M4 7v10a2 2 0 002 2h13a1 1 0 001-1V9a1 1 0 00-1-1H6a2 2 0 01-2-1z" /><Path d="M16 13.5h.01" /></>);
export const Lock = make(<><Rect x={5} y={11} width={14} height={10} rx={2} /><Path d="M8 11V7a4 4 0 018 0v4" /></>);
export const Send = make(<Path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" />);
export const Key = make(<><Circle cx={8} cy={15} r={4} /><Path d="M11 12l9-9M16 7l3 3" /></>);
export const Play = make(<Path d="M7 4l13 8-13 8V4z" />);
export const MapPin = make(<><Path d="M12 21s7-6.1 7-11a7 7 0 10-14 0c0 4.9 7 11 7 11z" /><Circle cx={12} cy={10} r={2.5} /></>);
export const Close = make(<Path d="M6 6l12 12M18 6L6 18" />, 2.4);
export const Trash = make(<Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />);
export const Chat = make(<Path d="M4 5h16v11H9l-5 4V5z" />);
export const Alert = make(<><Path d="M12 3l10 18H2L12 3z" /><Path d="M12 10v5M12 18h.01" /></>);
export const Doc = make(<><Path d="M6 3h8l4 4v14H6V3z" /><Path d="M14 3v4h4M9 13h6M9 17h6" /></>);
export const Hourglass = make(<Path d="M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9" />);
export const Info = make(<><Circle cx={12} cy={12} r={9} /><Path d="M12 11v5M12 8h.01" /></>);
export const Globe = make(<><Circle cx={12} cy={12} r={9} /><Path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>);
export const Scale = make(<Path d="M12 4v16M7 20h10M5 7h14M5 7l-3 7h6L5 7zM19 7l-3 7h6l-3-7z" />);
export const Undo = make(<Path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-2" />);
export const Delete = make(<><Path d="M9 5h11v14H9l-6-7 6-7z" /><Path d="M13 10l4 4M17 10l-4 4" /></>);

export function Star({ size = 32, filled }: { size?: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? c.lime : 'none'} stroke={filled ? c.forest : c.lineStrong} strokeWidth={1.8} strokeLinejoin="round">
      <Path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3z" />
    </Svg>
  );
}

/** Anneau de compatibilité d'une correspondance, de 0 à 100. */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <Svg width={68} height={68} viewBox="0 0 64 64" accessibilityRole="image" accessibilityLabel={label}>
      <Circle cx={32} cy={32} r={r} fill="none" stroke={c.sage} strokeWidth={7} />
      <Circle cx={32} cy={32} r={r} fill="none" stroke={v >= 50 ? c.leaf : c.dots} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - v / 100)} transform="rotate(-90 32 32)" />
    </Svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 38 38">
      <Circle cx={19} cy={19} r={19} fill={c.ink} />
      <Path d="M11 26 C11 16 27 22 27 12" stroke={c.lime} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Circle cx={11} cy={26} r={3.4} fill={c.lime} />
      <Circle cx={27} cy={12} r={3.4} fill={c.lime} />
    </Svg>
  );
}

export function ForestBadge() {
  return (
    <Svg width={104} height={128} viewBox="0 0 104 130" style={{ borderTopLeftRadius: 52, borderTopRightRadius: 52, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, overflow: 'hidden' }}>
      <Path d="M0 52 A52 52 0 0 1 104 52 V116 A14 14 0 0 1 90 130 H14 A14 14 0 0 1 0 116 Z" fill={c.mist} />
      <Circle cx={70} cy={46} r={16} fill={c.lime} />
      <Path d="M0 78 C20 66 40 64 60 74 C80 84 92 70 104 72 V116 A14 14 0 0 1 90 130 H14 A14 14 0 0 1 0 116 Z" fill="#A9D49B" />
      <Path d="M34 96 V72" stroke={c.forest} strokeWidth={2.5} strokeLinecap="round" />
      <Ellipse cx={34} cy={70} rx={17} ry={7} fill={c.leaf} />
      <Path d="M0 100 C8 84 26 82 38 90 C50 78 68 84 76 92 C86 84 98 86 104 94 V116 A14 14 0 0 1 90 130 H14 A14 14 0 0 1 0 116 Z" fill="#58B368" />
      <Path d="M0 112 C12 102 26 104 34 110 C46 102 58 106 66 112 C78 104 94 104 104 112 V116 A14 14 0 0 1 90 130 H14 A14 14 0 0 1 0 116 Z" fill={c.leaf} />
    </Svg>
  );
}

export function SunBadge() {
  return (
    <Svg width={92} height={112} viewBox="0 0 104 130">
      <Path d="M0 52 A52 52 0 0 1 104 52 V116 A14 14 0 0 1 90 130 H14 A14 14 0 0 1 0 116 Z" fill={c.mist} />
      <Circle cx={52} cy={52} r={34} fill={c.lime} opacity={0.5} />
      <Circle cx={52} cy={52} r={20} fill={c.lime} />
      <Path d="M0 84 C20 72 40 70 60 80 C80 90 92 76 104 78 V116 A14 14 0 0 1 90 130 H14 A14 14 0 0 1 0 116 Z" fill="#A9D49B" />
      <Path d="M0 106 C10 92 24 96 30 110 H74 C80 96 94 92 104 104 V116 A14 14 0 0 1 90 130 H14 A14 14 0 0 1 0 116 Z" fill="#58B368" />
      <Path d="M30 118 C42 106 62 106 74 118" stroke={c.lime} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 7" fill="none" />
      <Circle cx={74} cy={118} r={5} fill={c.forest} stroke={c.lime} strokeWidth={2.5} />
    </Svg>
  );
}

export function CanopyHero({ width }: { width: number }) {
  return (
    <Svg width={width} height={214} viewBox="0 0 390 214" preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', left: 0, top: 0 }}>
      <Rect width={390} height={214} fill={c.mist} />
      <Circle cx={300} cy={70} r={30} fill={c.lime} />
      <Path d="M0 118 C60 96 110 92 170 110 C230 128 280 96 340 102 C366 104 380 110 390 108 V214 H0 Z" fill="#A9D49B" />
      <G fill="#58B368">
        <Circle cx={30} cy={162} r={44} /><Circle cx={100} cy={150} r={40} /><Circle cx={170} cy={166} r={46} />
        <Circle cx={246} cy={152} r={42} /><Circle cx={318} cy={164} r={46} /><Circle cx={384} cy={152} r={40} />
        <Rect y={166} width={390} height={48} />
      </G>
      <Path d="M130 152 V104 M276 156 V118" stroke={c.forest} strokeWidth={3.5} strokeLinecap="round" />
      <G fill={c.leaf}><Ellipse cx={130} cy={100} rx={40} ry={15} /><Ellipse cx={276} cy={114} rx={32} ry={12} /></G>
      <Path d="M56 180 C110 150 160 184 214 164 C262 146 300 172 340 156" stroke={c.lime} strokeWidth={4} strokeLinecap="round" strokeDasharray="1 11" fill="none" />
      <Circle cx={56} cy={180} r={7} fill={c.forest} stroke={c.lime} strokeWidth={3.5} />
      <Circle cx={340} cy={156} r={9} fill={c.lime} />
      <G fill={c.leaf}>
        <Circle cx={0} cy={222} r={40} /><Circle cx={76} cy={226} r={36} /><Circle cx={160} cy={230} r={42} />
        <Circle cx={250} cy={226} r={38} /><Circle cx={334} cy={230} r={42} /><Circle cx={400} cy={222} r={34} />
      </G>
    </Svg>
  );
}

export function TicketCanopy() {
  return (
    <Svg width={200} height={80} viewBox="0 0 200 80" style={{ position: 'absolute', right: -10, bottom: -8 }}>
      <G fill={c.forestSoft}>
        <Circle cx={30} cy={78} r={30} /><Circle cx={80} cy={66} r={34} /><Circle cx={136} cy={76} r={38} /><Circle cx={188} cy={60} r={40} />
      </G>
    </Svg>
  );
}

export function RouteSquiggle() {
  return (
    <Svg width={92} height={30} viewBox="0 0 100 30">
      <Path d="M8 20 C30 2 46 30 64 14 C74 6 84 10 92 14" fill="none" stroke={c.lime} strokeWidth={3} strokeDasharray="1 9" strokeLinecap="round" />
      <Circle cx={8} cy={20} r={5} fill={c.forest} stroke={c.lime} strokeWidth={3} />
      <Circle cx={92} cy={14} r={6} fill={c.lime} />
    </Svg>
  );
}

export function RouteDots() {
  return (
    <Svg width={92} height={16} viewBox="0 0 92 16">
      <Circle cx={7} cy={8} r={5} fill="none" stroke={c.leaf} strokeWidth={2.5} />
      <Path d="M16 8h60" stroke={c.dots} strokeWidth={2.5} strokeDasharray="1 8" strokeLinecap="round" />
      <Circle cx={85} cy={8} r={6} fill={c.leaf} />
    </Svg>
  );
}
