"use client"

import { motion } from "motion/react" 

const LoadingCircleSpinner = () => {
    return (
        <div className="flex justify-center items-center rounded-lg">
            <motion.div
                className="w-12 h-12 rounded-full border-4 border-white/10 border-t-pink-500"
                animate={{ rotate: 360 }}
                transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "linear",
                }}
            />
        </div>
    )
}

export default LoadingCircleSpinner
