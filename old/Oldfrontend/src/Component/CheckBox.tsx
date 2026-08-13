"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

export default function CheckOrCross({ checked }: { checked: boolean }) {
  const pathLength = useMotionValue(checked ? 1 : 0);
  const strokeLinecap = useTransform(() =>
    pathLength.get() === 0 ? "none" : "round"
  );

  useEffect(() => {
    pathLength.set(checked ? 1 : 0);
  }, [checked, pathLength]);

  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-md border border-gray-700 bg-gray-900 p-1">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke={checked ? "#8df0cc" : "#f87171"} // ✅ 绿 or 红
        strokeWidth="3"
        className="w-full h-full"
      >
        {checked ? (
          <motion.path
            d="M4 12L10 18L20 6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              type: "spring",
              bounce: 0,
              duration: 1.3,
            }}
            style={{ pathLength, strokeLinecap }}
          />
        ) : (
          <>
            <motion.path
              d="M6 6L18 18"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                type: "spring",
                bounce: 0,
                duration: 0.5,
              }}
              style={{ pathLength }}
            />
            <motion.path
              d="M18 6L6 18"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                type: "spring",
                bounce: 0,
                duration: 0.5,
                delay: 0.3, // 第二笔稍后一点
              }}
              style={{ pathLength }}
            />
          </>
        )}
      </svg>
    </div>
  );
}
