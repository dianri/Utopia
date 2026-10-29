import React from 'react';

export const SAVAGE_BEAST_SVG_PATH =
  "M12 2L14.5 5.5L18 4L16.5 8.5L20 11L16 13L16.5 17L12 15L7.5 17L8 13L4 11L7.5 8.5L6 4L9.5 5.5L12 2Z";

export interface SavageBeastIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export const SavageBeastIcon: React.FC<SavageBeastIconProps> = ({
  className = "w-10 h-10",
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    stroke="currentColor"
    strokeWidth="0.5"
    {...props}
  >
    {/* Silueta de demonio / bestia cornuda con mandíbula de colmillos afilados */}
    <path d={SAVAGE_BEAST_SVG_PATH} />
    <circle cx="9" cy="10" r="1.2" fill="#000" stroke="none" />
    <circle cx="15" cy="10" r="1.2" fill="#000" stroke="none" />
    <path d="M10 13L12 14.5L14 13L12 16L10 13Z" fill="#000" stroke="none" />
  </svg>
);

export const SAVAGE_BEAST_SVG_HTML = `
  <svg viewBox="0 0 24 24" fill="#ef4444" class="w-7 h-7 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]">
    <path d="M12 2L14.5 5.5L18 4L16.5 8.5L20 11L16 13L16.5 17L12 15L7.5 17L8 13L4 11L7.5 8.5L6 4L9.5 5.5L12 2Z" />
    <polygon points="8,9 10,11 8,11" fill="#0f172a"/>
    <polygon points="16,9 14,11 16,11" fill="#0f172a"/>
    <polygon points="10,13 12,15 14,13 12,16" fill="#0f172a"/>
  </svg>
`;
