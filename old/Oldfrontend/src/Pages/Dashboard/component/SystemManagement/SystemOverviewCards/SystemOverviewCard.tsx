import React from 'react';
import { Badge } from 'antd';
import { motion } from 'framer-motion';

import type { SystemOverviewCardProps } from './types';

const SystemOverviewCard: React.FC<SystemOverviewCardProps> = ({
    title,
    value,
    detail,
    icon,
    hasNotice = false,
    onClick,
}) => {
    return (
        <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="system-overview-card"
            onClick={onClick}
        >
            <span className="system-overview-card-icon">
                <Badge dot={hasNotice} offset={[-2, 2]}>
                    <span>{icon}</span>
                </Badge>
            </span>
            <span className="system-overview-card-copy">
                <span className="system-overview-card-title">{title}</span>
            </span>
            <span className="system-overview-card-metric">
                <strong>{value}</strong>
                <small>{detail}</small>
            </span>
        </motion.button>
    );
};

export default SystemOverviewCard;
