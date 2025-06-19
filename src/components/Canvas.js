import { setupEngine } from "@cassdeckard/ebbg";
import { useEffect, useState, useRef, useCallback } from "react";

import { useLayer } from "../hooks/useLayer";
import { useTimer } from "../hooks/useTimer";

const DEFAULT_LAYER_1 = 86;
const DEFAULT_LAYER_2 = 0;
const DEFAULT_INTERVAL_SEC = 60;

export default function Canvas() {
  const [refreshSeconds, setRefreshSeconds] = useState(DEFAULT_INTERVAL_SEC);
  const [bgEngineState, setBgEngineState] = useState({});
  const [engine, setEngine] = useState(null);
  const canvasRef = useRef(null);

  // Use custom hooks for layer logic
  const timer = useTimer(0);
  const layer1 = useLayer("layer1", DEFAULT_LAYER_1, timer, refreshSeconds);
  const layer2 = useLayer("layer2", DEFAULT_LAYER_2, timer, refreshSeconds);

  const toggleRefresh = useCallback(() => {
    console.log("toggleRefresh");
    setRefreshSeconds(refreshSeconds === 0 ? DEFAULT_INTERVAL_SEC : 0);
  }, [refreshSeconds, setRefreshSeconds]);

  // Handles keydown events
  const handleKeyDown = useCallback((key) => {
    console.log(`handleKeyDown: ${key}`);
    
    const keyActions = {
        " ": () => {
          layer1.randomize();
          layer2.randomize();
        },
        "0": () => {
          layer1.zero();
          layer2.zero();
        },
        "1": () => layer1.randomize(),
        "2": () => layer2.randomize(),
        "+": () => setRefreshSeconds(refreshSeconds + 1),
        "-": () => setRefreshSeconds(refreshSeconds - 1),
        "=": toggleRefresh,
        "ArrowUp": () => layer1.shift(1),
        "ArrowDown": () => layer1.shift(-1),
        "ArrowRight": () => layer2.shift(1),
        "ArrowLeft": () => layer2.shift(-1),
    }

    keyActions[key] && keyActions[key]();
  }, [layer1, layer2, refreshSeconds, toggleRefresh]);

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

  return (
    <>
          <div id="overlay">
            <div id="overlay-content">
              <h1>
                [{layer1.value}, {layer2.value}]
                ({timer} % {refreshSeconds})</h1>
            </div>
          </div>
          
          <canvas ref={canvasRef} id="canvas" className="full"></canvas>
    </>
  );
}