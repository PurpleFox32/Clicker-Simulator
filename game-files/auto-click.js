(() => {
    const Game = window.Game;
    if (!Game) return;

    const ui = {
        ctier: [],
        auto: [], // auto-upgrade UI refs
    };

    function clickIntervalMs(t) {
        const base = Game.BASE.timeStartMs - t.timeLevel * Game.BASE.timeStepMs;
        return Math.max(Game.BASE.timeMinMs, base);
    }
    function clickTierPower(t) {
        return t.basePower + Math.min(Game.BASE.powerMaxExtraClicks, t.powerLevel);
    }

    function mmss(ms) {
        const s = Math.ceil(ms / 1000);
        const m = Math.floor(s / 60);
        const ss = String(s % 60).padStart(2, '0');
        return `${m}:${ss}`;
    }

    // ===== AUTO UPGRADE (Click) =====
    function autoUpgInterval(i) {
        const au = Game.state.clickAutoUpgrades[i];
        return Game.autoUpgIntervalMs(i, au.level);
    }

    function autoUpgApply(i) {
        // On completion, increase the corresponding CLICK TIER power by +1 (up to max)
        const tier = Game.state.clickTiers[i];
        if (!tier.unlocked) return; // do nothing until the tier is unlocked
        if (tier.powerLevel >= Game.BASE.powerMaxExtraClicks) return;
        tier.powerLevel += 1;
    }

    function updateAutoUpgUI(i) {
        const refs = ui.auto[i];
        const au = Game.state.clickAutoUpgrades[i];

        const maxed = au.level >= Game.BASE.autoUpgMaxLevel;
        const btnLabel = au.owned
            ? (maxed ? `Upgrade (MAX)` : `Upgrade L${au.level} (${Game.fmt(au.costTokens)}T)`)
            : `Enable (${Game.fmt(au.costTokens)}T)`;
        refs.btn.textContent = btnLabel;
        refs.btn.disabled = maxed || Game.state.rebirthTokens < Math.ceil(au.costTokens);

        // time label
        const interval = autoUpgInterval(i);
        const remain = Math.max(0, interval - au.elapsedMs);
        refs.time.textContent = mmss(remain);

        // progress fill
        const pct = Math.min(1, au.elapsedMs / interval) * 100;
        refs.fill.style.width = `${pct}%`;
    }

    // ===== TIER UI =====
    function updateTierUI(i) {
        const t = Game.state.clickTiers[i];
        const refs = ui.ctier[i];
        if (!refs) return;

        refs.root.classList.toggle('unlocked', !!t.unlocked);
        if (refs.btnUnlock) {
            refs.btnUnlock.textContent = `Unlock Tier ${i + 1} (${Game.fmt(t.unlockCost)})`;
            refs.btnUnlock.disabled = !!t.unlocked || Game.state.points < t.unlockCost;
        }

        if (!t.unlocked) {
            if (refs.fill) refs.fill.style.width = '0%';
            if (refs.timeLabel) refs.timeLabel.textContent = `${(clickIntervalMs(t) / 1000).toFixed(2)}s`;
            return;
        }

        const secs = clickIntervalMs(t) / 1000;
        if (refs.stats) refs.stats.textContent = `+${clickTierPower(t)} / ${secs.toFixed(secs % 1 === 0 ? 0 : 2)}s`;

        const remain = Math.max(0, (clickIntervalMs(t) - t.elapsedMs) / 1000);
        if (refs.timeLabel) refs.timeLabel.textContent = `${remain.toFixed(remain % 1 === 0 ? 0 : 2)}s`;

        const timeMaxed = t.timeLevel >= Game.BASE.timeMaxLevel || clickIntervalMs(t) <= Game.BASE.timeMinMs;
        if (refs.btnTime) {
            refs.btnTime.textContent = timeMaxed
                ? `Time L${t.timeLevel} (MAX)`
                : `Time L${t.timeLevel} (${Game.fmt(Math.ceil(t.timeCost))})`;
            refs.btnTime.disabled = timeMaxed || Game.state.points < Math.ceil(t.timeCost);
        }

        const powerMaxed = t.powerLevel >= Game.BASE.powerMaxExtraClicks;
        if (refs.btnPower) {
            refs.btnPower.textContent = powerMaxed
                ? `Power L${t.powerLevel} (MAX)`
                : `Power L${t.powerLevel} (${Game.fmt(Math.ceil(t.powerCost))})`;
            refs.btnPower.disabled = powerMaxed || Game.state.points < Math.ceil(t.powerCost);
        }
    }

    const AutoClick = {
        ready: false,

        init() {
            // Tier controls
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

            // Auto-upgrade UI for Click
            ui.auto = [
                { fill: document.getElementById('cAutoFill0'), time: document.getElementById('cAutoTime0'), btn: document.getElementById('cAutoBtn0') },
                { fill: document.getElementById('cAutoFill1'), time: document.getElementById('cAutoTime1'), btn: document.getElementById('cAutoBtn1') },
                { fill: document.getElementById('cAutoFill2'), time: document.getElementById('cAutoTime2'), btn: document.getElementById('cAutoBtn2') },
            ];

            // Wire tier buttons
            ui.ctier.forEach((refs, i) => {
                const t = Game.state.clickTiers[i];

                if (refs.btnUnlock) {
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
                }

                if (refs.btnTime) {
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
                }

                if (refs.btnPower) {
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
                }
            });

            // Wire auto-upgrade buttons
            ui.auto.forEach((refs, i) => {
                refs.btn.addEventListener('click', () => {
                    const au = Game.state.clickAutoUpgrades[i];
                    if (au.level >= Game.BASE.autoUpgMaxLevel) return;
                    const cost = Math.ceil(au.costTokens);
                    if (Game.state.rebirthTokens < cost) return;
                    Game.state.rebirthTokens -= cost;

                    if (!au.owned) {
                        au.owned = true;
                    } else {
                        au.level += 1;
                    }
                    au.costTokens = Math.ceil(au.costTokens * Game.BASE.autoUpgCostMult);
                    Game.updateDisplays();
                });
            });

            this.ready = true;
            this.updateUIAll();
        },

        updateUIAll() {
            for (let i = 0; i < Game.state.clickTiers.length; i++) updateTierUI(i);
            for (let i = 0; i < Game.state.clickAutoUpgrades.length; i++) updateAutoUpgUI(i);
        },

        tick(dt) {
            if (!this.ready) return;

            // Tier timers
            for (let i = 0; i < Game.state.clickTiers.length; i++) {
                const t = Game.state.clickTiers[i];
                const refs = ui.ctier[i];
                if (!refs) continue;

                if (!t.unlocked) {
                    if (refs.fill) refs.fill.style.width = '0%';
                    if (refs.timeLabel) refs.timeLabel.textContent = `${(clickIntervalMs(t) / 1000).toFixed(2)}s`;
                    continue;
                }

                const interval = clickIntervalMs(t);
                t.elapsedMs += dt;

                const remain = Math.max(0, (interval - t.elapsedMs) / 1000);
                if (refs.timeLabel) refs.timeLabel.textContent = `${remain.toFixed(remain % 1 === 0 ? 0 : 2)}s`;

                const pct = Math.min(1, t.elapsedMs / interval) * 100;
                if (refs.fill) refs.fill.style.width = `${pct}%`;

                if (t.elapsedMs >= interval) {
                    t.elapsedMs %= interval;
                    Game.doAutoClicks(clickTierPower(t));
                }
            }

            // Auto-upgrade timers
            for (let i = 0; i < Game.state.clickAutoUpgrades.length; i++) {
                const au = Game.state.clickAutoUpgrades[i];
                if (!au.owned) { updateAutoUpgUI(i); continue; }
                au.elapsedMs += dt;

                const interval = autoUpgInterval(i);
                if (au.elapsedMs >= interval) {
                    au.elapsedMs %= interval;
                    autoUpgApply(i);
                    Game.updateDisplays();
                }
                updateAutoUpgUI(i);
            }
        }
    };

    Game.AutoClick = AutoClick;
})();
