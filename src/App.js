import { setupEngine } from "@cassdeckard/ebbg";
import { useEffect, useState, useRef } from "react";

const DEFAULT_LAYER_1 = 86;
const DEFAULT_LAYER_2 = 0;
const DEFAULT_INTERVAL_SEC = 60;

function Canvas() {
  const [layer1, setLayer1] = useState(DEFAULT_LAYER_1);
  const [layer2] = useState(DEFAULT_LAYER_2);
  const [appSeconds, setAppSeconds] = useState(0);
  const [refreshSeconds] = useState(DEFAULT_INTERVAL_SEC);
  const [bgEngineState, setBgEngineState] = useState({});
  const [engine, setEngine] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    console.log("init");
    setBgEngineState({
      layer1: 86,
      layer2: 0
    });
  }, []);

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

  useEffect(() => {
    console.log("new engine => animate");
    if (engine) {
      engine.animate(false);
    }
  }, [engine]);

  useEffect(() => {
    if (appSeconds % refreshSeconds === 0) {
      const newLayer1 = Math.floor(Math.random() * 150) + (appSeconds % 150);
      setLayer1(newLayer1);
    }
  }, [appSeconds, refreshSeconds]);


  useEffect(() => {
    const timer = setInterval(() => setAppSeconds(appSeconds + 1), 1000);
    return () => clearInterval(timer);
  }, [appSeconds]);

  return (
    <>
          <div id="overlay">
            <div id="overlay-content">
              <h1>[{layer1}, {layer2}] ({appSeconds}s)</h1>
            </div>
          </div>
          <canvas ref={canvasRef} id="canvas" className="full"></canvas>
    </>
  );
}
export default function App() {
  return (<Canvas />);
}
