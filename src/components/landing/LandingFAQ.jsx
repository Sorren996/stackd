import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Is Stackd medical advice?",
    a: "No. Stackd is a review and organization tool. It walks you through your own numbers, settings, and plans so you can make your decision with everything in front of you. It doesn't tell you what to dose, and it isn't a medical device. Decisions about your insulin always stay with you and your care team.",
  },
  {
    q: "Do I need a Dexcom to use Stackd?",
    a: "No. A Dexcom is supported and convenient, but it's not required. You can log readings manually and get the full guided review either way.",
  },
  {
    q: "Does it work with my Dexcom?",
    a: "Yes. If you use a Dexcom CGM, Stackd connects to your account so your recent readings and trends flow in automatically. Setup is a one-time connection.",
  },
  {
    q: "Do I need any special hardware?",
    a: "No. There's nothing extra to buy and no hardware requirement. Connect a Dexcom if you have one, or enter readings by hand if you don't.",
  },
  {
    q: "How long does a review take?",
    a: "The guided flow is designed to be completed in a few minutes. It's thorough by design, but each step is short.",
  },
  {
    q: "Is my data private?",
    a: "Your readings, settings, and dose plans belong to you. We don't sell your data.",
  },
  {
    q: "Can I use Stackd if I don't split my doses?",
    a: "Yes. The split dose review is one part of the flow. If you take single doses, the rest of the guided review still applies.",
  },
];

function FAQItem({ item, isOpen, onToggle }) {
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
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