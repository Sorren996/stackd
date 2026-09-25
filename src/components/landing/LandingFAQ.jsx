import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Does Stackd work with Dexcom?",
    a: "Yes. Stackd connects to your Dexcom Share account so your recent readings and trends flow in automatically. Setup is a one-time connection. You enter your Dexcom Share credentials and Stackd handles the rest.",
  },
  {
    q: "Do I need a CGM?",
    a: "No. A Dexcom is supported and convenient, but it's not required. You can log readings manually and get the full guided review either way. Manual entries are a first-class part of the experience, not a workaround.",
  },
  {
    q: "How does Stackd handle manual glucose entries?",
    a: "Manual entries are treated the same way as Dexcom readings. They appear on your glucose graph, factor into your trend, and are included in your review. If a Dexcom reading arrives near the same time as a manual entry, the manual one is gently replaced so you don't see duplicates.",
  },
  {
    q: "What does Stackd track?",
    a: "Stackd brings together your glucose readings and trend, active insulin and recent insulin activity, meal carbohydrates and absorption information, meal context, and your configured insulin settings and review preferences. Everything is organized into one guided review before you dose.",
  },
  {
    q: "Does Stackd calculate my insulin dose?",
    a: "No. Stackd is a review and organization tool. It does not calculate, recommend, or suggest insulin doses. It brings the relevant information together so you can review it in one place and make your own decision. The dose always stays with you.",
  },
  {
    q: "Is Stackd a replacement for medical advice?",
    a: "No. Stackd is not a medical device and does not provide medical advice. It organizes information you already have into a review you can use. Decisions about your insulin always stay with you and your care team.",
  },
  {
    q: "How is my data handled?",
    a: "Your readings, settings, and dose logs belong to you. They're stored securely and tied to your account. Only you can see your own data. Stackd doesn't sell your data. Your Dexcom credentials are stored securely and used only to fetch your readings.",
  },
];

function FAQItem({ item, isOpen, onToggle }) {
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: "#fdf9f2",
        border: "1px solid #eadccf",
      }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-white/85">{item.q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-sm leading-relaxed text-white/55">
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center text-2xl font-bold tracking-tight text-white md:text-4xl"
        >
          Frequently asked questions
        </motion.h2>

        <div className="mt-10 space-y-2.5">
          {FAQS.map((item, i) => (
            <FAQItem
              key={i}
              item={item}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}