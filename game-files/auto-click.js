(() => {
    const Game = window.Game;
    if (!Game) return;

    const AutoClick = (Game.AutoClick = Game.AutoClick || {});
    AutoClick.ready = false;

    // ----- DOM references -----
    const tEls = [0, 1, 2].map(i => ({
        root: document.getElementById(`tier${i}`),
        unlockBtn: document.getElementById(`t${i}Unlock`),
        timeBtn: document.getElementById(`t${i}Time`),
        powerBtn: document.getElementById(`t${i}Power`),
        fill: document.getElementById(`t${i}Fill`),
        timeLabel: document.getElementById(`t${i}TimeLabel`),
        stats: document.getElementById(`t${i}Stats`)
    }));

    const auEls = [0, 1, 2].map(i => ({
        fill: document.getElementById(`cAutoFill${i}`),
        time: document.getElementById(`cAutoTime${i}`),
        btn: document.getElementById(`cAutoBtn${i}`),
    }));

    // ----- Helpers -----
    const tierIntervalMs = (t) => {
        const base = Game.BASE.timeStartMs;
        const step = Game.BASE.timeStepMs;
        const min = Game.BASE.timeMinMs;
        const ms = base - (t.timeLevel * step);
        return Math.max(min, ms);
    };
    const tierPower = (t) => t.basePower + t.powerLevel;

    const generatorUnlocked = (i) => !!Game.state.clickTiers[i].unlocked;

    const formatMMSS = (ms) => {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const ss = String(s % 60).padStart(2, '0');
        return `${m}:${ss}`;
    };

    // ----- UI update -----
    AutoClick.updateUIAll = () => {
        // Generators (tiers)
        Game.state.clickTiers.forEach((t, i) => {
            const el = tEls[i];
            if (!el.root) return;

            // Unlocked/locked state
            if (t.unlocked) el.root.classList.add('unlocked');
            else el.root.classList.remove('unlocked');

            // Buttons: costs & availability
            if (el.unlockBtn) el.unlockBtn.textContent = `Unlock Tier ${i + 1} (${Game.fmt(t.unlockCost)})`;

            if (el.timeBtn) {
                const can = Game.state.points >= Math.ceil(t.timeCost) && t.timeLevel < Game.BASE.timeMaxLevel;
                el.timeBtn.disabled = !can || !t.unlocked;
                el.timeBtn.textContent = `Time L${t.timeLevel} (${Game.fmt(t.timeCost)})`;
            }
            if (el.powerBtn) {
                const can = Game.state.points >= Math.ceil(t.powerCost) && t.powerLevel < Game.BASE.powerMaxExtraClicks;
                el.powerBtn.disabled = !can || !t.unlocked;
                el.powerBtn.textContent = `Power L${t.powerLevel} (${Game.fmt(t.powerCost)})`;
            }

            // Stats line
            if (el.stats) el.stats.textContent = `+${tierPower(t)} / ${Math.round(tierIntervalMs(t) / 100) / 10}s`;

            // Progress bar/label
            const interval = tierIntervalMs(t);
            const pct = t.unlocked ? Math.min(100, (t.elapsedMs / interval) * 100) : 0;
            if (el.fill) el.fill.style.width = `${pct}%`;
            if (el.timeLabel) el.timeLabel.textContent = (t.unlocked ? (interval - t.elapsedMs) : interval) / 1000
                .toFixed(2) + 's';
        });

        // Auto-Upgrades strip (purchase gating + labels)
        Game.state.clickAutoUpgrades.forEach((au, i) => {
            const e = auEls[i]; if (!e) return;
            const tierOwned = generatorUnlocked(i);
            if (!au.owned) {
                // Not owned: can only buy if corresponding generator is owned (GATING)
                e.btn.disabled = !tierOwned || Game.state.rebirthTokens < au.costTokens;
                e.btn.textContent = tierOwned ? `Enable (${Game.fmt(au.costTokens)}T)` : `Requires Tier ${i + 1}`;
                e.time.textContent = formatMMSS(Game.autoUpgIntervalMs(i, 0));
                if (e.fill) e.fill.style.width = '0%';
            } else {
                // Owned: can level up with tokens; but still require generator to be owned to progress the timer
                e.btn.disabled = Game.state.rebirthTokens < au.costTokens;
                e.btn.textContent = `Upgrade L${au.level} (${Game.fmt(au.costTokens)}T)`;
                const iv = Game.autoUpgIntervalMs(i, au.level);
                e.time.textContent = formatMMSS(Math.max(0, iv - au.elapsedMs));
                const pct = Math.min(100, (au.elapsedMs / iv) * 100);
                if (e.fill) e.fill.style.width = `${pct}%`;
                // If generator is NOT owned right now, visually indicate pause
                if (!tierOwned) {
                    e.btn.title = 'Paused — buy this Tier again to resume auto-upgrades';
                } else {
                    e.btn.title = '';
                }
            }
        });
    };

    // ----- Buying / wiring -----
    AutoClick.init = () => {
        // Unlock buttons
        tEls.forEach((el, i) => {
            el.unlockBtn?.addEventListener('click', () => {
                const t = Game.state.clickTiers[i];
                const cost = Math.ceil(t.unlockCost);
                if (t.unlocked) return;
                if (Game.state.points < cost) return;
                Game.state.points -= cost;
                t.unlocked = true;
                Game.updateDisplays();
            });
        });

        // Time / Power upgrades
        tEls.forEach((el, i) => {
            el.timeBtn?.addEventListener('click', () => {
                const t = Game.state.clickTiers[i];
                if (!t.unlocked) return;
                if (t.timeLevel >= Game.BASE.timeMaxLevel) return;
                const cost = Math.ceil(t.timeCost);
                if (Game.state.points < cost) return;
                Game.state.points -= cost;
                t.timeLevel += 1;
                t.timeCost = Math.ceil(t.timeCost * Game.BASE.tierUpgradeCostMult);
                t.elapsedMs = 0;
                Game.updateDisplays();
            });
            el.powerBtn?.addEventListener('click', () => {
                const t = Game.state.clickTiers[i];
                if (!t.unlocked) return;
                if (t.powerLevel >= Game.BASE.powerMaxExtraClicks) return;
                const cost = Math.ceil(t.powerCost);
                if (Game.state.points < cost) return;
                Game.state.points -= cost;
                t.powerLevel += 1;
                t.powerCost = Math.ceil(t.powerCost * Game.BASE.tierUpgradeCostMult);
                Game.updateDisplays();
            });
        });

        // Auto-Upgrade purchase/level (GATED by generator ownership)
        auEls.forEach((e, i) => {
            e.btn?.addEventListener('click', () => {
                const au = Game.state.clickAutoUpgrades[i];
                const tierOwned = generatorUnlocked(i);
                if (!tierOwned) return; // cannot buy/level without owning the corresponding generator
                const cost = Math.ceil(au.costTokens);
                if (Game.state.rebirthTokens < cost) return;

                Game.state.rebirthTokens -= cost;
                if (!au.owned) {
                    au.owned = true;
                } else {
                    if (au.level >= Game.BASE.autoUpgMaxLevel) return;
                    au.level += 1;
                }
                au.costTokens = Math.ceil(au.costTokens * Game.BASE.autoUpgCostMult);
                Game.updateDisplays();
            });
        });

        AutoClick.ready = true;
        AutoClick.updateUIAll();
    };

    // ----- Auto-upgrade behavior -----
    // When an Auto-Upgrade completes a cycle and the tier is owned,
    // it will first try to increase Power (until max), then Time (until max).
    function applyAutoUpgradeToTier(idx) {
        const t = Game.state.clickTiers[idx];
        if (!t.unlocked) return; // paused until the tier is re-bought after rebirth
        if (t.powerLevel < Game.BASE.powerMaxExtraClicks) {
            t.powerLevel += 1;
            return;
        }
        if (t.timeLevel < Game.BASE.timeMaxLevel) {
            t.timeLevel += 1;
            return;
        }
        // both maxed: do nothing
    }

    // ----- Tick -----
    AutoClick.tick = (dt) => {
        // Generators
        Game.state.clickTiers.forEach((t, i) => {
            if (!t.unlocked) return; // locked: no progress
            t.elapsedMs += dt;
            const iv = tierIntervalMs(t);
            while (t.elapsedMs >= iv) {
                t.elapsedMs -= iv;
                Game.doAutoClicks(tierPower(t));
            }
        });

        // Auto-Upgrades (pause if corresponding generator is not unlocked)
        Game.state.clickAutoUpgrades.forEach((au, i) => {
            if (!au.owned) return;
            if (!generatorUnlocked(i)) return; // paused until tier is re-purchased
            au.elapsedMs += dt;
            const iv = Game.autoUpgIntervalMs(i, au.level);
            while (au.elapsedMs >= iv) {
                au.elapsedMs -= iv;
                applyAutoUpgradeToTier(i);
            }
        });

        AutoClick.updateUIAll();
    };
})();
