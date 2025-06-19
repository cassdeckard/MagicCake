import { setupEngine } from "@cassdeckard/ebbg";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";

import { useLayer } from "../hooks/useLayer";
import { useTimer } from "../hooks/useTimer";
import { useEnemyData } from "../hooks/useEnemyData";

const DEFAULT_LAYER_1 = 86;
const DEFAULT_LAYER_2 = 0;
const DEFAULT_INTERVAL_SEC = 60;

export default function Canvas() {
  const [refreshSeconds, setRefreshSeconds] = useState(DEFAULT_INTERVAL_SEC);
  const [bgEngineState, setBgEngineState] = useState({});
  const [engine, setEngine] = useState(null);
  const [hideHud, setHideHud] = useState(false);
  const canvasRef = useRef(null);

  // Use custom hooks for layer logic
  const timer = useTimer(0);
  const layer1 = useLayer("layer1", DEFAULT_LAYER_1);
  const layer2 = useLayer("layer2", DEFAULT_LAYER_2);
  const enemyData = useEnemyData();

  const countdown = useCallback(() =>
    refreshSeconds - (timer % refreshSeconds),
  [refreshSeconds, timer])

  // Memoize layer mutators to prevent unnecessary re-renders
  const layerMutate = useMemo(() => [{
    randomize: layer1.randomize,
    shift: layer1.shift,
    zero: layer1.zero
  }, {
    randomize: layer2.randomize,
    shift: layer2.shift,
    zero: layer2.zero
  }], [layer1.randomize, layer1.shift, layer1.zero, layer2.randomize, layer2.shift, layer2.zero]);

  const enemyFuncs = useMemo(() => ({
    randomEnemyGroup: enemyData.randomEnemyGroup,
    enemiesInGroup: enemyData.enemiesInGroup,
  }), [enemyData.randomEnemyGroup, enemyData.enemiesInGroup]);

  const toggleRefresh = useCallback(() => {
    console.log("toggleRefresh");
    setRefreshSeconds(refreshSeconds === 0 ? DEFAULT_INTERVAL_SEC : 0);
  }, [refreshSeconds, setRefreshSeconds]);

  const toggleHideHud = useCallback(() => {
    console.log("toggleHideHud");
    setHideHud(!hideHud);
  }, [hideHud, setHideHud]);

  // Handles keydown events
  const handleKeyDown = useCallback((key) => {
    console.log(`handleKeyDown: ${key}`);
    
    const keyActions = {
        " ": () => {
          layerMutate[0].randomize();
          layerMutate[1].randomize();
        },
        "0": () => {
          layerMutate[0].zero();
          layerMutate[1].zero();
        },
        "1": () => layerMutate[0].randomize(),
        "2": () => layerMutate[1].randomize(),
        "+": () => setRefreshSeconds(refreshSeconds + 1),
        "-": () => setRefreshSeconds(refreshSeconds - 1),
        "=": toggleRefresh,
        "Escape": toggleHideHud,
        "ArrowUp": () => layerMutate[0].shift(1),
        "ArrowDown": () => layerMutate[0].shift(-1),
        "ArrowRight": () => layerMutate[1].shift(1),
        "ArrowLeft": () => layerMutate[1].shift(-1),
    }

    keyActions[key] && keyActions[key]();
  }, [layerMutate, refreshSeconds, toggleRefresh, toggleHideHud]);

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

  // Randomly updates layer 1 on refresh interval
  useEffect(() => {
    if (countdown() === refreshSeconds) {
      layerMutate[0].randomize(timer);
    }
  }, [layerMutate, timer, refreshSeconds, countdown]);

  useEffect(() => {
    if (enemyFuncs.randomEnemyGroup) {
      console.log(`randomEnemyGroup: ${enemyFuncs.randomEnemyGroup()}`);
    }
    if (enemyFuncs.error) {
      console.error("Enemy data error:", enemyFuncs.error);
    }
  }, [enemyFuncs]);

  return (
    <>
      <div id="overlay" hidden={hideHud}>
        <div id="overlay-content">
          <h1>
                [{layer1.value}, {layer2.value}]
                ({countdown()} | {refreshSeconds})
          </h1>
        </div>
      </div>
      <canvas ref={canvasRef} id="canvas" className="full"></canvas>
    </>
  );
}