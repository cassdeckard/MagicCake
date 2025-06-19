import { setupEngine } from "@cassdeckard/ebbg";
import { useEffect, useState, useRef } from "react";

const DEFAULT_LAYER_1 = 86;
const DEFAULT_LAYER_2 = 0;
const DEFAULT_INTERVAL_SEC = 5;

export default function Canvas() {
  const [layer1, setLayer1] = useState(DEFAULT_LAYER_1);
  const [layer2, setLayer2] = useState(DEFAULT_LAYER_2);
  const [appSeconds, setAppSeconds] = useState(0);
  const [refreshSeconds, setRefreshSeconds] = useState(DEFAULT_INTERVAL_SEC);
  const [bgEngineState, setBgEngineState] = useState({});
  const [engine, setEngine] = useState(null);
  const canvasRef = useRef(null);

  // Shifts layer by direction vector
  const shiftLayer = (layerNumber, direction) => {
    switch (layerNumber) {
      case 1:
        setLayer1(layer1 + direction);
        break;
      case 2:
        setLayer2(layer2 + direction);
        break;
    }
  }

  // Randomize Layer
  const randomizeLayers = (layerNumber) => {
    const newLayer = Math.floor(Math.random() * 150) + (appSeconds % 150);

    layerSetters[layerNumber] && layerSetters[layerNumber](newLayer);
  };

  // Handles keydown events
  const handleKeyDown = (key) => {
    console.log("key", key);

    keyActions[key] && keyActions[key]();
  };

  const toggleRefresh = () => {
    setRefreshSeconds(refreshSeconds === 0 ? DEFAULT_INTERVAL_SEC : 0);
  }

  const layerSetters = {
    1: setLayer1,
    2: setLayer2
  }

  const zeroLayers = () => {
    setLayer1(0);
    setLayer2(0);
  }

  const keyActions = {
      " ": randomizeLayers,
      "0": zeroLayers,
      "1": () => randomizeLayers(1),
      "2": () => randomizeLayers(2),
      "+": () => setRefreshSeconds(refreshSeconds + 1),
      "-": () => setRefreshSeconds(refreshSeconds - 1),
      "=": toggleRefresh,
      "ArrowUp": () => shiftLayer(1, 1),
      "ArrowDown": () => shiftLayer(1, -1),
      "ArrowRight": () => shiftLayer(2, 1),
      "ArrowLeft": () => shiftLayer(2, -1),
  }

  // Initialize
  useEffect(() => {
    console.log("init");
    setBgEngineState({
      layer1: 86,
      layer2: 0
    });
  }, []);

  // Refreshes engine on canvas mount or config change
  useEffect(() => {
    console.log("setup new engine");
    if (canvasRef.current) {
      setEngine(setupEngine(canvasRef.current, {
        ...bgEngineState,
        layer1,
        layer2
      }));
    }
  }, [canvasRef, bgEngineState, layer1, layer2]);

  // Starts engine animation on engine mount/refresh
  useEffect(() => {
    console.log("new engine => animate");
    if (engine) {
      engine.animate(false);
    }
  }, [engine]);

  // Randomly updates layer1 on refresh interval
  useEffect(() => {
    if (appSeconds % refreshSeconds === 0) {
      randomizeLayers(1);
    }
  }, [appSeconds, refreshSeconds]);

  // One second ticker
  useEffect(() => {
    const timer = setInterval(() => setAppSeconds(appSeconds + 1), 1000);
    return () => clearInterval(timer);
  }, [appSeconds]);


  // Subscribe handleKeyDown to keydown events
  useEffect(() => {
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
              <h1>[{layer1}, {layer2}] ({appSeconds} % {refreshSeconds})</h1>
            </div>
          </div>
          <canvas ref={canvasRef} id="canvas" className="full"></canvas>
    </>
  );
}