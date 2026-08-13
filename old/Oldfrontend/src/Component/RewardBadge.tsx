import React, { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { motion } from 'framer-motion';
import { RARITY_COLORS } from '../Constant';
import type { Rarity } from '../Types/System';

export interface RewardBadgeProps {
    icon?: ReactNode;
    value: string | number;
    label?: string; // Short label like "EXP"
    tooltipTitle: string;
    tooltipDesc?: string;
    theme?: 'amber' | 'purple' | 'blue'; // 保留兼容旧的theme方式
    rarity?: Rarity; // 新增：基于稀有度的样式
}

const themeStyles = {
    amber: {
        bg: 'bg-white/80 dark:bg-black/20',
        border: 'border-amber-200 dark:border-amber-500/30',
        iconBg: '', // e.g. Gold icon is an image, no extra bg needed
        text: 'text-neutral-700 dark:text-white/90',
        glow: '',
    },
    purple: {
        bg: 'bg-white/80 dark:bg-black/20',
        border: 'border-purple-200 dark:border-purple-500/30',
        iconBg: 'bg-purple-100 dark:bg-purple-900/40 text-purple-500',
        text: 'text-neutral-700 dark:text-white/90',
        glow: '',
    },
    blue: {
        bg: 'bg-white/80 dark:bg-black/20',
        border: 'border-blue-200 dark:border-blue-500/30',
        iconBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-500',
        text: 'text-neutral-700 dark:text-white/90',
        glow: '',
    }
};

const RewardBadge: React.FC<RewardBadgeProps> = ({ 
    icon, 
    value, 
    label, 
    tooltipTitle, 
    tooltipDesc, 
    theme, 
    rarity 
}) => {
    // 如果提供了rarity，使用稀有度样式；否则使用旧的theme样式
    const style = rarity 
        ? {
            bg: RARITY_COLORS[rarity].bg,
            border: RARITY_COLORS[rarity].border,
            iconBg: '',
            text: 'text-neutral-700 dark:text-white/90',
            glow: RARITY_COLORS[rarity].glow,
          }
        : themeStyles[theme || 'blue'];

    const tooltipContent = (
        <div className="flex flex-col gap-1 p-1">
            <span className="font-bold text-sm leading-tight text-white">{tooltipTitle}</span>
            {tooltipDesc && <span className="text-xs text-white/70">{tooltipDesc}</span>}
        </div>
    );

    return (
        <Tooltip 
            title={tooltipContent} 
            placement="top" 
            color="#1e293b" // dark slate color to pop in both light and dark mode
            overlayInnerStyle={{ borderRadius: '0.75rem', padding: '0.25rem' }}
        >
            <motion.div 
                whileHover={{ scale: 1.05 }}
                className={`flex flex-col items-center border-2 rounded-lg p-2 min-w-[56px] cursor-help ${style.bg} ${style.border} ${style.glow}`}
            >
                {icon && (
                    <div className={`w-8 h-8 rounded flex items-center justify-center mb-1 ${theme && !rarity ? style.iconBg : ''}`}>
                        {icon}
                    </div>
                )}
                {label && (
                    <span className="font-extrabold text-[10px] flex items-center justify-center px-1 text-center leading-tight break-all mb-0.5">
                        {label}
                    </span>
                )}
                <span className={`text-[10px] font-bold ${style.text}`}>{value}</span>
            </motion.div>
        </Tooltip>
    );
};

export default RewardBadge;
