import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaStore, FaScroll, FaBoxOpen, FaDice, FaEye, FaEyeSlash, FaTrash, FaPlus, FaSyncAlt } from 'react-icons/fa';
import { getRarityLabel } from '@timeplan-game/core/economy/rarity';
import {
    STORE_PRODUCT_CATEGORY_LABELS,
    STORE_PRODUCT_ECONOMY_TYPE_LABELS,
    STORE_PRODUCT_LOCATION_TYPE_LABELS,
    STORE_PRODUCT_NPC_ROLE_LABELS,
    STORE_PRODUCT_SHOP_MODE_LABELS,
} from '@timeplan-game/core/contracts/store/storeProduct';

import { RootState } from '../../../../Redux/store';
import { SystemLite } from '../../../../Redux/Features/systemSlice';
import type { StoreProductType, StoreProduct } from '../../../../Types/System';
import { RARITY_COLORS } from '../../../../Constant';
import {
    useLazyGetSystemListQuery,
    useCreateStoreProductMutation,
    useUpdateStoreProductMutation,
    useDeleteStoreProductMutation,
    useRepriceStoreProductMutation,
    useToggleStoreProductListingMutation,
} from '../../../../api/systemRtkApi';

const TYPE_LABELS: Record<string, string> = {
    mission: '任务',
    item: '道具',
    lottery_chance: '抽卡机会',
};

const VALUE_MODE_LABELS: Record<string, string> = {
    market_price_cny: '市场价',
    content_value: '内容价值',
};

const CONFIDENCE_LABELS: Record<string, string> = {
    high: '高',
    medium: '中',
    low: '低',
};

type StorePanelProps = {
    systemId: string;
    variant?: 'page' | 'embedded';
};

const StorePanel: React.FC<StorePanelProps> = ({ systemId, variant = 'page' }) => {
    const isEmbedded = variant === 'embedded';
    const systems = useSelector((state: RootState) => state.system.systems);
    const currentSystemData = systems.find(sys => sys._id === systemId) as (SystemLite & { storeProducts?: StoreProduct[] }) | undefined;

    const [isFormVisible, setIsFormVisible] = useState(false);
    const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
    const [form, setForm] = useState({
        name: '',
        type: 'item' as StoreProductType,
        image: '',
        description: '',
        stock: null as number | null,
        missionId: '',
    });

    const [triggerGetSystemList, { isLoading }] = useLazyGetSystemListQuery();
    const [createProduct, { isLoading: isCreating }] = useCreateStoreProductMutation();
    const [updateProduct, { isLoading: isUpdating }] = useUpdateStoreProductMutation();
    const [deleteProduct] = useDeleteStoreProductMutation();
    const [repriceProduct, { isLoading: isRepricing }] = useRepriceStoreProductMutation();
    const [toggleListing] = useToggleStoreProductListingMutation();

    const products = currentSystemData?.storeProducts || [];
    const isSaving = isCreating || isUpdating;

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    const resetForm = () => {
        setForm({
            name: '',
            type: 'item' as StoreProductType,
            image: '',
            description: '',
            stock: null,
            missionId: '',
        });
        setEditingProduct(null);
        setIsFormVisible(false);
    };

    const handleSubmit = async () => {
        if (isSaving) return;
        if (!form.name.trim()) {
            message.error('请填写商品名称');
            return;
        }
        if (form.stock !== null && form.stock < 0) {
            message.error('库存不能为负数');
            return;
        }
        try {
            const payload = {
                systemId,
                name: form.name.trim(),
                type: form.type,
                image: form.image.trim() || null,
                description: form.description.trim(),
                stock: form.type === 'mission' ? null : form.stock,
                missionId: form.type === 'mission' ? form.missionId.trim() : undefined,
            };
            if (editingProduct) {
                await updateProduct({ ...payload, productId: editingProduct._id }).unwrap();
                message.success('商品更新成功');
            } else {
                await createProduct(payload).unwrap();
                message.success('商品创建成功');
            }
            resetForm();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '操作失败');
        }
    };

    const handleEdit = (product: StoreProduct) => {
        setEditingProduct(product);
        setForm({
            name: product.name,
            type: product.type as StoreProductType,
            image: product.image || '',
            description: product.description || '',
            stock: product.stock,
            missionId: product.missionId || '',
        });
        setIsFormVisible(true);
    };

    const handleDelete = async (productId: string) => {
        if (!confirm('确定要删除此商品吗？此操作不可撤销。')) return;
        try {
            await deleteProduct({ systemId, productId }).unwrap();
            message.success('商品已删除');
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '删除失败');
        }
    };

    const handleToggleListing = async (productId: string, currentListed: boolean) => {
        try {
            await toggleListing({ systemId, productId }).unwrap();
            message.success(currentListed ? '商品已下架（用户不可见）' : '商品已上架');
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '操作失败');
        }
    };

    const handleReprice = async (productId: string) => {
        try {
            await repriceProduct({ systemId, productId }).unwrap();
            message.success('已重新估价');
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '重新估价失败');
        }
    };

    return (
        <div className={`${isEmbedded ? 'system-management-panel--embedded relative min-h-0 p-3 overflow-hidden' : 'p-6 2xl:p-8 overflow-y-auto'} h-full scrollbar-thin scrollbar-thumb-system-line/20 scrollbar-track-transparent`}>
            <div className={`${isEmbedded ? 'h-full min-h-0 overflow-y-auto pr-1' : 'max-w-6xl'} scrollbar-thin scrollbar-thumb-system-line/20 scrollbar-track-transparent`}>
                {/* Header */}
                <div className={`bg-system-panel/80 border border-system-line/20 rounded-xl ${isEmbedded ? 'p-3 mb-3 gap-3' : 'p-6 mb-6'} flex justify-between items-center`}>
                    <div>
                        <h3 className={`${isEmbedded ? 'text-sm' : 'text-lg'} font-bold tracking-widest mb-1 text-system-accent`}>商城管理</h3>
                        <p className={`${isEmbedded ? 'text-xs' : 'text-sm'} text-system-muted`}>创建商品，后端按市场价或内容价值自动估价，仅上架商品对用户可见</p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => { resetForm(); setIsFormVisible(true); }}
                        className={`bg-system-accent hover:bg-system-accent/80 text-system-bg ${isEmbedded ? 'px-3 py-1.5 text-xs' : 'px-5 py-2'} rounded-lg font-bold tracking-wider transition-colors flex items-center gap-2`}
                    >
                        <FaPlus /> 创建新商品
                    </motion.button>
                </div>

                {isLoading ? (
                    <div className={`text-center ${isEmbedded ? 'py-8 text-xs' : 'py-12'} text-system-muted bg-system-panel/40 rounded-xl border border-dashed border-system-line/30`}>
                        <FaStore className={`${isEmbedded ? 'text-3xl mb-3' : 'text-5xl mb-4'} opacity-30 mx-auto animate-pulse`} />
                        <p className="tracking-widest">加载中...</p>
                    </div>
                ) : products.length === 0 ? (
                    <div className={`text-center ${isEmbedded ? 'py-8 text-xs' : 'py-12'} text-system-muted bg-system-panel/40 rounded-xl border border-dashed border-system-line/30`}>
                        <FaStore className={`${isEmbedded ? 'text-3xl mb-3' : 'text-5xl mb-4'} opacity-30 mx-auto`} />
                        <p className="tracking-widest">商城空空如也，点击「创建新商品」开始添加</p>
                    </div>
                ) : (
                    <div className={`grid grid-cols-1 ${isEmbedded ? 'lg:grid-cols-2 gap-3' : 'md:grid-cols-2 lg:grid-cols-3 gap-4'}`}>
                        {products.map((product) => {
                            const rarityConfig = RARITY_COLORS[product.rarity as keyof typeof RARITY_COLORS] ?? RARITY_COLORS.common;
                            const isListed = product.isListed !== false;
                            const pricingSources = Array.isArray(product.pricingSources) ? product.pricingSources : [];
                            const firstPricingSource = pricingSources.find((source) => source?.url);
                            const categoryLabel = product.productCategory ? STORE_PRODUCT_CATEGORY_LABELS[product.productCategory] : null;
                            const economyTypeLabel = product.productEconomyType ? STORE_PRODUCT_ECONOMY_TYPE_LABELS[product.productEconomyType] : null;
                            const placement = product.shopPlacement;
                            const placementModeLabel = placement?.mode ? STORE_PRODUCT_SHOP_MODE_LABELS[placement.mode] : null;
                            const npcRoleLabel = placement?.npcRole ? STORE_PRODUCT_NPC_ROLE_LABELS[placement.npcRole] : null;
                            const locationTypeLabel = placement?.locationType ? STORE_PRODUCT_LOCATION_TYPE_LABELS[placement.locationType] : null;
                            const minRarityLabel = placement?.minRarity ? getRarityLabel(placement.minRarity) : null;
                            return (
                                <motion.div
                                    key={product._id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={`relative rounded-xl overflow-hidden border-2 bg-system-panel/80 transition-all ${rarityConfig.border} ${isListed ? '' : 'opacity-60 grayscale'}`}
                                    style={{ boxShadow: isListed ? `0 0 12px color-mix(in srgb, ${rarityConfig.glow.replace('shadow-', '').replace('/30', '')} 20%, transparent)` : undefined }}
                                >
                                    {/* Rarity accent top bar */}
                                    <div
                                        className="h-1 w-full"
                                        style={{ background: rarityConfig.color }}
                                    />

                                    <div className={isEmbedded ? 'p-3' : 'p-5'}>
                                        {/* Unlisted badge */}
                                        {!isListed && (
                                            <div className="absolute top-3 right-3 z-10 bg-system-faint/80 text-system-text text-xs px-2 py-0.5 rounded font-bold tracking-wider">
                                                已下架
                                            </div>
                                        )}

                                        {/* Name + rarity badge */}
                                        <div className="flex justify-between items-start mb-3">
                                            <h4 className="text-base font-bold text-system-text leading-tight pr-2">{product.name}</h4>
                                            <span
                                                className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0"
                                                style={{ color: rarityConfig.color, border: `1px solid ${rarityConfig.color}40`, background: `${rarityConfig.color}15` }}
                                            >
                                                {getRarityLabel(product.rarity)}
                                            </span>
                                        </div>

                                        {/* Image */}
                                        {product.image ? (
                                            <img
                                                src={product.image}
                                                alt={product.name}
                                                className="w-full h-28 object-cover rounded-lg border border-system-line/20 mb-3"
                                            />
                                        ) : (
                                            <div className="w-full h-28 rounded-lg border border-system-line/20 mb-3 bg-system-bg/50 flex items-center justify-center text-system-muted">
                                                {product.type === 'mission' && <FaScroll className="text-3xl" />}
                                                {product.type === 'item' && <FaBoxOpen className="text-3xl" />}
                                                {product.type === 'lottery_chance' && <FaDice className="text-3xl" />}
                                            </div>
                                        )}

                                        <p className="text-xs text-system-muted mb-3 min-h-[32px] line-clamp-2">
                                            {product.description || '无描述'}
                                        </p>

                                        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                                            <span className="bg-system-raised/80 px-2 py-1 rounded text-system-muted">
                                                {TYPE_LABELS[product.type] ?? product.type}
                                            </span>
                                            {product.pricingConfidence && (
                                                <span className="bg-system-raised/80 px-2 py-1 rounded text-system-muted">
                                                    估价: {CONFIDENCE_LABELS[product.pricingConfidence] ?? product.pricingConfidence}
                                                </span>
                                            )}
                                            {product.pricingValueMode && (
                                                <span className="bg-system-raised/80 px-2 py-1 rounded text-system-muted">
                                                    {VALUE_MODE_LABELS[product.pricingValueMode] ?? product.pricingValueMode}
                                                </span>
                                            )}
                                            {product.priceCnyEstimate != null && (
                                                <span className="bg-system-raised/80 px-2 py-1 rounded text-system-muted">
                                                    约¥{Math.round(Number(product.priceCnyEstimate) || 0)}
                                                </span>
                                            )}
                                            {product.stock !== null && (
                                                <span className="bg-system-raised/80 px-2 py-1 rounded text-system-muted">
                                                    库存: {product.stock}
                                                </span>
                                            )}
                                            {categoryLabel && (
                                                <span className="bg-system-raised/80 px-2 py-1 rounded text-system-muted">
                                                    分类: {categoryLabel}
                                                </span>
                                            )}
                                            {economyTypeLabel && (
                                                <span className="bg-system-raised/80 px-2 py-1 rounded text-system-muted">
                                                    {economyTypeLabel}
                                                </span>
                                            )}
                                            {placementModeLabel && (
                                                <span className="bg-system-raised/80 px-2 py-1 rounded text-system-muted">
                                                    {placementModeLabel}
                                                </span>
                                            )}
                                            {minRarityLabel && (
                                                <span className="bg-system-raised/80 px-2 py-1 rounded text-system-muted">
                                                    门槛: {minRarityLabel}
                                                </span>
                                            )}
                                        </div>
                                        {(npcRoleLabel || locationTypeLabel) && (
                                            <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] text-system-faint">
                                                {npcRoleLabel && <span>NPC: {npcRoleLabel}</span>}
                                                {locationTypeLabel && <span>地点: {locationTypeLabel}</span>}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mb-3 text-[11px]">
                                            {firstPricingSource ? (
                                                <a
                                                    href={firstPricingSource.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-system-action hover:text-system-accent transition-colors underline-offset-4 hover:underline"
                                                    title={firstPricingSource.title || firstPricingSource.url}
                                                >
                                                    市场来源 {pricingSources.length}
                                                </a>
                                            ) : product.pricingValueMode === 'market_price_cny' ? (
                                                <span className="text-system-faint">无市场来源</span>
                                            ) : null}
                                        </div>
                                        {product.pricingReason && (
                                            <p className="text-[11px] leading-relaxed text-system-faint mb-3 line-clamp-2">
                                                {product.pricingReason}
                                            </p>
                                        )}
                                        {product.shopVisibilityReason && (
                                            <p className="text-[11px] leading-relaxed text-system-faint mb-3 line-clamp-2">
                                                {product.shopVisibilityReason}
                                            </p>
                                        )}

                                        {/* Footer */}
                                        <div className="flex justify-between items-center pt-3 border-t border-system-line/10">
                                            <span className="text-system-accent font-black text-base">{product.price} 金币</span>
                                            <div className="flex gap-1.5">
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleReprice(product._id)}
                                                    disabled={isRepricing}
                                                    className="text-xs px-2.5 py-1 rounded bg-system-raised/80 hover:bg-system-violet/20 text-system-muted hover:text-system-violet transition-colors disabled:opacity-50"
                                                    title="重新估价"
                                                >
                                                    <FaSyncAlt />
                                                </motion.button>
                                                {/* Edit */}
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleEdit(product)}
                                                    className="text-xs px-2.5 py-1 rounded bg-system-raised/80 hover:bg-system-action/20 text-system-muted hover:text-system-action transition-colors"
                                                >
                                                    编辑
                                                </motion.button>
                                                {/* Toggle listing */}
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleToggleListing(product._id, isListed)}
                                                    title={isListed ? '下架（用户不可见）' : '上架'}
                                                    className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                                                        isListed
                                                            ? 'bg-system-success/20 text-system-success hover:bg-system-accent/10 hover:text-system-accent'
                                                            : 'bg-system-raised/80 text-system-muted hover:bg-system-success/20 hover:text-system-success'
                                                    }`}
                                                >
                                                    {isListed ? <FaEye /> : <FaEyeSlash />}
                                                    {isListed ? '上架中' : '已下架'}
                                                </motion.button>
                                                {/* Delete */}
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleDelete(product._id)}
                                                    title="删除商品"
                                                    className="text-xs px-2.5 py-1 rounded bg-system-danger/10 hover:bg-system-danger/20 text-system-danger transition-colors"
                                                >
                                                    <FaTrash />
                                                </motion.button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Slide-in form */}
            <AnimatePresence>
                {isFormVisible && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                if (!isSaving) resetForm();
                            }}
                            className={`${isEmbedded ? 'absolute' : 'fixed'} inset-0 bg-system-bg/70 backdrop-blur-sm z-40`}
                        />
                        <motion.div
                            initial={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
                            animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, -20% 100%)' }}
                            exit={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            className={`${isEmbedded ? 'absolute w-full sm:w-[360px]' : 'fixed w-full md:w-[450px]'} right-0 top-0 h-full bg-system-bg border-l-4 border-system-accent z-50 flex flex-col shadow-2xl`}
                        >
                            {isSaving && (
                                <div className="absolute inset-0 z-20 bg-system-bg/80 backdrop-blur-sm flex items-center justify-center px-6">
                                    <div className="border border-system-accent/40 bg-system-panel/95 rounded-lg px-5 py-4 text-center shadow-xl">
                                        <FaSyncAlt className="mx-auto mb-3 text-system-accent animate-spin" />
                                        <p className="text-sm font-bold tracking-widest text-system-text">AI 正在估价并生成商店数据...</p>
                                        <p className="mt-2 text-xs text-system-muted">正在判断价格、等级、分类和投放位置</p>
                                    </div>
                                </div>
                            )}
                            <div className={`${isEmbedded ? 'p-4' : 'p-6'} border-b-2 border-system-accent flex justify-between items-center bg-system-panel/90`}>
                                <h3 className={`${isEmbedded ? 'text-base' : 'text-xl'} font-black tracking-widest text-system-accent`}>
                                    {editingProduct ? '编辑商品' : '创建新商品'}
                                </h3>
                                <button disabled={isSaving} onClick={() => setIsFormVisible(false)} className="text-system-muted hover:text-system-danger transition-colors p-2 disabled:opacity-40">✕</button>
                            </div>

                            <div className={`flex-1 overflow-y-auto ${isEmbedded ? 'p-4 space-y-3' : 'p-6 space-y-4'} scrollbar-thin scrollbar-thumb-system-line/25 scrollbar-track-transparent`}>
                                <div>
                                    <label className="text-xs text-system-muted mb-1 block tracking-wider">商品名称</label>
                                    <input
                                        disabled={isSaving}
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="w-full bg-system-shell/70 border border-system-line/25 px-4 py-3 text-system-text rounded placeholder:text-system-faint focus:outline-none focus:border-system-accent/70 disabled:opacity-60"
                                        placeholder="输入商品名称"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-system-muted mb-1 block tracking-wider">图片 URL</label>
                                    <input
                                        disabled={isSaving}
                                        value={form.image}
                                        onChange={(e) => setForm({ ...form, image: e.target.value })}
                                        placeholder="https://..."
                                        className="w-full bg-system-shell/70 border border-system-line/25 px-4 py-3 text-system-text rounded placeholder:text-system-faint focus:outline-none focus:border-system-accent/70 disabled:opacity-60"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-system-muted mb-1 block tracking-wider">库存（留空=无限）</label>
                                    <input
                                        disabled={isSaving}
                                        type="number"
                                        min="0"
                                        value={form.stock === null ? '' : form.stock}
                                        onChange={(e) => setForm({ ...form, stock: e.target.value ? parseInt(e.target.value, 10) : null })}
                                        className="w-full bg-system-shell/70 border border-system-line/25 px-4 py-3 text-system-text rounded placeholder:text-system-faint focus:outline-none focus:border-system-accent/70 disabled:opacity-60"
                                        placeholder="留空表示无限库存"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-system-muted mb-1 block tracking-wider">描述</label>
                                    <textarea
                                        disabled={isSaving}
                                        rows={3}
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        className="w-full bg-system-shell/70 border border-system-line/25 px-4 py-3 text-system-text rounded placeholder:text-system-faint focus:outline-none focus:border-system-accent/70 disabled:opacity-60"
                                        placeholder="商品描述"
                                    />
                                </div>
                            </div>

                            <div className={`${isEmbedded ? 'p-4 gap-3' : 'p-6 gap-4'} border-t-2 border-system-accent bg-system-shell shrink-0 flex`}>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleSubmit}
                                    disabled={isSaving}
                                    className={`flex-1 bg-system-accent hover:bg-system-accent/80 text-system-bg ${isEmbedded ? 'py-3 text-xs' : 'py-4'} font-black tracking-[0.2em] transition-all disabled:opacity-50`}
                                >
                                    {isSaving ? 'AI 生成中...' : (editingProduct ? '更新商品' : '创建商品')}
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={resetForm}
                                    disabled={isSaving}
                                    className={`${isEmbedded ? 'px-4 py-3 text-xs' : 'px-6 py-4'} bg-system-raised hover:bg-system-raised/80 text-system-text font-black tracking-widest transition-colors disabled:opacity-40`}
                                >
                                    取消
                                </motion.button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StorePanel;
