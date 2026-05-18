const fs = require('fs');
let text = fs.readFileSync('styles.css', 'utf8');
const search = `    opacity: 1;
  }

  top: -180px; left: -120px;
}
.auth-orb-2 {`;
const replace = `    opacity: 1;
  }

  .msg-file-card {
    max-width: 200px;
    padding: 6px 10px;
  }

  .msg-file-icon {
    font-size: 1.1rem;
  }

  .msg-file-name {
    font-size: 0.74rem;
  }
}

@keyframes particleFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 0; }
  10% { opacity: var(--max-opacity, 0.3); }
  80% { opacity: var(--max-opacity, 0.3); }
  100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
}

/* =============================================
   AUTH SCREEN — Soft Purple Theme
   ============================================= */
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Full-page auth overlay */
.auth-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-main, #0c0a14);
  transition: opacity 0.3s ease, transform 0.3s ease;
  overflow: hidden;
}

/* Animated orbs — purple tones */
.auth-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.auth-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  animation: authOrbFloat 14s ease-in-out infinite alternate;
}

.auth-orb-1 {
  width: 520px; height: 520px;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.6) 0%, transparent 70%);
  top: -180px; left: -120px;
}
.auth-orb-2 {`;

text = text.replace(search, replace);
fs.writeFileSync('styles.css', text);
console.log('done');
