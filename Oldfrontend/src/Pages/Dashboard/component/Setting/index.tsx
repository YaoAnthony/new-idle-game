import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { message } from 'antd';
import { FaCogs, FaPlus, FaSearch } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import type { SystemLite } from '../../../../Redux/Features/systemSlice';
import { useCreateSystemMutation, useLazyGetSystemListQuery } from '../../../../api/systemRtkApi';
import { getOwnedSystems } from '../../utils/systemRelationship';
import './Setting.css';

type CreateSystemForm = {
    name: string;
    description: string;
};

const defaultFormState: CreateSystemForm = {
    name: '',
    description: '',
};

const cardMotion = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 6 },
    transition: { duration: 0.16, ease: 'easeOut' as const },
};

function SystemAvatar({ system }: { system: SystemLite }) {
    return (
        <div className="setting-system-avatar">
            {system.image ? <img src={system.image} alt="" /> : <FaCogs />}
        </div>
    );
}

const Setting: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const systems = useSelector((state: RootState) => state.system.systems);
    const isSystemLoading = useSelector((state: RootState) => state.system.loading);
    const profile = useSelector((state: RootState) => state.profile.profile);

    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [createSystem, { isLoading: isCreatingSystem }] = useCreateSystemMutation();

    const [searchQuery, setSearchQuery] = useState('');
    const [isCreating, setIsCreating] = useState(() => searchParams.get('mode') === 'create');
    const [form, setForm] = useState<CreateSystemForm>(defaultFormState);

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    useEffect(() => {
        setIsCreating(searchParams.get('mode') === 'create');
    }, [searchParams]);

    const ownSystems = useMemo(() => getOwnedSystems(systems, profile?._id), [profile?._id, systems]);
    const filteredOwnSystems = useMemo(
        () => ownSystems.filter((system) => system.name.toLowerCase().includes(searchQuery.trim().toLowerCase())),
        [ownSystems, searchQuery]
    );

    const openCreatePanel = () => {
        setIsCreating(true);
        setSearchParams({ mode: 'create' });
    };

    const closeCreatePanel = () => {
        setIsCreating(false);
        setSearchParams({});
    };

    const resetCreatePanel = () => {
        setForm(defaultFormState);
        closeCreatePanel();
    };

    const handleCreateSystem = async () => {
        if (!form.name.trim()) {
            message.error('系统名称不能为空');
            return;
        }

        try {
            const payload = {
                name: form.name.trim(),
                image: null,
                description: form.description.trim(),
                modules: {
                    taskChain: true,
                    store: true,
                    lottery: true,
                },
            };

            const result = await createSystem(payload).unwrap();
            message.success('系统创建成功');
            setForm(defaultFormState);
            setIsCreating(false);
            setSearchParams({});
            await triggerGetSystemList();

            const createdSystemId = result?.system?._id ? String(result.system._id) : '';
            if (createdSystemId) {
                navigate(`/dashboard/system/${createdSystemId}`);
            }
        } catch (error) {
            console.error('Create system error:', error);
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '创建系统失败');
        }
    };

    const handleSystemCardClick = (systemId: string) => {
        navigate(`/dashboard/system/${systemId}`);
    };

    const renderCreateForm = () => (
        <motion.main
            className="setting-create-page"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
        >
            <section
                role="form"
                aria-labelledby="setting-create-title"
                className="setting-create-panel setting-create-panel--page"
            >
                <header className="setting-create-header">
                    <div>
                        <span className="setting-kicker">系统工作室</span>
                        <h2 id="setting-create-title">创建系统</h2>
                        <p>填写名称和描述，任务链、商城和祈愿池会默认启用。</p>
                    </div>
                </header>

                <div className="setting-create-body">
                    <label className="setting-field">
                        <span>系统名称</span>
                        <input
                            placeholder="例如：每日成长系统"
                            value={form.name}
                            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        />
                    </label>

                    <label className="setting-field">
                        <span>描述</span>
                        <textarea
                            rows={5}
                            placeholder="记录这个系统的用途和运行规则"
                            value={form.description}
                            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                        />
                    </label>
                </div>

                <footer className="setting-create-footer">
                    <button
                        type="button"
                        onClick={resetCreatePanel}
                        className="setting-action-button"
                    >
                        返回工作室
                    </button>
                    <motion.button
                        type="button"
                        onClick={handleCreateSystem}
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={isCreatingSystem}
                        className="setting-action-button setting-action-button--primary"
                    >
                        {isCreatingSystem ? '创建中...' : '确认创建'}
                    </motion.button>
                </footer>
            </section>
        </motion.main>
    );

    const renderSystemCard = (system: SystemLite) => {
        const description = system.description?.trim() || '未记录此系统运行规则。';

        return (
            <motion.article
                key={system._id}
                {...cardMotion}
                layout
                className="setting-system-card is-clickable"
                onClick={() => handleSystemCardClick(system._id)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSystemCardClick(system._id);
                    }
                }}
                role="button"
                tabIndex={0}
            >
                <div className="setting-card-top">
                    <SystemAvatar system={system} />
                    <div className="setting-card-title">
                        <span>我创建的系统</span>
                        <h3>{system.name}</h3>
                    </div>
                </div>

                <p>{description}</p>
                <span className="setting-card-footer">点击进入系统管理</span>
            </motion.article>
        );
    };

    return (
        <section className="setting-page">
            <div className="setting-bg-layer" />

            <header className="setting-header">
                <div>
                    <span className="setting-kicker">系统工作室</span>
                    <h1>
                        <span className="setting-title-mark">
                            <FaCogs />
                        </span>
                        探索法则
                    </h1>
                </div>
                <div className="setting-header-stats">
                    <span>已创建 {ownSystems.length}</span>
                </div>
            </header>

            <div className={`setting-content ${isCreating ? 'is-create-page' : ''}`}>
                {isCreating ? (
                    renderCreateForm()
                ) : (
                    <main className="setting-main">
                        <div className="setting-toolbar">
                            <label className="setting-search-field">
                                <FaSearch />
                                <input
                                    type="text"
                                    placeholder="搜索我创建的系统"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                />
                            </label>

                            <motion.button
                                type="button"
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={openCreatePanel}
                                className="setting-action-button setting-action-button--primary setting-create-entry"
                            >
                                <FaPlus />
                                创建系统
                            </motion.button>
                        </div>

                        <div className="setting-scroll">
                            <div className="setting-grid">
                                <AnimatePresence mode="popLayout">
                                    {filteredOwnSystems.map((system) => renderSystemCard(system))}
                                </AnimatePresence>

                                {filteredOwnSystems.length === 0 && (
                                    <div className="setting-empty-state">
                                        <FaCogs />
                                        <p>{isSystemLoading ? '系统列表加载中...' : searchQuery ? '暂无匹配的系统。' : '还没有创建系统。'}</p>
                                        {!searchQuery && !isSystemLoading && (
                                            <button
                                                type="button"
                                                onClick={openCreatePanel}
                                                className="setting-action-button setting-action-button--primary setting-empty-action"
                                            >
                                                <FaPlus />
                                                创建第一个系统
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                )}
            </div>
        </section>
    );
};

export default Setting;
