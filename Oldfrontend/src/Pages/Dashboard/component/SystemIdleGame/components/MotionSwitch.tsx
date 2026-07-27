import * as Switch from '@radix-ui/react-switch';
import { motion } from 'motion/react';
import type { CSSProperties } from 'react';

type MotionSwitchTone = 'green' | 'amber' | 'red';

interface MotionSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  tone?: MotionSwitchTone;
}

const toneColors: Record<MotionSwitchTone, {
  activeBackground: string;
  activeBorder: string;
  focusRing: string;
  thumb: string;
  thumbBorder: string;
}> = {
  green: {
    activeBackground: '#052e16',
    activeBorder: '#22c55e',
    focusRing: 'rgba(34, 197, 94, 0.26)',
    thumb: '#4ade80',
    thumbBorder: '#bbf7d0',
  },
  amber: {
    activeBackground: '#451a03',
    activeBorder: '#f59e0b',
    focusRing: 'rgba(245, 158, 11, 0.28)',
    thumb: '#fbbf24',
    thumbBorder: '#fde68a',
  },
  red: {
    activeBackground: '#450a0a',
    activeBorder: '#ef4444',
    focusRing: 'rgba(239, 68, 68, 0.26)',
    thumb: '#f87171',
    thumbBorder: '#fecaca',
  },
};

export function MotionSwitch({
  checked,
  onCheckedChange,
  ariaLabel,
  disabled = false,
  tone = 'green',
}: MotionSwitchProps) {
  const colors = toneColors[tone];
  const switchStyle: CSSProperties = {
    justifyContent: checked ? 'flex-end' : 'flex-start',
  };

  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      asChild
    >
      <motion.button
        type="button"
        aria-label={ariaLabel}
        style={switchStyle}
        className="relative flex h-8 w-[68px] cursor-pointer items-center rounded-full border-2 p-1 outline-none shadow-inner shadow-black/45 disabled:cursor-not-allowed disabled:opacity-45"
        initial={false}
        animate={{
          backgroundColor: checked ? colors.activeBackground : '#09090b',
          borderColor: checked ? colors.activeBorder : '#27272a',
        }}
        transition={{ duration: 0.18 }}
        whileFocus={{
          boxShadow: `0 0 0 3px #09090b, 0 0 0 7px ${colors.focusRing}`,
          transition: { duration: 0.2 },
        }}
        whileTap={{ scale: disabled ? 1 : 0.96 }}
      >
        <Switch.Thumb asChild>
          <motion.span
            className="block h-5 w-5 rounded-full border-2 shadow-sm shadow-black/30"
            style={{
              backgroundColor: checked ? colors.thumb : '#52525b',
              borderColor: checked ? colors.thumbBorder : '#71717a',
            }}
            layout
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 30,
            }}
          />
        </Switch.Thumb>
      </motion.button>
    </Switch.Root>
  );
}
