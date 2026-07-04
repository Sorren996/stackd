import { motion } from "framer-motion";

const LOGO_URL = "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png";

export default function SplashScreen({ showAuth = false }) {
  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      style={{
        background:
          "radial-gradient(ellipse 120% 60% at 50% 100%, hsl(162, 28%, 10%) 0%, hsl(160, 14%, 7%) 55%, hsl(158, 10%, 5%) 100%)",
      }}
    >
      <motion.img
        src={LOGO_URL}
        alt="Stackd"
        animate={
          showAuth
            ? { opacity: 1, scale: 1 }
            : { opacity: [0.55, 1, 0.55], scale: [0.96, 1, 0.96] }
        }
        transition={
          showAuth
            ? { duration: 0.3 }
            : { duration: 2, repeat: Infinity, ease: "easeInOut" }
        }
        className="h-16 w-auto object-contain"
      />

      {showAuth && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="mt-16 flex w-full max-w-xs flex-col items-center gap-3 px-6"
        >
          <button
            onClick={() => { window.location.href = '/login'; }}
            className="w-full rounded-2xl border border-white/20 py-4 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
            style={{
              background: "linear-gradient(145deg, rgba(91,168,138,0.3), rgba(91,163,184,0.2))",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.15)",
            }}
          >
            Log In
          </button>
          <button
            onClick={() => { window.location.href = '/register'; }}
            className="w-full rounded-2xl border border-white/10 py-4 text-sm font-medium text-white/60 transition hover:text-white/80 hover:bg-white/5"
          >
            Create Account
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}