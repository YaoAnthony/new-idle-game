// ── Pixel Game HUD — Desktop Top Navigation ───────────────────────────────────
// Fills the 52px HUD bar. Logo left, controls right.
// No DarkLightSwitch (game forces dark mode).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useSelector } from "react-redux";
import { Popover } from "antd";

import { RootState } from "../../../Redux/store";
import DropDownBar from "./DropDownBar";
import ShowIcon from "../../ShowIcon";

const DeskTopNav = () => {
    const [isOpen, setIsOpen] = useState(false);
    const isAuthenticated = useSelector((state: RootState) => state.user.isLoggedIn);
    const { user } = useSelector((state: RootState) => state.user);
    const dropdownContent = useMemo(
        () => <DropDownBar onRequestClose={() => setIsOpen(false)} />,
        [],
    );

    return (
        <nav
            className="hidden md:flex w-full h-full items-center justify-between"
            style={{ padding: '0 20px' }}
        >
            {/* ── Logo ── */}
            <NavLink
                to="/"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
                <span
                    style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '13px',
                        color: '#e6edf3',
                        textShadow: '2px 2px 0 rgba(0,0,0,0.8)',
                        letterSpacing: '0.05em',
                    }}
                >
                    幻星<span style={{ color: '#ffd700' }}>纪元</span>
                </span>
            </NavLink>

            {/* ── Right HUD: coins + avatar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Coin display */}
                <ShowIcon />

                {/* Avatar / Login */}
                {isAuthenticated && (
                    <Popover
                        placement="bottomRight"
                        open={isOpen}
                        onOpenChange={setIsOpen}
                        content={dropdownContent}
                        trigger={['hover', 'click']}
                        styles={{
                            root: { whiteSpace: "normal", maxWidth: "none", padding: 0 },
                            body: { padding: 0, background: 'transparent', boxShadow: 'none' },
                        }}
                    >
                        <div
                            onClick={() => setIsOpen(!isOpen)}
                            style={{ cursor: 'pointer' }}
                        >
                            <img
                                src={user?.image_url || 'https://placehold.co/40x40/161b22/ffd700.png?text=U'}
                                alt="avatar"
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    border: '2px solid var(--px-border-gold)',
                                    imageRendering: 'pixelated',
                                    display: 'block',
                                }}
                            />
                        </div>
                    </Popover>
                )}
            </div>
        </nav>
    );
};

export default DeskTopNav;
