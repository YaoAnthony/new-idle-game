import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as THREE from 'three';
//import { FaPlay } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Navbar from '../../Component/Navigation/Navbar';
import { RootState } from '../../Redux/store';
import { useAuthModal } from '../../Features/Authentication/component/ModalAuthContext';
import { useLazyGetApiTokenStatusQuery } from '../../api/apiTokenApi';

// WebGL Particle Overlay Component
const ThreeParticles: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;
        
        // Setup WebGL Scene
        const width = window.innerWidth;
        const height = window.innerHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mountRef.current.appendChild(renderer.domElement);

        // Create Particles (Glowing dust/magic embers)
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 800; // Dense enough for atmosphere
        const posArray = new Float32Array(particlesCount * 3);

        for (let i = 0; i < particlesCount * 3; i++) {
            // Spread across a wide area
            posArray[i] = (Math.random() - 0.5) * 20; 
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        
        // We use a high additive blending for that glowing effect
        const particlesMaterial = new THREE.PointsMaterial({
            size: 0.025,
            color: '#fdfbc8', // Soft warm yellow/white
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particlesMesh);

        // Animation System
        let mouseX = 0;
        let mouseY = 0;
        const clock = new THREE.Clock();

        const animate = () => {
            const elapsedTime = clock.getElapsedTime();
            requestAnimationFrame(animate);

            // Gentle rotation representing air flow
            particlesMesh.rotation.y = elapsedTime * 0.02;
            particlesMesh.rotation.x = elapsedTime * 0.01;

            // Subtle mouse parallax effect
            particlesMesh.position.y += (mouseY * 0.5 - particlesMesh.position.y) * 0.05;
            particlesMesh.position.x += (mouseX * 0.5 - particlesMesh.position.x) * 0.05;

            renderer.render(scene, camera);
        };

        animate();

        // Event Listeners
        const onWindowResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        const onMouseMove = (e: MouseEvent) => {
            mouseX = (e.clientX / window.innerWidth) * 2 - 1;
            mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
        };

        window.addEventListener('resize', onWindowResize);
        window.addEventListener('mousemove', onMouseMove);

        // Cleanup
        return () => {
            window.removeEventListener('resize', onWindowResize);
            window.removeEventListener('mousemove', onMouseMove);
            
            // Fix ref linting by copying to local block variable
            const currentMount = mountRef.current;
            if (currentMount && renderer.domElement && currentMount.contains(renderer.domElement)) {
                currentMount.removeChild(renderer.domElement);
            }
            particlesGeometry.dispose();
            particlesMaterial.dispose();
            renderer.dispose();
        };
    }, []);

    return <div ref={mountRef} className="absolute inset-0 pointer-events-none z-0" />;
};

// const PlayButton = () => {

//     return (
//         <motion.button 
//             whileHover={{ scale: 1.05 }}
//             whileTap={{ scale: 0.95 }}
//             className="relative group w-20 h-20 mb-6 flex items-center justify-center cursor-pointer"
//         >
//             <div className="absolute inset-0 bg-white/10 rounded-full blur-xl group-hover:bg-[#FFC72C]/20 transition-all duration-700" />
//             <div className="absolute inset-0 border-2 border-white/40 rounded-full group-hover:border-[#FFC72C]/80 transition-colors duration-500 shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
            
//             {/* 装饰性旋转圆环 */}
//             <div className="absolute inset-1.5 border border-white/20 rounded-full border-dashed group-hover:rotate-180 transition-transform duration-[1.5s] ease-in-out" />
            
//             {/* 播放图标本体 */}
//             <div className="w-10 h-10 flex items-center justify-center bg-white/90 group-hover:bg-[#FFC72C] rounded-full pl-1 transition-colors duration-300 shadow-xl backdrop-blur-md">
//                 <FaPlay className="text-xl text-black/80" />
//             </div>
//         </motion.button>

//     )

// } 
const MainPage: React.FC = () => {
    const navigate = useNavigate();
    const isAuthenticated = useSelector((state: RootState) => state.user.isLoggedIn);
    const { showAuthModal } = useAuthModal();
    const [triggerGetApiTokenStatus] = useLazyGetApiTokenStatusQuery();
    const [isStarting, setIsStarting] = useState(false);

    const handleStartGame = async () => {
        if (isAuthenticated) {
            setIsStarting(true);
            try {
                const status = await triggerGetApiTokenStatus().unwrap();
                if (!status.configured) {
                    navigate('/apiToken?next=/dashboard/idle-game');
                    return;
                }
                navigate('/dashboard/idle-game');
            } catch (error) {
                console.error('API token status check failed:', error);
                navigate('/apiToken?next=/dashboard/idle-game');
            } finally {
                setIsStarting(false);
            }
        } else {
            showAuthModal();
        }
    };

    return (
        <div className="relative isolate w-screen h-screen overflow-hidden font-sans select-none">
            {/* Tailwind Custom Animations injected securely via style block */}
            <style>{`
                @keyframes shine {
                    100% { transform: translateX(150%) skewX(-30deg); }
                }
                .animate-shine {
                    animation: shine 1.5s ease-in-out infinite;
                }
            `}</style>

            {/* Layer 1: Background Image */}
            <div className="absolute inset-0 z-0 h-full w-full bg-cover bg-center" style={{ backgroundImage: "url('/background.png')" }}>
                 {/* Dark overlay specifically fading into the top edge to make the navbar readable */}
                 <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent h-48" />
                 {/* Vignette effect around the entire screen to focus the center point */}
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
            </div>

            {/* Layer 2: WebGL Particles (Three.js WebGL rendering for deep immersion) */}
            <div className="absolute inset-0 z-10">
                <ThreeParticles />
            </div>
            
            {/* Layer 3: Application UI Container */}
            <div className="absolute inset-0 z-20">
                
                <div className="absolute inset-x-0 top-0 z-30 h-20">
                    <Navbar />
                </div>

                {/* 中央内容区 (Center Content - The "Start" Area) */}
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 pt-20"
                >
                    {/* 播放/预告片 按钮 (Play Icon Element) */}
                    
                    {/* Slogan */}
                    <div className="text-white text-xl md:text-2xl tracking-[0.25em] font-light drop-shadow-[0_4px_6px_rgba(0,0,0,1)] mb-8 text-center px-4">
                        管理你的时间，立即加入我们
                    </div>

                    {/* 主行动按钮 - 开始游戏 (Main Action Button - "Start Game") */}
                    <motion.button 
                        onClick={handleStartGame}
                        disabled={isStarting}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="pointer-events-auto bg-[#FFC72C] text-[#2C2C2C] px-16 py-4 md:py-5 min-w-[280px] rounded-sm text-2xl md:text-3xl font-bold tracking-[0.4em] indent-[0.2em] shadow-[0_4px_20px_rgba(255,199,44,0.4)] hover:shadow-[0_8px_30px_rgba(255,199,44,0.6)] hover:bg-[#FFE066] transition-all duration-300 relative overflow-hidden group clip-edges"
                    >
                        {/* The sweep light effect */}
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-[150%] skew-x-[-30deg] group-hover:animate-shine" />
                        
                        {/* Subtle decorative corners for that "game UI" feel */}
                        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#2C2C2C]/30 m-1" />
                        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[#2C2C2C]/30 m-1" />

                        {isStarting ? '检查中' : '开始游戏'}
                    </motion.button>
                </motion.div>
                
            </div>
            
        </div>
    );
};

export default MainPage;
