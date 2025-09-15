(() => {
    const Game = (window.Game = window.Game || {});

    // ===== Config / Defaults =====
    Game.SAVE_KEY = 'clickerSave_v5';
    Game.fmt = (n) => {
        if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
        if (n >= 10_000) return Math.floor(n).toLocaleString();
        return Math.ceil(n).toString();
    };

    Game.BASE = {
        progressMax: 10,
        clickPower: 1,
        pointReward: 1,
        pointUpgradeCost: 10,
        clickUpgradeCost: 20,
        rebirthCost: 1000,

        // Balance tweaks
        pointUpgradeCostMultiplier: 1.35,
        clickUpgradeCostMultiplier: 1.50,
        progressGrowthPerFill: 1.015,

        clickDelayMs: 0,

        // Auto Click tiers
        clickTierDefs: [
            { color: 'red', unlockCost: 20, basePower: 1 },
            { color: 'green', unlockCost: 40, basePower: 2 },
            { color: 'blue', unlockCost: 60, basePower: 3 },
        ],
        timeStepMs: 250,
        timeMaxLevel: 36,
        timeStartMs: 10000,
        timeMinMs: 1000,
        powerMaxExtraClicks: 20,
        tierUpgradeCostMult: 1.5,

        // Auto Point tiers
        pointTierDefs: [
            { color: 'red', basePower: 1, unlockRebirths: 1, baseCost: 20 },
            { color: 'green', basePower: 2, unlockRebirths: 2, baseCost: 40 },
            { color: 'blue', basePower: 3, unlockRebirths: 3, baseCost: 60 },
        ],
        pointFixedIntervalMs: 10000,
        pointPowerStep: 2,
        powerMaxLevelsPoints: 20,
    };

    // ===== State =====
    Game.state = {
        version: 5,
        progressMax: Game.BASE.progressMax,
        points: 0,
        clicks: 0,
        clickPower: Game.BASE.clickPower,
        pointReward: Game.BASE.pointReward,
        rebirthMultiplier: 1,
        clickUpgradeLevel: 1,
        pointUpgradeLevel: 1,
        rebirths: 0,
        pointUpgradeCost: Game.BASE.pointUpgradeCost,
        clickUpgradeCost: Game.BASE.clickUpgradeCost,
        rebirthCost: Game.BASE.rebirthCost,
        progress: 0,

        lastSave: Date.now(),

        clickTiers: Game.BASE.clickTierDefs.map((def) => ({
            color: def.color,
            unlocked: false,
            basePower: def.basePower,
            powerLevel: 0,
            timeLevel: 0,
            elapsedMs: 0,
            timeCost: def.unlockCost,
            powerCost: def.unlockCost,
            unlockCost: def.unlockCost
        })),

        pointTiers: Game.BASE.pointTierDefs.map((def) => ({
            color: def.color,
            devForceUnlocked: false, // dev override
            unlocked: false, // computed (devForceUnlocked || rebirths >= unlockRebirths)
            basePower: def.basePower,
            powerLevel: 0,
            elapsedMs: 0,
            powerCost: def.baseCost,
            unlockRebirths: def.unlockRebirths,
            baseCost: def.baseCost
        }))
    };

    // ===== DOM refs (core UI only) =====
    Game.el = {
        progressBar: document.getElementById('progressBar'),
        clickButton: document.getElementById('clickButton'),
        scoreDisplay: document.getElementById('scoreDisplay'),
        totalClicksDisplay: document.getElementById('totalClicks'),
        upgradePoints: document.getElementById('upgradePoints'),
        upgradeClicks: document.getElementById('upgradeClicks'),
        rebirth: document.getElementById('rebirth'),
        resetButton: document.getElementById('resetButton'),
        metaDisplay: document.getElementById('metaDisplay'),
    };

    // ===== Core helpers =====
    Game.incrementPerClick = () =>
        Math.max(1, Math.ceil(Game.state.rebirthMultiplier * Game.state.clickPower * Game.state.clickUpgradeLevel));

    // Smoothly scales later-game payout so it doesn't get grindy
    Game.dynamicPointsMultiplier = () =>
        Math.max(1, Math.pow(Game.state.progressMax / Game.BASE.progressMax, 0.5));

    Game.pointsPerFill = () =>
        Math.max(1, Math.ceil(Game.state.rebirthMultiplier * Game.state.pointReward * Game.state.pointUpgradeLevel * Game.dynamicPointsMultiplier()));

    Game.clicksRemainingToFill = () => {
        const inc = Game.incrementPerClick();
        return Math.max(1, Math.ceil((Game.state.progressMax - Game.state.progress) / inc));
    };

    Game.applyProgress = (amount) => {
        Game.state.progress += amount;
        while (Game.state.progress >= Game.state.progressMax) {
            Game.state.progress -= Game.state.progressMax;
            Game.state.points += Game.pointsPerFill();
            Game.state.progressMax = Math.ceil(Game.state.progressMax * Game.BASE.progressGrowthPerFill);
        }
    };

    Game.handleClickCore = (countUserClick = true) => {
        if (countUserClick) Game.state.clicks++;
        Game.applyProgress(Game.incrementPerClick());
        Game.updateDisplays();
    };

    // Exposed for modules
    Game.doAutoClicks = (power) => {
        for (let i = 0; i < power; i++) Game.handleClickCore(false);
    };
    Game.addPointsDirect = (amount) => {
        Game.state.points += amount;
        Game.updateDisplays();
    };

    Game.updateButtons = () => {
        const { points } = Game.state;
        const canPoints = points >= Math.ceil(Game.state.pointUpgradeCost);
        const canClicks = points >= Math.ceil(Game.state.clickUpgradeCost);
        const canRebirth = points >= Math.ceil(Game.state.rebirthCost);

        Game.el.upgradePoints.disabled = !canPoints;
        Game.el.upgradeClicks.disabled = !canClicks;
        Game.el.rebirth.disabled = !canRebirth;

        Game.el.upgradePoints.textContent = `Upgrade Points L${Game.state.pointUpgradeLevel} (Cost: ${Game.fmt(Game.state.pointUpgradeCost)})`;
        Game.el.upgradeClicks.textContent = `Upgrade Click Power L${Game.state.clickUpgradeLevel} (Cost: ${Game.fmt(Game.state.clickUpgradeCost)})`;
        Game.el.rebirth.textContent = `Rebirth (Cost: ${Game.fmt(Game.state.rebirthCost)})`;

        // Let modules refresh their button/labels too
        if (Game.AutoClick && Game.AutoClick.updateUIAll) Game.AutoClick.updateUIAll();
        if (Game.AutoPoint && Game.AutoPoint.updateUIAll) Game.AutoPoint.updateUIAll();
    };

    Game.updateDisplays = () => {
        const clicksRemain = Game.clicksRemainingToFill();

        Game.el.scoreDisplay.textContent =
            `Points: ${Game.fmt(Game.state.points)} | Clicks Needed: ${Game.fmt(clicksRemain)} | Clicks Remaining: ${Game.fmt(clicksRemain)}`;

        Game.el.totalClicksDisplay.textContent = `Total Clicks: ${Game.fmt(Game.state.clicks)}`;

        Game.el.metaDisplay.innerHTML =
            `Rebirths: ${Game.state.rebirths}<span class="sep">•</span>` +
            `Click Power: ${Game.fmt(Game.state.clickPower)}<span class="sep">•</span>` +
            `Point Reward: ${Game.fmt(Game.state.pointReward)}`;

        Game.el.progressBar.style.width = `${(Game.state.progress / Game.state.progressMax) * 100}%`;

        Game.updateButtons();
        Game.saveGame();
    };

    // ===== Storage =====
    Game.saveGame = () => {
        Game.state.lastSave = Date.now();
        try { localStorage.setItem(Game.SAVE_KEY, JSON.stringify(Game.state)); } catch { }
    };

    Game.loadGame = () => {
        try {
            const raw = localStorage.getItem(Game.SAVE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (!saved || saved.version !== 5) return;

            // Ensure new fields exist for older saves
            if (saved.pointTiers) {
                saved.pointTiers.forEach(pt => { if (typeof pt.devForceUnlocked === 'undefined') pt.devForceUnlocked = false; });
            }
            Game.state = { ...Game.state, ...saved };
        } catch { }
    };

    // ===== Bind core events =====
    Game.bindMainHandlers = () => {
        Game.el.clickButton.addEventListener('click', () => {
            if (Game.BASE.clickDelayMs > 0) setTimeout(() => Game.handleClickCore(true), Game.BASE.clickDelayMs);
            else Game.handleClickCore(true);
        });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                Game.el.clickButton.click();
            }
        });

        Game.el.upgradePoints.addEventListener('click', () => {
            const cost = Math.ceil(Game.state.pointUpgradeCost);
            if (Game.state.points >= cost) {
                Game.state.points -= cost;
                Game.state.pointUpgradeLevel++;
                Game.state.pointUpgradeCost *= Game.BASE.pointUpgradeCostMultiplier;
                if (Game.state.points < 0) Game.state.points = 0;
                Game.updateDisplays();
            }
        });

        Game.el.upgradeClicks.addEventListener('click', () => {
            const cost = Math.ceil(Game.state.clickUpgradeCost);
            if (Game.state.points >= cost) {
                Game.state.points -= cost;
                Game.state.clickUpgradeLevel++;
                Game.state.clickUpgradeCost *= Game.BASE.clickUpgradeCostMultiplier;
                if (Game.state.points < 0) Game.state.points = 0;
                Game.updateDisplays();
            }
        });

        Game.el.rebirth.addEventListener('click', () => {
            const cost = Math.ceil(Game.state.rebirthCost);
            if (Game.state.points < cost) return;

            if (!confirm(`Rebirth for ${Game.fmt(cost)} points? Current x${Game.state.rebirthMultiplier} → x${Game.state.rebirthMultiplier + 1}`)) return;

            Game.state.points -= cost;
            Game.state.rebirths += 1;
            Game.state.rebirthMultiplier += 1;

            Game.state.clicks = 0;
            Game.state.progress = 0;
            Game.state.progressMax = Game.BASE.progressMax;

            Game.state.clickUpgradeLevel = 1;
            Game.state.pointUpgradeLevel = 1;
            Game.state.pointUpgradeCost = Game.BASE.pointUpgradeCost;
            Game.state.clickUpgradeCost = Game.BASE.clickUpgradeCost;

            Game.state.rebirthCost = Math.ceil(Game.state.rebirthCost * 5);

            Game.updateDisplays();
            alert(`Rebirth complete! Permanent multiplier is now x${Game.state.rebirthMultiplier}.`);
        });

        Game.el.resetButton.addEventListener('click', () => {
            if (confirm('Reset all progress and clear save?')) {
                localStorage.removeItem(Game.SAVE_KEY);
                location.reload();
            }
        });
    };

    // ===== Loop =====
    let _lastTs = performance.now();
    Game._loopRunning = false;

    Game.tick = (dt) => {
        if (Game.AutoClick && Game.AutoClick.tick) Game.AutoClick.tick(dt);
        if (Game.AutoPoint && Game.AutoPoint.tick) Game.AutoPoint.tick(dt);
        Game.updateButtons();
    };

    Game.startLoop = () => {
        if (Game._loopRunning) return;
        Game._loopRunning = true;
        _lastTs = performance.now();
        const raf = (ts) => {
            const dt = ts - _lastTs; _lastTs = ts;
            Game.tick(dt);
            requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
        setInterval(Game.saveGame, 5000);
    };

    // ===== Bootstrap =====
    function waitForModulesThenInit() {
        if (Game.AutoClick && Game.AutoPoint) {
            Game.AutoClick.init();
            Game.AutoPoint.init();
            Game.updateDisplays();
            Game.startLoop();
        } else {
            setTimeout(waitForModulesThenInit, 0);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        Game.loadGame();
        Game.bindMainHandlers();
        Game.updateDisplays();
        waitForModulesThenInit();
    });
})();
