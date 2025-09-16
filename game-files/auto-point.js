(() => {
    const Game = window.Game;
    if (!Game) return;

    const AutoPoint = (Game.AutoPoint = Game.AutoPoint || {});
    AutoPoint.ready = false;

    // ----- DOM references -----
    const pEls = [0, 1, 2].map(i => ({
        root: document.getElementById(`ptier${i}`),
        powerBtn: document.getElementById(`p${i}Power`),
        fill: document.getElementById(`p${i}Fill`),
        timeLabel: document.getElementById(`p${i}TimeLabel`),
        stats: document.getElementById(`p${i}Stats`),
        lockMsg: document.getElementById(`p${i}LockMsg`),
    }));

    const auEls = [0, 1, 2].map(i => ({
        fill: document.getElementById(`pAutoFill${i}`),
        time: document.getElementById(`pAutoTime${i}`),
        btn: document.getElementById(`pAutoBtn${i}`),
    }));

    // ----- Helpers -----
    const generatorUnlocked = (i) => {
        const pt = Game.state.pointTiers[i];
        const unlockedByRebirth = Game.state.rebirths >= pt.unlockRebirths;
        pt.unlocked = unlockedByRebirth || !!pt.devForceUnlocked;
        return pt.unlocked;
    };

    const pointIntervalMs = () => Game.BASE.pointFixedIntervalMs;
    const pointPower = (pt) => pt.basePower + (pt.powerLevel * Game.BASE.pointPowerStep);

    const formatMMSS = (ms) => {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const ss = String(s % 60).padStart(2, '0');
        return `${m}:${ss}`;
    };

    // ----- UI update -----
    AutoPoint.updateUIAll = () => {
        Game.state.pointTiers.forEach((pt, i) => {
            const el = pEls[i]; if (!el.root) return;
            const isUnlocked = generatorUnlocked(i);

            // Lock overlay message
            if (el.lockMsg) {
                el.lockMsg.textContent = pt.devForceUnlocked
                    ? 'Dev-unlocked'
                    : `Requires ${pt.unlockRebirths} rebirth${pt.unlockRebirths > 1 ? 's' : ''}`;
            }

            if (isUnlocked) el.root.classList.add('unlocked');
            else el.root.classList.remove('unlocked');

            // Power upgrade (points currency)
            if (el.powerBtn) {
                const can = Game.state.points >= Math.ceil(pt.powerCost) && pt.powerLevel < Game.BASE.powerMaxLevelsPoints;
                el.powerBtn.disabled = !can || !isUnlocked;
                el.powerBtn.textContent = `Power L${pt.powerLevel} (${Game.fmt(pt.powerCost)})`;
            }

            // Stats
            if (el.stats) el.stats.textContent = `+${pointPower(pt)} / 10s`;

            // Progress
            const iv = pointIntervalMs();
            const pct = isUnlocked ? Math.min(100, (pt.elapsedMs / iv) * 100) : 0;
            if (el.fill) el.fill.style.width = `${pct}%`;
            if (el.timeLabel) el.timeLabel.textContent = (isUnlocked ? (iv - pt.elapsedMs) : iv) / 1000
                .toFixed(2) + 's';
        });

        // Auto-Upgrades strip — GATE purchase behind generator unlock; behavior otherwise unchanged
        Game.state.pointAutoUpgrades.forEach((au, i) => {
            const e = auEls[i]; if (!e) return;
            const tierOwned = generatorUnlocked(i);

            if (!au.owned) {
                e.btn.disabled = !tierOwned || Game.state.rebirthTokens < au.costTokens;
                e.btn.textContent = tierOwned ? `Enable (${Game.fmt(au.costTokens)}T)` : `Requires Tier ${i + 1}`;
                e.time.textContent = formatMMSS(Game.autoUpgIntervalMs(i, 0));
                if (e.fill) e.fill.style.width = '0%';
            } else {
                e.btn.disabled = Game.state.rebirthTokens < au.costTokens;
                e.btn.textContent = `Upgrade L${au.level} (${Game.fmt(au.costTokens)}T)`;
                const iv = Game.autoUpgIntervalMs(i, au.level);
                e.time.textContent = formatMMSS(Math.max(0, iv - au.elapsedMs));
                const pct = Math.min(100, (au.elapsedMs / iv) * 100);
                if (e.fill) e.fill.style.width = `${pct}%`;
            }
        });
    };

    // ----- Wiring -----
    AutoPoint.init = () => {
        // Power upgrade buys
        pEls.forEach((el, i) => {
            el.powerBtn?.addEventListener('click', () => {
                const pt = Game.state.pointTiers[i];
                if (!generatorUnlocked(i)) return;
                if (pt.powerLevel >= Game.BASE.powerMaxLevelsPoints) return;
                const cost = Math.ceil(pt.powerCost);
                if (Game.state.points < cost) return;
                Game.state.points -= cost;
                pt.powerLevel += 1;
                pt.powerCost = Math.ceil(pt.powerCost * Game.BASE.tierUpgradeCostMult);
                Game.updateDisplays();
            });
        });

        // Auto-Upgrade purchase/level (GATED by generator ownership)
        auEls.forEach((e, i) => {
            e.btn?.addEventListener('click', () => {
                const au = Game.state.pointAutoUpgrades[i];
                if (!generatorUnlocked(i)) return; // cannot buy/level without generator unlocked
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

        AutoPoint.ready = true;
        AutoPoint.updateUIAll();
    };

    // Auto-upgrades: when a cycle completes and tier is unlocked, increase Power if possible
    function applyPointAutoUpgrade(idx) {
        const pt = Game.state.pointTiers[idx];
        if (!generatorUnlocked(idx)) return; // (rebirths only increase; this will almost always be true once met)
        if (pt.powerLevel < Game.BASE.powerMaxLevelsPoints) {
            pt.powerLevel += 1;
        }
    }

    // ----- Tick -----
    AutoPoint.tick = (dt) => {
        // Generators: points every fixed interval
        Game.state.pointTiers.forEach((pt, i) => {
            if (!generatorUnlocked(i)) return;
            pt.elapsedMs += dt;
            const iv = pointIntervalMs();
            while (pt.elapsedMs >= iv) {
                pt.elapsedMs -= iv;
                Game.addPointsDirect(pointPower(pt));
            }
        });

        // Auto-Upgrades (no rebirth changes requested; just run if owned)
        Game.state.pointAutoUpgrades.forEach((au, i) => {
            if (!au.owned) return;
            if (!generatorUnlocked(i)) return; // cannot progress if tier not unlocked yet
            au.elapsedMs += dt;
            const iv = Game.autoUpgIntervalMs(i, au.level);
            while (au.elapsedMs >= iv) {
                au.elapsedMs -= iv;
                applyPointAutoUpgrade(i);
            }
        });

        AutoPoint.updateUIAll();
    };
})();
