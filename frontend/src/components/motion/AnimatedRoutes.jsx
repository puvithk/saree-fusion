import { Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';

// Enter: fade + slide-up + gentle scale-in. Exit is short so navigation never feels blocked.
const page = {
  initial: { opacity: 0, y: 18, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 28, mass: 0.8 } },
  exit: { opacity: 0, y: -8, scale: 0.99, transition: { duration: 0.16, ease: 'easeIn' } },
};

export default function AnimatedRoutes({ children }) {
  const location = useLocation();
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={location.pathname} className="page-transition" {...page}>
          <Routes location={location}>{children}</Routes>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
