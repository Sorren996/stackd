import { useState } from "react";
import { Delete, Send, ChevronDown, ArrowUp, HelpCircle as Question } from "lucide-react";

const IOS_KEY = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)",
  borderColor: "rgba(255,255,255,0.08)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 3px rgba(0,0,0,0.2)",
};

const IOS_KEY_DARK = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
  borderColor: "rgba(255,255,255,0.06)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

const IOS_KEY_PRESSED = {
  background: "linear-gradient(180deg, rgba(91,168,138,0.3) 0%, rgba(91,168,138,0.1) 100%)",
  borderColor: "rgba(91,168,138,0.28)",
  boxShadow: "inset 0 2px 8px rgba(0,0,0,0.2), 0 0 10px rgba(91,168,138,0.12)",
};

function haptic() {
  if (typeof window !== "undefined" && window.navigator?.vibrate) {
    window.navigator.vibrate(8);
  }
}

export default function CoachKeyboard({ value, onChange, onSend, onDismiss, sendDisabled }) {
  const [shifted, setShifted] = useState(false);
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

  const add = (key) => {
    haptic();
    onChange(`${value || ""}${shifted ? key.toUpperCase() : key}`);
    if (shifted) setShifted(false);
  };

  const backspace = () => {
    haptic();
    onChange(String(value || "").slice(0, -1));
  };

  const pressKey = (e, action) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  const KeyButton = ({ children, onPress, wide = false, style = IOS_KEY, className = "" }) => (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.style.cssText = "";
        Object.assign(e.currentTarget.style, IOS_KEY_PRESSED);
        pressKey(e, onPress);
      }}
      onPointerUp={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, style); }}
      onPointerLeave={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, style); }}
      onPointerCancel={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, style); }}
      className={`h-[56px] min-w-0 touch-none select-none rounded-[10px] border text-xl font-normal text-white/95 ${wide ? "flex-1" : "shrink-0"} ${className}`}
      style={style}
    >
      {children}
    </button>
  );

  return (
    <div
      className="overflow-hidden border-t px-[6px] pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-1"
      style={{
        background: "linear-gradient(160deg, hsl(162,12%,9%) 0%, hsl(162,10%,6%) 100%)",
        borderColor: "rgba(255,255,255,0.1)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="mb-1 flex justify-center">
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); haptic(); onDismiss(); }}
          className="flex items-center justify-center"
        >
          <ChevronDown className="h-4 w-4 text-white/30" />
        </button>
      </div>

      <div className="space-y-[7px]">
        <div className="flex gap-[6px]">
          {[...rows[0]].map((letter) => (
            <KeyButton key={letter} onPress={() => add(letter)} wide>
              {shifted ? letter.toUpperCase() : letter}
            </KeyButton>
          ))}
        </div>
        <div className="flex gap-[6px] px-[18px]">
          {[...rows[1]].map((letter) => (
            <KeyButton key={letter} onPress={() => add(letter)} wide>
              {shifted ? letter.toUpperCase() : letter}
            </KeyButton>
          ))}
        </div>
        <div className="flex gap-[6px]">
          <KeyButton onPress={() => { haptic(); setShifted((s) => !s); }} style={shifted ? IOS_KEY_PRESSED : IOS_KEY_DARK} className="w-[38px] flex items-center justify-center text-white/60">
            <ArrowUp className="h-4 w-4" />
          </KeyButton>
          {[...rows[2]].map((letter) => (
            <KeyButton key={letter} onPress={() => add(letter)} wide>
              {shifted ? letter.toUpperCase() : letter}
            </KeyButton>
          ))}
          <KeyButton onPress={backspace} style={IOS_KEY_DARK} className="w-[46px] flex items-center justify-center text-white/60">
            <Delete className="h-5 w-5" />
          </KeyButton>
        </div>
        <div className="flex gap-[6px]">
          <KeyButton onPress={() => add(",")} style={IOS_KEY_DARK} className="w-[34px] text-sm text-white/60">,</KeyButton>
          <KeyButton onPress={() => add(".")} style={IOS_KEY_DARK} className="w-[34px] text-sm text-white/60">.</KeyButton>
          <KeyButton onPress={() => add("?")} style={IOS_KEY_DARK} className="w-[34px] flex items-center justify-center text-white/60">
            <Question className="h-4 w-4" />
          </KeyButton>
          <KeyButton onPress={() => add(" ")} style={IOS_KEY_DARK} className="flex-[4] text-sm text-white/50">space</KeyButton>
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); if (!sendDisabled) { haptic(); onSend(); } }}
            disabled={sendDisabled}
            className="flex h-[56px] w-[72px] shrink-0 touch-none select-none items-center justify-center gap-1 rounded-[10px] border text-xs font-semibold text-white disabled:opacity-30"
            style={{
              background: "linear-gradient(145deg, rgba(91,168,138,0.7), rgba(91,163,184,0.5))",
              borderColor: "rgba(91,168,138,0.3)",
              boxShadow: "0 2px 10px rgba(91,163,184,0.15), inset 0 1px 1px rgba(255,255,255,0.2)",
            }}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}