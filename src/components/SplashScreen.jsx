import { motion } from "framer-motion";

const LOGO_URL = "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png";

export default function SplashScreen() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background:
          "radial-gradient(ellipse 120% 60% at 50% 100%, hsl(162, 28%, 10%) 0%, hsl(160, 14%, 7%) 55%, hsl(158, 10%, 5%) 100%)",
      }}
    >
      <motion.img
        src={LOGO_URL}
        alt="Stackd"
        animate={{ opacity: [0.55, 1, 0.55], scale: [0.96, 1, 0.96] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="h-16 w-auto object-contain"
      />
    </div>
  );
}