/**
 * dropDownContainerVariants
 */
export const dropDown = {
    containerVariants : {
        open: {
            opacity: 1,
            transition: { staggerChildren: 0.1, delayChildren: 0.2 }
        },
        closed: {
            opacity: 0,
            transition: { staggerChildren: 0.05, staggerDirection: -1 }
        }
    },
    itemVariants : {
        open: { y: 0, opacity: 1 },
        closed: { y: -20, opacity: 0 }
    }
};
