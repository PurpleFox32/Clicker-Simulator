(() => {
    const Game = window.Game;
    if (!Game) return;

    const ui = { ptier: [] };

    const pointIntervalMs = () => Game.BASE.pointFixedIntervalMs;
    const pointTierPower = (t) => t.basePower + (t.powerLevel * Game.BASE.pointPowerStep);
    const isUnlocked = (t) => !!t.devForceUnlocked || Game.state.rebirths >= t.unlockRebirths;

    function updateTierUI(i) {
        const t = Game.state.pointTiers[i];
        const refs = ui.ptier[i];
        if (!refs) return;

        t.unlocked = isUnlocked(t);
        refs.root.classList.toggle('unlocked', t.unlocked);

        if (!t.unlocked) {
            refs.lockMsg.textContent = `Requires ${t.unlockRebirths} rebirth${t.unlockRebirths === 1 ? '' : 's'} (or enable in Dev)`;
            refs.fill.style.width = '0%';
            refs.timeLabel.textContent = `${(pointIntervalMs() / 1000).toFixed(2)}s`;
            return;
        }

        const secs = (pointIntervalMs() / 1000);
        refs.stats.textContent = `+${pointTierPower(t)} / ${secs.toFixed(0)}s`;

        const remain = Math.max(0, (pointIntervalMs() - t.elapsedMs) / 1000);
        refs.timeLabel.textContent = `${remain.toFixed(remain % 1 === 0 ? 0 : 2)}s`;

        const powerMaxed = t.powerLevel >= Game.BASE.powerMaxLevelsPoints;
        refs.btnPower.textContent = powerMaxed
            ? `Power L${t.powerLevel} (MAX)`
            : `Power L${t.powerLevel} (${Game.fmt(Math.ceil(t.powerCost))})`;
        refs.btnPower.disabled = powerMaxed || Game.state.points < Math.ceil(t.powerCost);
    }

    const AutoPoint = {
        ready: false,

        init() {
            ui.ptier = [
                {
                    root: document.getElementById('ptier0'),
                    stats: document.getElementById('p0Stats'),
                    fill: document.getElementById('p0Fill'),
                    timeLabel: document.getElementById('p0TimeLabel'),
                    btnPower: document.getElementById('p0Power'),
                    lockMsg: document.getElementById('p0LockMsg'),
                },
                {
                    root: document.getElementById('ptier1'),
                    stats: document.getElementById('p1Stats'),
                    fill: document.getElementById('p1Fill'),
                    timeLabel: document.getElementById('p1TimeLabel'),
                    btnPower: document.getElementById('p1Power'),
                    lockMsg: document.getElementById('p1LockMsg'),
                },
                {
                    root: document.getElementById('ptier2'),
                    stats: document.getElementById('p2Stats'),
                    fill: document.getElementById('p2Fill'),
                    timeLabel: document.getElementById('p2TimeLabel'),
                    btnPower: document.getElementById('p2Power'),
                    lockMsg: document.getElementById('p2LockMsg'),
                },
            ];

            // Guard against missing DOM (shouldn’t happen with provided HTML)
            if (ui.ptier.some(refs => !refs.root)) {
                console.warn('AutoPoint: missing tier DOM elements. Will retry on next tick.');
                return;
            }

            // Wire power buttons
            ui.ptier.forEach((refs, i) => {
                refs.btnPower.addEventListener('click', () => {
                    const t = Game.state.pointTiers[i];
                    if (!isUnlocked(t)) return;
                    const maxed = t.powerLevel >= Game.BASE.powerMaxLevelsPoints;
                    const cost = Math.ceil(t.powerCost);
                    if (!maxed && Game.state.points >= cost) {
                        Game.state.points -= cost;
                        t.powerLevel++;
                        t.powerCost = Math.ceil(t.powerCost * Game.BASE.tierUpgradeCostMult);
                        Game.updateDisplays();
                    }
                });
            });

            this.ready = true;
            this.updateUIAll();
        },

        updateUIAll() { for (let i = 0; i < Game.state.pointTiers.length; i++) updateTierUI(i); },

        tick(dt) {
            if (!this.ready) return;

            for (let i = 0; i < Game.state.pointTiers.length; i++) {
                const t = Game.state.pointTiers[i];
                const refs = ui.ptier[i];
                if (!refs) continue;

                const wasUnlocked = t.unlocked;
                t.unlocked = isUnlocked(t);
                refs.root.classList.toggle('unlocked', t.unlocked);

                if (!t.unlocked) {
                    refs.fill.style.width = '0%';
                    refs.lockMsg.textContent = `Requires ${t.unlockRebirths} rebirth${t.unlockRebirths === 1 ? '' : 's'} (or enable in Dev)`;
                    refs.timeLabel.textContent = `${(pointIntervalMs() / 1000).toFixed(2)}s`;
                    continue;
                } else if (!wasUnlocked) {
                    t.elapsedMs = 0; // start fresh on unlock
                }

                const interval = pointIntervalMs();
                t.elapsedMs += dt;

                const remain = Math.max(0, (interval - t.elapsedMs) / 1000);
                refs.timeLabel.textContent = `${remain.toFixed(remain % 1 === 0 ? 0 : 2)}s`;

                const pct = Math.min(1, t.elapsedMs / interval) * 100;
                refs.fill.style.width = `${pct}%`;

                if (t.elapsedMs >= interval) {
                    t.elapsedMs %= interval;
                    Game.addPointsDirect(pointTierPower(t));
                }
            }
        }
    };

    Game.AutoPoint = AutoPoint;
})();
