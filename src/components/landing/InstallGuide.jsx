import { motion } from "framer-motion";

const STEPS = [
  {
    image: "https://media.base44.com/images/public/6aad64ef13ea720bbe594d6f/740958fde_generated_image.png",
    caption: "1. Open Stackd in Safari",
    description:
      "On your iPhone, open https://stackdose.base44.app in the Safari browser. This has to be Safari, not Chrome or another browser. iOS only allows installing a web app from Safari.",
    alt: "Screenshot showing Stackd opened in the Safari browser on an iPhone",
  },
  {
    image: "https://media.base44.com/images/public/6aad64ef13ea720bbe594d6f/bac389628_generated_image.png",
    caption: "2. Tap the Share button",
    description:
      "In the toolbar at the bottom of Safari, tap the Share button, the square with an arrow pointing up.",
    alt: "Screenshot showing the Share button in Safari's bottom toolbar on an iPhone",
  },
  {
    image: "https://media.base44.com/images/public/6aad64ef13ea720bbe594d6f/83eee739c_generated_image.png",
    caption: '3. Tap "Add to Home Screen"',
    description:
      "Scroll down in the share menu until you see Add to Home Screen, then tap it.",
    alt: "Screenshot showing the Add to Home Screen option in the iOS share menu",
  },
  {
    image: "https://media.base44.com/images/public/6aad64ef13ea720bbe594d6f/33d424842_generated_image.png",
    caption: '4. Tap "Add"',
    description:
      'Confirm the name "Stackd" and tap Add in the top right corner. Stackd now sits on your home screen like any other app.',
    alt: "Screenshot showing the Add button to confirm installing Stackd on the iPhone home screen",
  },
];

const INTRO =
  "Stackd is a web app, so there's no App Store download and nothing taking up storage. Once it's on your home screen, it opens full screen like a native app.";

export default function InstallGuide() {
  return (
    <section id="install" className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-4xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center text-2xl font-bold tracking-tight md:text-4xl"
          style={{ color: "#3f3830" }}
        >
          Keep Stackd close.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-5 max-w-2xl text-center text-sm leading-relaxed md:text-base"
          style={{ color: "#6b6153" }}
        >
          {INTRO}
        </motion.p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: (i % 2) * 0.1 }}
              className="rounded-2xl p-5"
              style={{
                background: "#fdf9f2",
                border: "1px solid #eadccf",
              }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "#3f3830" }}>{step.caption}</h3>
              <div
                className="mt-4 flex items-center justify-center overflow-hidden rounded-xl"
                style={{
                  background: "#f7f1e8",
                  border: "1px solid #eadccf",
                  height: "220px",
                }}
              >
                <img
                  src={step.image}
                  alt={step.alt}
                  className="h-full w-full object-contain"
                />
              </div>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "#6b6153" }}>
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}