import React from 'react';

export const SAVAGE_BEAST_SVG_PATH =
  "M12 2C9.5 2 7.2 3.1 5.8 4.8L3 3.5 4.2 6.5C3.1 8.1 2.5 10 2.5 12c0 4.2 2.8 7.8 6.7 9 1.1.3 2.1-.5 2.1-1.7V17c0-.6.4-1 1-1h1.4c.6 0 1 .4 1 1v2.3c0 1.2 1 2 2.1 1.7 3.9-1.2 6.7-4.8 6.7-9 0-2-.6-3.9-1.7-5.5L23 3.5l-2.8 1.3C18.8 3.1 16.5 2 14 2h-2zm-3.5 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-6.2 6.2l1.2-1.7 1.5 1.1 1.5-1.1 1.2 1.7-1.2 1.5h-3l-1.2-1.5z";

export interface SavageBeastIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export const SavageBeastIcon: React.FC<SavageBeastIconProps> = ({
  className = "w-6 h-6",
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    {...props}
  >
    {/* Silueta agresiva de bestia de caza con colmillos expuestos y orejas/púas erizadas */}
    <path d={SAVAGE_BEAST_SVG_PATH} />
  </svg>
);

export const SAVAGE_BEAST_SVG_HTML = `<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]"><path d="${SAVAGE_BEAST_SVG_PATH}" /></svg>`;
