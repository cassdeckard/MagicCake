import { setupEngine } from "@cassdeckard/ebbg";
import { useEffect, useState, useRef, useCallback } from "react";

import { useLayer } from "../hooks/useLayer";
import { useTimer } from "../hooks/useTimer";
import { useEnemyData } from "../hooks/useEnemyData";

const DEFAULT_LAYER_1 = 86;
const DEFAULT_LAYER_2 = 0;
const DEFAULT_INTERVAL_SEC = 60;

export default function Canvas({ hideHud, toggleHideHud }) {
  const [refreshSeconds, setRefreshSeconds] = useState(DEFAULT_INTERVAL_SEC);
  const [bgEngineState, setBgEngineState] = useState({});
  const [engine, setEngine] = useState(null);
  const [enemies, setEnemies] = useState([]);
  const canvasRef = useRef(null);

  // Use custom hooks for layer logic
  const timer = useTimer(0);
  const layer1 = useLayer("layer1", DEFAULT_LAYER_1);
  const layer2 = useLayer("layer2", DEFAULT_LAYER_2);
  const enemyData = useEnemyData();

  const countdown = useCallback(() =>
    refreshSeconds - (timer % refreshSeconds),
  [refreshSeconds, timer])

  const toggleRefresh = useCallback(() => {
    console.log("toggleRefresh");
    setRefreshSeconds(refreshSeconds === 0 ? DEFAULT_INTERVAL_SEC : 0);
  }, [refreshSeconds, setRefreshSeconds]);

  const randomizeLayers = useCallback(() => {
    if (enemyData.error) {
      console.error("Enemy data error:", enemyData.error);
      return;
    }
    const randomEnemyGroup = enemyData.randomEnemyGroup();
    if (!randomEnemyGroup) {
      console.error("No random enemy group found");
      return;
    }
    // const enemies = enemyData.enemiesInGroup(randomEnemyGroup.id);
    // console.log(`enemies: ${enemies}`);
    // setEnemies(enemies);
    layer1.api.setValue(randomEnemyGroup["Background 1"]);
    layer2.api.setValue(randomEnemyGroup["Background 2"]);
  }, [layer1.api, layer2.api, enemyData]);

  // Set enemies on layer1 or layer2 value change
  useEffect(() => {
    const enemies = enemyData.enemiesForBgLayers(layer1.value, layer2.value);
    setEnemies(enemies);
  }, [layer1.value, layer2.value, enemyData]);

  // Handles keydown events
  const handleKeyDown = useCallback((key) => {
    console.log(`handleKeyDown: ${key}`);
    
    const keyActions = {
        " ": () => randomizeLayers(),
        "0": () => {
          layer1.api.zero();
          layer2.api.zero();
        },
        "1": () => layer1.api.randomize(),
        "2": () => layer2.api.randomize(),
        "+": () => setRefreshSeconds(refreshSeconds + 1),
        "-": () => setRefreshSeconds(refreshSeconds - 1),
        "=": toggleRefresh,
        "Escape": toggleHideHud,
        "ArrowUp": () => layer1.api.shift(1),
        "ArrowDown": () => layer1.api.shift(-1),
        "ArrowRight": () => layer2.api.shift(1),
        "ArrowLeft": () => layer2.api.shift(-1),
    }

    keyActions[key] && keyActions[key]();
  }, [layer1.api, layer2.api, randomizeLayers, refreshSeconds, toggleRefresh, toggleHideHud]);

  // Initialize
  useEffect(() => {
    console.log("init");
    setBgEngineState({
      layer1: DEFAULT_LAYER_1,
      layer2: DEFAULT_LAYER_2
    });
  }, []);

  // Refreshes engine on canvas mount or config change
  useEffect(() => {
    console.log("setup new engine");
    if (canvasRef.current) {
      setEngine(setupEngine(canvasRef.current, bgEngineState));
    }
  }, [canvasRef, bgEngineState]);

  // Sync bgEngineState with layer values
  useEffect(() => {
    console.log("setBgEngineState");
    setBgEngineState(prevState => ({
      ...prevState,
      layer1: layer1.value,
      layer2: layer2.value
    }));
  }, [layer1.value, layer2.value]);

  // Starts engine animation on engine mount/refresh
  useEffect(() => {
    console.log("new engine => animate");
    if (engine) {
      engine.animate(false);
    }
  }, [engine]);

  // Subscribe handleKeyDown to keydown events
  useEffect(() => {
    console.log("subscribe to keydown events");
    const keyDownListener = (event) => {
      const key = event.key;
      handleKeyDown(key);
    };
    window.addEventListener("keydown", keyDownListener);
    return () => window.removeEventListener("keydown", keyDownListener);
  }, [handleKeyDown]);

  // on refresh interval, updates background based on random enemy group
  useEffect(() => {
    if (countdown() === refreshSeconds) {
      randomizeLayers();
    }
  }, [randomizeLayers, refreshSeconds, countdown]);

  return (
    <>
      <div id="overlay" hidden={hideHud}>
        <div id="overlay-content">
          <p>
                [{layer1.value}, {layer2.value}]
                ({countdown()} | {refreshSeconds})
          </p>
          <ul>
            {enemies?.map((enemy) => <li>{enemy}</li>)}
          </ul>
        </div>
      </div>
      <canvas ref={canvasRef} id="canvas" className="full"></canvas>
    </>
  );
}