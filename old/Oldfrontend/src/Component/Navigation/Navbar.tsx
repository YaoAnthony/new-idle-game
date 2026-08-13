// ── Pixel Game HUD Top Bar ────────────────────────────────────────────────────
// Static header (not fixed/absolute) — lives in the flex layout flow.
// Height is set by the parent container (52px).
// ─────────────────────────────────────────────────────────────────────────────

import DeskTopNav from "./DeskTop/TopNavigation";
import MobileNav from "./Mobile/MobileNavigation";
import { useLocation } from "react-router-dom";

const Navbar = () => {
    const location = useLocation();
    const isLoginPage = location.pathname === "/login";

    if (isLoginPage) {
        return (
            <header className="flex items-center px-6 h-full">
                <div
                    style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '14px',
                        color: '#ffd700',
                        textShadow: '2px 2px 0 rgba(0,0,0,0.8)',
                    }}
                >
                    幻星纪元
                </div>
            </header>
        );
    }

    return (
        <header className="flex items-center h-full w-full">
            <DeskTopNav />
            <MobileNav />
        </header>
    );
};

export default Navbar;
