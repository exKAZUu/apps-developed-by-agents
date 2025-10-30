(() => {
  const DISPLAY_MODE_LABEL = {
    pomodoro: "ポモドーロ",
    shortBreak: "短い休憩",
    longBreak: "長い休憩",
  };

  const DEFAULT_DURATIONS = {
    pomodoro: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60,
  };
  const CELEBRATION_DURATION_MS = 4000;
  const CATEGORY_LABELS = {
    work: "仕事",
    study: "勉強",
    home: "家事",
  };
  const STORAGE_KEY = "pomodoroFarmSaveV1";
  const TOMATO_GROWTH_STAGES = [
    { threshold: 0, label: "種まき", description: "畑の準備はばっちり。" },
    { threshold: 1, label: "発芽", description: "小さな芽が顔を出しました。" },
    { threshold: 3, label: "葉っぱが増えた", description: "トマトの葉がぐんぐん広がっています。" },
    { threshold: 5, label: "つぼみが付いた", description: "白い花が咲きそうです。" },
    { threshold: 7, label: "花が咲いた", description: "花が咲きました。実るまであと少し！" },
    { threshold: 9, label: "収穫目前", description: "真っ赤なトマトが実っています！" },
  ];
  const elements = {
    body: document.body,
    modeButtons: Array.from(document.querySelectorAll(".mode-switcher__button")),
    minutes: document.querySelector(".timer__minutes"),
    seconds: document.querySelector(".timer__seconds"),
    phaseLabel: document.querySelector(".timer__phase-label"),
    cycleLabel: document.querySelector(".timer__cycle-label"),
    startButton: document.querySelector('.timer__control[data-action="start"]'),
    resetButton: document.querySelector('.timer__control[data-action="reset"]'),
    skipButton: document.querySelector('.timer__control[data-action="skip"]'),
    settingsApply: document.querySelector(".settings__apply"),
    pomodoroMinutesInput: document.getElementById("pomodoroMinutes"),
    pomodoroSecondsInput: document.getElementById("pomodoroSeconds"),
    shortBreakMinutesInput: document.getElementById("shortBreakMinutes"),
    shortBreakSecondsInput: document.getElementById("shortBreakSeconds"),
    longBreakMinutesInput: document.getElementById("longBreakMinutes"),
    longBreakSecondsInput: document.getElementById("longBreakSeconds"),
    longBreakIntervalInput: document.getElementById("longBreakInterval"),
    celebration: document.querySelector(".celebration"),
    celebrationTitle: document.querySelector(".celebration__title"),
    celebrationMessage: document.querySelector(".celebration__message"),
    categorySelector: document.querySelector(".category-selector"),
    categoryButtons: Array.from(document.querySelectorAll(".category-selector__button")),
    categoryLabel: document.querySelector(".timer__category-label"),
    categoryCountsLabel: document.querySelector(".timer__category-counts"),
    farmPanel: document.querySelector(".farm-panel"),
    farmCoins: document.querySelector(".farm-panel__coins"),
    farmHarvest: document.querySelector(".farm-panel__harvest"),
    farmCapacity: document.querySelector(".farm-panel__capacity"),
    farmPlantButton: document.querySelector(".farm-panel__plant-button"),
    farmPlantsContainer: document.querySelector(".farm-panel__plants"),
    farmUpgradeButtons: Array.from(document.querySelectorAll(".farm-upgrade")),
  };

  const durationInputs = {
    pomodoro: {
      minutes: elements.pomodoroMinutesInput,
      seconds: elements.pomodoroSecondsInput,
    },
    shortBreak: {
      minutes: elements.shortBreakMinutesInput,
      seconds: elements.shortBreakSecondsInput,
    },
    longBreak: {
      minutes: elements.longBreakMinutesInput,
      seconds: elements.longBreakSecondsInput,
    },
  };

  const state = {
    mode: "pomodoro",
    isRunning: false,
    intervalId: null,
    durations: {
      pomodoro: 0,
      shortBreak: 0,
      longBreak: 0,
    },
    longBreakInterval: Number(elements.longBreakIntervalInput.value),
    remainingTime: 0,
    completedPomodoros: 0,
    totalPomodorosCompleted: 0,
    category: null,
    categoryCounts: {
      work: 0,
      study: 0,
      home: 0,
    },
    farm: {
      coins: 0,
      harvestCount: 0,
      basePrice: 80,
      maxActivePlants: 1,
      growthMultiplier: 1,
      priceMultiplier: 1,
      upgrades: {
        capacity: 0,
        growth: 0,
        value: 0,
      },
      plants: [],
    },
  };

  let celebrationTimeoutId = null;
  let celebrationHideTimeoutId = null;
  let categoryAttentionTimeoutId = null;

  let plantIdCounter = 1;
  const FINAL_STAGE_INDEX = TOMATO_GROWTH_STAGES.length - 1;
  const UPGRADE_CONFIG = {
    capacity: {
      label: "畑を拡張",
      description: "同時に育てるトマト数を増やす",
      baseCost: 150,
      costGrowth: 1.65,
      maxLevel: 5,
      apply() {
        state.farm.maxActivePlants += 1;
      },
      meta() {
        return `畑: ${state.farm.plants.length} / ${state.farm.maxActivePlants}`;
      },
    },
    growth: {
      label: "栄養剤",
      description: "成長速度を上げる",
      baseCost: 120,
      costGrowth: 1.7,
      maxLevel: 6,
      apply() {
        state.farm.growthMultiplier = Number((state.farm.growthMultiplier + 0.35).toFixed(2));
      },
      meta() {
        return `成長速度 x${state.farm.growthMultiplier.toFixed(2)}`;
      },
    },
    value: {
      label: "ブランド化",
      description: "販売価格を上げる",
      baseCost: 180,
      costGrowth: 1.6,
      maxLevel: 6,
      apply() {
        state.farm.priceMultiplier = Number((state.farm.priceMultiplier + 0.25).toFixed(2));
      },
      meta() {
        return `販売倍率 x${state.farm.priceMultiplier.toFixed(2)}`;
      },
    },
  };

  state.durations.pomodoro = getDurationFromInputs("pomodoro", DEFAULT_DURATIONS.pomodoro);
  state.durations.shortBreak = getDurationFromInputs("shortBreak", DEFAULT_DURATIONS.shortBreak);
  state.durations.longBreak = getDurationFromInputs("longBreak", DEFAULT_DURATIONS.longBreak);
  state.longBreakInterval = parseIntervalSetting(
    elements.longBreakIntervalInput,
    state.longBreakInterval
  );
  loadPersistentState();
  state.remainingTime = state.durations[state.mode];
  ensureInitialPlants();

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function sanitizeNumberInput(input, { min, max, fallback }) {
    const parsed = Number.parseInt(input.value, 10);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      return parsed;
    }
    const clampedFallback = clamp(fallback, min, max);
    input.value = clampedFallback;
    return clampedFallback;
  }

  function getDurationFromInputs(mode, fallbackSeconds) {
    const inputs = durationInputs[mode];
    const minutesInput = inputs.minutes;
    const secondsInput = inputs.seconds;
    const minMinutes = Number(minutesInput.min);
    const maxMinutes = Number(minutesInput.max);
    const minSeconds = Number(secondsInput.min);
    const maxSeconds = Number(secondsInput.max);

    const effectiveFallback = Math.max(
      Number.isFinite(fallbackSeconds) ? fallbackSeconds : DEFAULT_DURATIONS[mode],
      1
    );
    const fallbackMinutes = Math.floor(effectiveFallback / 60);
    const fallbackSecondsPart = effectiveFallback % 60;

    const minutes = sanitizeNumberInput(minutesInput, {
      min: minMinutes,
      max: maxMinutes,
      fallback: fallbackMinutes,
    });
    const seconds = sanitizeNumberInput(secondsInput, {
      min: minSeconds,
      max: maxSeconds,
      fallback: fallbackSecondsPart,
    });

    let total = minutes * 60 + seconds;
    if (total === 0) {
      const fallbackTotal = Math.max(effectiveFallback, 1);
      const nextMinutes = clamp(Math.floor(fallbackTotal / 60), minMinutes, maxMinutes);
      const nextSeconds = clamp(fallbackTotal % 60, minSeconds, maxSeconds);
      minutesInput.value = nextMinutes;
      secondsInput.value = nextSeconds;
      total = nextMinutes * 60 + nextSeconds;
    }
    return total;
  }

  function parseIntervalSetting(input, fallbackValue) {
    const min = Number(input.min);
    const max = Number(input.max);
    const fallback = clamp(
      Number.isFinite(fallbackValue) ? fallbackValue : Number(input.value) || 4,
      min,
      max
    );
    const value = Number.parseInt(input.value, 10);
    if (Number.isFinite(value) && value >= min && value <= max) {
      return value;
    }
    input.value = fallback;
    return fallback;
  }

  function setDurationInputsFromSeconds(mode, totalSeconds) {
    const inputs = durationInputs[mode];
    if (!inputs) {
      return;
    }
    const safeTotal = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : null;
    if (safeTotal === null) {
      return;
    }
    const minutes = Math.floor(safeTotal / 60);
    const seconds = safeTotal % 60;
    inputs.minutes.value = String(minutes);
    inputs.seconds.value = String(seconds);
  }

  function saveState() {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      const payload = {
        durations: {
          pomodoro: state.durations.pomodoro,
          shortBreak: state.durations.shortBreak,
          longBreak: state.durations.longBreak,
        },
        longBreakInterval: state.longBreakInterval,
        totalPomodorosCompleted: state.totalPomodorosCompleted,
        completedPomodoros: state.completedPomodoros,
        category: state.category,
        categoryCounts: { ...state.categoryCounts },
        farm: {
          coins: state.farm.coins,
          harvestCount: state.farm.harvestCount,
          basePrice: state.farm.basePrice,
          maxActivePlants: state.farm.maxActivePlants,
          growthMultiplier: state.farm.growthMultiplier,
          priceMultiplier: state.farm.priceMultiplier,
          upgrades: { ...state.farm.upgrades },
          plants: state.farm.plants.map((plant) => ({
            id: plant.id,
            growth: plant.growth,
            readyForHarvest: plant.readyForHarvest,
          })),
        },
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // Ignore storage errors (e.g. quota exceeded, private mode).
    }
  }

  function loadPersistentState() {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") {
        return;
      }

      if (data.durations && typeof data.durations === "object") {
        ["pomodoro", "shortBreak", "longBreak"].forEach((mode) => {
          if (Number.isFinite(data.durations[mode])) {
            setDurationInputsFromSeconds(mode, data.durations[mode]);
          }
        });
      }

      if (Number.isFinite(data.longBreakInterval) && elements.longBreakIntervalInput) {
        elements.longBreakIntervalInput.value = String(
          Math.max(Number(elements.longBreakIntervalInput.min), Math.round(data.longBreakInterval))
        );
      }

      state.durations.pomodoro = getDurationFromInputs("pomodoro", state.durations.pomodoro);
      state.durations.shortBreak = getDurationFromInputs("shortBreak", state.durations.shortBreak);
      state.durations.longBreak = getDurationFromInputs("longBreak", state.durations.longBreak);
      state.longBreakInterval = parseIntervalSetting(
        elements.longBreakIntervalInput,
        state.longBreakInterval
      );

      if (typeof data.category === "string") {
        state.category = data.category;
        if (!CATEGORY_LABELS[state.category]) {
          state.category = null;
        }
      }

      if (data.categoryCounts && typeof data.categoryCounts === "object") {
        const normalizedCategoryCounts = { ...state.categoryCounts };
        Object.keys(normalizedCategoryCounts).forEach((key) => {
          const value = Number(data.categoryCounts[key]);
          if (Number.isFinite(value)) {
            normalizedCategoryCounts[key] = Math.max(0, Math.floor(value));
          }
        });
        state.categoryCounts = normalizedCategoryCounts;
      }

      if (Number.isFinite(data.totalPomodorosCompleted)) {
        state.totalPomodorosCompleted = Math.max(0, Math.floor(data.totalPomodorosCompleted));
      }
      if (Number.isFinite(data.completedPomodoros)) {
        state.completedPomodoros = Math.max(0, Math.floor(data.completedPomodoros));
      }
      state.completedPomodoros = Math.min(state.completedPomodoros, state.longBreakInterval);

      if (data.farm && typeof data.farm === "object") {
        const farmData = data.farm;
        if (Number.isFinite(farmData.coins)) {
          state.farm.coins = Math.max(0, Math.floor(farmData.coins));
        }
        if (Number.isFinite(farmData.harvestCount)) {
          state.farm.harvestCount = Math.max(0, Math.floor(farmData.harvestCount));
        }
        if (Number.isFinite(farmData.basePrice)) {
          state.farm.basePrice = Math.max(0, Math.round(farmData.basePrice));
        }
        if (Number.isFinite(farmData.maxActivePlants)) {
          state.farm.maxActivePlants = Math.max(1, Math.floor(farmData.maxActivePlants));
        }
        if (Number.isFinite(farmData.growthMultiplier)) {
          state.farm.growthMultiplier = Math.max(0.1, Number(farmData.growthMultiplier));
        }
        if (Number.isFinite(farmData.priceMultiplier)) {
          state.farm.priceMultiplier = Math.max(0.1, Number(farmData.priceMultiplier));
        }
        if (farmData.upgrades && typeof farmData.upgrades === "object") {
          ["capacity", "growth", "value"].forEach((key) => {
            const level = Number(farmData.upgrades[key]);
            if (Number.isFinite(level) && level >= 0) {
              const maxLevel = UPGRADE_CONFIG[key]?.maxLevel ?? level;
              state.farm.upgrades[key] = Math.min(Math.floor(level), maxLevel);
            }
          });
        }
        if (Array.isArray(farmData.plants)) {
          const normalizedPlants = [];
          let highestNumericId = 0;
          farmData.plants.forEach((plant) => {
            if (!plant || typeof plant !== "object") {
              return;
            }
            const growthValue = Number(plant.growth);
            if (!Number.isFinite(growthValue)) {
              return;
            }
            const sanitizedGrowth = Math.max(0, growthValue);
            let plantId =
              typeof plant.id === "string" && plant.id.trim().length > 0 ? plant.id.trim() : "";
            let numericId = 0;
            const match = plantId.match(/plant-(\d+)/);
            if (match) {
              numericId = Number(match[1]);
              if (Number.isFinite(numericId)) {
                highestNumericId = Math.max(highestNumericId, numericId);
              } else {
                plantId = "";
              }
            } else {
              plantId = "";
            }
            if (!plantId) {
              highestNumericId += 1;
              plantId = `plant-${highestNumericId}`;
              numericId = highestNumericId;
            }
            const stageIndex = getStageIndexFromValue(sanitizedGrowth);
            const ready = Boolean(plant.readyForHarvest) || stageIndex >= FINAL_STAGE_INDEX;
            normalizedPlants.push({
              id: plantId,
              growth: sanitizedGrowth,
              stageIndex: ready ? FINAL_STAGE_INDEX : stageIndex,
              readyForHarvest: ready,
              justAdvanced: false,
              justRipened: false,
            });
          });
          state.farm.plants = normalizedPlants;
          if (highestNumericId >= 1) {
            plantIdCounter = highestNumericId + 1;
          }
          state.farm.maxActivePlants = Math.max(state.farm.maxActivePlants, state.farm.plants.length);
        }
      }
    } catch (error) {
      // Ignore malformed storage data.
    }
  }

  function createPlant() {
    const plant = {
      id: `plant-${plantIdCounter}`,
      growth: 0,
      stageIndex: 0,
      readyForHarvest: false,
      justAdvanced: false,
      justRipened: false,
    };
    plantIdCounter += 1;
    return plant;
  }

  function ensureInitialPlants() {
    if (state.farm.plants.length === 0) {
      state.farm.plants.push(createPlant());
      saveState();
    }
  }

  function calculateProgressPercent(plant) {
    const currentStage = TOMATO_GROWTH_STAGES[plant.stageIndex];
    if (plant.stageIndex >= FINAL_STAGE_INDEX) {
      return 100;
    }
    const nextStage = TOMATO_GROWTH_STAGES[plant.stageIndex + 1];
    const span = nextStage.threshold - currentStage.threshold;
    if (span <= 0) {
      return 0;
    }
    const progress = plant.growth - currentStage.threshold;
    return Math.max(0, Math.min(100, Math.round((progress / span) * 100)));
  }

  function advanceFarmAfterPomodoro() {
    ensureInitialPlants();
    const growthGain = state.farm.growthMultiplier;
    let highestStageAdvanced = null;
    let newlyReadyCount = 0;

    state.farm.plants.forEach((plant) => {
      plant.justAdvanced = false;
      plant.justRipened = false;
      if (plant.readyForHarvest) {
        return;
      }
      const previousStage = plant.stageIndex;
      plant.growth += growthGain;
      plant.stageIndex = getStageIndexFromValue(plant.growth);
      if (plant.stageIndex > previousStage) {
        plant.justAdvanced = true;
        if (highestStageAdvanced === null || plant.stageIndex > highestStageAdvanced) {
          highestStageAdvanced = plant.stageIndex;
        }
      }
      if (plant.stageIndex >= FINAL_STAGE_INDEX) {
        plant.stageIndex = FINAL_STAGE_INDEX;
        plant.readyForHarvest = true;
        plant.justRipened = true;
        newlyReadyCount += 1;
      }
    });

    const stageInfo =
      typeof highestStageAdvanced === "number" && highestStageAdvanced >= 0
        ? getStageInfoByIndex(highestStageAdvanced)
        : null;

    return {
      advancedStage: stageInfo,
      newlyReadyCount,
    };
  }

  function getUpgradeCost(type) {
    const config = UPGRADE_CONFIG[type];
    if (!config) {
      return Infinity;
    }
    const level = state.farm.upgrades[type];
    return Math.round(config.baseCost * Math.pow(config.costGrowth, level));
  }

  function buildTomatoVisual(stageIndex) {
    const visual = document.createElement("div");
    visual.className = `tomato-growth__visual tomato-growth__visual--stage-${stageIndex}`;
    visual.innerHTML = `
      <div class="tomato-growth__soil"></div>
      <div class="tomato-growth__stem"></div>
      <div class="tomato-growth__leaf tomato-growth__leaf--left"></div>
      <div class="tomato-growth__leaf tomato-growth__leaf--right"></div>
      <div class="tomato-growth__fruit"></div>
      <div class="tomato-growth__sparkles"></div>
    `;
    return visual;
  }

  function renderFarm() {
    ensureInitialPlants();
    if (
      !elements.farmPanel ||
      !elements.farmCoins ||
      !elements.farmHarvest ||
      !elements.farmCapacity ||
      !elements.farmPlantsContainer
    ) {
      return;
    }

    elements.farmCoins.textContent = `所持コイン: ${state.farm.coins} G`;
    elements.farmHarvest.textContent = `収穫数: ${state.farm.harvestCount}`;
    elements.farmCapacity.textContent = `畑: ${state.farm.plants.length} / ${state.farm.maxActivePlants}`;

    if (elements.farmPlantButton) {
      const slotsLeft = state.farm.maxActivePlants - state.farm.plants.length;
      const clampedSlots = Math.max(slotsLeft, 0);
      elements.farmPlantButton.disabled = slotsLeft <= 0;
      elements.farmPlantButton.textContent =
        slotsLeft > 0
          ? `新しいトマトを植える (残り ${clampedSlots})`
          : `新しいトマトを植える (残り 0)`;
    }

    const container = elements.farmPlantsContainer;
    container.innerHTML = "";

    if (state.farm.plants.length === 0) {
      const empty = document.createElement("p");
      empty.className = "farm-panel__empty";
      empty.textContent = "まだトマトを植えていません。スタートして育てましょう！";
      container.appendChild(empty);
    } else {
      const grid = document.createElement("div");
      grid.className = "plant-grid";
      const harvestValue = Math.round(state.farm.basePrice * state.farm.priceMultiplier);

      state.farm.plants.forEach((plant) => {
        const card = document.createElement("article");
        card.className = "plant-card";
        card.dataset.plantId = plant.id;
        if (plant.readyForHarvest) {
          card.classList.add("plant-card--ready");
        }
        if (plant.justAdvanced || plant.justRipened) {
          card.classList.add("plant-card--pulse");
        }

        const visual = buildTomatoVisual(plant.stageIndex);
        card.appendChild(visual);

        const info = document.createElement("div");
        info.className = "plant-card__info";
        const stageInfo = getStageInfoByIndex(plant.stageIndex);

        const stage = document.createElement("p");
        stage.className = "plant-card__stage";
        stage.textContent = `ステージ: ${stageInfo.label}`;

        const desc = document.createElement("p");
        desc.className = "plant-card__desc";
        if (plant.readyForHarvest) {
          desc.textContent = `収穫可能！ 価格 +${harvestValue} G`;
        } else {
          desc.textContent = stageInfo.description;
        }

        info.appendChild(stage);
        info.appendChild(desc);

        if (!plant.readyForHarvest) {
          const progressWrapper = document.createElement("div");
          progressWrapper.className = "plant-card__progress";
          const progressSpan = document.createElement("span");
          progressSpan.style.setProperty("--progress-percent", `${calculateProgressPercent(plant)}%`);
          progressWrapper.appendChild(progressSpan);
          info.appendChild(progressWrapper);
        }

        card.appendChild(info);

        if (plant.readyForHarvest) {
          const actions = document.createElement("div");
          actions.className = "plant-card__actions";
          const harvestButton = document.createElement("button");
          harvestButton.type = "button";
          harvestButton.className = "plant-card__harvest";
          harvestButton.dataset.plantId = plant.id;
          harvestButton.textContent = `収穫する (+${harvestValue} G)`;
          actions.appendChild(harvestButton);
          card.appendChild(actions);
        }

        plant.justAdvanced = false;
        plant.justRipened = false;

        grid.appendChild(card);
      });

      container.appendChild(grid);
    }

    if (elements.farmUpgradeButtons) {
      elements.farmUpgradeButtons.forEach((button) => {
        const type = button.dataset.upgrade;
        const config = UPGRADE_CONFIG[type];
        if (!config) {
          return;
        }
        const level = state.farm.upgrades[type];
        const cost = getUpgradeCost(type);
        const isMax = config.maxLevel !== undefined && level >= config.maxLevel;
        button.disabled = isMax || state.farm.coins < cost;

        const titleEl = button.querySelector(".farm-upgrade__title");
        const descEl = button.querySelector(".farm-upgrade__desc");
        const metaEl = button.querySelector(".farm-upgrade__meta");

        if (titleEl) {
          titleEl.textContent = config.label;
        }
        if (descEl) {
          descEl.textContent = config.description;
        }
        if (metaEl) {
          if (isMax) {
            metaEl.textContent = `レベル ${level} (最大)`;
          } else {
            metaEl.textContent = `レベル ${level} ・ コスト ${cost} G ・ ${config.meta()}`;
          }
        }
      });
    }
  }

  function canPlantNew() {
    return state.farm.plants.length < state.farm.maxActivePlants;
  }

  function plantNewTomato() {
    if (!canPlantNew()) {
      return false;
    }
    state.farm.plants.push(createPlant());
    renderFarm();
    saveState();
    return true;
  }

  function harvestPlant(plantId) {
    const plant = state.farm.plants.find((item) => item.id === plantId);
    if (!plant || !plant.readyForHarvest) {
      return false;
    }
    const harvestValue = Math.round(state.farm.basePrice * state.farm.priceMultiplier);
    state.farm.coins += harvestValue;
    state.farm.harvestCount += 1;
    plant.growth = 0;
    plant.stageIndex = getStageIndexFromValue(0);
    plant.readyForHarvest = false;
    plant.justAdvanced = false;
    plant.justRipened = false;
    renderFarm();
    saveState();
    return true;
  }

  function purchaseUpgrade(type) {
    const config = UPGRADE_CONFIG[type];
    if (!config) {
      return;
    }
    const level = state.farm.upgrades[type];
    if (config.maxLevel !== undefined && level >= config.maxLevel) {
      return;
    }
    const cost = getUpgradeCost(type);
    if (state.farm.coins < cost) {
      return;
    }
    state.farm.coins -= cost;
    state.farm.upgrades[type] += 1;
    config.apply();
    renderFarm();
    saveState();
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = Math.floor(totalSeconds % 60)
      .toString()
      .padStart(2, "0");
    return { minutes, seconds };
  }

  function updateDisplay() {
    const { minutes, seconds } = formatTime(state.remainingTime);
    elements.minutes.textContent = minutes;
    elements.seconds.textContent = seconds;
    elements.phaseLabel.textContent = `現在: ${DISPLAY_MODE_LABEL[state.mode]}`;
    elements.cycleLabel.textContent = `完了ポモドーロ: ${state.completedPomodoros} / ${state.longBreakInterval}`;
    updateStartButtonLabel();
    updateCategoryUI();
    renderFarm();
  }

  function updateStartButtonLabel() {
    if (state.isRunning) {
      elements.startButton.textContent = "一時停止";
      return;
    }

    const durationForMode = state.durations[state.mode];
    const isAtStart = state.remainingTime === durationForMode;
    elements.startButton.textContent = isAtStart ? "スタート" : "再開";
  }

  function updateStartButtonState() {
    const shouldDisable = state.mode === "pomodoro" && !state.category;
    elements.startButton.disabled = shouldDisable;
  }

  function activateCategoryButton(category) {
    elements.categoryButtons.forEach((button) => {
      button.classList.toggle(
        "category-selector__button--active",
        category && button.dataset.category === category
      );
    });
  }

  function formatCategoryCounts() {
    return Object.entries(CATEGORY_LABELS)
      .map(([key, label]) => `${label} ${state.categoryCounts[key] ?? 0}`)
      .join(" / ");
  }

  function getStageIndexFromValue(value) {
    let stageIndex = 0;
    for (let i = 0; i < TOMATO_GROWTH_STAGES.length; i += 1) {
      if (value >= TOMATO_GROWTH_STAGES[i].threshold) {
        stageIndex = i;
      } else {
        break;
      }
    }
    return stageIndex;
  }

  function getStageInfoByIndex(index) {
    return { ...TOMATO_GROWTH_STAGES[index], index };
  }

  function updateCategoryUI() {
    if (!elements.categoryLabel || !elements.categoryCountsLabel) {
      updateStartButtonState();
      return;
    }
    activateCategoryButton(state.category);
    const label = state.category ? CATEGORY_LABELS[state.category] : "未選択";
    elements.categoryLabel.textContent = `カテゴリ: ${label}`;
    elements.categoryCountsLabel.textContent = `カテゴリ別実施: ${formatCategoryCounts()}`;
    updateStartButtonState();
  }

  function promptCategorySelection() {
    if (!elements.categorySelector) {
      return;
    }
    window.clearTimeout(categoryAttentionTimeoutId);
    elements.categorySelector.classList.add("category-selector--attention");
    categoryAttentionTimeoutId = window.setTimeout(() => {
      elements.categorySelector.classList.remove("category-selector--attention");
      categoryAttentionTimeoutId = null;
    }, 900);
  }

  function activateModeButton(mode) {
    elements.modeButtons.forEach((button) => {
      button.classList.toggle("mode-switcher__button--active", button.dataset.mode === mode);
    });
  }

  function setBodyMode(mode) {
    elements.body.classList.remove("mode-pomodoro", "mode-shortBreak", "mode-longBreak");
    elements.body.classList.add(`mode-${mode}`);
  }

  function stopTimer() {
    if (!state.isRunning) {
      return;
    }
    state.isRunning = false;
    clearInterval(state.intervalId);
    state.intervalId = null;
    updateStartButtonLabel();
    updateStartButtonState();
  }

  function startTimer() {
    if (state.isRunning) {
      return;
    }
    if (state.mode === "pomodoro" && !state.category) {
      promptCategorySelection();
      return;
    }
    state.isRunning = true;
    const targetTime = Date.now() + state.remainingTime * 1000;

    state.intervalId = window.setInterval(() => {
      const remaining = Math.round((targetTime - Date.now()) / 1000);
      state.remainingTime = Math.max(remaining, 0);
      updateDisplay();

      if (remaining <= 0) {
        clearInterval(state.intervalId);
        state.intervalId = null;
        state.isRunning = false;
        playChime();
        handleSessionCompletion();
      }
    }, 250);

    updateStartButtonLabel();
  }

  function resetTimer() {
    stopTimer();
    state.remainingTime = state.durations[state.mode];
    updateDisplay();
  }

  function handleSessionCompletion(options = {}) {
    const { viaSkip = false } = options;

    if (state.mode === "pomodoro") {
      const prospectiveCount = state.completedPomodoros + (viaSkip ? 0 : 1);
      const shouldLongBreak =
        prospectiveCount > 0 && prospectiveCount % state.longBreakInterval === 0;
      const nextMode = shouldLongBreak ? "longBreak" : "shortBreak";

      const transitionToBreak = () => {
        switchMode(nextMode, { autoStart: false });
      };

      if (viaSkip) {
        transitionToBreak();
        return;
      }

      state.completedPomodoros = prospectiveCount;
      state.totalPomodorosCompleted += 1;
      if (state.category && state.categoryCounts[state.category] !== undefined) {
        state.categoryCounts[state.category] += 1;
      }
      const farmUpdate = advanceFarmAfterPomodoro();
      updateDisplay();
      saveState();

      const categoryMessage = `${
        state.category ? CATEGORY_LABELS[state.category] : "ポモドーロ"
      }を完了しました (${state.completedPomodoros}/${state.longBreakInterval})`;
      let tomatoMessage;
      if (farmUpdate.newlyReadyCount > 0) {
        tomatoMessage = `${farmUpdate.newlyReadyCount}個のトマトが収穫可能になりました！`;
      } else if (farmUpdate.advancedStage) {
        tomatoMessage = `トマトが「${farmUpdate.advancedStage.label}」に成長！${farmUpdate.advancedStage.description}`;
      } else {
        tomatoMessage = "トマトは順調に育っています。";
      }

      showCelebration({
        title: "お疲れさま！",
        message: `${categoryMessage}。${tomatoMessage}`,
        onComplete: transitionToBreak,
      });
    } else {
      switchMode("pomodoro", { autoStart: true });
    }
  }

  function switchMode(mode, options = {}) {
    const { autoStart = false } = options;
    stopTimer();
    state.mode = mode;
    state.remainingTime = state.durations[mode];
    activateModeButton(mode);
    setBodyMode(mode);
    updateDisplay();
    if (autoStart) {
      startTimer();
    }
  }

  function skipSession() {
    stopTimer();
    handleSessionCompletion({ viaSkip: true });
  }

  function playChime() {
    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 1.2);
      oscillator.addEventListener("ended", () => {
        ctx.close();
      });
    } catch (error) {
      // Audio context might be blocked; ignore silently.
    }
  }

  function applySettings() {
    state.durations.pomodoro = getDurationFromInputs("pomodoro", state.durations.pomodoro);
    state.durations.shortBreak = getDurationFromInputs("shortBreak", state.durations.shortBreak);
    state.durations.longBreak = getDurationFromInputs("longBreak", state.durations.longBreak);
    state.longBreakInterval = parseIntervalSetting(
      elements.longBreakIntervalInput,
      state.longBreakInterval
    );
    state.completedPomodoros = Math.min(state.completedPomodoros, state.longBreakInterval);

    if (!state.isRunning) {
      state.remainingTime = state.durations[state.mode];
    }
    updateDisplay();
    saveState();
  }

  function showCelebration({ title, message, onComplete }) {
    window.clearTimeout(celebrationTimeoutId);
    window.clearTimeout(celebrationHideTimeoutId);

    elements.celebrationTitle.textContent = title;
    elements.celebrationMessage.textContent = message;
    elements.celebration.hidden = false;

    // Allow CSS transition to kick in
    requestAnimationFrame(() => {
      elements.celebration.classList.add("celebration--visible");
    });

    celebrationTimeoutId = window.setTimeout(() => {
      hideCelebration(onComplete);
    }, CELEBRATION_DURATION_MS);
  }

  function hideCelebration(callback) {
    window.clearTimeout(celebrationTimeoutId);
    celebrationTimeoutId = null;
    elements.celebration.classList.remove("celebration--visible");
    celebrationHideTimeoutId = window.setTimeout(() => {
      elements.celebration.hidden = true;
      celebrationHideTimeoutId = null;
      if (typeof callback === "function") {
        callback();
      }
    }, 320);
  }

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (mode !== state.mode) {
        switchMode(mode);
      }
    });
  });

  elements.startButton.addEventListener("click", () => {
    if (state.isRunning) {
      stopTimer();
    } else {
      startTimer();
    }
  });

  elements.resetButton.addEventListener("click", () => {
    resetTimer();
  });

  elements.skipButton.addEventListener("click", () => {
    skipSession();
  });

  elements.categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      if (state.category === category) {
        return;
      }
      state.category = category;
      if (elements.categorySelector) {
        elements.categorySelector.classList.remove("category-selector--attention");
      }
      window.clearTimeout(categoryAttentionTimeoutId);
      categoryAttentionTimeoutId = null;
      updateCategoryUI();
      saveState();
    });
  });

  if (elements.farmPlantButton) {
    elements.farmPlantButton.addEventListener("click", () => {
      plantNewTomato();
    });
  }

  if (elements.farmPlantsContainer) {
    elements.farmPlantsContainer.addEventListener("click", (event) => {
      const harvestButton = event.target.closest(".plant-card__harvest");
      if (!harvestButton) {
        return;
      }
      const { plantId } = harvestButton.dataset;
      if (plantId) {
        harvestPlant(plantId);
      }
    });
  }

  if (elements.farmUpgradeButtons) {
    elements.farmUpgradeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const type = button.dataset.upgrade;
        if (type) {
          purchaseUpgrade(type);
        }
      });
    });
  }

  elements.settingsApply.addEventListener("click", () => {
    applySettings();
  });

  // Initialize initial state
  activateModeButton(state.mode);
  setBodyMode(state.mode);
  updateDisplay();
})();
