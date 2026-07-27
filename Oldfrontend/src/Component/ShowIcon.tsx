// ── Pixel Game Gold Coin Counter ──────────────────────────────────────────────
// Shows in the HUD top bar. Pixel-border box with gold coin emoji + count.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type CSSProperties } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent } from 'motion/react';
import { useSelector } from 'react-redux';
import type { RootState } from '../Redux/store';
import { goldIcon } from '../assets';

const coinNumberStyle: CSSProperties = {
    color: 'var(--px-gold)',
    fontWeight: 800,
    fontSize: '13px',
    fontFamily: 'monospace',
    letterSpacing: '0.05em',
    minWidth: '36px',
    textAlign: 'right',
    display: 'inline-block',
    transformOrigin: 'right center',
    fontVariantNumeric: 'tabular-nums',
};

function normalizeCoinValue(value: unknown) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return Math.max(0, Math.round(numericValue));
}

function AnimatedCoinNumber({ value }: { value: number }) {
    const targetValue = normalizeCoinValue(value);
    const animatedValue = useMotionValue(targetValue);
    const [displayValue, setDisplayValue] = useState(targetValue);
    const [isChanging, setIsChanging] = useState(false);

    useMotionValueEvent(animatedValue, 'change', (latest) => {
        setDisplayValue(normalizeCoinValue(latest));
    });

    useEffect(() => {
        const currentValue = animatedValue.get();

        if (Math.round(currentValue) === targetValue) {
            setDisplayValue(targetValue);
            return;
        }

        const delta = Math.abs(targetValue - currentValue);
        const duration = Math.min(2, Math.max(0.6, delta / 180));
        setIsChanging(true);

        const controls = animate(animatedValue, targetValue, {
            duration,
            ease: [0.16, 1, 0.3, 1],
        });
        const pulseTimer = window.setTimeout(() => setIsChanging(false), 360);

        return () => {
            controls.stop();
            window.clearTimeout(pulseTimer);
        };
    }, [animatedValue, targetValue]);

    return (
        <motion.span
            animate={isChanging ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            style={coinNumberStyle}
        >
            {displayValue.toLocaleString()}
        </motion.span>
    );
}

const ShowIcon = () => {
    const profile = useSelector((state: RootState) => state.profile.profile);
    const coins = normalizeCoinValue(profile?.wallet?.coins ?? 0);

    if (!profile) return null;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--px-surface2)',
                border: '2px solid var(--px-border-gold)',
                padding: '4px 10px',
                boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.05)',
            }}
        >
            <img
                src={goldIcon}
                alt="金币"
                style={{
                    width: '22px',
                    height: '22px',
                    objectFit: 'contain',
                    imageRendering: 'pixelated',
                    display: 'block',
                }}
            />
            <AnimatedCoinNumber value={coins} />
        </div>
    );
};

export default ShowIcon;
