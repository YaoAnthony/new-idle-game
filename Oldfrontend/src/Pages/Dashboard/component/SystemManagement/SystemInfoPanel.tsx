import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { message } from 'antd';
import { FaCopy, FaInfoCircle, FaShareAlt, FaUserPlus } from 'react-icons/fa';
import type { SystemLite } from '../../../../Types/System';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../../Redux/store';
import { useNavigate } from 'react-router-dom';

import { useJoinSystemMutation } from '../../../../api/systemRtkApi';
import DeleteSystem from './DeleteSystem';
import { isMemberSystem, isOwnedSystem } from '../../utils/systemRelationship';
import SystemOverviewCards, { type SystemOverviewTabKey } from './SystemOverviewCards';

type SystemInfoPanelProps = {
    system: SystemLite;
    eventCount: number;
    onOpenTab: (tabKey: SystemOverviewTabKey) => void;
};

const SystemInfoPanel: React.FC<SystemInfoPanelProps> = ({ system, eventCount, onOpenTab }) => {

    const navigate = useNavigate();
    
    const profile = useSelector((state: RootState) => state.profile.profile);
    const [joinSystem, { isLoading: isJoiningOwnSystem }] = useJoinSystemMutation();
    const [hasJoinedOwnSystem, setHasJoinedOwnSystem] = useState(false);
    const isOwner = isOwnedSystem(system, profile?._id);
    const isMember = isMemberSystem(system, profile?._id) || hasJoinedOwnSystem;
    const canJoinOwnSystem = isOwner && !isMember;
    const description = system.description?.trim() || '未设置描述。';

    const handleJoinOwnSystem = async () => {
        try {
            await joinSystem({ systemId: system._id }).unwrap();
            setHasJoinedOwnSystem(true);
            message.success('已加入自己的系统');
        } catch (error) {
            console.error('Join own system error:', error);
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '加入系统失败');
        }
    };

    return (
        <div className="system-info-panel">
            <div className="system-info-stack">
                <SystemOverviewCards
                    system={system}
                    systemId={system._id}
                    eventCount={eventCount}
                    onOpenTab={onOpenTab}
                />

                <section className="system-info-card">
                    <header className="system-info-card-header">
                        <FaInfoCircle />
                        <h2>系统描述</h2>
                    </header>
                    <p className="system-info-description">{description}</p>
                    {system.image && (
                        <img src={system.image} alt="系统封面" className="system-info-cover" />
                    )}
                </section>

                <section className="system-info-card system-info-share-card">
                    <header className="system-info-card-header">
                        <FaShareAlt />
                        <h2>分享系统</h2>
                    </header>
                    <p className="system-info-muted">用于游戏内加入系统。</p>
                    <div className="system-info-share-row">
                        <code>
                            {system._id}
                        </code>
                        <div className="system-info-share-actions">
                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                    navigator.clipboard.writeText(system._id);
                                    message.success('系统ID已复制到剪贴板');
                                }}
                                className="system-info-copy-button"
                            >
                                <FaCopy />
                                复制ID
                            </motion.button>
                            {canJoinOwnSystem && (
                                <motion.button
                                    type="button"
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleJoinOwnSystem}
                                    disabled={isJoiningOwnSystem}
                                    className="system-info-copy-button system-info-join-own-button"
                                >
                                    <FaUserPlus />
                                    {isJoiningOwnSystem ? '加入中...' : '加入自己的系统'}
                                </motion.button>
                            )}
                        </div>
                    </div>
                </section>

                {isOwner && (
                    <section className="system-info-danger-zone">
                        <DeleteSystem
                            systemId={system._id}
                            systemName={system.name}
                            onDeleted={() => navigate('/dashboard/setting/my')}
                        />
                    </section>
                )}
            </div>
        </div>
    );
};

export default SystemInfoPanel;
