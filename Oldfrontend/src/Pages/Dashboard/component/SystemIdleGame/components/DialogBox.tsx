/**
 * DialogBox — NPC speech dialog with Sprout-Lands pixel-RPG aesthetic.
 * Styled to mimic the "dialog box big" from the Sprout Lands UI pack
 * using pure CSS (no extra asset needed).
 */
import React, { useState, useEffect, useRef } from 'react';

interface DialogBoxProps {
  visible:  boolean;
  npcName:  string;
  text:     string;
}

/** Typewriter effect — reveals one character at a time. */
function useTypewriter(text: string, speed = 40) {
  const [displayed, setDisplayed] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!text) { setDisplayed(''); return; }
    setDisplayed('');
    let i = 0;
    timer.current = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length && timer.current) clearInterval(timer.current);
    }, speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [text, speed]);

  return displayed;
}

export const DialogBox: React.FC<DialogBoxProps> = ({ visible, npcName, text }) => {
  const displayed = useTypewriter(text);
  if (!visible) return null;

  return (
    <div style={{
      position:      'absolute',
      bottom:        122,
      left:          '50%',
      transform:     'translateX(-50%)',
      width:         'clamp(280px, 55%, 500px)',
      zIndex:        30,
      pointerEvents: 'none',
    }}>
      {/* Outer frame — pixel-art double border */}
      <div style={{
        background:   '#fffde8',
        border:       '3px solid #4a3500',
        borderRadius: 4,
        boxShadow:    '0 0 0 1px #c8a850, 4px 4px 0 #4a3500',
        padding:      '10px 14px 12px',
        fontFamily:   '"Courier New", monospace',
      }}>
        {/* NPC name strip */}
        <div style={{
          background:   '#4a3500',
          color:        '#fffde8',
          fontSize:     11,
          fontWeight:   'bold',
          padding:      '2px 8px',
          borderRadius: 2,
          marginBottom: 7,
          display:      'inline-block',
          letterSpacing: 1,
        }}>
          ▶ {npcName}
        </div>

        {/* Dialog text */}
        <div style={{
          color:      '#3a2000',
          fontSize:   13,
          lineHeight: 1.7,
          minHeight:  '1.7em',
        }}>
          {displayed}
          {/* blinking cursor while typing */}
          {displayed.length < text.length && (
            <span style={{ animation: 'blink 0.8s step-end infinite' }}>▌</span>
          )}
        </div>
      </div>

      {/* Inline blink keyframe */}
      <style>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
    </div>
  );
};
