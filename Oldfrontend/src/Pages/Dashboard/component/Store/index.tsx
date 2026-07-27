import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { FaStore, FaBoxOpen, FaScroll, FaDice } from 'react-icons/fa';
import { message } from 'antd';
import { getRarityLabel } from '@timeplan-game/core/economy/rarity';

import { RootState } from '../../../../Redux/store';
import { setSelectedSystemId } from '../../../../Redux/Features/systemSlice';
import { useLazyGetSystemListQuery, usePurchaseStoreProductMutation } from '../../../../api/systemRtkApi';
import { useLazyGetProfileAndUserQuery } from '../../../../api/profileApi';
import '../pixelDashboard.css';
import { getMemberSystems, isOwnedSystem } from '../../utils/systemRelationship';

const Store: React.FC = () => {
    const dispatch = useDispatch();

    const allSystems = useSelector((state: RootState) => state.system.systems);
    const selectedSystemId = useSelector((state: RootState) => state.system.selectedSystemId);
    const profile = useSelector((state: RootState) => state.profile.profile);

    const systems = useMemo(
        () => getMemberSystems(allSystems, profile?._id),
        [allSystems, profile?._id]
    );
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [triggerGetProfileAndUser] = useLazyGetProfileAndUserQuery();
    const [purchaseStoreProduct, { isLoading: isPurchasing }] = usePurchaseStoreProductMutation();

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    useEffect(() => {
        if (!selectedSystemId && systems.length > 0) {
            dispatch(setSelectedSystemId(systems[0]._id));
        }
    }, [selectedSystemId, systems, dispatch]);

    const selectedSystem = useMemo(() => {
        if (!systems.length) return null;
        return systems.find((sys) => sys._id === selectedSystemId) || systems[0];
    }, [systems, selectedSystemId]);

    if (!systems.length) {
        return (
            <section className="pixel-page-shell w-full h-[85vh] flex flex-col overflow-hidden select-none p-8">
                <div className="flex flex-col items-center justify-center h-full text-neutral-400 dark:text-white/40">
                    <FaStore className="text-7xl mb-6 opacity-40 drop-shadow-md" />
                    <p className="text-2xl font-black tracking-widest mb-2">未加入任何系统</p>
                    <p className="text-sm font-bold tracking-wider opacity-70">请前往「探索法则」创建或加入系统，方可访问交易馆</p>
                </div>
            </section>
        );
    }

    const isOwner = selectedSystem ? isOwnedSystem(selectedSystem, profile?._id) : false;
    const products = selectedSystem?.storeProducts || [];
    const currentCoins = Number(profile?.wallet?.coins || 0);

    const handlePurchase = async (productId: string, productName: string) => {
        if (!selectedSystem?._id) return;

        try {
            const result = await purchaseStoreProduct({
                systemId: selectedSystem._id,
                productId,
                quantity: 1,
            }).unwrap();

            message.success(`购买成功：${result.purchase.productName}（- ${result.purchase.totalCost} 金币）`);
            await Promise.all([
                triggerGetSystemList().unwrap(),
                triggerGetProfileAndUser().unwrap(),
            ]);
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || `购买失败：${productName}`);
        }
    };

    return (
        <section className="pixel-page-shell w-full h-[85vh] flex flex-col overflow-hidden select-none relative">
            
            <div className="pixel-page-header px-8 py-6 relative z-10 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="pixel-icon-tile p-3">
                            <FaStore className="text-3xl drop-shadow-md" />
                        </div>
                        <div>
                            <h1 className="pixel-page-title text-3xl font-extrabold">高维交易馆</h1>
                            <p className="pixel-page-subtitle text-sm font-bold uppercase mt-1">Resource Exchange Network</p>
                        </div>
                    </div>

                </div>

                <div className="mt-6 flex flex-wrap gap-2 md:gap-3">
                    {systems.map((sys) => (
                        <button
                            key={sys._id}
                            onClick={() => dispatch(setSelectedSystemId(sys._id))}
                            className={`pixel-button px-4 py-2 text-xs md:text-sm font-black tracking-widest transition-all duration-300 relative overflow-hidden group ${
                                selectedSystem?._id === sys._id
                                    ? 'pixel-button-primary'
                                    : ''
                            }`}
                        >
                            <span className="relative z-10">{sys.name}</span>
                            {selectedSystem?._id === sys._id && (
                                <motion.div layoutId="storeSystemTab" className="absolute inset-0 bg-neutral-800 dark:bg-[#FFC72C]" style={{ zIndex: 0 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin scrollbar-thumb-black/20 dark:scrollbar-thumb-white/20 scrollbar-track-transparent relative z-10">
                {!selectedSystem?.modules?.store ? (
                    <div className="h-full flex items-center justify-center text-neutral-400 dark:text-white/35">
                        <div className="text-center">
                            <FaStore className="text-7xl mb-6 opacity-30 drop-shadow-md mx-auto" />
                            <p className="text-2xl font-black tracking-widest mb-2">流转中枢未激活</p>
                            <p className="text-sm font-bold tracking-wider opacity-70">请在探索法则(设置)中启用 Store 模块以进行交易</p>
                        </div>
                    </div>
                ) : products.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-neutral-400 dark:text-white/35">
                        <div className="text-center">
                            <FaStore className="text-7xl mb-6 opacity-30 drop-shadow-md mx-auto" />
                            <p className="text-2xl font-black tracking-widest mb-2">节点库存空缺</p>
                            <p className="text-sm font-bold tracking-wider opacity-70">世界主宰尚未在此节点投放资源</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {products.map((product) => (
                            <motion.div
                                key={product._id}
                                whileHover={{ scale: 1.05, y: -5 }}
                                className="pixel-card relative p-6 transition-all duration-300 flex flex-col group overflow-hidden"
                            >
                                <div className="flex items-start justify-between mb-4 z-10">
                                    <h3 className="text-xl font-black tracking-wider text-neutral-800 dark:text-white">{product.name}</h3>
                                    <span className={`pixel-chip pixel-rarity-${product.rarity || 'common'} text-[10px] font-black uppercase tracking-widest px-3 py-1`}>
                                        {getRarityLabel(product.rarity || 'common')}
                                    </span>
                                </div>

                                {product.image ? (
                                    <img
                                        src={product.image}
                                        alt={product.name}
                                        className="pixel-item-frame w-full h-36 object-cover mb-4 z-10"
                                    />
                                ) : (
                                    <div className="pixel-item-frame w-full h-36 mb-4 flex items-center justify-center text-amber-100 z-10">
                                        {product.type === 'mission' && <FaScroll className="text-5xl" />}
                                        {product.type === 'item' && <FaBoxOpen className="text-5xl" />}
                                        {product.type === 'lottery_chance' && <FaDice className="text-5xl" />}
                                    </div>
                                )}

                                <p className="text-sm font-medium text-neutral-600 dark:text-white/60 mb-4 flex-1 line-clamp-3 leading-relaxed">
                                    {product.description || '不可名状的物品，充满了未知的能量。'}
                                </p>
                                
                                <div className="flex gap-4 mb-5 text-xs font-bold tracking-widest uppercase opacity-70 z-10 border-t border-black/5 dark:border-white/10 pt-4">
                                    <span className="pixel-chip px-2 py-1">
                                        类型: {product.type === 'item' ? '道具实体' : product.type === 'mission' ? '任务卷轴' : '概率祈愿盒'}
                                    </span>
                                    {product.stock !== null && (
                                        <span className="pixel-chip px-2 py-1">余量: {product.stock}</span>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-black/5 dark:border-white/10 z-10 gap-4 mt-auto">
                                    <span className="text-amber-600 dark:text-[#FFC72C] text-2xl font-black font-mono tracking-tighter drop-shadow-sm flex items-center gap-1.5">
                                        <FaStore className="text-sm mb-1 opacity-80" />
                                        {product.price} 
                                    </span>
                                    <motion.button
                                        whileHover={!(isPurchasing || product.stock === 0 || currentCoins < product.price) ? { scale: 1.05 } : {}}
                                        whileTap={!(isPurchasing || product.stock === 0 || currentCoins < product.price) ? { scale: 0.95 } : {}}
                                        onClick={() => handlePurchase(product._id, product.name)}
                                        disabled={isPurchasing || product.stock === 0 || currentCoins < product.price}
                                        className={`pixel-button px-5 py-2.5 text-sm font-black tracking-widest transition-all ${
                                            product.stock === 0 || currentCoins < product.price
                                            ? ''
                                            : 'pixel-button-primary'
                                        }`}
                                    >
                                        {product.stock === 0 ? '资源枯竭' : currentCoins < product.price ? '金币不足' : '购买'}
                                    </motion.button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {!isOwner && selectedSystem && (
                    <div className="pixel-section mt-8 p-4 text-xs tracking-widest font-bold text-center">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 dark:bg-[#FFC72C] mr-2 shadow-[0_0_5px_currentColor]"></span>
                        &gt;&gt; 节点同步成功: {selectedSystem.name} &lt;&lt;
                    </div>
                )}
            </div>
        </section>
    );
};

export default Store;
