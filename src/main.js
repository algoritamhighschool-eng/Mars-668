
const pageTransition = document.querySelector('#page-transition');
const revealSite = () => {
    requestAnimationFrame(() => pageTransition.classList.add('is-hidden'));
};

if (document.readyState === 'complete') {
    revealSite();
} else {
    window.addEventListener('load', revealSite, { once: true });
}

const landingPage = document.querySelector('#landing-page');
const aboutPage = document.querySelector('#about-page');
const gamePage = document.querySelector('#game-page');
const playButton = document.querySelector('#play-button');
const backButton = document.querySelector('#back-button');
const aboutUsButton = document.querySelector('#about-us-button');
const aboutBackButton = document.querySelector('#about-back-button');
const gameFrame = document.querySelector('#game-frame');
const fullscreenButton = document.querySelector('#fullscreen-button');
const fullscreenStatus = document.querySelector('#fullscreen-status');
const settingsButton = document.querySelector('#settings-button');
const settingsPanel = document.querySelector('#settings-panel');
const settingsCloseButton = document.querySelector('#settings-close-button');
const sfxVolume = document.querySelector('#sfx-volume');
const musicVolume = document.querySelector('#music-volume');
const muteGameAudio = document.querySelector('#mute-game-audio');
const sfxValue = document.querySelector('#sfx-value');
const musicValue = document.querySelector('#music-value');
const sandBackground = document.querySelector('#sand-background');
const worldBackground = document.querySelector('#world-background');
const earthSandLayer = document.querySelector('#earth-sand-layer');
let earthCovered = false;
const gameAudioGains = new Set();
let siteAudioContext;
let siteSfxGain;
let siteMusicGain;
let sandNoiseBuffer;
let lastSandSoundAt = 0;
let ambientNoteIndex = 0;

const ambientNotes = [220, 261.63, 329.63, 392, 329.63, 261.63];

function playAmbientNote() {
    if (!siteAudioContext || siteAudioContext.state !== 'running') return;

    const now = siteAudioContext.currentTime;
    const oscillator = siteAudioContext.createOscillator();
    const filter = siteAudioContext.createBiquadFilter();
    const envelope = siteAudioContext.createGain();
    const frequency = ambientNotes[ambientNoteIndex % ambientNotes.length];
    ambientNoteIndex += 1;

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    filter.type = 'lowpass';
    filter.frequency.value = 720;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.14, now + 0.8);
    envelope.gain.setTargetAtTime(0.0001, now + 2.7, 0.5);

    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(siteMusicGain);
    oscillator.start(now);
    oscillator.stop(now + 5);
    oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        filter.disconnect();
        envelope.disconnect();
    }, { once: true });
}

function startSiteAudio() {
    if (!siteAudioContext) {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) {
            console.error('Web Audio is unavailable; site audio could not start.');
            return;
        }

        siteAudioContext = new AudioContextConstructor();
        siteSfxGain = siteAudioContext.createGain();
        siteMusicGain = siteAudioContext.createGain();
        siteSfxGain.connect(siteAudioContext.destination);
        siteMusicGain.connect(siteAudioContext.destination);
        updateAudioSettings(false);

        sandNoiseBuffer = siteAudioContext.createBuffer(
            1,
            Math.floor(siteAudioContext.sampleRate * 0.15),
            siteAudioContext.sampleRate,
        );
        const noiseSamples = sandNoiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseSamples.length; i += 1) {
            noiseSamples[i] = Math.random() * 2 - 1;
        }

        for (const frequency of [55, 82.41, 110]) {
            const oscillator = siteAudioContext.createOscillator();
            const gain = siteAudioContext.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gain.gain.value = 0.1;
            oscillator.connect(gain);
            gain.connect(siteMusicGain);
            oscillator.start();
        }

        window.setInterval(playAmbientNote, 4200);
    }

    if (siteAudioContext.state === 'suspended') {
        siteAudioContext.resume()
            .then(playAmbientNote)
            .catch(error => console.error('Could not resume site audio:', error));
    }
}

function playSandSound(event) {
    if (!siteAudioContext || siteAudioContext.state !== 'running' || !sandNoiseBuffer) return;

    const now = siteAudioContext.currentTime;
    if (now - lastSandSoundAt < 0.17) return;
    lastSandSoundAt = now;

    const source = siteAudioContext.createBufferSource();
    const filter = siteAudioContext.createBiquadFilter();
    const envelope = siteAudioContext.createGain();
    const speed = Math.min(1, Math.hypot(event.movementX, event.movementY) / 30);

    source.buffer = sandNoiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = 850 + Math.random() * 650;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.12 + speed * 0.06, now + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(siteSfxGain);
    source.start(now);
    source.stop(now + 0.15);
    source.addEventListener('ended', () => {
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
    }, { once: true });
}

function getSavedVolume(key, fallback) {
    const saved = localStorage.getItem(key);
    if (saved === null) return fallback;
    const value = Number(saved);
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
}

function setSettingsOpen(isOpen) {
    settingsPanel.classList.toggle('hidden', !isOpen);
    settingsButton.setAttribute('aria-expanded', String(isOpen));
    settingsButton.setAttribute('aria-label', isOpen ? 'Close settings' : 'Open settings');
}

function installGameAudioVolumeBridge() {
    const audioNodePrototype = gameFrame.contentWindow.AudioNode?.prototype;
    if (!audioNodePrototype || audioNodePrototype.__mars668VolumeBridge) return;

    gameAudioGains.clear();
    const nativeConnect = audioNodePrototype.connect;
    const masterGains = new WeakMap();

    audioNodePrototype.connect = function (destination, ...args) {
        const audioContext = this.context;
        if (!audioContext || destination !== audioContext.destination) {
            return nativeConnect.call(this, destination, ...args);
        }

        let masterGain = masterGains.get(audioContext);
        if (!masterGain) {
            masterGain = audioContext.createGain();
            masterGain.gain.value = muteGameAudio.checked ? 0 : Number(sfxVolume.value) / 100;
            nativeConnect.call(masterGain, destination);
            masterGains.set(audioContext, masterGain);
            gameAudioGains.add(masterGain);
        }
        return nativeConnect.call(this, masterGain, ...args);
    };

    Object.defineProperty(audioNodePrototype, '__mars668VolumeBridge', { value: true });
}

function syncGameMuteButton(isMuted) {
    if (!gameFrame.getAttribute('src')) return;
    const muteButton = gameFrame.contentDocument.querySelector(
        'button[aria-label="Mute audio"], button[aria-label="Unmute audio"]',
    );
    if (!muteButton) return;

    const gameIsMuted = muteButton.getAttribute('aria-label') === 'Unmute audio';
    if (gameIsMuted !== isMuted) muteButton.click();
}

function updateAudioSettings(save = true) {
    const sfx = Number(sfxVolume.value);
    const music = Number(musicVolume.value);
    const muted = muteGameAudio.checked || sfx === 0;
    const effectiveSfx = muted ? 0 : sfx / 100;
    const effectiveMusic = muteGameAudio.checked ? 0 : music / 100;
    sfxValue.value = `${sfx}%`;
    musicValue.value = `${music}%`;

    if (save) {
        localStorage.setItem('mars668-sfx-volume', String(sfx));
        localStorage.setItem('mars668-music-volume', String(music));
        localStorage.setItem('mars668-mute-game-audio', String(muteGameAudio.checked));
    }

    if (siteAudioContext) {
        siteSfxGain.gain.setTargetAtTime(effectiveSfx * 0.45, siteAudioContext.currentTime, 0.04);
        siteMusicGain.gain.setTargetAtTime(
            (muteGameAudio.checked ? 0 : music / 100) * 0.22,
            siteAudioContext.currentTime,
            0.2,
        );
    }

    for (const gain of gameAudioGains) {
        gain.gain.setTargetAtTime(effectiveSfx, gain.context.currentTime, 0.02);
    }
    syncGameMuteButton(muted);

    if (gameFrame.getAttribute('src')) {
        gameFrame.contentWindow.postMessage({
            type: 'mars668-audio-settings',
            sfx: effectiveSfx,
            music: effectiveMusic,
            muted,
        }, window.location.origin);
    }
}

sfxVolume.value = String(getSavedVolume('mars668-sfx-volume', 80));
musicVolume.value = String(getSavedVolume('mars668-music-volume', 70));
muteGameAudio.checked = localStorage.getItem('mars668-mute-game-audio') === 'true';
updateAudioSettings(false);
window.addEventListener('pointerdown', startSiteAudio);
window.addEventListener('keydown', startSiteAudio);
sfxVolume.addEventListener('input', () => updateAudioSettings());
musicVolume.addEventListener('input', () => updateAudioSettings());
muteGameAudio.addEventListener('change', () => updateAudioSettings());
gameFrame.addEventListener('load', () => {
    if (!gameFrame.getAttribute('src')) return;
    installGameAudioVolumeBridge();
    updateAudioSettings(false);
});

function sendSandEvent(type, event) {
    if (landingPage.classList.contains('hidden')) return;

    if (type === 'move') playSandSound(event);
    sandBackground.contentWindow.postMessage({
        type: `pixel-sand-${type}`,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
    }, window.location.origin);
}

window.addEventListener('pointermove', event => sendSandEvent('move', event), { passive: true });
window.addEventListener('pointerup', event => sendSandEvent('up', event));
document.documentElement.addEventListener('pointerleave', event => sendSandEvent('leave', event));
window.addEventListener('blur', event => sendSandEvent('leave', event));

window.addEventListener('message', event => {
    if (event.source !== sandBackground.contentWindow
        || event.origin !== window.location.origin
        || event.data?.type !== 'pixel-sand-earth-covered'
        || earthCovered) {
        return;
    }

    earthCovered = true;
    const sandCanvas = sandBackground.contentDocument.querySelector('#sand-bg');
    earthSandLayer.src = sandCanvas.toDataURL('image/png');
    landingPage.classList.add('mars-revealed');
    worldBackground.classList.add('mars-revealed');
    sandBackground.contentWindow.postMessage({ type: 'pixel-sand-reset' }, window.location.origin);
});

settingsButton.addEventListener('click', () => {
    const isOpen = settingsButton.getAttribute('aria-expanded') === 'true';
    setSettingsOpen(!isOpen);
});

settingsCloseButton.addEventListener('click', () => setSettingsOpen(false));
document.addEventListener('pointerdown', event => {
    if (!settingsPanel.classList.contains('hidden') && !event.target.closest('#settings-widget')) {
        setSettingsOpen(false);
    }
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setSettingsOpen(false);
});

aboutUsButton.addEventListener('click', () => {
    setSettingsOpen(false);
    landingPage.classList.add('hidden');
    aboutPage.classList.remove('hidden');
});

aboutBackButton.addEventListener('click', () => {
    aboutPage.classList.add('hidden');
    landingPage.classList.remove('hidden');
});

function updateFullscreenButton() {
    const isFullscreen = document.fullscreenElement === gamePage;
    fullscreenButton.textContent = isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
    fullscreenButton.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
    fullscreenStatus.textContent = '';
}

fullscreenButton.addEventListener('click', async () => {
    fullscreenStatus.textContent = '';
    try {
        if (document.fullscreenElement === gamePage) {
            await document.exitFullscreen();
        } else {
            await gamePage.requestFullscreen();
        }
    } catch (error) {
        console.error('Could not change fullscreen mode:', error);
        fullscreenStatus.textContent = 'Fullscreen unavailable';
    }
});

document.addEventListener('fullscreenchange', updateFullscreenButton);

playButton.addEventListener('click', () => {
    setSettingsOpen(false);
    sandBackground.classList.add('hidden');
    landingPage.classList.add('hidden');
    gamePage.classList.remove('hidden');

    gameFrame.src = `${import.meta.env.BASE_URL}game/Mars365-HTML5.html`;
});

backButton.addEventListener('click', async () => {
    setSettingsOpen(false);
    if (document.fullscreenElement === gamePage) await document.exitFullscreen();
    gameFrame.src = '';
    gameAudioGains.clear();

    sandBackground.classList.remove('hidden');
    gamePage.classList.add('hidden');
    landingPage.classList.remove('hidden');
});
