(() => {
    const Game = window.Game;
    if (!Game) return;

    const ui = {
        ptier: [],
        auto: [], // auto-upgrade UI refs
    };

    const pointIntervalMs = () => Game.BASE.pointFixedIntervalMs;
    const pointTierPower = (t) => t.basePower + (t.powerLevel * Game.BASE.pointPowerStep);
    const isUnlocked = (t) => !!t.devForceUnlocked || Game.state.rebirths >= t.unlockRebirths;

    function mmss(ms) {
        const s = Math.ceil(ms / 1000);
        const m = Math.floor(s / 60);
        const ss = String(s % 60).padStart(2, '0');
        return `${m}:${ss}`;
    }

    // ===== AUTO UPGRADE (Point) =====
    function autoUpgInterval(i) {
        const au = Game.state.pointAutoUpgrades[i];
        return Game.autoUpgIntervalMs(i, au.level);
    }

    function autoUpgApply(i) {
        // On completion, increase the corresponding POINT TIER power by +1 (up to max)
        const tier = Game.state.pointTiers[i];
        if (!isUnlocked(tier)) return; // wait until tier unlocks
        if (tier.powerLevel >= Game.BASE.powerMaxLevelsPoints) return;
        tier.powerLevel += 1;
    }

    function updateAutoUpgUI(i) {
        const refs = ui.auto[i];
        const au = Game.state.pointAutoUpgrades[i];

        const maxed = au.level >= Game.BASE.autoUpgMaxLevel;
        const btnLabel = au.owned
            ? (maxed ? `Upgrade (MAX)` : `Upgrade L${au.level} (${Game.fmt(au.costTokens)}T)`)
            : `Enable (${Game.fmt(au.costTokens)}T)`;
        refs.btn.textContent = btnLabel;
        refs.btn.disabled = maxed || Game.state.rebirthTokens < Math.ceil(au.costTokens);

        const interval = autoUpgInterval(i);
        const remain = Math.max(0, interval - au.elapsedMs);
        refs.time.textContent = mmss(remain);

        const pct = Math.min(1, au.elapsedMs / interval) * 100;
        refs.fill.style.width = `${pct}%`;
    }

    function updatePointTierUI(i) {
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

            // Auto-upgrade UI for Point
            ui.auto = [
                { fill: document.getElementById('pAutoFill0'), time: document.getElementById('pAutoTime0'), btn: document.getElementById('pAutoBtn0') },
                { fill: document.getElementById('pAutoFill1'), time: document.getElementById('pAutoTime1'), btn: document.getElementById('pAutoBtn1') },
                { fill: document.getElementById('pAutoFill2'), time: document.getElementById('pAutoTime2'), btn: document.getElementById('pAutoBtn2') },
            ];

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

            // Wire auto-upgrade buttons
            ui.auto.forEach((refs, i) => {
                refs.btn.addEventListener('click', () => {
                    const au = Game.state.pointAutoUpgrades[i];
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
            for (let i = 0; i < Game.state.pointTiers.length; i++) updatePointTierUI(i);
            for (let i = 0; i < Game.state.pointAutoUpgrades.length; i++) updateAutoUpgUI(i);
        },

        tick(dt) {
            if (!this.ready) return;

            // Tier timers
            for (let i = 0; i < Game.state.pointTiers.length; i++) {
                const t = Game.state.pointTiers[i];
                const refs = ui.ptier[i];

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

            // Auto-upgrade timers
            for (let i = 0; i < Game.state.pointAutoUpgrades.length; i++) {
                const au = Game.state.pointAutoUpgrades[i];
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

    Game.AutoPoint = AutoPoint;
})();
