// Line icons from the SaafGadi UI samples (24×24, stroke-based).
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number };

function make(paths: React.ReactNode, defaults: { strokeWidth?: number; fill?: boolean } = {}) {
  return function Icon({ size = 20, strokeWidth, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={defaults.fill ? 'currentColor' : 'none'}
        stroke={defaults.fill ? 'none' : 'currentColor'}
        strokeWidth={strokeWidth ?? defaults.strokeWidth ?? 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const Plus = make(<path d="M12 5v14M5 12h14" />);
export const ChevronLeft = make(<path d="M15 18l-6-6 6-6" />);
export const ChevronRight = make(<path d="M9 6l6 6-6 6" />);
export const ChevronDown = make(<path d="M6 9l6 6 6-6" />);
export const Mail = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </>,
);
export const Check = make(<path d="M20 6 9 17l-5-5" />);
export const CheckCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.6 2.5L16 9.5" />
  </>,
);
export const WhatsApp = make(
  <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" />,
);
export const Phone = make(
  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
);
export const Message = make(
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
);
export const Calendar = make(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </>,
);
export const X = make(<path d="M18 6 6 18M6 6l12 12" />);
export const Home = make(<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />);
export const Clock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const Car = make(
  <>
    <path d="M3 13l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 8l2 5v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <path d="M3 13h18M7 15.5h.01M17 15.5h.01" />
  </>,
);
export const Bike = make(
  <>
    <circle cx="5.5" cy="17" r="3.5" />
    <circle cx="18.5" cy="17" r="3.5" />
    <path d="M5.5 17 9 9h5l4.5 8M9 9H6.5M14 9l-1.5-3H15" />
  </>,
);
export const List = make(<path d="M4 6h16M4 12h16M4 18h10" />);
export const MapPin = make(
  <>
    <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </>,
);
export const Wash = make(
  <>
    <path d="M7 16a4 4 0 0 1-.9-7.9A5 5 0 0 1 16 7a4.5 4.5 0 0 1 1 8.9" />
    <path d="M9 19l1-2M13 20l1-2" />
  </>,
);
export const Interior = make(
  <>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    <path d="M5 19h14" />
  </>,
);
export const Today = make(
  <>
    <path d="M9 11l3 3 8-8" />
    <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
  </>,
);
export const User = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);
export const Users = make(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7" />
  </>,
);
export const Menu = make(<path d="M4 6h16M4 12h16M4 18h16" />);
export const Search = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const Logout = make(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </>,
);
export const Download = make(<path d="M12 3v12M7 10l5 5 5-5M5 21h14" />);
export const Alert = make(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);
export const Edit = make(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />);
export const Rupee = make(<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10" />);
export const HelpCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 3.9M12 17h.01" />
  </>,
);
export const Sparkles = Interior;
