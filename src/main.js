
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
