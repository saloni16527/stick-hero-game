import React, { useState, useEffect, useRef } from 'react';

// Game Constants
const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 600;
const HERO_WIDTH = 24;
const HERO_HEIGHT = 32;
const STICK_WIDTH = 6;
const PLAYER_SPEED = 4.5;
const FALL_SPEED = 9;
const TRANSITION_SPEED = 12;

const PHASES = {
  WAITING: 'WAITING',
  STRETCHING: 'STRETCHING',
  TURNING: 'TURNING',
  WALKING: 'WALKING',
  TRANSITIONING: 'TRANSITIONING',
  FALLING: 'FALLING',
};

// --- Advanced Audio System ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const playSound = (freq, type = 'sine', duration = 0.1, volume = 0.1, ramp = true) => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  if (ramp) {
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  }
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
};

// Procedural background "music" (Ambient soft drone)
let bgNode = null;
const startAmbientMusic = () => {
  if (bgNode) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(110, audioCtx.currentTime); // Low A
  gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
  
  // Create a gentle pulsing effect
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.setValueAtTime(0.2, audioCtx.currentTime);
  lfoGain.gain.setValueAtTime(0.01, audioCtx.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  lfo.start();
  bgNode = { osc, lfo };
};

const App = () => {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState({
    phase: PHASES.WAITING,
    score: 0,
    bestScore: parseInt(localStorage.getItem('stickHeroBest') || '0'),
    heroX: 80,
    heroY: CANVAS_HEIGHT - 200 - HERO_HEIGHT,
    platforms: [
      { x: 50, width: 60 },
      { x: 220, width: 50 },
    ],
    stickLength: 0,
    stickAngle: 0,
    viewOffset: 0,
    isFirstLoad: true,
    perfectHit: false
  });

  const stateRef = useRef(gameState);

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  const resetGame = () => {
    startAmbientMusic();
    playSound(440, 'triangle', 0.3, 0.15); // Start chime
    setGameState({
      phase: PHASES.WAITING,
      score: 0,
      bestScore: parseInt(localStorage.getItem('stickHeroBest') || '0'),
      heroX: 80,
      heroY: CANVAS_HEIGHT - 200 - HERO_HEIGHT,
      platforms: [
        { x: 50, width: 60 },
        { x: 220, width: 50 },
      ],
      stickLength: 0,
      stickAngle: 0,
      viewOffset: 0,
      isFirstLoad: false,
      perfectHit: false
    });
  };

  const generatePlatform = (lastPlatformX, lastPlatformWidth) => {
    const minGap = 60;
    const maxGap = 200;
    const minWidth = 35;
    const maxWidth = 85;
    const x = lastPlatformX + lastPlatformWidth + minGap + Math.random() * (maxGap - minGap);
    const width = minWidth + Math.random() * (maxWidth - minWidth);
    return { x, width };
  };

  const handleMouseDown = (e) => {
    const state = stateRef.current;
    if (state.phase === PHASES.WAITING && !state.isFirstLoad && state.heroY < CANVAS_HEIGHT) {
      if (e.target.tagName === 'BUTTON') return;
      startAmbientMusic();
      setGameState(prev => ({ ...prev, phase: PHASES.STRETCHING, stickLength: 0, stickAngle: 0, perfectHit: false }));
    }
  };

  const handleMouseUp = () => {
    if (stateRef.current.phase === PHASES.STRETCHING) {
      playSound(350, 'sine', 0.1, 0.1); // Stop stretching sound
      setGameState(prev => ({ ...prev, phase: PHASES.TURNING }));
    }
  };

  useEffect(() => {
    let animationFrameId;

    const gameLoop = () => {
      const state = stateRef.current;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      if (state.phase !== PHASES.WAITING) {
        setGameState(prev => {
          let next = { ...prev };
          if (prev.phase === PHASES.STRETCHING) {
            next.stickLength += 4.5;
            // Play a ticking sound that rises in pitch
            if (Math.floor(next.stickLength) % 15 === 0) {
                playSound(200 + (next.stickLength * 2), 'sine', 0.04, 0.04);
            }
          } else if (prev.phase === PHASES.TURNING) {
            next.stickAngle += 0.12;
            if (next.stickAngle >= Math.PI / 2) {
              next.stickAngle = Math.PI / 2;
              next.phase = PHASES.WALKING;
              playSound(150, 'square', 0.05, 0.03); // Stick hit platform sound
            }
          } else if (prev.phase === PHASES.WALKING) {
            next.heroX += PLAYER_SPEED;
            // Footstep sound
            if (Math.floor(next.heroX) % 30 === 0) {
                playSound(100, 'sine', 0.02, 0.02);
            }

            const currentPlatform = prev.platforms[0];
            const nextPlatform = prev.platforms[1];
            const stickEnd = currentPlatform.x + currentPlatform.width + prev.stickLength;
            
            const landedSuccessfully = stickEnd >= nextPlatform.x && stickEnd <= nextPlatform.x + nextPlatform.width;
            const centerOfPlatform = nextPlatform.x + nextPlatform.width / 2;
            const isPerfect = Math.abs(stickEnd - centerOfPlatform) < 5;

            const stopAt = landedSuccessfully ? nextPlatform.x + nextPlatform.width - (HERO_WIDTH / 2) : stickEnd;

            if (next.heroX >= stopAt) {
              if (landedSuccessfully) {
                next.heroX = nextPlatform.x + nextPlatform.width - HERO_WIDTH;
                next.phase = PHASES.TRANSITIONING;
                next.score += isPerfect ? 2 : 1;
                next.perfectHit = isPerfect;
                
                // Achievement sounds
                if (isPerfect) {
                    playSound(523.25, 'sine', 0.1, 0.1); // C5
                    setTimeout(() => playSound(659.25, 'sine', 0.1, 0.1), 100); // E5
                    setTimeout(() => playSound(783.99, 'sine', 0.3, 0.1), 200); // G5
                } else {
                    playSound(523.25, 'sine', 0.15, 0.08); // Normal score
                }
              } else {
                next.heroX = stickEnd;
                next.phase = PHASES.FALLING;
                playSound(120, 'sawtooth', 0.5, 0.1); // Fall sound
              }
            }
          } else if (prev.phase === PHASES.TRANSITIONING) {
            const nextPlatform = prev.platforms[1];
            const targetOffset = nextPlatform.x - 50;
            const diff = targetOffset - prev.viewOffset;
            
            if (Math.abs(diff) < TRANSITION_SPEED) {
              next.viewOffset = targetOffset;
              next.platforms = [{ ...nextPlatform }, generatePlatform(nextPlatform.x, nextPlatform.width)];
              next.phase = PHASES.WAITING;
              next.stickLength = 0;
              next.stickAngle = 0;
            } else {
              next.viewOffset += TRANSITION_SPEED;
            }
          } else if (prev.phase === PHASES.FALLING) {
            next.heroY += FALL_SPEED;
            next.stickAngle += 0.08;
            if (next.heroY > CANVAS_HEIGHT) {
              if (next.score > next.bestScore) {
                localStorage.setItem('stickHeroBest', next.score.toString());
                next.bestScore = next.score;
              }
              next.phase = PHASES.WAITING;
              playSound(80, 'sine', 0.2, 0.1); // Final impact
            }
          }
          return next;
        });
      }

      // --- RENDER ---
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.save();
      ctx.translate(-state.viewOffset, 0);

      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      grad.addColorStop(0, '#fdfcfb');
      grad.addColorStop(1, '#e2d1c3');
      ctx.fillStyle = grad;
      ctx.fillRect(state.viewOffset, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(state.viewOffset + 100, 100, 30, 0, Math.PI * 2);
      ctx.arc(state.viewOffset + 130, 110, 25, 0, Math.PI * 2);
      ctx.arc(state.viewOffset + 70, 110, 20, 0, Math.PI * 2);
      ctx.fill();

      state.platforms.forEach(p => {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(p.x + 8, CANVAS_HEIGHT - 200 + 8, p.width, 200);
        ctx.fillStyle = '#4b5563'; 
        ctx.beginPath();
        ctx.roundRect(p.x, CANVAS_HEIGHT - 200, p.width, 200, [8, 8, 0, 0]);
        ctx.fill();
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(p.x + (p.width / 2) - 4, CANVAS_HEIGHT - 200, 8, 8);
      });

      const currentPlatform = state.platforms[0];
      const stickStartX = currentPlatform.x + currentPlatform.width;
      const stickStartY = CANVAS_HEIGHT - 200;
      ctx.lineWidth = STICK_WIDTH;
      ctx.strokeStyle = '#374151';
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(stickStartX, stickStartY);
      ctx.lineTo(
        stickStartX + Math.sin(state.stickAngle) * state.stickLength,
        stickStartY - Math.cos(state.stickAngle) * state.stickLength
      );
      ctx.stroke();

      if (state.perfectHit) {
        ctx.fillStyle = '#f43f5e';
        ctx.font = 'bold 20px Quicksand';
        ctx.textAlign = "center";
        ctx.fillText('PERFECT!', state.heroX + HERO_WIDTH / 2, state.heroY - 20);
      }

      ctx.save();
      ctx.translate(state.heroX + HERO_WIDTH / 2, state.heroY + HERO_HEIGHT);
      let scaleY = 1;
      if (state.phase === PHASES.STRETCHING) scaleY = 1 - (Math.sin(Date.now() / 50) * 0.05);
      ctx.scale(1, scaleY);
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.roundRect(-HERO_WIDTH / 2, -HERO_HEIGHT, HERO_WIDTH, HERO_HEIGHT, 8);
      ctx.fill();
      ctx.fillStyle = '#f9fafb';
      ctx.beginPath();
      ctx.roundRect(-HERO_WIDTH / 2 + 2, -HERO_HEIGHT + 6, HERO_WIDTH - 4, 12, 4);
      ctx.fill();
      ctx.fillStyle = '#111827';
      const eyeBlink = Math.sin(Date.now() / 300) > 0.98 ? 0.1 : 1;
      ctx.fillRect(-4, -HERO_HEIGHT + 10, 3, 3 * eyeBlink);
      ctx.fillRect(2, -HERO_HEIGHT + 10, 3, 3 * eyeBlink);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-HERO_WIDTH / 2, -HERO_HEIGHT + 18, HERO_WIDTH, 4);
      ctx.restore();

      ctx.restore();
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#fef2f2',
      fontFamily: '"Quicksand", system-ui, sans-serif',
      padding: '20px',
      userSelect: 'none',
      touchAction: 'none'
    },
    gameWrapper: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '40px',
      boxShadow: '0 30px 60px -12px rgba(100, 50, 50, 0.2)',
      border: '12px solid #fff',
      backgroundColor: '#fdfcfb',
      width: '500px',
      height: '600px'
    },
    hud: {
      position: 'absolute',
      top: '40px',
      left: 0,
      right: 0,
      textAlign: 'center',
      pointerEvents: 'none',
      zIndex: 10
    },
    scoreText: {
      fontSize: '96px',
      fontWeight: '900',
      color: '#fff',
      margin: 0,
      lineHeight: 0.8,
      WebkitTextStroke: '3px #fb7185',
      textShadow: '0 8px 0 #fda4af'
    },
    overlay: {
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(255, 241, 242, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(10px)',
      zIndex: 20
    },
    modal: {
      backgroundColor: 'white',
      padding: '40px',
      borderRadius: '48px',
      textAlign: 'center',
      width: '340px',
      boxShadow: '0 20px 40px rgba(251, 113, 133, 0.2)',
      border: '2px solid #fff1f2'
    },
    btn: {
      backgroundColor: '#fb7185',
      color: 'white',
      border: 'none',
      padding: '20px 50px',
      borderRadius: '100px',
      fontSize: '22px',
      fontWeight: 'bold',
      cursor: 'pointer',
      boxShadow: '0 10px 0 #e11d48',
      transition: 'all 0.1s',
      marginTop: '10px'
    }
  };

  const showOverlay = gameState.isFirstLoad || (gameState.phase === PHASES.WAITING && gameState.heroY > CANVAS_HEIGHT);

  return (
    <div 
      style={styles.container}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
    >
      <div style={styles.gameWrapper}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{display: 'block', width: '100%', height: '100%'}} />
        
        <div style={styles.hud}>
          <div style={styles.scoreText}>{gameState.score}</div>
          <div style={{color: '#fda4af', fontWeight: 'bold', fontSize: '16px', letterSpacing: '4px', marginTop: '10px'}}>POINTS</div>
        </div>

        {showOverlay && (
          <div style={styles.overlay}>
            <div style={styles.modal}>
              <div style={{fontSize: '60px', marginBottom: '10px'}}>
                {gameState.score > 0 ? "🌸" : "🥷"}
              </div>
              <h1 style={{margin: '0 0 5px 0', color: '#1f2937', fontSize: '36px', fontWeight: '900'}}>
                {gameState.score > 0 ? "Nice Try!" : "STICK HERO"}
              </h1>
              <p style={{color: '#9ca3af', fontSize: '18px', marginBottom: '25px', fontWeight: '600'}}>
                {gameState.score > 0 ? `You got ${gameState.score} points` : "Become the ultimate ninja!"}
              </p>
              <div style={{
                backgroundColor: '#fff1f2', 
                padding: '20px', 
                borderRadius: '24px', 
                marginBottom: '30px',
              }}>
                <span style={{color: '#fb7185', fontSize: '14px', textTransform: 'uppercase', fontWeight: '900', display: 'block', marginBottom: '4px'}}>BEST SCORE</span>
                <span style={{color: '#e11d48', fontSize: '32px', fontWeight: '900'}}>{gameState.bestScore}</span>
              </div>
              <button 
                style={styles.btn}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.style.transform = 'translateY(4px)';
                  e.currentTarget.style.boxShadow = '0 6px 0 #e11d48';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 10px 0 #e11d48';
                }}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  resetGame(); 
                }}
              >
                {gameState.score > 0 ? "REPLAY" : "START"}
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div style={{marginTop: '30px', textAlign: 'center'}}>
        <div style={{color: '#fda4af', fontSize: '14px', fontWeight: '900', letterSpacing: '2px'}}>
          {gameState.phase === PHASES.WAITING && !showOverlay ? "HOLD SCREEN TO GROW STICK" : " "}
        </div>
      </div>
    </div>
  );
};

export default App;