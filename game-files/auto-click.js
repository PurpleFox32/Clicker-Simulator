(() => {
    const Game = window.Game;
    if (!Game) return;

    const ui = { ctier: [] };

    function clickIntervalMs(t) {
        const base = Game.BASE.timeStartMs - t.timeLevel * Game.BASE.timeStepMs;
        return Math.max(Game.BASE.timeMinMs, base);
    }
    function clickTierPower(t) {
        return t.basePower + Math.min(Game.BASE.powerMaxExtraClicks, t.powerLevel);
    }

    function updateTierUI(i) {
        const t = Game.state.clickTiers[i];
        const refs = ui.ctier[i];

        refs.root.classList.toggle('unlocked', !!t.unlocked);
        refs.btnUnlock.textContent = `Unlock Tier ${i + 1} (${Game.fmt(t.unlockCost)})`;
        refs.btnUnlock.disabled = !!t.unlocked || Game.state.points < t.unlockCost;

        if (!t.unlocked) {
            refs.fill.style.width = '0%';
            refs.timeLabel.textContent = `${(clickIntervalMs(t) / 1000).toFixed(2)}s`;
            return;
        }

        const secs = clickIntervalMs(t) / 1000;
        refs.stats.textContent = `+${clickTierPower(t)} / ${secs.toFixed(secs % 1 === 0 ? 0 : 2)}s`;

        const remain = Math.max(0, (clickIntervalMs(t) - t.elapsedMs) / 1000);
        refs.timeLabel.textContent = `${remain.toFixed(remain % 1 === 0 ? 0 : 2)}s`;

        const timeMaxed = t.timeLevel >= Game.BASE.timeMaxLevel || clickIntervalMs(t) <= Game.BASE.timeMinMs;
        refs.btnTime.textContent = timeMaxed
            ? `Time L${t.timeLevel} (MAX)`
            : `Time L${t.timeLevel} (${Game.fmt(Math.ceil(t.timeCost))})`;
        refs.btnTime.disabled = timeMaxed || Game.state.points < Math.ceil(t.timeCost);

        const powerMaxed = t.powerLevel >= Game.BASE.powerMaxExtraClicks;
        refs.btnPower.textContent = powerMaxed
            ? `Power L${t.powerLevel} (MAX)`
            : `Power L${t.powerLevel} (${Game.fmt(Math.ceil(t.powerCost))})`;
        refs.btnPower.disabled = powerMaxed || Game.state.points < Math.ceil(t.powerCost);
    }

    const AutoClick = {
        init() {
            ui.ctier = [
                {
                    root: document.getElementById('tier0'),
                    stats: document.getElementById('t0Stats'),
                    fill: document.getElementById('t0Fill'),
                    btnUnlock: document.getElementById('t0Unlock'),
                    btnTime: document.getElementById('t0Time'),
                    btnPower: document.getElementById('t0Power'),
                    timeLabel: document.getElementById('t0TimeLabel'),
                },
                {
                    root: document.getElementById('tier1'),
                    stats: document.getElementById('t1Stats'),
                    fill: document.getElementById('t1Fill'),
                    btnUnlock: document.getElementById('t1Unlock'),
                    btnTime: document.getElementById('t1Time'),
                    btnPower: document.getElementById('t1Power'),
                    timeLabel: document.getElementById('t1TimeLabel'),
                },
                {
                    root: document.getElementById('tier2'),
                    stats: document.getElementById('t2Stats'),
                    fill: document.getElementById('t2Fill'),
                    btnUnlock: document.getElementById('t2Unlock'),
                    btnTime: document.getElementById('t2Time'),
                    btnPower: document.getElementById('t2Power'),
                    timeLabel: document.getElementById('t2TimeLabel'),
                },
            ];

            // Wire buttons
            ui.ctier.forEach((refs, i) => {
                const t = Game.state.clickTiers[i];

                refs.btnUnlock.addEventListener('click', () => {
                    if (t.unlocked) return;
                    if (Game.state.points >= t.unlockCost) {
                        Game.state.points -= t.unlockCost;
                        t.unlocked = true;
                        t.elapsedMs = 0;
                        refs.root.classList.add('unlocked'); // immediate visual flip
                        Game.updateDisplays();
                    }
                });

                refs.btnTime.addEventListener('click', () => {
                    if (!t.unlocked) return;
                    const maxed = t.timeLevel >= Game.BASE.timeMaxLevel;
                    const cost = Math.ceil(t.timeCost);
                    if (!maxed && Game.state.points >= cost) {
                        Game.state.points -= cost;
                        t.timeLevel++;
                        t.timeCost = Math.ceil(t.timeCost * Game.BASE.tierUpgradeCostMult);
                        if (clickIntervalMs(t) <= Game.BASE.timeMinMs) t.timeLevel = Game.BASE.timeMaxLevel;
                        Game.updateDisplays();
                    }
                });

                refs.btnPower.addEventListener('click', () => {
                    if (!t.unlocked) return;
                    const maxed = t.powerLevel >= Game.BASE.powerMaxExtraClicks;
                    const cost = Math.ceil(t.powerCost);
                    if (!maxed && Game.state.points >= cost) {
                        Game.state.points -= cost;
                        t.powerLevel++;
                        t.powerCost = Math.ceil(t.powerCost * Game.BASE.tierUpgradeCostMult);
                        Game.updateDisplays();
                    }
                });
            });

            this.updateUIAll();
        },

        updateUIAll() { for (let i = 0; i < Game.state.clickTiers.length; i++) updateTierUI(i); },

        tick(dt) {
            for (let i = 0; i < Game.state.clickTiers.length; i++) {
                const t = Game.state.clickTiers[i];
                const refs = ui.ctier[i];

                if (!t.unlocked) {
                    refs.fill.style.width = '0%';
                    refs.timeLabel.textContent = `${(clickIntervalMs(t) / 1000).toFixed(2)}s`;
                    continue;
                }

                const interval = clickIntervalMs(t);
                t.elapsedMs += dt;

                const remain = Math.max(0, (interval - t.elapsedMs) / 1000);
                refs.timeLabel.textContent = `${remain.toFixed(remain % 1 === 0 ? 0 : 2)}s`;

                const pct = Math.min(1, t.elapsedMs / interval) * 100;
                refs.fill.style.width = `${pct}%`;

                if (t.elapsedMs >= interval) {
                    t.elapsedMs %= interval;
                    Game.doAutoClicks(clickTierPower(t));
                }
            }
        }
    };

    Game.AutoClick = AutoClick;
})();
