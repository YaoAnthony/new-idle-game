import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../../../Redux/store";
import { GiftOutlined } from '@ant-design/icons';
import { Link, useLocation } from "react-router-dom";
import { sidebarItems } from "../../constants";

// ── Pixel Game Sidebar ────────────────────────────────────────────────────────
// Sharp-corner RPG menu panel. No glassmorphism, no companion widget.
// Active item: left gold bar + golden text + dim gold background.
// ─────────────────────────────────────────────────────────────────────────────

const NAV_ICONS: Record<string, string> = {
    "主界面":   "⚔",
    "背包":     "🎒",
    "系列任务": "📜",
    "商城":     "🏪",
    "挂机培养": "🌱",
    "探索法则": "🔮",
    "祈愿卡池": "✨",
};

const SideBar: React.FC = () => {
    const location = useLocation();
    const selectedSystemId = useSelector((state: RootState) => state.system.selectedSystemId);
    const systems = useSelector((state: RootState) => state.system.systems);
    const selectedSystem = systems.find((item) => item._id === selectedSystemId);

    const allItems = [
        ...sidebarItems,
        ...(selectedSystemId && selectedSystem?.modules?.lottery
            ? [{ label: "祈愿卡池", path: `/dashboard/system/${selectedSystemId}/lottery`, icon: <GiftOutlined /> }]
            : []),
    ];

    return (
        <aside
            className="flex flex-col h-full shrink-0"
            style={{
                width: '200px',
                background: 'var(--px-surface)',
                borderRight: '2px solid var(--px-border)',
            }}
        >
            {/* ── Section label ── */}
            <div
                className="px-4 pt-4 pb-3 text-xs tracking-widest uppercase select-none"
                style={{
                    color: 'var(--px-muted)',
                    borderBottom: '1px solid var(--px-border)',
                    letterSpacing: '0.15em',
                }}
            >
                MENU
            </div>

            {/* ── Nav items ── */}
            <nav className="flex flex-col flex-1 pt-2">
                {allItems.map(item => {
                    const isActive = location.pathname.startsWith(item.path);
                    const emoji: React.ReactNode = NAV_ICONS[item.label] ?? item.icon ?? '▶';

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 16px',
                                fontSize: '13px',
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                                borderLeft: isActive
                                    ? '4px solid var(--px-gold)'
                                    : '4px solid transparent',
                                background: isActive
                                    ? 'rgba(255,215,0,0.07)'
                                    : 'transparent',
                                color: isActive
                                    ? 'var(--px-gold)'
                                    : 'var(--px-muted)',
                                textDecoration: 'none',
                                transition: 'background 0.15s, color 0.15s',
                                userSelect: 'none',
                            }}
                            onMouseEnter={e => {
                                if (!isActive) {
                                    (e.currentTarget as HTMLElement).style.background = 'var(--px-surface2)';
                                    (e.currentTarget as HTMLElement).style.color = 'var(--px-text)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isActive) {
                                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                                    (e.currentTarget as HTMLElement).style.color = 'var(--px-muted)';
                                }
                            }}
                        >
                            {/* Pixel emoji icon */}
                            <span style={{ fontSize: '16px', width: '20px', textAlign: 'center', lineHeight: 1 }}>
                                {emoji}
                            </span>
                            <span>{item.label}</span>

                            {/* Active arrow indicator */}
                            {isActive && (
                                <span style={{ marginLeft: 'auto', color: 'var(--px-gold)', fontSize: '10px' }}>
                                    ▶
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* ── Bottom version stamp ── */}
            <div
                className="px-4 py-3 text-center"
                style={{
                    borderTop: '1px solid var(--px-border)',
                    color: 'var(--px-border)',
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    fontFamily: '"Press Start 2P", monospace',
                }}
            >
                幻星纪元
            </div>
        </aside>
    );
};

export default SideBar;
