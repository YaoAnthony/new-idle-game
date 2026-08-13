import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import { FaBolt, FaGem, FaRedo, FaStar, FaTimes } from 'react-icons/fa';
import { DrawResult } from '../../../../Types/Lottery';

type Rarity = 'legendary' | 'epic' | 'rare' | 'none';
type Phase = 'summoning' | 'burst' | 'results';

type RarityMeta = {
    label: string;
    shortLabel: string;
    accent: string;
    glow: string;
    cardClass: string;
    borderClass: string;
    textClass: string;
};

const RARITY_META: Record<Rarity, RarityMeta> = {
    legendary: {
        label: '限定回响',
        shortLabel: '限定',
        accent: '#f8c14a',
        glow: 'rgba(248,193,74,0.72)',
        cardClass: 'from-amber-300 via-yellow-500 to-orange-700',
        borderClass: 'border-yellow-200',
        textClass: 'text-yellow-50',
    },
    epic: {
        label: '精锐回响',
        shortLabel: '精锐',
        accent: '#b78cff',
        glow: 'rgba(167,139,250,0.66)',
        cardClass: 'from-violet-300 via-purple-600 to-indigo-800',
        borderClass: 'border-purple-200',
        textClass: 'text-purple-50',
    },
    rare: {
        label: '星尘回响',
        shortLabel: '获得',
        accent: '#7dd3fc',
        glow: 'rgba(125,211,252,0.46)',
        cardClass: 'from-sky-300 via-blue-600 to-slate-800',
        borderClass: 'border-sky-200',
        textClass: 'text-sky-50',
    },
    none: {
        label: '微光沉寂',
        shortLabel: '未中',
        accent: '#94a3b8',
        glow: 'rgba(148,163,184,0.26)',
        cardClass: 'from-slate-500 via-slate-700 to-slate-950',
        borderClass: 'border-slate-300/60',
        textClass: 'text-slate-100',
    },
};

const BASE_SUMMON_COLOR = '#7dd3fc';
const BASE_SUMMON_GLOW = 'rgba(125,211,252,0.52)';

const getRarity = (draw: DrawResult): Rarity => {
    if (draw.isFeatured || draw.tierIndex === 0) return 'legendary';
    if (draw.tierIndex === 1) return 'epic';
    if (draw.won) return 'rare';
    return 'none';
};

const rarityRank: Record<Rarity, number> = {
    none: 0,
    rare: 1,
    epic: 2,
    legendary: 3,
};

const getBestRarity = (draws: DrawResult[]): Rarity => {
    return draws.reduce<Rarity>((best, draw) => {
        const current = getRarity(draw);
        return rarityRank[current] > rarityRank[best] ? current : best;
    }, 'none');
};

const getRewardName = (draw: DrawResult) => {
    if (draw.won && draw.reward?.productName) return draw.reward.productName;
    return '未获得奖励';
};

const getRewardQuantity = (draw: DrawResult) => {
    return draw.won && draw.reward ? Math.max(1, Number(draw.reward.quantity || 1)) : 0;
};

const useGachaBackground = (
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    accentColor: string,
    revealAfterMs: number,
) => {
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const frameRef = useRef<number>(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 500);
        camera.position.z = 6;

        const particleCount = 320;
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const drift = new Float32Array(particleCount);
        const palette = [
            new THREE.Color(BASE_SUMMON_COLOR),
            new THREE.Color(0x7dd3fc),
            new THREE.Color(0xffffff),
            new THREE.Color(0xbae6fd),
        ];
        const startColor = new THREE.Color(BASE_SUMMON_COLOR);
        const finalColor = new THREE.Color(accentColor);

        for (let i = 0; i < particleCount; i += 1) {
            positions[i * 3] = (Math.random() - 0.5) * 22;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 7;
            drift[i] = 0.004 + Math.random() * 0.007;

            const color = palette[Math.floor(Math.random() * palette.length)];
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.065,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
        });
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        scene.add(particles);

        const rings = [
            new THREE.Mesh(
                new THREE.TorusGeometry(1.8, 0.035, 10, 96),
                new THREE.MeshBasicMaterial({ color: startColor, transparent: true, opacity: 0.62 }),
            ),
            new THREE.Mesh(
                new THREE.TorusGeometry(1.12, 0.025, 10, 88),
                new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.4 }),
            ),
            new THREE.Mesh(
                new THREE.TorusGeometry(0.58, 0.014, 8, 70),
                new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 }),
            ),
        ];
        rings.forEach((ring) => scene.add(ring));

        const clock = new THREE.Clock();
        const tick = () => {
            frameRef.current = requestAnimationFrame(tick);
            const t = clock.getElapsedTime();
            const positionArray = particleGeometry.attributes.position.array as Float32Array;

            for (let i = 0; i < particleCount; i += 1) {
                positionArray[i * 3 + 1] += drift[i];
                if (positionArray[i * 3 + 1] > 6) positionArray[i * 3 + 1] = -6;
            }
            particleGeometry.attributes.position.needsUpdate = true;

            rings[0].rotation.set(Math.sin(t * 0.6) * 0.45, 0, t * 1.1);
            rings[1].rotation.set(0, Math.cos(t * 0.8) * 0.45, -t * 1.6);
            rings[2].rotation.set(Math.sin(t * 0.7) * 0.6, Math.cos(t * 0.5) * 0.5, t * 2.3);

            const revealProgress = THREE.MathUtils.smoothstep(t, revealAfterMs / 1000, revealAfterMs / 1000 + 0.9);
            const liveAccent = startColor.clone().lerp(finalColor, revealProgress);
            const outerMaterial = rings[0].material as THREE.MeshBasicMaterial;
            const middleMaterial = rings[1].material as THREE.MeshBasicMaterial;
            outerMaterial.color.copy(liveAccent);
            outerMaterial.opacity = 0.5 + revealProgress * 0.28;
            middleMaterial.color.copy(startColor.clone().lerp(finalColor, revealProgress * 0.45));

            renderer.render(scene, camera);
        };
        tick();

        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onResize);

        return () => {
            cancelAnimationFrame(frameRef.current);
            window.removeEventListener('resize', onResize);
            rings.forEach((ring) => {
                ring.geometry.dispose();
                if (Array.isArray(ring.material)) {
                    ring.material.forEach((material) => material.dispose());
                } else {
                    ring.material.dispose();
                }
            });
            particleGeometry.dispose();
            particleMaterial.dispose();
            renderer.dispose();
            rendererRef.current = null;
        };
    }, [accentColor, canvasRef, revealAfterMs]);
};

const MagicCircle: React.FC<{
    accent: string;
    glow: string;
    isTenPull: boolean;
}> = ({ accent, glow, isTenPull }) => {
    const glyphs = useMemo(() => Array.from({ length: 16 }, (_, index) => index), []);

    return (
        <motion.div
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 aspect-square w-[min(76vw,31rem)] -translate-x-1/2 -translate-y-1/2"
            initial={{ opacity: 0, scale: 0.72, rotateX: 60 }}
            animate={{ opacity: 1, scale: [0.9, 1.02, 1], rotateX: 62 }}
            exit={{ opacity: 0, scale: 1.18 }}
            transition={{ duration: 0.72, ease: 'easeOut' }}
            style={{ transformStyle: 'preserve-3d' }}
        >
            <motion.div
                className="absolute inset-0 rounded-full border-2 border-cyan-100/70"
                style={{ boxShadow: `0 0 38px ${BASE_SUMMON_GLOW}, inset 0 0 28px rgba(125,211,252,0.18)` }}
                animate={{ rotate: 360 }}
                transition={{ duration: isTenPull ? 8.8 : 7.4, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
                className="absolute inset-0 rounded-full border-2"
                style={{ borderColor: accent, boxShadow: `0 0 58px ${glow}, inset 0 0 36px ${glow}` }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: [0, 0, 0.9, 0.74], scale: [0.96, 0.96, 1.08, 1] }}
                transition={{
                    duration: isTenPull ? 2.15 : 1.78,
                    times: [0, 0.5, 0.78, 1],
                    ease: 'easeInOut',
                }}
            />
            <motion.div
                className="absolute inset-[12%] rounded-full"
                style={{
                    background:
                        'repeating-conic-gradient(from 0deg, rgba(125,211,252,0.72) 0deg 4deg, transparent 4deg 16deg)',
                    WebkitMaskImage: 'radial-gradient(farthest-side, transparent 65%, #000 66%, #000 72%, transparent 73%)',
                    maskImage: 'radial-gradient(farthest-side, transparent 65%, #000 66%, #000 72%, transparent 73%)',
                }}
                animate={{ rotate: -360 }}
                transition={{ duration: 13, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
                className="absolute inset-[22%] rounded-full border border-cyan-100/35"
                animate={{ rotate: 360, scale: [1, 1.04, 1] }}
                transition={{
                    rotate: { duration: 5.8, repeat: Infinity, ease: 'linear' },
                    scale: { duration: 1.35, repeat: Infinity, ease: 'easeInOut' },
                }}
            />
            <motion.div
                className="absolute inset-[30%] rounded-full"
                style={{
                    background:
                        'linear-gradient(90deg, transparent 48%, rgba(186,230,253,0.7) 49%, rgba(186,230,253,0.7) 51%, transparent 52%), linear-gradient(0deg, transparent 48%, rgba(186,230,253,0.52) 49%, rgba(186,230,253,0.52) 51%, transparent 52%)',
                }}
                animate={{ rotate: -180 }}
                transition={{ duration: 4.6, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
                className="absolute inset-[6%] rounded-full"
                style={{
                    background: `repeating-conic-gradient(from 0deg, transparent 0deg 18deg, ${accent} 18deg 20deg, transparent 20deg 45deg)`,
                    WebkitMaskImage: 'radial-gradient(farthest-side, transparent 83%, #000 84%, #000 86%, transparent 87%)',
                    maskImage: 'radial-gradient(farthest-side, transparent 83%, #000 84%, #000 86%, transparent 87%)',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 0.86, 0.58], rotate: 180 }}
                transition={{
                    opacity: { duration: 1.8, times: [0, 0.55, 0.8, 1], ease: 'easeInOut' },
                    rotate: { duration: 9, repeat: Infinity, ease: 'linear' },
                }}
            />
            {glyphs.map((glyph) => (
                <motion.span
                    key={glyph}
                    className="absolute left-1/2 top-1/2 h-1.5 w-8 origin-left rounded-full bg-cyan-100/55"
                    style={{
                        transform: `rotate(${glyph * 22.5}deg) translateX(min(33vw, 13.6rem))`,
                        boxShadow: `0 0 10px ${BASE_SUMMON_GLOW}`,
                    }}
                    animate={{ opacity: [0.28, 0.84, 0.28] }}
                    transition={{ duration: 1.6, repeat: Infinity, delay: glyph * 0.045, ease: 'easeInOut' }}
                />
            ))}
            <motion.div
                className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-100/45 bg-slate-950/30 backdrop-blur-sm"
                style={{ boxShadow: `0 0 32px ${BASE_SUMMON_GLOW}` }}
                animate={{ scale: [0.92, 1.12, 0.92], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            >
                <FaStar className="text-3xl text-cyan-100" />
            </motion.div>
            <motion.div
                className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: accent, filter: 'blur(30px)' }}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 0, 0.48, 0], scale: [0.3, 0.3, 2.5, 3.6] }}
                transition={{ duration: 1.9, times: [0, 0.52, 0.76, 1], ease: 'easeOut' }}
            />
        </motion.div>
    );
};

const GachaCard: React.FC<{
    draw: DrawResult;
    index: number;
    delayMs: number;
    forceReveal: boolean;
    isLarge?: boolean;
}> = ({ draw, index, delayMs, forceReveal, isLarge }) => {
    const [flipped, setFlipped] = useState(false);
    const rarity = getRarity(draw);
    const meta = RARITY_META[rarity];
    const quantity = getRewardQuantity(draw);

    useEffect(() => {
        setFlipped(false);
        if (forceReveal) {
            setFlipped(true);
            return undefined;
        }
        const timer = window.setTimeout(() => setFlipped(true), delayMs);
        return () => window.clearTimeout(timer);
    }, [delayMs, draw, forceReveal]);

    const sizeClass = isLarge
        ? 'w-[min(78vw,22rem)] h-[min(62vh,30rem)]'
        : 'w-24 h-36 sm:w-28 sm:h-40';

    return (
        <motion.div
            className={`${sizeClass} relative`}
            style={{ perspective: '900px' }}
            initial={{ opacity: 0, y: 28, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.32, delay: Math.min(delayMs / 1000, 1.2), ease: 'easeOut' }}
        >
            <motion.div
                className="absolute inset-0 rounded-xl border-2 border-cyan-100/60 bg-slate-950 overflow-hidden flex items-center justify-center"
                style={{
                    backfaceVisibility: 'hidden',
                    boxShadow: `0 0 24px ${meta.glow}`,
                }}
                initial={{ rotateY: 0 }}
                animate={{ rotateY: flipped ? 90 : 0 }}
                transition={{ duration: 0.22, ease: 'easeIn' }}
            >
                <div
                    className="absolute inset-0 opacity-40"
                    style={{
                        background:
                            'linear-gradient(135deg,rgba(125,211,252,0.35),transparent 42%,rgba(248,193,74,0.24)), repeating-linear-gradient(45deg,rgba(255,255,255,0.15) 0,rgba(255,255,255,0.15) 1px,transparent 1px,transparent 14px)',
                    }}
                />
                <motion.div
                    animate={{ scale: [1, 1.16, 1], opacity: [0.68, 1, 0.68] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                    className="relative z-10"
                >
                    <FaStar className={isLarge ? 'text-7xl text-cyan-100' : 'text-4xl text-cyan-100'} />
                </motion.div>
            </motion.div>

            <motion.div
                className={`absolute inset-0 rounded-xl border-2 ${meta.borderClass} ${meta.textClass} bg-gradient-to-br ${meta.cardClass} overflow-hidden flex flex-col items-center justify-between px-3 py-3`}
                style={{
                    backfaceVisibility: 'hidden',
                    boxShadow: `0 0 ${isLarge ? 58 : 30}px ${meta.glow}`,
                }}
                initial={{ rotateY: -90 }}
                animate={{ rotateY: flipped ? 0 : -90 }}
                transition={{ duration: 0.24, ease: 'easeOut', delay: 0.2 }}
            >
                <div className="absolute inset-0 bg-black/18" />
                <motion.div
                    className="absolute -inset-x-12 top-0 h-16 bg-white/30 blur-xl"
                    animate={{ x: ['-35%', '45%'], opacity: [0, 0.45, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.4 }}
                />
                <div className="relative z-10 w-full flex items-center justify-between text-[0.65rem] font-black tracking-widest uppercase text-white/70">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <span>{meta.shortLabel}</span>
                </div>
                <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-2 min-h-0">
                    <motion.div
                        animate={{ rotate: flipped ? [0, 12, -8, 0] : 0, scale: flipped ? [0.85, 1.16, 1] : 0.85 }}
                        transition={{ duration: 0.55, delay: 0.26 }}
                    >
                        <FaGem
                            className={isLarge ? 'text-6xl' : 'text-3xl'}
                            style={{ color: rarity === 'none' ? '#cbd5e1' : '#fff7d6' }}
                        />
                    </motion.div>
                    <p className={`${isLarge ? 'text-2xl' : 'text-xs'} relative z-10 text-center font-black leading-tight break-words max-w-full`}>
                        {getRewardName(draw)}
                    </p>
                    {quantity > 0 && (
                        <p className={`${isLarge ? 'text-base' : 'text-[0.68rem]'} relative z-10 text-white/76 font-bold`}>
                            x{quantity}
                        </p>
                    )}
                </div>
                <div className="relative z-10 w-full h-1 rounded-full bg-white/45" />
            </motion.div>
        </motion.div>
    );
};

interface GachaAnimationProps {
    draws: DrawResult[];
    onClose: () => void;
    onReplay?: (count: 1 | 10) => void;
    canReplayOne?: boolean;
    canReplayTen?: boolean;
}

const GachaAnimation: React.FC<GachaAnimationProps> = ({
    draws,
    onClose,
    onReplay,
    canReplayOne = true,
    canReplayTen = true,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [phase, setPhase] = useState<Phase>('summoning');
    const [allRevealed, setAllRevealed] = useState(false);

    const isTenPull = draws.length > 1;
    const bestRarity = useMemo(() => getBestRarity(draws), [draws]);
    const bestMeta = RARITY_META[bestRarity];
    const wonCount = draws.filter((draw) => draw.won).length;
    const summonMs = isTenPull ? 2500 : 1800;
    const revealDelay = isTenPull ? 120 : 0;
    const revealCompleteMs = isTenPull ? Math.min(1800, draws.length * 120 + 760) : 760;

    const comets = useMemo(() => {
        const count = isTenPull ? Math.min(10, draws.length) : 1;
        return Array.from({ length: count }, (_, index) => {
            const draw = draws[index] || draws[0];
            const rarity = draw ? getRarity(draw) : bestRarity;
            const meta = RARITY_META[rarity];
            const offset = index - (count - 1) / 2;
            return {
                key: `${index}-${rarity}`,
                color: meta.accent,
                glow: meta.glow,
                yStart: isTenPull ? `${56 + offset * 3.6}vh` : '58vh',
                yEnd: isTenPull ? `${20 + Math.abs(offset) * 2.2}vh` : '26vh',
                rotate: isTenPull ? -22 + offset * 4.8 : -18,
                delay: isTenPull ? index * 0.08 : 0,
            };
        });
    }, [bestRarity, draws, isTenPull]);

    useGachaBackground(canvasRef, bestMeta.accent, summonMs * 0.42);

    useEffect(() => {
        console.log('[GachaAnimation] overlay mounted', { drawCount: draws.length, bestRarity });
        return () => console.log('[GachaAnimation] overlay unmounted');
    }, [bestRarity, draws.length]);

    useEffect(() => {
        setPhase('summoning');
        setAllRevealed(false);

        const burstTimer = window.setTimeout(() => setPhase('burst'), summonMs);
        const resultTimer = window.setTimeout(() => setPhase('results'), summonMs + 650);
        const doneTimer = window.setTimeout(() => setAllRevealed(true), summonMs + 650 + revealCompleteMs);

        return () => {
            window.clearTimeout(burstTimer);
            window.clearTimeout(resultTimer);
            window.clearTimeout(doneTimer);
        };
    }, [draws, revealCompleteMs, summonMs]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && allRevealed) onClose();
            if (event.key === ' ' && !allRevealed) {
                event.preventDefault();
                setPhase('results');
                setAllRevealed(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [allRevealed, onClose]);

    if (draws.length === 0) return null;

    const finishEarly = () => {
        setPhase('results');
        setAllRevealed(true);
    };

    const replay = (count: 1 | 10) => {
        if (!onReplay) return;
        onReplay(count);
    };

    const overlay = (
        <div className="fixed inset-0 flex items-center justify-center overflow-hidden select-none text-white" style={{ zIndex: 2147483647 }}>
            <div
                className="absolute inset-0 bg-slate-950"
                style={{
                    background:
                        'radial-gradient(circle at 50% 42%, rgba(56,189,248,0.18), transparent 32%), radial-gradient(circle at 50% 52%, rgba(15,23,42,0.1), #020617 72%)',
                }}
            />
            <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

            <AnimatePresence mode="wait">
                {phase === 'summoning' && (
                    <motion.div
                        key="summoning"
                        className="absolute inset-0 z-10 overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35 }}
                    >
                        <motion.div
                            className="absolute left-1/2 top-1/2 h-[1px] w-[80vw] -translate-x-1/2 bg-white/20"
                            initial={{ scaleX: 0, opacity: 0 }}
                            animate={{ scaleX: 1, opacity: [0, 0.45, 0] }}
                            transition={{ duration: summonMs / 1000, ease: 'easeInOut' }}
                        />
                        <MagicCircle accent={bestMeta.accent} glow={bestMeta.glow} isTenPull={isTenPull} />
                        {comets.map((comet) => (
                            <motion.div
                                key={comet.key}
                                className="absolute left-0 top-0 h-2 w-44 origin-right rounded-full"
                                style={{
                                    background: `linear-gradient(90deg, transparent, ${BASE_SUMMON_COLOR})`,
                                    boxShadow: `0 0 34px ${BASE_SUMMON_GLOW}`,
                                }}
                                initial={{ x: '-18vw', y: comet.yStart, rotate: comet.rotate, opacity: 0, scaleX: 0.55 }}
                                animate={{
                                    x: '118vw',
                                    y: comet.yEnd,
                                    opacity: [0, 1, 1, 0],
                                    scaleX: [0.55, 1.35, 2.15],
                                }}
                                transition={{
                                    duration: isTenPull ? 2.05 : 1.55,
                                    delay: comet.delay,
                                    ease: [0.16, 0.84, 0.44, 1],
                                }}
                            >
                                <motion.span
                                    className="absolute inset-0 rounded-full"
                                    style={{
                                        background: `linear-gradient(90deg, transparent, ${comet.color})`,
                                        boxShadow: `0 0 42px ${comet.glow}`,
                                    }}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: [0, 0, 1, 1, 0] }}
                                    transition={{
                                        duration: isTenPull ? 2.05 : 1.55,
                                        delay: comet.delay,
                                        times: [0, 0.42, 0.66, 0.84, 1],
                                        ease: 'easeInOut',
                                    }}
                                />
                                <span
                                    className="absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white"
                                    style={{ boxShadow: `0 0 30px 8px ${BASE_SUMMON_GLOW}` }}
                                />
                                <motion.span
                                    className="absolute right-0 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white"
                                    style={{ boxShadow: `0 0 34px 10px ${comet.glow}` }}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: [0, 0, 1, 0.85, 0], scale: [0.8, 0.8, 1.2, 1, 0.6] }}
                                    transition={{
                                        duration: isTenPull ? 2.05 : 1.55,
                                        delay: comet.delay,
                                        times: [0, 0.42, 0.66, 0.84, 1],
                                        ease: 'easeInOut',
                                    }}
                                />
                            </motion.div>
                        ))}
                        <div className="absolute inset-x-0 top-[18vh] flex flex-col items-center gap-3">
                            <motion.div
                                initial={{ opacity: 0, y: -12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.45 }}
                                className="flex items-center gap-3 text-sm font-black tracking-[0.36em] text-cyan-100/85"
                            >
                                <motion.span
                                    animate={{ color: [BASE_SUMMON_COLOR, BASE_SUMMON_COLOR, bestMeta.accent] }}
                                    transition={{ duration: summonMs / 1000, times: [0, 0.48, 0.78], ease: 'easeInOut' }}
                                >
                                    <FaBolt />
                                </motion.span>
                                <span>{isTenPull ? '十连祈愿' : '单次祈愿'}</span>
                            </motion.div>
                            <motion.p
                                className="text-3xl sm:text-5xl font-black tracking-[0.18em]"
                                animate={{
                                    color: [BASE_SUMMON_COLOR, BASE_SUMMON_COLOR, bestMeta.accent],
                                    opacity: [0.62, 1, 0.62],
                                    scale: [1, 1.035, 1],
                                    textShadow: [
                                        `0 0 28px ${BASE_SUMMON_GLOW}`,
                                        `0 0 34px ${BASE_SUMMON_GLOW}`,
                                        `0 0 38px ${bestMeta.glow}`,
                                    ],
                                }}
                                transition={{
                                    color: { duration: summonMs / 1000, times: [0, 0.48, 0.78], ease: 'easeInOut' },
                                    opacity: { duration: 1.2, repeat: Infinity },
                                    scale: { duration: 1.2, repeat: Infinity },
                                    textShadow: { duration: summonMs / 1000, times: [0, 0.48, 0.78], ease: 'easeInOut' },
                                }}
                            >
                                星轨展开
                            </motion.p>
                        </div>
                    </motion.div>
                )}

                {phase === 'burst' && (
                    <motion.div
                        key="burst"
                        className="absolute inset-0 z-20 flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22 }}
                    >
                        <motion.div
                            className="h-16 w-16 rounded-full bg-white"
                            style={{ boxShadow: `0 0 120px 64px ${bestMeta.glow}` }}
                            initial={{ scale: 0.35, opacity: 0.9 }}
                            animate={{ scale: [0.35, 10, 18], opacity: [0.95, 0.82, 0] }}
                            transition={{ duration: 0.65, ease: 'easeOut' }}
                        />
                    </motion.div>
                )}

                {phase === 'results' && (
                    <motion.div
                        key="results"
                        className="relative z-30 flex max-h-[96vh] w-full flex-col items-center gap-4 overflow-y-auto px-4 py-6"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.36 }}
                    >
                        <div className="text-center">
                            <motion.div
                                className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border border-white/35 bg-white/10"
                                style={{ boxShadow: `0 0 36px ${bestMeta.glow}` }}
                                initial={{ scale: 0.7, rotate: -12 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: 'spring', stiffness: 240, damping: 16 }}
                            >
                                <FaStar className="text-2xl" style={{ color: bestMeta.accent }} />
                            </motion.div>
                            <p className="text-xs font-black tracking-[0.32em] text-white/55">
                                {isTenPull ? '十连结果' : '祈愿结果'}
                            </p>
                            <h2
                                className="mt-1 text-3xl font-black tracking-[0.16em] sm:text-4xl"
                                style={{ color: bestMeta.accent, textShadow: `0 0 28px ${bestMeta.glow}` }}
                            >
                                {bestMeta.label}
                            </h2>
                            <p className="mt-2 text-sm text-white/60">
                                本次获得 {wonCount} 项奖励
                            </p>
                        </div>

                        {isTenPull ? (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
                                {draws.map((draw, index) => (
                                    <GachaCard
                                        key={`${index}-${draw.reward?.productId || draw.reward?.productName || 'none'}`}
                                        draw={draw}
                                        index={index}
                                        delayMs={index * revealDelay}
                                        forceReveal={allRevealed}
                                    />
                                ))}
                            </div>
                        ) : (
                            <GachaCard
                                draw={draws[0]}
                                index={0}
                                delayMs={0}
                                forceReveal={allRevealed}
                                isLarge
                            />
                        )}

                        <AnimatePresence>
                            {allRevealed && (
                                <motion.div
                                    key="actions"
                                    className="flex flex-wrap items-center justify-center gap-3 pt-1"
                                    initial={{ opacity: 0, y: 18 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    transition={{ duration: 0.32 }}
                                >
                                    <button
                                        onClick={() => replay(1)}
                                        disabled={!onReplay || !canReplayOne}
                                        className="flex min-w-36 items-center justify-center gap-2 rounded-xl border border-yellow-200/70 px-5 py-3 text-sm font-black tracking-widest text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                                        style={{
                                            background: 'linear-gradient(90deg,#f8c14a,#fff0a8)',
                                            boxShadow: canReplayOne ? '0 0 26px rgba(248,193,74,0.45)' : 'none',
                                        }}
                                    >
                                        <FaRedo /> 再来一发
                                    </button>
                                    <button
                                        onClick={() => replay(10)}
                                        disabled={!onReplay || !canReplayTen}
                                        className="flex min-w-36 items-center justify-center gap-2 rounded-xl border border-cyan-100/60 px-5 py-3 text-sm font-black tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-40"
                                        style={{
                                            background: 'linear-gradient(90deg,#0f172a,#2563eb,#7c3aed)',
                                            boxShadow: canReplayTen ? '0 0 26px rgba(125,211,252,0.36)' : 'none',
                                        }}
                                    >
                                        <FaStar /> 再来十连
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="min-w-28 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold tracking-widest text-white/80 hover:bg-white/16"
                                    >
                                        完成
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {!allRevealed && (
                <button
                    onClick={finishEarly}
                    className="absolute bottom-6 right-6 z-40 rounded-lg border border-white/15 bg-black/20 px-4 py-2 text-xs font-bold tracking-widest text-white/45 backdrop-blur hover:text-white/80"
                >
                    跳过动画
                </button>
            )}

            {allRevealed && (
                <button
                    onClick={onClose}
                    className="absolute right-6 top-6 z-40 text-white/45 transition-colors hover:text-white"
                    aria-label="关闭抽卡结果"
                >
                    <FaTimes className="text-2xl" />
                </button>
            )}
        </div>
    );

    return createPortal(overlay, document.body);
};

export default GachaAnimation;
